from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import get_current_user
from app.db import queries

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def require_admin(current_user: dict):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/settings")
async def get_settings(current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    return queries.get_notification_settings()


class NotificationSettingsBody(BaseModel):
    morning_time: str
    evening_time: str
    enabled: bool = True


@router.put("/settings")
async def update_settings(body: NotificationSettingsBody, current_user: dict = Depends(get_current_user)):
    require_admin(current_user)
    for t in (body.morning_time, body.evening_time):
        parts = t.split(":")
        if len(parts) != 2 or not all(p.isdigit() for p in parts):
            raise HTTPException(status_code=400, detail=f"Invalid time format: {t}. Use HH:MM")
        if not (0 <= int(parts[0]) <= 23 and 0 <= int(parts[1]) <= 59):
            raise HTTPException(status_code=400, detail=f"Time out of range: {t}")

    queries.save_notification_settings(body.morning_time, body.evening_time, body.enabled)

    from app.services.scheduler_service import reschedule
    reschedule(body.morning_time, body.evening_time)

    return {"status": "saved", "morning_time": body.morning_time, "evening_time": body.evening_time}


@router.post("/trigger")
async def manual_trigger(current_user: dict = Depends(get_current_user)):
    """Admin: fire the reminder job immediately and return real results."""
    require_admin(current_user)
    from app.services.scheduler_service import run_reminder_job
    result = run_reminder_job()
    return result


@router.post("/trigger/weekly")
async def manual_weekly_trigger(current_user: dict = Depends(get_current_user)):
    """Admin: fire the weekly summary job immediately."""
    require_admin(current_user)
    from app.services.scheduler_service import run_weekly_summary_job
    result = run_weekly_summary_job()
    return result


@router.post("/test/chat")
async def test_chat_dm(current_user: dict = Depends(get_current_user)):
    """Admin: test Chat DM to own account and return detailed error info."""
    require_admin(current_user)
    import traceback
    from app.services.chat_service import _get_chat_service, _dm_space_name

    result = {"service_built": False, "space_name": None, "message_sent": False, "error": None}
    try:
        svc = _get_chat_service()
        if not svc:
            result["error"] = "Service account not found — check GOOGLE_SERVICE_ACCOUNT_CONTENT or service-account.json"
            return result
        result["service_built"] = True

        space = svc.spaces().setup(body={
            "space": {"spaceType": "DIRECT_MESSAGE"},
            "memberships": [{"member": {"name": f"users/{current_user['email']}", "type": "HUMAN"}}],
        }).execute()
        result["space_name"] = space.get("name")

        svc.spaces().messages().create(
            parent=space["name"],
            body={"text": "✅ TimeSync Chat test message — it works!"},
        ).execute()
        result["message_sent"] = True
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {e}"
        result["traceback"] = traceback.format_exc()
    return result
