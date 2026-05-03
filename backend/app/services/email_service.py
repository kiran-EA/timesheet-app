import smtplib
import ssl
import socket
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import date, timedelta
from typing import List, Dict
from app.core.config import settings


def _smtp_ipv4(host: str, port: int, timeout: int = 15) -> smtplib.SMTP:
    """Open an SMTP connection using IPv4 only.
    Render free tier has no IPv6 routing; getaddrinfo returns IPv6 first
    for smtp.gmail.com which causes ENETUNREACH (errno 101)."""
    infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
    if not infos:
        raise OSError(f"No IPv4 address found for {host}")
    ip = infos[0][4][0]
    smtp = smtplib.SMTP(timeout=timeout)
    smtp._host = host          # keep original host for TLS SNI
    smtp.connect(ip, port)
    return smtp


def _smtp_ssl_ipv4(host: str, port: int, context: ssl.SSLContext, timeout: int = 15) -> smtplib.SMTP_SSL:
    """Same as above but for SMTP_SSL."""
    infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
    if not infos:
        raise OSError(f"No IPv4 address found for {host}")
    ip = infos[0][4][0]
    smtp = smtplib.SMTP_SSL(timeout=timeout, context=context)
    smtp._host = host
    smtp.connect(ip, port)
    return smtp


def _working_days_back(n: int) -> date:
    d, count = date.today(), 0
    while count < n:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            count += 1
    return d


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
                <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.15);display:inline-flex;align-items:center;justify-content:center;">
                  <span style="font-size:22px;">&#9200;</span>
                </div>
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


def send_timesheet_reminder(to_email: str, name: str, today_str: str,
                             today_hours: float, gaps: List[Dict]) -> bool:
    """Send reminder email via Gmail SMTP. Returns True on success."""
    smtp_email    = getattr(settings, "SMTP_EMAIL", "")
    smtp_password = getattr(settings, "SMTP_PASSWORD", "")

    if not smtp_email or not smtp_password:
        print("[email] SMTP_EMAIL or SMTP_PASSWORD not configured — skipping.")
        return False

    try:
        subject = f"TimeSync Reminder — Timesheet Incomplete ({date.fromisoformat(today_str).strftime('%d %b %Y')})"
        html    = _html_email(name, today_str, today_hours, gaps)

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = f"TimeSync <{smtp_email}>"
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html"))

        # Try STARTTLS on port 587 first (IPv4 forced to avoid ENETUNREACH on Render)
        try:
            with _smtp_ipv4(settings.SMTP_HOST, 587) as s:
                s.ehlo(settings.SMTP_HOST)
                s.starttls(context=ssl.create_default_context())
                s.ehlo(settings.SMTP_HOST)
                s.login(smtp_email, smtp_password)
                s.sendmail(smtp_email, to_email, msg.as_string())
        except smtplib.SMTPAuthenticationError as auth_err:
            print(f"[email] Auth failed (port 587): {auth_err}. "
                  "Make sure SMTP_PASSWORD is a 16-char Gmail App Password.")
            return False
        except Exception as e587:
            print(f"[email] Port 587 failed ({e587}), trying SSL port 465…")
            # Fallback: SSL on port 465 (IPv4 forced)
            ctx = ssl.create_default_context()
            with _smtp_ssl_ipv4(settings.SMTP_HOST, 465, ctx) as s:
                s.login(smtp_email, smtp_password)
                s.sendmail(smtp_email, to_email, msg.as_string())

        print(f"[email] Reminder sent → {to_email}")
        return True

    except smtplib.SMTPAuthenticationError as e:
        print(f"[email] Auth failed for {to_email}: {e}. "
              "Use a Gmail App Password: Google Account → Security → 2-Step Verification → App Passwords")
        return False
    except Exception as e:
        print(f"[email] Failed to send to {to_email}: {type(e).__name__}: {e}")
        return False
