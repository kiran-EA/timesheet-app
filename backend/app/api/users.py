from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from app.core.security import get_current_user
from app.db import queries

router = APIRouter(prefix="/users", tags=["Users"])


def require_admin(current_user: dict):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    user = queries.get_user_by_id(current_user["sub"])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(user)


@router.get("/all")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    """Admin only — all users with manager name and resource count."""
    require_admin(current_user)
    return {"users": [dict(u) for u in queries.get_all_users_with_details()]}


@router.get("/subordinates")
async def get_subordinates(current_user: dict = Depends(get_current_user)):
    """Return direct reports for current user (teamlead/admin)."""
    if current_user.get("role") not in ("teamlead", "admin"):
        raise HTTPException(status_code=403, detail="Teamlead or Admin access required")
    subs = queries.get_subordinates(current_user["sub"])
    return {"subordinates": [dict(s) for s in subs]}


class AssignBody(BaseModel):
    user_id: str
    role: str
    manager_id: Optional[str] = None


@router.put("/assign")
async def assign_user(body: AssignBody, current_user: dict = Depends(get_current_user)):
    """Admin: update a user's role and/or manager."""
    require_admin(current_user)
    if body.role not in ("admin", "teamlead", "resource"):
        raise HTTPException(status_code=400, detail="role must be admin, teamlead, or resource")
    if body.role != "admin" and not body.manager_id:
        raise HTTPException(status_code=400, detail="manager_id required for teamlead and resource")
    queries.update_user_role_and_manager(body.user_id, body.role, body.manager_id)
    queries.bust("subs:")
    return {"status": "updated"}


@router.put("/{resource_id}/unassign")
async def unassign_resource(resource_id: str, current_user: dict = Depends(get_current_user)):
    """Admin: immediately remove a resource from their current manager."""
    require_admin(current_user)
    queries.set_users_manager([resource_id], None)
    queries.bust("subs:")
    return {"status": "unassigned"}


class ConfigureUserBody(BaseModel):
    role: str
    manager_id: Optional[str] = None
    resource_ids: List[str] = []   # users to place under this user (teamlead only)


@router.put("/{user_id}/configure")
async def configure_user(
    user_id: str,
    body: ConfigureUserBody,
    current_user: dict = Depends(get_current_user),
):
    """Admin: set role + manager for a user, and optionally assign resources under a teamlead."""
    require_admin(current_user)
    if body.role not in ("admin", "teamlead", "resource"):
        raise HTTPException(status_code=400, detail="Invalid role")

    # 1. Update this user's own role and manager
    queries.update_user_role_and_manager(user_id, body.role, body.manager_id or None)

    # 2. Handle subordinate assignments
    if body.role in ("teamlead", "admin"):
        # Both teamleads and admins can manage resources
        current_subs = {s["user_id"] for s in queries.get_subordinates(user_id)}
        new_subs = set(body.resource_ids)
        to_unassign = list(current_subs - new_subs)
        to_assign   = list(new_subs - current_subs)
        if to_unassign:
            queries.set_users_manager(to_unassign, None)
        if to_assign:
            queries.set_users_manager(to_assign, user_id)
    else:
        # If changing away from teamlead/admin, release all their current resources
        current_subs = [s["user_id"] for s in queries.get_subordinates(user_id)]
        if current_subs:
            queries.set_users_manager(current_subs, None)

    queries.bust("subs:")
    queries.bust("pending:")
    return {"status": "configured"}
