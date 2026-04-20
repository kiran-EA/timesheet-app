from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from app.core.security import get_current_user
from app.services.jira_service import jira_service
from app.schemas.timesheet import JiraTask
from app.db import queries
from concurrent.futures import ThreadPoolExecutor
import time

router = APIRouter(prefix="/jira", tags=["Jira"])

# Per-user task cache: {"tasks:<email>": {"ts": float, "tasks": list, "active_keys": set}}
_task_cache: dict = {}
_TASK_TTL   = 300   # 5 minutes
_STATUS_TTL = 120   # 2 minutes
_LOGGED_TTL = 30    # 30 seconds


def _fetch_tasks_cached(email: str) -> tuple[list, set]:
    """Run both Jira calls in parallel and cache the combined result for 5 minutes."""
    now = time.time()
    key = f"tasks:{email}"
    entry = _task_cache.get(key)
    if entry and now - entry["ts"] < _TASK_TTL:
        return entry["tasks"], entry["active_keys"]

    with ThreadPoolExecutor(max_workers=2) as ex:
        f_tasks  = ex.submit(jira_service.get_user_tasks, email)
        f_sprint = ex.submit(jira_service.get_active_sprint_keys, email)
        tasks       = f_tasks.result()
        active_keys = f_sprint.result()

    _task_cache[key] = {"ts": now, "tasks": tasks, "active_keys": active_keys}
    return tasks, active_keys


def _get_logged_hours_cached(user_id: str) -> dict:
    """Cache get_all_logged_hours per user for 30 s to avoid double DB call per page load."""
    key = f"logged:{user_id}"
    entry = _task_cache.get(key)
    if entry and time.time() - entry["ts"] < _LOGGED_TTL:
        return entry["tasks"]
    result = queries.get_all_logged_hours(user_id)
    _task_cache[key] = {"ts": time.time(), "tasks": result}
    return result

# These are shared operational tasks shown to ALL users under "General Purpose Tasks".
# They are filtered out of each user's personal JIRA task list.
GENERAL_TASK_KEYS = {'HSB-7', 'HSB-19', 'HSB-8', 'HSB-20', 'HSB-37', 'HSB-38'}

GENERAL_TASKS_BASE = [
    {"key": "HSB-7",  "title": "Team Meetings", "purpose": "Team Meetings"},
    {"key": "HSB-19", "title": "Holiday",        "purpose": "Holiday"},
    {"key": "HSB-8",  "title": "Leave",          "purpose": "Leave"},
    {"key": "HSB-20", "title": "Comp Off",       "purpose": "Comp Off"},
    {"key": "HSB-37", "title": "Non Billable",   "purpose": "Non Billable"},
    {"key": "HSB-38", "title": "LOP",            "purpose": "Leave without Pay"},
]


@router.get("/status")
async def jira_status(current_user: dict = Depends(get_current_user)):
    key = "status"
    entry = _task_cache.get(key)
    if entry and time.time() - entry["ts"] < _STATUS_TTL:
        return entry["tasks"]
    result = jira_service.check_connection()
    _task_cache[key] = {"ts": time.time(), "tasks": result}
    return result


@router.get("/tasks", response_model=list[JiraTask])
async def get_my_tasks(
    for_user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    # Admin can fetch tasks for any user via ?for_user_id=
    if for_user_id and current_user.get("role") == "admin":
        user = queries.get_user_by_id(for_user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        email   = user["email"]
        user_id = for_user_id
    else:
        email   = current_user.get("email")
        user_id = current_user.get("sub")

    tasks, active_keys = _fetch_tasks_cached(email)

    # Remove general purpose tasks from personal task list
    tasks = [t for t in tasks if t["key"] not in GENERAL_TASK_KEYS]

    # Mark tasks in active sprint
    for task in tasks:
        task["is_active_sprint"] = task["key"] in active_keys

    # Overwrite logged_hours from the app's own DB (cached 30 s)
    logged_map = _get_logged_hours_cached(user_id)
    for task in tasks:
        task["logged_hours"] = logged_map.get(task["key"], 0.0)

    # Tasks loaded successfully → mark status cache as connected
    _task_cache["status"] = {"ts": time.time(), "tasks": {"connected": True, "user": email}}

    return tasks


_ALL_TASKS_TTL = 300   # 5 minutes


def _fetch_all_tasks_cached() -> tuple[list, set]:
    """Fetch all project tasks + sprint keys (no assignee filter). Cached 5 min."""
    now = time.time()
    key = "all-tasks"
    entry = _task_cache.get(key)
    if entry and now - entry["ts"] < _ALL_TASKS_TTL:
        return entry["tasks"], entry["active_keys"]

    with ThreadPoolExecutor(max_workers=2) as ex:
        f_tasks  = ex.submit(jira_service.get_all_project_tasks)
        f_sprint = ex.submit(jira_service.get_all_sprint_keys)
        tasks       = f_tasks.result()
        active_keys = f_sprint.result()

    _task_cache[key] = {"ts": now, "tasks": tasks, "active_keys": active_keys}
    return tasks, active_keys


@router.get("/all-tasks", response_model=list[JiraTask])
async def get_all_tasks(current_user: dict = Depends(get_current_user)):
    """Admin only — all open project tasks across all assignees (current sprint + backlog)."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    user_id = current_user.get("sub")
    tasks, active_keys = _fetch_all_tasks_cached()

    # Remove general purpose tasks
    tasks = [t for t in tasks if t["key"] not in GENERAL_TASK_KEYS]

    # Mark active sprint tasks
    for task in tasks:
        task["is_active_sprint"] = task["key"] in active_keys

    # Overwrite logged_hours from the app's own DB (admin's own logged hours)
    logged_map = _get_logged_hours_cached(user_id)
    for task in tasks:
        task["logged_hours"] = logged_map.get(task["key"], 0.0)

    return tasks


@router.get("/general-tasks", response_model=list[JiraTask])
async def get_general_tasks(
    for_user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """Return the 6 shared operational tasks with this user's logged hours."""
    if for_user_id and current_user.get("role") == "admin":
        user_id = for_user_id
    else:
        user_id = current_user.get("sub")
    logged_map = _get_logged_hours_cached(user_id)  # reuses cache from /tasks if called together

    result = []
    for i, base in enumerate(GENERAL_TASKS_BASE):
        result.append({
            "id":           f"general-{i}",
            "key":          base["key"],
            "title":        base["title"],
            "epic":         base["purpose"],
            "story_points": None,
            "est_hours":    None,
            "logged_hours": logged_map.get(base["key"], 0.0),
            "status":       "Active",
            "sprint":       None,
        })
    return result
