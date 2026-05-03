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
