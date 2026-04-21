import time
from typing import Optional, Dict, Any
from app.db.database import execute_query

# ── Simple in-process TTL cache ────────────────────────────────────────────────
_cache: dict = {}

def _get(key: str, ttl: float):
    e = _cache.get(key)
    if e and time.time() - e['ts'] < ttl:
        return e['val'], True
    return None, False

def _set(key: str, val):
    _cache[key] = {'ts': time.time(), 'val': val}

def bust(prefix: str):
    """Invalidate all cache entries whose key starts with prefix."""
    for k in [k for k in _cache if k.startswith(prefix)]:
        del _cache[k]

def find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    query = "SELECT * FROM users WHERE email = %s"
    return execute_query(query, (email,), fetch_one=True)

def create_user(email: str, full_name: str, role: str = 'resource') -> Dict[str, Any]:
    user_id = f"USR{abs(hash(email)) % 100000000:08d}"
    avatar = ''.join([name[0].upper() for name in full_name.split()[:2]])
    
    insert_query = """
        INSERT INTO users (user_id, email, full_name, role, avatar, is_active)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    execute_query(insert_query, (user_id, email, full_name, role, avatar, True), fetch_all=False)
    return find_user_by_email(email)

def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    query = "SELECT * FROM users WHERE user_id = %s"
    return execute_query(query, (user_id,), fetch_one=True)


# ── Timesheet entries ──────────────────────────────────────────────────────────

def get_entries_by_date(user_id: str, entry_date: str):
    query = """
        SELECT id, user_id, task_id, task_title, entry_date,
               work_description, hours, status, rejection_reason, epic
        FROM timesheet_entries
        WHERE user_id = %s AND entry_date = %s
        ORDER BY created_at ASC
    """
    return execute_query(query, (user_id, entry_date), fetch_all=True)


def create_entry(user_id: str, task_id: str, task_title: str,
                 entry_date: str, work_description: str, hours: float,
                 status: str = "pending", epic: str = None) -> Optional[Dict[str, Any]]:
    import uuid
    entry_id = str(uuid.uuid4())[:12]
    insert_query = """
        INSERT INTO timesheet_entries
            (id, user_id, task_id, task_title, entry_date, work_description, hours, status, epic, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
    """
    execute_query(insert_query, (entry_id, user_id, task_id, task_title, entry_date, work_description, hours, status, epic), fetch_all=False)
    select_query = """
        SELECT id, user_id, task_id, task_title, entry_date, work_description, hours, status, rejection_reason, epic
        FROM timesheet_entries
        WHERE id = %s AND user_id = %s
    """
    return execute_query(select_query, (entry_id, user_id), fetch_one=True)


def resubmit_entry(entry_id: str, user_id: str, work_description: str = None,
                   hours: float = None, task_id: str = None, task_title: str = None):
    """Resource edits a rejected entry and resubmits."""
    updates, params = ["status = 'pending'", "rejection_reason = NULL"], []
    if work_description is not None:
        updates.append("work_description = %s"); params.append(work_description)
    if hours is not None:
        updates.append("hours = %s"); params.append(hours)
    if task_id is not None:
        updates.append("task_id = %s"); params.append(task_id)
    if task_title is not None:
        updates.append("task_title = %s"); params.append(task_title)
    params += [entry_id, user_id]
    execute_query(
        f"UPDATE timesheet_entries SET {', '.join(updates)} WHERE id = %s AND user_id = %s",
        tuple(params), fetch_all=False
    )


def delete_entry(entry_id: str, user_id: str) -> bool:
    query = "DELETE FROM timesheet_entries WHERE id = %s AND user_id = %s"
    execute_query(query, (entry_id, user_id), fetch_all=False)
    return True


def edit_entry(entry_id: str, user_id: str, work_description: str, hours: float) -> Optional[Dict[str, Any]]:
    """Resource/teamlead edits their own pending or resubmitted entry."""
    execute_query(
        """UPDATE timesheet_entries
           SET work_description = %s, hours = %s
           WHERE id = %s AND user_id = %s AND status IN ('pending', 'resubmitted')""",
        (work_description, hours, entry_id, user_id), fetch_all=False,
    )
    return execute_query(
        "SELECT id, user_id, task_id, task_title, entry_date, work_description, hours, status, rejection_reason, epic FROM timesheet_entries WHERE id = %s",
        (entry_id,), fetch_one=True,
    )


def edit_entry_admin(entry_id: str, work_description: str, hours: float) -> Optional[Dict[str, Any]]:
    """Admin edits any entry regardless of owner or status."""
    execute_query(
        "UPDATE timesheet_entries SET work_description = %s, hours = %s WHERE id = %s",
        (work_description, hours, entry_id), fetch_all=False,
    )
    return execute_query(
        "SELECT id, user_id, task_id, task_title, entry_date, work_description, hours, status, rejection_reason, epic FROM timesheet_entries WHERE id = %s",
        (entry_id,), fetch_one=True,
    )


def delete_entry_admin(entry_id: str) -> bool:
    """Admin: delete any entry regardless of owner."""
    execute_query("DELETE FROM timesheet_entries WHERE id = %s", (entry_id,), fetch_all=False)
    return True


def get_week_hours(user_id: str, week_start: str, week_end: str) -> float:
    query = """
        SELECT COALESCE(SUM(hours), 0) as total
        FROM timesheet_entries
        WHERE user_id = %s AND entry_date BETWEEN %s AND %s
    """
    row = execute_query(query, (user_id, week_start, week_end), fetch_one=True)
    return float(row['total']) if row else 0.0


def get_all_logged_hours(user_id: str) -> dict:
    """Return {task_id: total_hours} for all tasks logged by a user."""
    query = """
        SELECT task_id, CAST(SUM(hours) AS FLOAT) as total
        FROM timesheet_entries
        WHERE user_id = %s
        GROUP BY task_id
    """
    rows = execute_query(query, (user_id,), fetch_all=True)
    return {row['task_id']: float(row['total']) for row in rows} if rows else {}


# ── Role-based queries ─────────────────────────────────────────────────────────

def get_subordinates(manager_id: str) -> list:
    """Return all users directly managed by manager_id. Cached 5 min."""
    key = f"subs:{manager_id}"
    val, hit = _get(key, 300)
    if hit:
        return val
    result = execute_query(
        "SELECT user_id, email, full_name, role, avatar, manager_id FROM users WHERE manager_id = %s AND is_active = true ORDER BY full_name",
        (manager_id,), fetch_all=True
    ) or []
    _set(key, result)
    return result


def get_all_users() -> list:
    """Admin: return all active users."""
    return execute_query(
        "SELECT user_id, email, full_name, role, avatar, manager_id FROM users WHERE is_active = true ORDER BY role, full_name",
        fetch_all=True
    ) or []


def get_all_users_with_details() -> list:
    """Admin: all active users with manager name and subordinate count."""
    return execute_query("""
        SELECT u.user_id, u.email, u.full_name, u.role, u.avatar, u.manager_id,
               m.full_name AS manager_name,
               (SELECT COUNT(*) FROM users r
                WHERE r.manager_id = u.user_id AND r.is_active = true) AS resource_count
        FROM users u
        LEFT JOIN users m ON m.user_id = u.manager_id
        WHERE u.is_active = true
        ORDER BY
            CASE u.role WHEN 'admin' THEN 0 WHEN 'teamlead' THEN 1 ELSE 2 END,
            u.full_name
    """, fetch_all=True) or []


def set_users_manager(user_ids: list, manager_id):
    """Bulk-update manager_id for a list of users."""
    if not user_ids:
        return
    placeholders = ','.join(['%s'] * len(user_ids))
    execute_query(
        f"UPDATE users SET manager_id = %s WHERE user_id IN ({placeholders})",
        (manager_id,) + tuple(user_ids), fetch_all=False
    )


def update_user_role_and_manager(user_id: str, role: str, manager_id: str = None):
    execute_query(
        "UPDATE users SET role = %s, manager_id = %s WHERE user_id = %s",
        (role, manager_id, user_id), fetch_all=False
    )


# ── Approval queries ────────────────────────────────────────────────────────────

def get_pending_entries_for_manager(manager_id: str, entry_date: str = None) -> list:
    """Fetch pending/resubmitted entries from direct subordinates. Cached 30 s."""
    key = f"pending:{manager_id}:{entry_date or '*'}"
    val, hit = _get(key, 30)
    if hit:
        return val
    if entry_date:
        query = """
            SELECT te.*, u.full_name, u.email, u.avatar, u.role
            FROM timesheet_entries te
            JOIN users u ON u.user_id = te.user_id
            WHERE u.manager_id = %s AND u.is_active = true
            AND te.entry_date = %s
            AND te.status IN ('pending', 'resubmitted')
            ORDER BY te.entry_date DESC, u.full_name
        """
        result = execute_query(query, (manager_id, entry_date), fetch_all=True) or []
    else:
        query = """
            SELECT te.*, u.full_name, u.email, u.avatar, u.role
            FROM timesheet_entries te
            JOIN users u ON u.user_id = te.user_id
            WHERE u.manager_id = %s AND u.is_active = true
            AND te.status IN ('pending', 'resubmitted')
            ORDER BY te.entry_date DESC, u.full_name
        """
        result = execute_query(query, (manager_id,), fetch_all=True) or []
    _set(key, result)
    return result


def get_all_pending_entries(entry_date: str = None) -> list:
    """Admin: fetch ALL pending/resubmitted entries across every user. Not cached."""
    if entry_date:
        query = """
            SELECT te.*, u.full_name, u.email, u.avatar, u.role,
                   m.full_name AS manager_name
            FROM timesheet_entries te
            JOIN users u ON u.user_id = te.user_id
            LEFT JOIN users m ON m.user_id = u.manager_id
            WHERE te.entry_date = %s
              AND te.status IN ('pending', 'resubmitted')
            ORDER BY te.entry_date DESC, u.full_name
        """
        return execute_query(query, (entry_date,), fetch_all=True) or []
    else:
        query = """
            SELECT te.*, u.full_name, u.email, u.avatar, u.role,
                   m.full_name AS manager_name
            FROM timesheet_entries te
            JOIN users u ON u.user_id = te.user_id
            LEFT JOIN users m ON m.user_id = u.manager_id
            WHERE te.status IN ('pending', 'resubmitted')
            ORDER BY te.entry_date DESC, u.full_name
        """
        return execute_query(query, fetch_all=True) or []


def approve_entry(entry_id: str, approved_by: str):
    execute_query(
        "UPDATE timesheet_entries SET status='approved', approved_by=%s, approved_at=CURRENT_TIMESTAMP WHERE id=%s",
        (approved_by, entry_id), fetch_all=False
    )


def reject_entry(entry_id: str, rejected_by: str, reason: str):
    execute_query(
        "UPDATE timesheet_entries SET status='rejected', approved_by=%s, rejection_reason=%s, approved_at=CURRENT_TIMESTAMP WHERE id=%s",
        (rejected_by, reason, entry_id), fetch_all=False
    )


def approve_all_entries(approved_by: str, entry_date: str = None):
    """Admin: approve ALL pending/resubmitted entries across every user."""
    if entry_date:
        execute_query(
            """UPDATE timesheet_entries SET status='approved', approved_by=%s, approved_at=CURRENT_TIMESTAMP
               WHERE entry_date=%s AND status IN ('pending','resubmitted')""",
            (approved_by, entry_date), fetch_all=False
        )
    else:
        execute_query(
            """UPDATE timesheet_entries SET status='approved', approved_by=%s, approved_at=CURRENT_TIMESTAMP
               WHERE status IN ('pending','resubmitted')""",
            (approved_by,), fetch_all=False
        )


def approve_all_for_manager(manager_id: str, entry_date: str = None):
    """Approve all pending entries from subordinates (optionally filtered by date)."""
    subordinate_ids = [s['user_id'] for s in get_subordinates(manager_id)]
    if not subordinate_ids:
        return 0
    placeholders = ','.join(['%s'] * len(subordinate_ids))
    if entry_date:
        query = f"""UPDATE timesheet_entries SET status='approved', approved_by=%s, approved_at=CURRENT_TIMESTAMP
                    WHERE user_id IN ({placeholders}) AND entry_date=%s AND status IN ('pending','resubmitted')"""
        execute_query(query, (manager_id,) + tuple(subordinate_ids) + (entry_date,), fetch_all=False)
    else:
        query = f"""UPDATE timesheet_entries SET status='approved', approved_by=%s, approved_at=CURRENT_TIMESTAMP
                    WHERE user_id IN ({placeholders}) AND status IN ('pending','resubmitted')"""
        execute_query(query, (manager_id,) + tuple(subordinate_ids), fetch_all=False)


def get_analytics_for_manager(manager_id: str, start_date: str, end_date: str) -> list:
    """Hours + entry count per subordinate in date range."""
    subordinate_ids = [s['user_id'] for s in get_subordinates(manager_id)]
    if not subordinate_ids:
        return []
    placeholders = ','.join(['%s'] * len(subordinate_ids))
    query = f"""
        SELECT u.user_id, u.full_name, u.email, u.avatar, u.role,
               u.manager_id,
               m.full_name AS manager_name,
               COALESCE(SUM(te.hours), 0)   AS total_hours,
               COUNT(te.id)                  AS total_entries,
               COUNT(CASE WHEN te.status = 'pending'  THEN 1 END) AS pending_count,
               COUNT(CASE WHEN te.status = 'approved' THEN 1 END) AS approved_count
        FROM users u
        LEFT JOIN users m ON m.user_id = u.manager_id
        LEFT JOIN timesheet_entries te
          ON te.user_id = u.user_id
          AND te.entry_date BETWEEN %s AND %s
        WHERE u.user_id IN ({placeholders})
        GROUP BY u.user_id, u.full_name, u.email, u.avatar, u.role, u.manager_id, m.full_name
        ORDER BY u.full_name
    """
    return execute_query(query, (start_date, end_date) + tuple(subordinate_ids), fetch_all=True) or []


def get_all_entries_for_user(user_id: str, status: str = None) -> list:
    """All timesheet entries for a user across all dates, newest first."""
    if status:
        query = """
            SELECT id, user_id, task_id, task_title, entry_date,
                   work_description, hours, status, rejection_reason, created_at
            FROM timesheet_entries
            WHERE user_id = %s AND status = %s
            ORDER BY entry_date DESC, created_at DESC
        """
        return execute_query(query, (user_id, status), fetch_all=True) or []
    else:
        query = """
            SELECT id, user_id, task_id, task_title, entry_date,
                   work_description, hours, status, rejection_reason, created_at
            FROM timesheet_entries
            WHERE user_id = %s
            ORDER BY entry_date DESC, created_at DESC
        """
        return execute_query(query, (user_id,), fetch_all=True) or []


def get_task_total_logged(user_id: str, task_id: str) -> float:
    query = """
        SELECT COALESCE(SUM(hours), 0) as total
        FROM timesheet_entries
        WHERE user_id = %s AND task_id = %s
    """
    row = execute_query(query, (user_id, task_id), fetch_one=True)
    return float(row['total']) if row else 0.0


def get_analytics_for_all_resources(start_date: str, end_date: str) -> list:
    """Admin: hours + entry count per ALL active users in date range (including admins)."""
    query = """
        SELECT u.user_id, u.full_name, u.email, u.avatar, u.role,
               u.manager_id,
               m.full_name AS manager_name,
               COALESCE(SUM(te.hours), 0)                                AS total_hours,
               COUNT(te.id)                                               AS total_entries,
               COUNT(CASE WHEN te.status = 'pending'  THEN 1 END)        AS pending_count,
               COUNT(CASE WHEN te.status = 'approved' THEN 1 END)        AS approved_count
        FROM users u
        LEFT JOIN users m ON m.user_id = u.manager_id
        LEFT JOIN timesheet_entries te
          ON te.user_id = u.user_id
          AND te.entry_date BETWEEN %s AND %s
        WHERE u.is_active = true
        GROUP BY u.user_id, u.full_name, u.email, u.avatar, u.role, u.manager_id, m.full_name
        ORDER BY
            CASE u.role WHEN 'admin' THEN 0 WHEN 'teamlead' THEN 1 ELSE 2 END,
            u.full_name
    """
    return execute_query(query, (start_date, end_date), fetch_all=True) or []


def get_task_breakdown_for_user(user_id: str, start_date: str, end_date: str) -> list:
    """Per-task hours + status counts for a single user in date range."""
    query = """
        SELECT task_id, task_title,
               CAST(SUM(hours) AS FLOAT)                                  AS total_hours,
               COUNT(id)                                                   AS total_entries,
               COUNT(CASE WHEN status = 'pending'  THEN 1 END)            AS pending_count,
               COUNT(CASE WHEN status = 'approved' THEN 1 END)            AS approved_count,
               COUNT(CASE WHEN status = 'rejected' THEN 1 END)            AS rejected_count
        FROM timesheet_entries
        WHERE user_id = %s
          AND entry_date BETWEEN %s AND %s
        GROUP BY task_id, task_title
        ORDER BY total_hours DESC
    """
    return execute_query(query, (user_id, start_date, end_date), fetch_all=True) or []


def get_epic_dashboard_entries(start_date: str, end_date: str) -> list:
    """Epic dashboard: logged hours grouped by user + task + epic for the date range.
    Used to overlay DB hours onto Jira task/epic data."""
    return execute_query("""
        SELECT te.user_id, te.task_id, te.task_title,
               COALESCE(te.epic, '') AS epic,
               CAST(SUM(te.hours) AS FLOAT) AS total_hours,
               COUNT(*) AS total_entries
        FROM timesheet_entries te
        WHERE te.entry_date BETWEEN %s AND %s
        GROUP BY te.user_id, te.task_id, te.task_title, te.epic
        ORDER BY te.epic, te.user_id
    """, (start_date, end_date), fetch_all=True) or []
