from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from datetime import date as _date
from app.core.security import get_current_user
from app.db import queries
from app.services.jira_service import jira_service


def _check_jira_token(entry: dict) -> Optional[str]:
    """Return an error message if the entry owner's JIRA token is missing or expired.
    Returns None if the token is valid and approval should proceed."""
    name = entry.get("full_name") or "This user"
    if not entry.get("jira_token"):
        return f"{name} has no JIRA token configured. Ask them to add it via JIRA Integration in the sidebar."
    expires = entry.get("jira_token_expires_at")
    if expires:
        exp_date = expires if isinstance(expires, _date) else _date.fromisoformat(str(expires))
        if exp_date < _date.today():
            return f"{name}'s JIRA token expired on {exp_date.strftime('%d %b %Y')}. Ask them to update it via JIRA Integration."
    return None

router = APIRouter(prefix="/approvals", tags=["Approvals"])


def require_manager(current_user: dict):
    """Teamlead or Admin only."""
    if current_user.get("role") not in ("teamlead", "admin"):
        raise HTTPException(status_code=403, detail="Teamlead or Admin access required")


@router.get("/pending")
async def get_pending(
    entry_date: Optional[str] = Query(None, description="Filter by date YYYY-MM-DD (omit for all dates)"),
    current_user: dict = Depends(get_current_user),
):
    """Get pending/resubmitted entries.
    Admin → ALL users across the system.
    Teamlead → direct subordinates only."""
    require_manager(current_user)
    if current_user.get("role") == "admin":
        rows = queries.get_all_pending_entries(entry_date, exclude_user_id=current_user["sub"])
    else:
        rows = queries.get_pending_entries_for_manager(current_user["sub"], entry_date)
    return {"entries": [dict(r) for r in rows], "count": len(rows)}


@router.post("/approve/{entry_id}")
async def approve(entry_id: str, current_user: dict = Depends(get_current_user)):
    require_manager(current_user)

    # Hard block: check JIRA token before approving
    entry = queries.get_entry_with_user(entry_id)
    if entry:
        err = _check_jira_token(dict(entry))
        if err:
            raise HTTPException(status_code=400, detail=err)

    queries.approve_entry(entry_id, current_user["sub"])
    queries.bust(f"pending:{current_user['sub']}")

    # Post worklog to JIRA
    jira_synced = False
    try:
        if entry:
            e = dict(entry)
            jira_synced = jira_service.post_worklog(
                email=e["email"],
                token=e["jira_token"],
                issue_key=e["task_id"],
                entry_date=str(e["entry_date"]),
                hours=float(e["hours"]),
                description=e.get("work_description") or e.get("task_title") or e["task_id"],
            )
    except Exception as ex:
        print(f"approve JIRA sync error: {ex}")

    return {"status": "approved", "jira_synced": jira_synced}


class RejectBody(BaseModel):
    reason: str


@router.post("/reject/{entry_id}")
async def reject(entry_id: str, body: RejectBody, current_user: dict = Depends(get_current_user)):
    require_manager(current_user)
    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="Rejection reason is required")
    queries.reject_entry(entry_id, current_user["sub"], body.reason.strip())
    queries.bust(f"pending:{current_user['sub']}")
    return {"status": "rejected"}


@router.post("/approve-all")
async def approve_all(
    entry_date: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Approve all pending entries.
    Admin → all users across system.
    Teamlead → direct subordinates only.
    Entries whose owner has no token or expired token are skipped."""
    require_manager(current_user)
    is_admin = current_user.get("role") == "admin"

    pending = queries.get_pending_entries_with_tokens(
        manager_id=None if is_admin else current_user["sub"],
        entry_date=entry_date,
    )

    valid_ids   = []
    skipped_users: dict = {}   # user_id → {name, reason}
    for row in pending:
        e = dict(row)
        err = _check_jira_token(e)
        if err:
            uid = e["user_id"]
            if uid not in skipped_users:
                skipped_users[uid] = {"name": e.get("full_name", uid), "reason": err}
        else:
            valid_ids.append(e["id"])

    # Approve only entries with valid tokens
    queries.approve_entries_by_ids(valid_ids, current_user["sub"])
    queries.bust(f"pending:{current_user['sub']}")

    # Post worklogs for approved entries
    synced = 0
    for row in pending:
        e = dict(row)
        if e["id"] not in valid_ids:
            continue
        try:
            ok = jira_service.post_worklog(
                email=e["email"],
                token=e["jira_token"],
                issue_key=e["task_id"],
                entry_date=str(e["entry_date"]),
                hours=float(e["hours"]),
                description=e.get("work_description") or e.get("task_title") or e["task_id"],
            )
            if ok:
                synced += 1
        except Exception as ex:
            print(f"approve-all JIRA sync error entry {e['id']}: {ex}")

    return {
        "status": "all_approved",
        "approved": len(valid_ids),
        "skipped": len(skipped_users),
        "skipped_users": [{"name": v["name"], "reason": v["reason"]} for v in skipped_users.values()],
        "jira_synced": synced,
    }


@router.get("/analytics")
async def get_analytics(
    start_date: str = Query(...),
    end_date: str   = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Hours + pending count per subordinate (teamlead) or all users (admin)."""
    require_manager(current_user)

    if current_user.get("role") == "admin":
        rows = queries.get_analytics_for_all_resources(start_date, end_date)
    else:
        rows = queries.get_analytics_for_manager(current_user["sub"], start_date, end_date)

    return {"analytics": [dict(r) for r in rows]}


@router.get("/insights")
async def get_insights(
    start_date: str = Query(...),
    end_date: str   = Query(...),
    space_key: Optional[str] = Query(None, description="Filter to a single Jira space, e.g. 'EA'. Omit for all spaces."),
    current_user: dict = Depends(get_current_user),
):
    """Admin-only: all chart data for the Dashboard Insights page in one call."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    sk = space_key or None
    user_hours       = queries.get_insights_user_hours(start_date, end_date, sk)
    daily_hours      = queries.get_insights_daily_hours(start_date, end_date, sk)
    status_breakdown = queries.get_insights_status_breakdown(start_date, end_date, sk)
    space_hours      = queries.get_insights_space_hours(start_date, end_date, sk)
    dow_pattern      = queries.get_insights_dow_pattern(start_date, end_date, sk)

    return {
        "user_hours":       [dict(r) for r in user_hours],
        "daily_hours":      [dict(r) for r in daily_hours],
        "status_breakdown": [dict(r) for r in status_breakdown],
        "space_hours":      [dict(r) for r in space_hours],
        "dow_pattern":      [dict(r) for r in dow_pattern],
        "available_spaces": sorted({dict(r)["space_key"] for r in queries.get_insights_space_hours(start_date, end_date)}),
    }


@router.get("/analytics/tasks")
async def get_task_breakdown(
    user_id: str    = Query(..., description="Target user's user_id"),
    start_date: str = Query(...),
    end_date: str   = Query(...),
    current_user: dict = Depends(get_current_user),
):
    """Per-task breakdown for a single resource. Manager can only query their subordinates."""
    require_manager(current_user)

    if current_user.get("role") != "admin":
        subordinates = queries.get_subordinates(current_user["sub"])
        sub_ids = {s["user_id"] for s in subordinates}
        if user_id not in sub_ids:
            raise HTTPException(status_code=403, detail="You can only view analytics for your direct reports")

    rows = queries.get_task_breakdown_for_user(user_id, start_date, end_date)
    return {"tasks": [dict(r) for r in rows]}
