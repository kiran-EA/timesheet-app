from fastapi import APIRouter, Depends
from app.core.security import get_current_user
from app.services.jira_service import jira_service
from app.schemas.timesheet import JiraTask
from app.db import queries

router = APIRouter(prefix="/jira", tags=["Jira"])

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
    return jira_service.check_connection()


@router.get("/tasks", response_model=list[JiraTask])
async def get_my_tasks(current_user: dict = Depends(get_current_user)):
    email   = current_user.get("email")
    user_id = current_user.get("sub")

    tasks = jira_service.get_user_tasks(email)

    # Remove general purpose tasks from personal task list
    tasks = [t for t in tasks if t["key"] not in GENERAL_TASK_KEYS]

    # Mark tasks in active sprint using openSprints() JQL (reliable even for carried-over tasks)
    active_keys = jira_service.get_active_sprint_keys(email)
    for task in tasks:
        task["is_active_sprint"] = task["key"] in active_keys

    # Overwrite logged_hours from the app's own DB
    logged_map = queries.get_all_logged_hours(user_id)
    for task in tasks:
        task["logged_hours"] = logged_map.get(task["key"], 0.0)

    return tasks


@router.get("/general-tasks", response_model=list[JiraTask])
async def get_general_tasks(current_user: dict = Depends(get_current_user)):
    """Return the 6 shared operational tasks with this user's logged hours."""
    user_id = current_user.get("sub")
    logged_map = queries.get_all_logged_hours(user_id)

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
