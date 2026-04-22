from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from app.core.security import get_current_user
from app.services.jira_service import jira_service
from app.schemas.timesheet import JiraTask
from app.db import queries
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
import time
import re

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
    sprint_only: bool = Query(False, description="Show only active-sprint tasks"),
    start_date: Optional[str] = Query(None),
    end_date:   Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    """Admin only — Project Level Dashboard grouped by Jira Space → Epic → Members.
    - Logged hours respect start_date/end_date when provided, otherwise all-time.
    - Sprint Only: filters spaces and epics to those with active-sprint tasks.
    - General Purpose (Holiday/Leave/Meetings) returned as a separate 'general' key.
    """
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    _EPIC_CACHE_TTL = 300

    # ── 1. Jira data — cached 5 min ──────────────────────────────────────────
    now = time.time()
    _ec = _task_cache.get("epic-dashboard-jira")
    if _ec and now - _ec["ts"] < _EPIC_CACHE_TTL:
        epics_list  = _ec["epics"]
        jira_tasks  = _ec["tasks"]
        active_keys = _ec["active_keys"]
    else:
        epics_list    = jira_service.get_all_open_epics()
        epic_keys_all = [e["key"] for e in epics_list]
        jira_tasks    = jira_service.get_tasks_for_epics(epic_keys_all) if epic_keys_all else []
        task_keys_all = [t["key"] for t in jira_tasks]
        active_keys   = jira_service.get_active_sprint_keys_for_tasks(task_keys_all)
        _task_cache["epic-dashboard-jira"] = {
            "ts": now, "epics": epics_list, "tasks": jira_tasks, "active_keys": active_keys,
        }

    jira_tasks    = [t for t in jira_tasks if t["key"] not in GENERAL_TASK_KEYS]
    visible_tasks = [t for t in jira_tasks if t["key"] in active_keys] if sprint_only else jira_tasks

    # ── 2. Build epic_meta: epic_key → {name, tasks} ─────────────────────────
    epic_meta: dict = {e["key"]: {"name": e["name"], "tasks": []} for e in epics_list}
    for task in visible_tasks:
        ek = task.get("epic")
        if not ek:
            continue
        if ek not in epic_meta:
            epic_meta[ek] = {"name": task.get("epic_name"), "tasks": []}
        elif not epic_meta[ek]["name"] and task.get("epic_name"):
            epic_meta[ek]["name"] = task["epic_name"]
        epic_meta[ek]["tasks"].append(task)

    # ── 3. DB logged hours (date-filtered or all-time) ────────────────────────
    if start_date and end_date:
        db_rows = queries.get_epic_dashboard_entries(start_date, end_date)
    else:
        db_rows = queries.get_all_epic_dashboard_entries()

    db_by_epic: dict = defaultdict(lambda: defaultdict(dict))
    for row in db_rows:
        epic = row.get("epic") or ""
        db_by_epic[epic][row["user_id"]][row["task_id"]] = float(row["total_hours"])

    # ── 4. User maps ──────────────────────────────────────────────────────────
    all_users = queries.get_all_users()
    user_map  = {u["user_id"]: u for u in all_users}
    name_map  = {u["full_name"].lower(): u for u in all_users}

    def _find_by_name(display: str):
        return name_map.get((display or "").lower())

    def _space_of(key: str) -> str:
        m = re.match(r'^([A-Z]+)-\d+$', key or "")
        return m.group(1) if m else "OTHER"

    general_key_set = {b["key"] for b in GENERAL_TASKS_BASE}

    # ── 5. Build per-epic data ────────────────────────────────────────────────
    def _build_epic(epic_key, meta) -> dict:
        epic_tasks   = meta["tasks"]
        all_for_epic = [t for t in jira_tasks if t.get("epic") == epic_key]
        active_cnt   = sum(1 for t in all_for_epic if t["key"] in active_keys)
        total_est    = round(sum((t.get("story_points") or 0) * 8 * 1.2 for t in epic_tasks), 2)
        visible_keys = {t["key"] for t in epic_tasks}
        db_epic      = db_by_epic.get(epic_key, {})

        if sprint_only:
            total_logged = round(sum(
                sum(h for tid, h in tm.items() if tid in visible_keys)
                for tm in db_epic.values()
            ), 2)
        else:
            total_logged = round(sum(sum(v.values()) for v in db_epic.values()), 2)

        pct = round((total_logged / total_est * 100) if total_est > 0 else 0)

        members_dict: dict = {}
        for task in epic_tasks:
            aname  = task.get("assignee") or ""
            db_usr = _find_by_name(aname)
            uid    = db_usr["user_id"] if db_usr else f"jira__{aname}"
            if uid not in members_dict:
                members_dict[uid] = {
                    "user_id":    uid,
                    "full_name":  db_usr["full_name"] if db_usr else (aname or "Unassigned"),
                    "email":      db_usr["email"]     if db_usr else "",
                    "avatar":     (db_usr.get("avatar") or db_usr["full_name"][0].upper()) if db_usr
                                  else (aname[:1].upper() or "?"),
                    "role":       db_usr.get("role", "resource") if db_usr else "resource",
                    "jira_tasks": [],
                }
            members_dict[uid]["jira_tasks"].append(task)

        for uid, tm in db_epic.items():
            if any(tid in visible_keys for tid in tm) and uid not in members_dict:
                u = user_map.get(uid)
                if u:
                    members_dict[uid] = {
                        "user_id": uid, "full_name": u["full_name"], "email": u["email"],
                        "avatar":  u.get("avatar") or u["full_name"][0].upper(),
                        "role":    u.get("role", "resource"), "jira_tasks": [],
                    }

        members = []
        for uid, m in members_dict.items():
            mth    = db_epic.get(uid, {})
            mlogged = round(sum(h for tid, h in mth.items() if tid in visible_keys), 2) \
                      if sprint_only else round(sum(mth.values()), 2)
            members.append({
                "user_id":      uid,
                "full_name":    m["full_name"],
                "email":        m["email"],
                "avatar":       m["avatar"],
                "role":         m["role"],
                "total_logged": mlogged,
                "tasks": [
                    {
                        "key":              t["key"],
                        "title":            t["title"],
                        "story_points":     t.get("story_points"),
                        "est_hours":        round((t.get("story_points") or 0) * 8 * 1.2, 2),
                        "logged_hours":     round(mth.get(t["key"], 0.0), 2),
                        "status":           t["status"],
                        "is_active_sprint": t["key"] in active_keys,
                    }
                    for t in m["jira_tasks"]
                ],
            })
        members.sort(key=lambda x: x["full_name"])

        return {
            "epic_key":            epic_key,
            "epic_name":           meta["name"],
            "total_tasks":         len(epic_tasks),
            "active_sprint_tasks": active_cnt,
            "total_est_hours":     total_est,
            "total_logged_hours":  total_logged,
            "pct_complete":        pct,
            "member_count":        len(members),
            "members":             members,
        }

    all_epics = [_build_epic(ek, meta) for ek, meta in epic_meta.items()]

    # Sprint Only at epic level: drop epics with 0 sprint tasks
    if sprint_only:
        all_epics = [e for e in all_epics if e["active_sprint_tasks"] > 0]

    # ── 6. Group epics by Jira space ─────────────────────────────────────────
    project_names = jira_service.get_all_projects()

    by_space: dict = defaultdict(list)
    for e in all_epics:
        by_space[_space_of(e["epic_key"])].append(e)

    # "No Epic" per space: DB entries with no epic tag (excluding general tasks)
    no_epic_db: dict = defaultdict(lambda: defaultdict(dict))  # space → uid → task_id → hours
    for row in db_rows:
        if row.get("epic") or row["task_id"] in general_key_set:
            continue
        sp = _space_of(row["task_id"])
        no_epic_db[sp][row["user_id"]][row["task_id"]] = float(row["total_hours"])

    result_spaces = []
    for space_key in sorted(set(list(by_space.keys()) + list(no_epic_db.keys()))):
        epics = sorted(by_space.get(space_key, []),
                       key=lambda e: (-e["total_logged_hours"], e["epic_key"]))

        # Build "No Epic" entry for this space if any DB entries exist
        no_epic_entry = None
        ne_users = no_epic_db.get(space_key, {})
        if ne_users:
            ne_members, ne_logged = [], 0.0
            for uid, tm in ne_users.items():
                u = user_map.get(uid)
                if not u:
                    continue
                uh = sum(tm.values())
                ne_logged += uh
                ne_members.append({
                    "user_id": uid, "full_name": u["full_name"], "email": u["email"],
                    "avatar":  u.get("avatar") or u["full_name"][0].upper(),
                    "role":    u.get("role", "resource"),
                    "total_logged": round(uh, 2),
                    "tasks": [
                        {"key": tid, "title": tid, "story_points": None, "est_hours": None,
                         "logged_hours": h, "status": "—", "is_active_sprint": False}
                        for tid, h in tm.items()
                    ],
                })
            ne_members.sort(key=lambda x: x["full_name"])
            no_epic_entry = {
                "epic_key": None, "epic_name": None,
                "total_tasks": sum(len(m["tasks"]) for m in ne_members),
                "active_sprint_tasks": 0,
                "total_est_hours": None,
                "total_logged_hours": round(ne_logged, 2),
                "pct_complete": None,
                "member_count": len(ne_members),
                "members": ne_members,
            }

        all_in_space = epics + ([no_epic_entry] if no_epic_entry else [])
        all_uids = {m["user_id"] for e in all_in_space for m in e["members"]}

        result_spaces.append({
            "space_key":          space_key,
            "space_name":         project_names.get(space_key, space_key),
            "total_epics":        len(epics),
            "member_count":       len(all_uids),
            "total_tasks":        sum(e["total_tasks"] for e in epics),
            "sprint_tasks":       sum(e["active_sprint_tasks"] for e in epics),
            "total_logged_hours": round(sum(e["total_logged_hours"] for e in all_in_space), 2),
            "epics":              all_in_space,
        })

    # Sprint Only at space level: drop spaces with 0 sprint tasks
    if sprint_only:
        result_spaces = [s for s in result_spaces if s["sprint_tasks"] > 0]

    # ── 7. General section (separate, always at bottom) ───────────────────────
    gen_logged, gen_members_dict = 0.0, {}
    for row in db_rows:
        if row["task_id"] not in general_key_set:
            continue
        uid = row["user_id"]
        u   = user_map.get(uid)
        if not u:
            continue
        h = float(row["total_hours"])
        gen_logged += h
        if uid not in gen_members_dict:
            gen_members_dict[uid] = {
                "user_id": uid, "full_name": u["full_name"], "email": u["email"],
                "avatar":  u.get("avatar") or u["full_name"][0].upper(),
                "role":    u.get("role", "resource"), "total_logged": 0.0, "tasks": [],
            }
        gen_members_dict[uid]["total_logged"] += h
        gen_members_dict[uid]["tasks"].append({
            "key": row["task_id"], "title": row["task_title"],
            "story_points": None, "est_hours": None,
            "logged_hours": h, "status": "Active", "is_active_sprint": False,
        })

    general = {
        "total_logged_hours": round(gen_logged, 2),
        "member_count":       len(gen_members_dict),
        "members":            sorted(gen_members_dict.values(), key=lambda x: x["full_name"]),
    } if gen_members_dict else None

    return {"spaces": result_spaces, "general": general}


# ── Resource View drill-down: User → Jira Space → Epic → Entries ─────────────

@router.get("/user-spaces")
async def get_user_spaces(
    user_id: str,
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user),
):
    """Admin/Teamlead: timesheet drill-down for a single user.
    Structure driven by Jira assigned tasks (not just logged entries), so spaces
    appear even when 0 hours have been logged in the date range.
    Returns: spaces → epics → entries, each with total/sprint/logged task counts."""
    role = current_user.get("role")
    if role not in ("admin", "teamlead"):
        raise HTTPException(status_code=403, detail="Admin or Teamlead access required")

    # 1. Resolve user email to fetch their Jira tasks
    user = queries.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    email = user["email"]

    # 2. Jira tasks assigned to this user (cached 5 min) + active sprint keys
    jira_tasks, active_sprint_keys = _fetch_tasks_cached(email)
    jira_tasks = [t for t in jira_tasks if t["key"] not in GENERAL_TASK_KEYS]

    # 3. DB timesheet entries for this user in the date range
    db_entries = queries.get_user_entries_in_range(user_id, start_date, end_date)

    # 4. Jira project names
    project_names = jira_service.get_all_projects()

    def _space(key: str) -> str:
        m = re.match(r'^([A-Z]+)-\d+$', key or "")
        return m.group(1) if m else "OTHER"

    # 5. Index DB entries by task_id for fast lookup
    entries_by_task: dict = defaultdict(list)
    for e in db_entries:
        entries_by_task[e["task_id"]].append(e)

    # 6. Build Jira structure: space → epic → [tasks]
    #    Use "__none__" as placeholder for tasks with no epic
    space_epic_tasks: dict = defaultdict(lambda: defaultdict(list))
    for task in jira_tasks:
        space = _space(task["key"])
        epic  = task.get("epic") or "__none__"
        space_epic_tasks[space][epic].append(task)

    # 7. Also include DB-only entries (tasks that are Done in Jira / no longer assigned)
    #    so logged hours are never lost from the view
    jira_keys = {t["key"] for t in jira_tasks}
    for e in db_entries:
        tid = e["task_id"]
        if tid not in jira_keys:
            space = _space(tid)
            epic  = e.get("epic") or "__none__"
            # Create a synthetic task entry so it appears in the structure
            if not any(t["key"] == tid for t in space_epic_tasks[space][epic]):
                space_epic_tasks[space][epic].append({
                    "key":   tid,
                    "title": e["task_title"],
                    "epic":  e.get("epic"),
                    "epic_name": None,
                    "story_points": None,
                    "is_active_sprint": False,
                    "_db_only": True,
                })

    # 8. Build response
    result = []
    for space_key in sorted(space_epic_tasks.keys()):
        epics_data  = space_epic_tasks[space_key]
        sp_total    = 0
        sp_sprint   = 0
        sp_logged   = 0
        sp_hours    = 0.0
        epics_list  = []

        # Epics alphabetically, "__none__" last
        for ek in sorted(epics_data.keys(), key=lambda k: (1, k) if k == "__none__" else (0, k)):
            tasks        = epics_data[ek]
            ep_total     = len(tasks)
            ep_sprint    = sum(1 for t in tasks if t["key"] in active_sprint_keys)
            ep_logged    = sum(1 for t in tasks if t["key"] in entries_by_task)
            ep_hours     = sum(
                sum(float(e["hours"]) for e in entries_by_task.get(t["key"], []))
                for t in tasks
            )

            sp_total  += ep_total
            sp_sprint += ep_sprint
            sp_logged += ep_logged
            sp_hours  += ep_hours

            # All DB entries for tasks in this epic, newest first
            all_entries = []
            for t in tasks:
                for e in entries_by_task.get(t["key"], []):
                    all_entries.append({
                        "id":               e["id"],
                        "entry_date":       str(e["entry_date"]),
                        "task_id":          e["task_id"],
                        "task_title":       e["task_title"],
                        "work_description": e.get("work_description") or "",
                        "hours":            float(e["hours"]),
                        "status":           e["status"],
                    })
            all_entries.sort(key=lambda x: x["entry_date"], reverse=True)

            real_ek    = None if ek == "__none__" else ek
            epic_name  = tasks[0].get("epic_name") if real_ek and tasks else None
            epics_list.append({
                "epic_key":     real_ek,
                "epic_name":    epic_name,
                "total_tasks":  ep_total,
                "sprint_tasks": ep_sprint,
                "logged_tasks": ep_logged,
                "total_hours":  round(ep_hours, 2),
                "entries":      all_entries,
            })

        result.append({
            "space_key":    space_key,
            "space_name":   project_names.get(space_key, space_key),
            "total_tasks":  sp_total,
            "sprint_tasks": sp_sprint,
            "logged_tasks": sp_logged,
            "total_hours":  round(sp_hours, 2),
            "epics":        epics_list,
        })

    return {"spaces": result}
