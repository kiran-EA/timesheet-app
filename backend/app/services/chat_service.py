import json
import os
import requests as _requests
from datetime import date, timedelta
from typing import List, Dict, Optional
from app.core.config import settings


# ── helpers ─────────────────────────────────────────────────────────────────────

def _get_chat_service():
    """Build a Google Chat API service using the existing service account.
    Uses GOOGLE_SERVICE_ACCOUNT_CONTENT env var (Render) or service-account.json file (local)."""
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build

        sa_content = os.environ.get("GOOGLE_SERVICE_ACCOUNT_CONTENT", "").strip()
        if sa_content:
            creds = Credentials.from_service_account_info(
                json.loads(sa_content),
                scopes=["https://www.googleapis.com/auth/chat.bot"],
            )
        else:
            sa_file = os.path.join(
                os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                settings.GOOGLE_SERVICE_ACCOUNT_FILE,
            )
            if not os.path.exists(sa_file):
                print(f"[chat] No service account configured (file not found: {sa_file})")
                return None
            creds = Credentials.from_service_account_file(
                sa_file,
                scopes=["https://www.googleapis.com/auth/chat.bot"],
            )
        return build("chat", "v1", credentials=creds)
    except Exception as e:
        print(f"[chat] Failed to build Chat service: {e}")
        return None


def _dm_space_name(service, user_email: str) -> Optional[str]:
    """Find or create a DM space with user_email. Returns space name like 'spaces/...'."""
    try:
        space = service.spaces().setup(body={
            "space": {"spaceType": "DIRECT_MESSAGE"},
            "memberships": [{"member": {"name": f"users/{user_email}", "type": "HUMAN"}}],
        }).execute()
        return space["name"]
    except Exception as e:
        print(f"[chat] Could not set up DM space for {user_email}: {e}")
        return None


# ── DM message card ──────────────────────────────────────────────────────────────

def _dm_text(name: str, today: str, today_hours: float, gaps: List[Dict]) -> str:
    today_label = date.fromisoformat(today).strftime("%a, %d %b %Y")
    if today_hours >= 8:
        today_line = f"✅ Today ({today_label}): {today_hours}h logged"
    elif today_hours > 0:
        today_line = f"⚠️ Today ({today_label}): {today_hours}h logged (need {round(8 - today_hours, 1)}h more)"
    else:
        today_line = f"🔴 Today ({today_label}): 0h — not filled"

    gap_lines = ""
    if gaps:
        gap_lines = f"\n\n*Unfilled days ({len(gaps)}):*"
        for g in gaps[:5]:   # cap at 5 to keep message short
            d     = date.fromisoformat(g["date"])
            label = d.strftime("%a %d %b")
            hrs   = g["hours"]
            sym   = "⚠️" if hrs > 0 else "🔴"
            need  = round(8 - hrs, 1)
            gap_lines += f"\n{sym} {label}: {hrs}h (need {need}h)"
        if len(gaps) > 5:
            gap_lines += f"\n_…and {len(gaps) - 5} more_"

    app_url = "https://timesheet-app-lac.vercel.app/timesheet"
    return (
        f"*Hi {name}!* 👋\n\n"
        f"*TimeSync Reminder* — please log at least *8 hours* for today.\n\n"
        f"{today_line}"
        f"{gap_lines}\n\n"
        f"👉 <{app_url}|Open TimeSync>"
    )


# ── Public: send per-user DM ─────────────────────────────────────────────────────

def send_dm(user_email: str, name: str, today: str,
            today_hours: float, gaps: List[Dict]) -> bool:
    service = _get_chat_service()
    if not service:
        print("[chat] Service account not configured — skipping DM.")
        return False

    space_name = _dm_space_name(service, user_email)
    if not space_name:
        return False

    text = _dm_text(name, today, today_hours, gaps)
    try:
        service.spaces().messages().create(
            parent=space_name,
            body={"text": text},
        ).execute()
        print(f"[chat] DM sent → {user_email}")
        return True
    except Exception as e:
        print(f"[chat] DM failed for {user_email}: {type(e).__name__}: {e}")
        return False


# ── Public: weekly summary via webhook ───────────────────────────────────────────

def send_weekly_summary(week_start: str, week_end: str, users_data: List[Dict]) -> bool:
    """POST a weekly hours summary card to the shared space webhook."""
    webhook_url = settings.CHAT_WEBHOOK_URL
    if not webhook_url:
        print("[chat] CHAT_WEBHOOK_URL not set — skipping weekly summary.")
        return False

    ws_label = date.fromisoformat(week_start).strftime("%d %b")
    we_label = date.fromisoformat(week_end).strftime("%d %b %Y")

    rows = ""
    for u in users_data:
        hrs   = round(float(u.get("total_hours", 0)), 1)
        target = u.get("working_days", 5) * 8
        if hrs >= target:
            sym = "✅"
        elif hrs >= target * 0.5:
            sym = "⚠️"
        else:
            sym = "🔴"
        rows += f"\n{sym} *{u['full_name']}*: {hrs}h / {target}h"

    if not rows:
        rows = "\n_No timesheet data found for this week._"

    text = (
        f"*📊 Weekly Timesheet Summary — {ws_label} to {we_label}*\n"
        f"{rows}\n\n"
        f"_Generated by TimeSync_"
    )

    try:
        resp = _requests.post(webhook_url, json={"text": text}, timeout=15)
        if resp.status_code in (200, 201):
            print("[chat] Weekly summary sent via webhook.")
            return True
        print(f"[chat] Webhook error {resp.status_code}: {resp.text}")
        return False
    except Exception as e:
        print(f"[chat] Webhook request failed: {e}")
        return False
