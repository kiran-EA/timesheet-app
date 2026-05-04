import smtplib
import ssl
import socket
import json
import base64
import requests as _requests
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import date, timedelta
from typing import List, Dict
from app.core.config import settings


# ── Gmail API via service account (no DNS needed, uses existing Google credentials) ─

def _send_via_gmail_api(to_email: str, subject: str, html: str) -> bool:
    """Send via Gmail REST API using the existing service account + domain-wide delegation.
    Requires: Gmail API enabled in Google Cloud + delegation set up in Google Admin."""
    sa_content = settings.GOOGLE_SERVICE_ACCOUNT_CONTENT
    sender     = settings.GMAIL_SENDER_EMAIL
    if not sa_content or not sender:
        return False
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build

        creds = Credentials.from_service_account_info(
            json.loads(sa_content),
            scopes=["https://www.googleapis.com/auth/gmail.send"],
        )
        delegated = creds.with_subject(sender)
        service   = build("gmail", "v1", credentials=delegated)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"TimeSync <{sender}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html"))

        raw  = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        service.users().messages().send(userId="me", body={"raw": raw}).execute()
        return True
    except Exception as e:
        print(f"[email] Gmail API failed: {type(e).__name__}: {e}")
        return False


# ── Resend HTTP API (works on Render free tier; SMTP ports are blocked) ─────────

def _send_via_resend(to_email: str, subject: str, html: str) -> bool:
    """Send via Resend HTTP API. Requires RESEND_API_KEY env var."""
    api_key = settings.RESEND_API_KEY
    if not api_key:
        return False
    from_addr = settings.RESEND_FROM_EMAIL or "TimeSync <onboarding@resend.dev>"
    try:
        resp = _requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"from": from_addr, "to": [to_email], "subject": subject, "html": html},
            timeout=15,
        )
        if resp.status_code in (200, 201):
            return True
        print(f"[email] Resend error {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        print(f"[email] Resend request failed: {e}")
        return False


# ── SMTP fallback (works locally; Render free tier blocks SMTP ports) ────────────

def _smtp_ipv4(host: str, port: int, timeout: int = 15) -> smtplib.SMTP:
    """Open an SMTP connection forcing IPv4 (avoids ENETUNREACH on IPv6-disabled hosts)."""
    infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
    if not infos:
        raise OSError(f"No IPv4 address found for {host}")
    ip = infos[0][4][0]
    smtp = smtplib.SMTP(timeout=timeout)
    smtp._host = host
    smtp.connect(ip, port)
    return smtp


def _send_via_smtp(to_email: str, subject: str, html: str) -> bool:
    smtp_email    = settings.SMTP_EMAIL
    smtp_password = settings.SMTP_PASSWORD
    if not smtp_email or not smtp_password:
        print("[email] SMTP_EMAIL or SMTP_PASSWORD not configured.")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"TimeSync <{smtp_email}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html"))
        raw = msg.as_string()

        try:
            with _smtp_ipv4(settings.SMTP_HOST, 587) as s:
                s.ehlo(settings.SMTP_HOST)
                s.starttls(context=ssl.create_default_context())
                s.ehlo(settings.SMTP_HOST)
                s.login(smtp_email, smtp_password)
                s.sendmail(smtp_email, to_email, raw)
        except smtplib.SMTPAuthenticationError as e:
            print(f"[email] SMTP auth failed: {e}. Use a Gmail App Password.")
            return False
        except Exception as e587:
            print(f"[email] Port 587 failed ({e587}), trying SSL 465…")
            ctx = ssl.create_default_context()
            infos = socket.getaddrinfo(settings.SMTP_HOST, 465, socket.AF_INET, socket.SOCK_STREAM)
            ip = infos[0][4][0]
            with smtplib.SMTP_SSL(ip, 465, context=ctx, timeout=15) as s:
                s.login(smtp_email, smtp_password)
                s.sendmail(smtp_email, to_email, raw)
        return True
    except smtplib.SMTPAuthenticationError as e:
        print(f"[email] SMTP auth failed: {e}. Use a Gmail App Password.")
        return False
    except Exception as e:
        print(f"[email] SMTP failed for {to_email}: {type(e).__name__}: {e}")
        return False


# ── HTML template ────────────────────────────────────────────────────────────────

def _html_email(name: str, today: str, today_hours: float, gaps: List[Dict]) -> str:
    gap_rows = ""
    for g in gaps:
        d      = date.fromisoformat(g["date"])
        label  = d.strftime("%a, %d %b %Y")
        hrs    = g["hours"]
        color  = "#dc2626" if hrs == 0 else "#d97706"
        status = f"{hrs}h logged" if hrs > 0 else "0h — not filled"
        gap_rows += f"""
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;color:#334155;">{label}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;color:{color};font-weight:600;">{status}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;color:#dc2626;font-weight:600;">
            {f"Need {round(8 - hrs, 2)}h more" if hrs > 0 else "Need 8h"}
          </td>
        </tr>"""

    today_color  = "#dc2626" if today_hours == 0 else ("#d97706" if today_hours < 8 else "#059669")
    today_status = f"{today_hours}h logged" if today_hours > 0 else "0h — not filled"
    today_label  = date.fromisoformat(today).strftime("%a, %d %b %Y")
    app_url      = "https://timesheet-app-lac.vercel.app"

    gap_section = ""
    if gaps:
        gap_section = f"""
        <div style="margin-top:24px;">
          <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#334155;">
            Unfilled days since 15 Apr 2026 ({len(gaps)} day{"s" if len(gaps) != 1 else ""})
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px;">
            <thead>
              <tr style="background:#f8fafc;">
                <th style="padding:10px 16px;text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">Date</th>
                <th style="padding:10px 16px;text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">Hours</th>
                <th style="padding:10px 16px;text-align:left;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0;">Action</th>
              </tr>
            </thead>
            <tbody>{gap_rows}</tbody>
          </table>
        </div>"""

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="background:linear-gradient(135deg,#2563eb,#1d4ed8);padding:28px 32px;border-radius:12px 12px 0 0;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;color:rgba(255,255,255,0.7);text-transform:uppercase;">TimeSync · Express Analytics</p>
                <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;">Timesheet Reminder</h1>
              </td>
              <td align="right">
                <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:22px;">&#9200;</div>
              </td>
            </tr>
          </table>
        </td></tr>
        <tr><td style="background:#ffffff;padding:28px 32px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none;">
          <p style="margin:0 0 6px;font-size:16px;font-weight:600;color:#0f172a;">Hi {name},</p>
          <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">
            Your timesheet for today is incomplete. Please log at least <strong>8 hours</strong> to keep your record up to date.
          </p>
          <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px 20px;margin-bottom:4px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;">Today</p>
            <p style="margin:0;font-size:15px;font-weight:600;color:#0f172a;">{today_label}</p>
            <p style="margin:4px 0 0;font-size:13px;color:{today_color};font-weight:600;">{today_status}</p>
          </div>
          {gap_section}
          <div style="margin-top:28px;text-align:center;">
            <a href="{app_url}/timesheet"
              style="display:inline-block;padding:13px 32px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">
              Open TimeSync &rarr;
            </a>
          </div>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;">
            You can log time up to 3 working days back.<br>
            To stop these reminders, ask your admin to disable email notifications for your account.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


# ── Public entry point ───────────────────────────────────────────────────────────

def send_timesheet_reminder(to_email: str, name: str, today_str: str,
                             today_hours: float, gaps: List[Dict]) -> bool:
    subject = f"TimeSync Reminder — Timesheet Incomplete ({date.fromisoformat(today_str).strftime('%d %b %Y')})"
    html    = _html_email(name, today_str, today_hours, gaps)

    # 1. Gmail API via service account (best: uses existing Google credentials, works on Render)
    if settings.GOOGLE_SERVICE_ACCOUNT_CONTENT and settings.GMAIL_SENDER_EMAIL:
        ok = _send_via_gmail_api(to_email, subject, html)
        if ok:
            print(f"[email] Sent via Gmail API → {to_email}")
            return True
        print("[email] Gmail API failed, trying Resend…")

    # 2. Resend HTTP API (works on Render free tier where SMTP ports are blocked)
    if settings.RESEND_API_KEY:
        ok = _send_via_resend(to_email, subject, html)
        if ok:
            print(f"[email] Sent via Resend → {to_email}")
            return True
        print("[email] Resend failed, falling back to SMTP…")

    # 3. SMTP fallback (works locally)
    ok = _send_via_smtp(to_email, subject, html)
    if ok:
        print(f"[email] Sent via SMTP → {to_email}")
    return ok
