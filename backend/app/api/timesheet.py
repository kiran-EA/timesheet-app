from fastapi import APIRouter, Depends, HTTPException
from datetime import date, timedelta
from app.core.security import get_current_user
from app.schemas.timesheet import TimesheetEntryCreate, TimesheetEntryResponse
from app.db import queries

router = APIRouter(prefix="/timesheet", tags=["Timesheet"])


@router.get("/entries", response_model=list[TimesheetEntryResponse])
async def get_entries(entry_date: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
    rows = queries.get_entries_by_date(user_id, entry_date)
    if not rows:
        return []
    return [dict(r) for r in rows]


@router.post("/entries", response_model=TimesheetEntryResponse, status_code=201)
async def add_entry(body: TimesheetEntryCreate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
    row = queries.create_entry(
        user_id=user_id,
        task_id=body.task_id,
        task_title=body.task_title,
        entry_date=str(body.entry_date),
        work_description=body.work_description,
        hours=body.hours,
    )
    if not row:
        raise HTTPException(status_code=500, detail="Failed to create entry")
    return dict(row)


@router.delete("/entries/{entry_id}", status_code=204)
async def remove_entry(entry_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
    queries.delete_entry(entry_id, user_id)


@router.get("/stats")
async def get_stats(current_user: dict = Depends(get_current_user)):
    user_id = current_user["sub"]
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    week_hours = queries.get_week_hours(user_id, str(week_start), str(week_end))
    return {"week_hours": week_hours}
