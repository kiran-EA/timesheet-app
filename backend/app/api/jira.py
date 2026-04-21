from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.core.security import get_current_user
from app.services.jira_service import jira_service
from app.schemas.timesheet import JiraTask
from app.db import queries
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
import time

router = APIRouter(prefix="/jira", tags=["Jira"])

# Per-user task cache: {"tasks:<email>": {"ts": float, "tasks": list, "active_keys": set}}
_task_cache: dict = {}
_TASK_TTL   = 300   # 5 minutes
_STATUS_TTL = 120   # 2 minutes
_LOGGED_TTL = 30    # 30 seconds


def _fetch_tasks_cached(email: str, force: bool = False) -> tuple[list, set]:
    """Run both Jira calls in parallel and cache the combined result for 5 minutes.
    Pass force=True to bypass the cache (used by Sync button)."""
    now = time.time()
    key = f"tasks:{email}"
    entry = _task_cache.get(key)
    if not force and entry and now - entry["ts"] < _TASK_TTL:
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
    force: bool = False,
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

    tasks, active_keys = _fetch_tasks_cached(email, force=force)

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


# ── Epic / Project Level Dashboard ────────────────────────────────────────────

@router.get("/epic-dashboard")
async def get_epic_dashboard(
    start_date: str  = Query(..., description="YYYY-MM-DD"),
    end_date: str    = Query(..., description="YYYY-MM-DD"),
    sprint_only: bool = Query(False, description="Show only active-sprint tasks"),
    current_user: dict = Depends(get_current_user),
):
    """Admin only — Project Level Dashboard: all Jira epics with team breakdown
    and hours logged from DB for the given date range."""
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    # ── 1. Jira data (cached 5 min) ──────────────────────────────────────────
    all_tasks, active_keys = _fetch_all_tasks_cached()

    # Remove general-purpose housekeeping tasks
    jira_tasks = [t for t in all_tasks if t["key"] not in GENERAL_TASK_KEYS]

    # Optionally limit to sprint tasks only
    if sprint_only:
        jira_tasks = [t for t in jira_tasks if t["key"] in active_keys]

    # ── 2. Group Jira tasks by epic ──────────────────────────────────────────
    # epic_meta: { epic_key -> {name, tasks: [task_dict]} }
    epic_meta: dict = {}
    for task in jira_tasks:
        epic_key = task.get("epic")
        if not epic_key:
            continue
        if epic_key not in epic_meta:
            epic_meta[epic_key] = {"name": task.get("epic_name"), "tasks": []}
        elif not epic_meta[epic_key]["name"] and task.get("epic_name"):
            epic_meta[epic_key]["name"] = task["epic_name"]
        epic_meta[epic_key]["tasks"].append(task)

    # ── 3. DB logged hours for date range ────────────────────────────────────
    # Returns rows: {user_id, task_id, task_title, epic, total_hours, total_entries}
    db_rows = queries.get_epic_dashboard_entries(start_date, end_date)

    # Build: db_by_epic[epic_key][user_id][task_id] = hours
    db_by_epic: dict = defaultdict(lambda: defaultdict(dict))
    for row in db_rows:
        epic = row.get("epic") or ""
        db_by_epic[epic][row["user_id"]][row["task_id"]] = float(row["total_hours"])

    # ── 4. All active users for name / avatar lookup ─────────────────────────
    all_users = queries.get_all_users()
    user_map  = {u["user_id"]: u for u in all_users}  # user_id  → user
    name_map  = {u["full_name"].lower(): u for u in all_users}  # display_name → user

    def _find_by_display_name(display: str):
        return name_map.get((display or "").lower())

    # ── 5. Build per-epic result ─────────────────────────────────────────────
    result = []
    for epic_key, meta in epic_meta.items():
        epic_tasks = meta["tasks"]
        total_est  = round(sum(t.get("est_hours") or 0 for t in epic_tasks), 2)
        active_cnt = sum(1 for t in epic_tasks if t["key"] in active_keys)

        db_epic = db_by_epic.get(epic_key, {})
        total_logged = round(sum(sum(v.values()) for v in db_epic.values()), 2)
        pct = round((total_logged / total_est * 100) if total_est > 0 else 0)

        # ── Build member list ─────────────────────────────────────────────
        # Seed with Jira assignees (display name → DB user match)
        members_dict: dict = {}  # user_id (or placeholder) → member

        for task in epic_tasks:
            assignee_name = task.get("assignee") or ""
            db_user = _find_by_display_name(assignee_name)
            uid = db_user["user_id"] if db_user else f"jira__{assignee_name}"

            if uid not in members_dict:
                members_dict[uid] = {
                    "user_id":   uid,
                    "full_name": db_user["full_name"] if db_user else (assignee_name or "Unassigned"),
                    "email":     db_user["email"]     if db_user else "",
                    "avatar":    (db_user.get("avatar") or db_user["full_name"][0].upper()) if db_user
                                 else (assignee_name[:1].upper() or "?"),
                    "role":      db_user.get("role", "resource") if db_user else "resource",
                    "tasks":     [],
                }
            members_dict[uid]["tasks"].append(task)

        # Also include DB users who logged hours but aren't Jira assignees
        for uid in db_epic:
            if uid not in members_dict:
                u = user_map.get(uid)
                if u:
                    members_dict[uid] = {
                        "user_id":   uid,
                        "full_name": u["full_name"],
                        "email":     u["email"],
                        "avatar":    u.get("avatar") or u["full_name"][0].upper(),
                        "role":      u.get("role", "resource"),
                        "tasks":     [],
                    }

        # Compute logged hours per member per task
        members = []
        for uid, m in members_dict.items():
            member_task_hours = db_epic.get(uid, {})
            member_logged = round(sum(member_task_hours.values()), 2)
            member_tasks = [
                {
                    "key":             t["key"],
                    "title":           t["title"],
                    "est_hours":       t.get("est_hours"),
                    "logged_hours":    round(member_task_hours.get(t["key"], 0.0), 2),
                    "status":          t["status"],
                    "is_active_sprint": t["key"] in active_keys,
                }
                for t in m["tasks"]
            ]
            members.append({
                "user_id":      uid,
                "full_name":    m["full_name"],
                "email":        m["email"],
                "avatar":       m["avatar"],
                "role":         m["role"],
                "total_logged": member_logged,
                "tasks":        member_tasks,
            })

        members.sort(key=lambda x: x["full_name"])

        result.append({
            "epic_key":           epic_key,
            "epic_name":          meta["name"],
            "total_tasks":        len(epic_tasks),
            "active_sprint_tasks": active_cnt,
            "total_est_hours":    total_est,
            "total_logged_hours": total_logged,
            "pct_complete":       pct,
            "member_count":       len(members),
            "members":            members,
        })

    # Most-logged epics first; epics with 0 hours sorted alphabetically at end
    result.sort(key=lambda e: (-e["total_logged_hours"], e["epic_key"]))

    # ── 6. General-purpose section (Holiday / Leave / Meeting etc.) ──────────
    # These tasks have task_id in GENERAL_TASK_KEYS; epic col may be blank or
    # set to the purpose string.  Group them under a synthetic "GENERAL" epic.
    general_logged = 0.0
    general_members_dict: dict = {}
    general_key_set = {b["key"] for b in GENERAL_TASKS_BASE}

    for row in db_rows:
        if row["task_id"] not in general_key_set:
            continue
        uid = row["user_id"]
        u   = user_map.get(uid)
        if not u:
            continue
        general_logged += float(row["total_hours"])
        if uid not in general_members_dict:
            general_members_dict[uid] = {
                "user_id":   uid,
                "full_name": u["full_name"],
                "email":     u["email"],
                "avatar":    u.get("avatar") or u["full_name"][0].upper(),
                "role":      u.get("role", "resource"),
                "total_logged": 0.0,
                "tasks": [],
            }
        general_members_dict[uid]["total_logged"] += float(row["total_hours"])
        general_members_dict[uid]["tasks"].append({
            "key":             row["task_id"],
            "title":           row["task_title"],
            "est_hours":       None,
            "logged_hours":    float(row["total_hours"]),
            "status":          "Active",
            "is_active_sprint": False,
        })

    if general_members_dict:
        result.append({
            "epic_key":           "GENERAL",
            "epic_name":          "General Purpose (Holiday / Leave / Meetings)",
            "total_tasks":        len(general_key_set),
            "active_sprint_tasks": 0,
            "total_est_hours":    None,
            "total_logged_hours": round(general_logged, 2),
            "pct_complete":       None,
            "member_count":       len(general_members_dict),
            "members":            sorted(general_members_dict.values(), key=lambda x: x["full_name"]),
        })

    return {"epics": result, "date_range": {"start": start_date, "end": end_date}}
