from fastapi import APIRouter, Depends, HTTPException
from datetime import date, timedelta
import datetime as _dt
import calendar as _cal
from collections import defaultdict
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
        initial_status = "approved"   # admin logging on behalf of someone → auto-approved
    else:
        user_id = current_user["sub"]
        user_record = queries.get_user_by_id(user_id)
        has_manager = bool(user_record and user_record.get("manager_id"))
        initial_status = "pending" if has_manager else "approved"

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


class ResubmitBody(BaseModel):
    work_description: Optional[str] = None
    hours: Optional[float] = None
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    for_user_id: Optional[str] = None
    is_resubmit: bool = False   # True = change status to resubmitted; False = keep status


@router.put("/entries/{entry_id}/resubmit")
async def resubmit_entry(entry_id: str, body: ResubmitBody, current_user: dict = Depends(get_current_user)):
    """Edit work_description and hours.
    is_resubmit=True  → status → resubmitted (for rejected entries)
    is_resubmit=False → keep status unchanged (for pending/resubmitted edits)
    Admin can edit any entry regardless of status."""
    role = current_user.get("role", "resource")

    if role == "admin":
        queries.edit_entry_admin(entry_id, body.work_description, body.hours)
    else:
        user_id = current_user["sub"]
        if body.is_resubmit:
            queries.resubmit_entry(entry_id, user_id, body.work_description, body.hours, body.task_id, body.task_title)
        else:
            queries.edit_entry(entry_id, user_id, body.work_description, body.hours)

    return {"status": "ok"}


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


@router.get("/team-calendar")
async def get_team_calendar(
    year:  int = None,
    month: int = None,
    current_user: dict = Depends(get_current_user),
):
    """Admin only — per-day fill status for all active users."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    today = _dt.date.today()
    y = year  or today.year
    m = month or today.month
    last_day = _cal.monthrange(y, m)[1]

    users, entries = queries.get_team_calendar_data(y, m)
    user_list = [dict(u) for u in users]
    total_users = len(user_list)
    user_name_map = {u["user_id"]: u["full_name"] for u in user_list}

    # Build: date -> user_id -> hours
    day_user: dict = defaultdict(lambda: defaultdict(float))
    for e in entries:
        day_user[e["date"]][e["user_id"]] += float(e["hours"])

    days = []
    for d in range(1, last_day + 1):
        date_str = f"{y}-{m:02d}-{d:02d}"
        dow = _dt.date(y, m, d).weekday()   # 0=Mon 6=Sun
        is_weekend = dow >= 5
        user_hours_map = day_user.get(date_str, {})
        users_data = sorted(
            [{"user_id": uid, "full_name": user_name_map[uid],
              "hours": round(user_hours_map.get(uid, 0.0), 1)}
             for uid in user_name_map],
            key=lambda x: x["hours"], reverse=True,
        )
        filled_count = sum(1 for u in users_data if u["hours"] >= 8)
        days.append({
            "date":         date_str,
            "is_weekend":   is_weekend,
            "users":        users_data,
            "filled_count": filled_count,
            "total_users":  total_users,
            "all_filled":   (not is_weekend) and total_users > 0 and filled_count == total_users,
        })

    return {"year": y, "month": m, "days": days}


@router.get("/my-calendar")
async def get_my_calendar(
    year:        int = None,
    month:       int = None,
    for_user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Calendar view: per-day hours + space breakdown for the current (or specified) user."""
    user_id = current_user["sub"]
    if for_user_id and current_user.get("role") == "admin":
        user_id = for_user_id
    from datetime import date as dt
    today = dt.today()
    y = year  or today.year
    m = month or today.month
    rows = queries.get_my_calendar_data(user_id, y, m)

    # Aggregate: { date -> { total, spaces: {space_key: hours} } }
    day_map: dict = {}
    for r in rows:
        d = str(r["date"])
        if d not in day_map:
            day_map[d] = {"date": d, "total_hours": 0.0, "spaces": {}}
        day_map[d]["total_hours"] = round(day_map[d]["total_hours"] + float(r["hours"]), 2)
        day_map[d]["spaces"][r["space_key"]] = round(
            day_map[d]["spaces"].get(r["space_key"], 0.0) + float(r["hours"]), 2
        )

    return {"year": y, "month": m, "days": list(day_map.values())}
