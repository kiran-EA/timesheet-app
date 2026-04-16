from typing import Optional, Dict, Any
from app.db.database import execute_query

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
               work_description, hours
        FROM timesheet_entries
        WHERE user_id = %s AND entry_date = %s
        ORDER BY created_at ASC
    """
    return execute_query(query, (user_id, entry_date), fetch_all=True)


def create_entry(user_id: str, task_id: str, task_title: str,
                 entry_date: str, work_description: str, hours: float) -> Optional[Dict[str, Any]]:
    import uuid
    entry_id = str(uuid.uuid4())[:12]
    insert_query = """
        INSERT INTO timesheet_entries
            (id, user_id, task_id, task_title, entry_date, work_description, hours, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
    """
    execute_query(insert_query, (entry_id, user_id, task_id, task_title, entry_date, work_description, hours), fetch_all=False)
    select_query = """
        SELECT id, user_id, task_id, task_title, entry_date, work_description, hours
        FROM timesheet_entries
        WHERE id = %s AND user_id = %s
    """
    return execute_query(select_query, (entry_id, user_id), fetch_one=True)


def delete_entry(entry_id: str, user_id: str) -> bool:
    query = "DELETE FROM timesheet_entries WHERE id = %s AND user_id = %s"
    execute_query(query, (entry_id, user_id), fetch_all=False)
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


def get_task_total_logged(user_id: str, task_id: str) -> float:
    query = """
        SELECT COALESCE(SUM(hours), 0) as total
        FROM timesheet_entries
        WHERE user_id = %s AND task_id = %s
    """
    row = execute_query(query, (user_id, task_id), fetch_one=True)
    return float(row['total']) if row else 0.0
