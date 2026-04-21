from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from app.core.security import get_current_user
from app.db import queries

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
        rows = queries.get_all_pending_entries(entry_date)
    else:
        rows = queries.get_pending_entries_for_manager(current_user["sub"], entry_date)
    return {"entries": [dict(r) for r in rows], "count": len(rows)}


@router.post("/approve/{entry_id}")
async def approve(entry_id: str, current_user: dict = Depends(get_current_user)):
    require_manager(current_user)
    queries.approve_entry(entry_id, current_user["sub"])
    queries.bust(f"pending:{current_user['sub']}")
    return {"status": "approved"}


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
    Teamlead → direct subordinates only."""
    require_manager(current_user)
    if current_user.get("role") == "admin":
        queries.approve_all_entries(current_user["sub"], entry_date)
    else:
        queries.approve_all_for_manager(current_user["sub"], entry_date)
    queries.bust(f"pending:{current_user['sub']}")
    return {"status": "all_approved"}


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
