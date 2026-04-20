"""
Google Calendar Service
-----------------------
Two modes:
  1. Service Account (domain-wide delegation) — no user OAuth needed.
     Requires service-account.json + Workspace admin grants delegation.
  2. OAuth fallback — user connects manually via /calendar/auth-url.
"""

import os
import logging
from datetime import datetime, timezone
from google.oauth2 import service_account
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from app.core.config import settings
from app.db.database import execute_query

logger = logging.getLogger(__name__)

SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

CLIENT_CONFIG = {
    "web": {
        "client_id":     settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
        "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
        "token_uri":     "https://oauth2.googleapis.com/token",
    }
}

# ── Service Account (domain-wide delegation) ──────────────────────────────────

def _service_account_path() -> str:
    base = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    return os.path.join(base, settings.GOOGLE_SERVICE_ACCOUNT_FILE)


def is_service_account_available() -> bool:
    if settings.GOOGLE_SERVICE_ACCOUNT_CONTENT:
        return True
    return os.path.exists(_service_account_path())


def get_service_account_credentials(user_email: str):
    """Return credentials impersonating user_email via domain-wide delegation."""
    if settings.GOOGLE_SERVICE_ACCOUNT_CONTENT:
        import json
        info = json.loads(settings.GOOGLE_SERVICE_ACCOUNT_CONTENT)
        creds = service_account.Credentials.from_service_account_info(
            info, scopes=SCOPES,
        ).with_subject(user_email)
    else:
        creds = service_account.Credentials.from_service_account_file(
            _service_account_path(), scopes=SCOPES,
        ).with_subject(user_email)
    return creds


# ── OAuth flow (fallback) ─────────────────────────────────────────────────────

def get_auth_url(state: str) -> str:
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES, state=state)
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
    )
    return auth_url


def exchange_code(code: str) -> dict:
    flow = Flow.from_client_config(CLIENT_CONFIG, scopes=SCOPES)
    flow.redirect_uri = settings.GOOGLE_REDIRECT_URI
    flow.fetch_token(code=code)
    creds = flow.credentials
    return {
        "access_token":  creds.token,
        "refresh_token": creds.refresh_token,
        "token_expiry":  creds.expiry.isoformat() if creds.expiry else None,
    }


def save_tokens(user_id: str, tokens: dict):
    execute_query("DELETE FROM google_tokens WHERE user_id = %s",
                  (user_id,), fetch_all=False)
    execute_query(
        """INSERT INTO google_tokens (user_id, access_token, refresh_token, token_expiry, updated_at)
           VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)""",
        (user_id, tokens["access_token"], tokens.get("refresh_token"), tokens.get("token_expiry")),
        fetch_all=False,
    )


def load_tokens(user_id: str) -> dict | None:
    row = execute_query(
        "SELECT access_token, refresh_token, token_expiry FROM google_tokens WHERE user_id = %s",
        (user_id,), fetch_one=True,
    )
    return dict(row) if row else None


def get_oauth_credentials(user_id: str) -> Credentials | None:
    tokens = load_tokens(user_id)
    if not tokens:
        return None
    expiry = None
    if tokens.get("token_expiry"):
        try:
            expiry = datetime.fromisoformat(str(tokens["token_expiry"]))
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
        except Exception:
            pass
    creds = Credentials(
        token=tokens["access_token"],
        refresh_token=tokens.get("refresh_token"),
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
        expiry=expiry,
    )
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            save_tokens(user_id, {
                "access_token":  creds.token,
                "refresh_token": creds.refresh_token,
                "token_expiry":  creds.expiry.isoformat() if creds.expiry else None,
            })
        except Exception as e:
            logger.error(f"Token refresh failed for {user_id}: {e}")
            return None
    return creds


# ── Unified status & events ───────────────────────────────────────────────────

def is_connected(user_id: str, user_email: str) -> bool:
    """True if calendar can be accessed (service account OR stored OAuth token)."""
    if is_service_account_available():
        return True
    return load_tokens(user_id) is not None


def get_events(user_id: str, user_email: str, time_min: str, time_max: str) -> list:
    """
    Fetch calendar events.
    Prefers service account (no user action needed).
    Falls back to stored OAuth token.
    """
    if is_service_account_available():
        try:
            creds = get_service_account_credentials(user_email)
            service = build("calendar", "v3", credentials=creds, cache_discovery=False)
            logger.info(f"Using service account for {user_email}")
            return _fetch_events(service, time_min, time_max)
        except Exception as e:
            logger.warning(f"Service account failed for {user_email}: {e} — trying OAuth")

    creds = get_oauth_credentials(user_id)
    if not creds:
        return []
    try:
        service = build("calendar", "v3", credentials=creds, cache_discovery=False)
        return _fetch_events(service, time_min, time_max)
    except Exception as e:
        logger.error(f"get_events OAuth error for {user_id}: {e}")
        return []


def _get_response_status(event: dict) -> str:
    """
    Derive the user's response status for this event:
      personal   — no attendees (self-created / personal event)
      organizer  — user is the organizer
      accepted   — user accepted the invite
      tentative  — user tentatively accepted
      declined   — user declined
      needsAction — user hasn't responded yet
    """
    attendees = event.get("attendees", [])
    if not attendees:
        return "personal"

    organizer = event.get("organizer", {})
    if organizer.get("self"):
        return "organizer"

    for attendee in attendees:
        if attendee.get("self"):
            return attendee.get("responseStatus", "needsAction")

    return "accepted"   # no self entry → calendar-wide event, treat as accepted


def _fetch_events(service, time_min: str, time_max: str) -> list:
    result = service.events().list(
        calendarId="primary",
        timeMin=time_min,
        timeMax=time_max,
        singleEvents=True,
        orderBy="startTime",
        maxResults=200,
    ).execute()

    events = []
    for e in result.get("items", []):
        start = e.get("start", {})
        end   = e.get("end",   {})
        events.append({
            "id":              e.get("id"),
            "title":           e.get("summary", "(No title)"),
            "start":           start.get("dateTime") or start.get("date"),
            "end":             end.get("dateTime")   or end.get("date"),
            "all_day":         "date" in start and "dateTime" not in start,
            "location":        e.get("location", ""),
            "status":          e.get("status", ""),
            "response_status": _get_response_status(e),
        })
    return events
