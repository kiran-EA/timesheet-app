from fastapi import APIRouter, Depends, HTTPException
from datetime import date, timedelta
from typing import Optional
from pydantic import BaseModel
from app.core.security import get_current_user
from app.schemas.timesheet import TimesheetEntryCreate, TimesheetEntryResponse
from app.db import queries


def _get_min_allowed_date() -> date:
    """3 working days (Mon–Fri) back from today."""
    today = date.today()
    count = 0
    d = today
    while count < 3:
        d -= timedelta(days=1)
        if d.weekday() < 5:   # 0=Mon … 4=Fri
            count += 1
    return d

router = APIRouter(prefix="/timesheet", tags=["Timesheet"])


@router.get("/entries", response_model=list[TimesheetEntryResponse])
async def get_entries(
    entry_date: str,
    for_user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    # Admin can query any user's entries via ?for_user_id=
    if for_user_id and current_user.get("role") == "admin":
        user_id = for_user_id
    else:
        user_id = current_user["sub"]
    rows = queries.get_entries_by_date(user_id, entry_date)
    if not rows:
        return []
    return [dict(r) for r in rows]


@router.post("/entries", response_model=TimesheetEntryResponse, status_code=201)
async def add_entry(body: TimesheetEntryCreate, current_user: dict = Depends(get_current_user)):
    role = current_user.get("role", "resource")

    # Admin can log on behalf of another user via target_user_id
    if body.target_user_id and role == "admin":
        user_id = body.target_user_id
        initial_status = "approved"   # admin-created entries are auto-approved
    else:
        user_id = current_user["sub"]
        initial_status = "approved" if role == "admin" else "pending"

    # Non-admin: enforce 3-working-day lookback restriction
    if role != "admin":
        min_date = _get_min_allowed_date()
        today    = date.today()
        if body.entry_date < min_date:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot log time more than 3 working days back. Earliest allowed date: {min_date}",
            )
        if body.entry_date > today:
            raise HTTPException(status_code=400, detail="Cannot log time for future dates")

    row = queries.create_entry(
        user_id=user_id,
        task_id=body.task_id,
        task_title=body.task_title,
        entry_date=str(body.entry_date),
        work_description=body.work_description,
        hours=body.hours,
        status=initial_status,
        epic=body.epic,
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create entry")
    return dict(row)


class EditEntryBody(BaseModel):
    work_description: str
    hours: float
    for_user_id: Optional[str] = None


@router.patch("/entries/{entry_id}", response_model=TimesheetEntryResponse)
async def edit_entry(entry_id: str, body: EditEntryBody, current_user: dict = Depends(get_current_user)):
    """Edit work_description and hours of an existing entry.
    Admin can edit any entry (any status). Resource/teamlead can only edit pending/resubmitted."""
    role = current_user.get("role", "resource")
    if body.for_user_id and role == "admin":
        row = queries.edit_entry_admin(entry_id, body.work_description, body.hours)
    elif role == "admin":
        row = queries.edit_entry_admin(entry_id, body.work_description, body.hours)
    else:
        row = queries.edit_entry(entry_id, current_user["sub"], body.work_description, body.hours)
    if not row:
        raise HTTPException(status_code=404, detail="Entry not found or cannot be edited")
    return dict(row)


class ResubmitBody(BaseModel):
    work_description: Optional[str] = None
    hours: Optional[float] = None
    task_id: Optional[str] = None
    task_title: Optional[str] = None


@router.put("/entries/{entry_id}/resubmit")
async def resubmit_entry(entry_id: str, body: ResubmitBody, current_user: dict = Depends(get_current_user)):
    """Resource edits a rejected entry and resubmits it."""
    user_id = current_user["sub"]
    queries.resubmit_entry(entry_id, user_id, body.work_description, body.hours, body.task_id, body.task_title)
    return {"status": "resubmitted"}


@router.delete("/entries/{entry_id}", status_code=204)
async def remove_entry(
    entry_id: str,
    for_user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if for_user_id and current_user.get("role") == "admin":
        queries.delete_entry_admin(entry_id)
    else:
        queries.delete_entry(entry_id, current_user["sub"])


@router.get("/all-entries")
async def get_all_entries(
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """All entries for the current user across all dates, newest first.
    Optional ?status=pending|approved|rejected|resubmitted filter."""
    user_id = current_user["sub"]
    rows = queries.get_all_entries_for_user(user_id, status)
    return [dict(r) for r in rows]


@router.get("/stats")
async def get_stats(
    for_user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if for_user_id and current_user.get("role") == "admin":
        user_id = for_user_id
    else:
        user_id = current_user["sub"]
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    week_hours = queries.get_week_hours(user_id, str(week_start), str(week_end))
    return {"week_hours": week_hours}
