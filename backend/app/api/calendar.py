from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from app.core.security import get_current_user
from app.core.config import settings
from app.services import google_calendar_service as gcal
from app.db.database import execute_query
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/calendar", tags=["Google Calendar"])


# ── Status ────────────────────────────────────────────────────────────────────

@router.get("/status")
async def calendar_status(current_user: dict = Depends(get_current_user)):
    user_id    = current_user["sub"]
    user_email = current_user.get("email", "")
    connected  = gcal.is_connected(user_id, user_email)
    mode       = "service_account" if gcal.is_service_account_available() else "oauth"
    return {"connected": connected, "mode": mode}


# ── Fetch events for a specific date ─────────────────────────────────────────

@router.get("/events-by-date")
async def get_events_by_date(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    current_user: dict = Depends(get_current_user),
):
    """
    Return Google Calendar events for the logged-in user on a given date.
    Uses service account — no OAuth needed.
    Also returns which event IDs have already been logged.
    """
    user_id    = current_user["sub"]
    user_email = current_user.get("email", "")

    if not gcal.is_connected(user_id, user_email):
        raise HTTPException(
            status_code=403,
            detail="Google Calendar not accessible. Contact admin."
        )

    try:
        # Build time range for the day
        day_start = datetime.fromisoformat(f"{date}T00:00:00").replace(tzinfo=timezone.utc)
        day_end   = datetime.fromisoformat(f"{date}T23:59:59").replace(tzinfo=timezone.utc)

        events = gcal.get_events(
            user_id, user_email,
            time_min=day_start.isoformat(),
            time_max=day_end.isoformat(),
        )

        # Find which event IDs are already logged for this user + date
        logged_rows = execute_query(
            """SELECT calendar_event_id FROM timesheet_entries
               WHERE user_id = %s AND calendar_event_id IS NOT NULL
               AND entry_date = %s""",
            (user_id, date), fetch_all=True
        )
        logged_ids = {r["calendar_event_id"] for r in (logged_rows or [])}

        # Annotate events with already_logged flag and computed duration
        result = []
        for e in events:
            if not e.get("start") or e.get("all_day"):
                continue   # skip all-day events

            start_dt = datetime.fromisoformat(e["start"].replace("Z", "+00:00"))
            end_dt   = datetime.fromisoformat(e["end"].replace("Z", "+00:00"))
            duration_hours = round((end_dt - start_dt).total_seconds() / 3600, 2)

            result.append({
                **e,
                "duration_hours":  duration_hours,
                "already_logged":  e["id"] in logged_ids,
            })

        return {"events": result, "count": len(result), "date": date}

    except Exception as ex:
        logger.error(f"events-by-date error: {ex}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(ex))


# ── OAuth fallback (auth-url / callback) ─────────────────────────────────────

@router.get("/auth-url")
async def get_auth_url(current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
    url = gcal.get_auth_url(state=user_id)
    return {"auth_url": url}


@router.get("/callback")
async def oauth_callback(code: str = Query(...), state: str = Query(...)):
    try:
        tokens = gcal.exchange_code(code)
        gcal.save_tokens(state, tokens)
    except Exception as e:
        logger.error(f"OAuth callback error: {e}")
        return RedirectResponse(f"{settings.FRONTEND_URL}/calendar?error=auth_failed")
    return RedirectResponse(f"{settings.FRONTEND_URL}/calendar?connected=1")


@router.delete("/disconnect")
async def disconnect(current_user: dict = Depends(get_current_user)):
    execute_query("DELETE FROM google_tokens WHERE user_id = %s",
                  (current_user["sub"],), fetch_all=False)
    return {"disconnected": True}
