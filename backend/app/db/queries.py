from typing import Optional, Dict, Any
from app.db.database import execute_query

def find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    query = "SELECT * FROM users WHERE email = %s"
    return execute_query(query, (email,), fetch_one=True)

def create_user(email: str, full_name: str, role: str = 'resource') -> Dict[str, Any]:
    user_id = f"USR{hash(email) % 100000000:08d}"
    avatar = ''.join([name[0].upper() for name in full_name.split()[:2]])
    
    insert_query = """
        INSERT INTO users (user_id, email, full_name, role, avatar, is_active)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    execute_query(insert_query, (user_id, email, full_name, role, avatar, True), fetch_one=False, fetch_all=False)
    
    # Fetch the created user
    return find_user_by_email(email)

def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    query = "SELECT * FROM users WHERE user_id = %s"
    return execute_query(query, (user_id,), fetch_one=True)

def create_timesheet_entry(user_id: str, jira_key: str, task_description: str, hours: float, work_date: str, notes: str = "") -> Dict[str, Any]:
    """Create a timesheet entry from Jira task"""
    query = """
        INSERT INTO timesheet_entries (user_id, jira_key, task_description, hours, work_date, notes, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, NOW())
    """
    execute_query(query, (user_id, jira_key, task_description, hours, work_date, notes), fetch_one=False, fetch_all=False)
    
    # Fetch the created entry
    select_query = "SELECT * FROM timesheet_entries WHERE user_id = %s AND jira_key = %s AND work_date = %s ORDER BY created_at DESC LIMIT 1"
    return execute_query(select_query, (user_id, jira_key, work_date), fetch_one=True)

def get_timesheet_entries(user_id: str, start_date: Optional[str] = None, end_date: Optional[str] = None) -> list:
    """Fetch timesheet entries for a user"""
    if start_date and end_date:
        query = "SELECT * FROM timesheet_entries WHERE user_id = %s AND work_date BETWEEN %s AND %s ORDER BY work_date DESC"
        return execute_query(query, (user_id, start_date, end_date), fetch_one=False, fetch_all=True)
    else:
        query = "SELECT * FROM timesheet_entries WHERE user_id = %s ORDER BY work_date DESC LIMIT 100"
        return execute_query(query, (user_id,), fetch_one=False, fetch_all=True)

def update_timesheet_entry(entry_id: str, hours: float = None, notes: str = None, work_date: str = None) -> Optional[Dict[str, Any]]:
    """Update a timesheet entry"""
    updates = []
    params = [entry_id]
    
    if hours is not None:
        updates.append("hours = %s")
        params.insert(1, hours)
    if notes is not None:
        updates.append("notes = %s")
        params.insert(len(params)-1, notes)
    if work_date is not None:
        updates.append("work_date = %s")
        params.insert(len(params)-1, work_date)
    
    if not updates:
        return None
    
    query = f"UPDATE timesheet_entries SET {', '.join(updates)}, updated_at = NOW() WHERE entry_id = %s"
    execute_query(query, tuple(params), fetch_one=False, fetch_all=False)
    
    # Fetch updated entry
    select_query = "SELECT * FROM timesheet_entries WHERE entry_id = %s"
    return execute_query(select_query, (entry_id,), fetch_one=True)

def delete_timesheet_entry(entry_id: str) -> bool:
    """Delete a timesheet entry"""
    query = "DELETE FROM timesheet_entries WHERE entry_id = %s"
    execute_query(query, (entry_id,), fetch_one=False, fetch_all=False)
    return True

def get_user_timesheet_summary(user_id: str, start_date: str = None, end_date: str = None) -> Dict[str, Any]:
    """Get timesheet summary for user"""
    if start_date and end_date:
        query = """
            SELECT 
                COUNT(*) as total_entries,
                SUM(hours) as total_hours,
                COUNT(DISTINCT work_date) as working_days,
                AVG(hours) as avg_hours_per_day
            FROM timesheet_entries 
            WHERE user_id = %s AND work_date BETWEEN %s AND %s
        """
        result = execute_query(query, (user_id, start_date, end_date), fetch_one=True)
    else:
        query = """
            SELECT 
                COUNT(*) as total_entries,
                SUM(hours) as total_hours,
                COUNT(DISTINCT work_date) as working_days,
                AVG(hours) as avg_hours_per_day
            FROM timesheet_entries 
            WHERE user_id = %s
        """
        result = execute_query(query, (user_id,), fetch_one=True)
    
    return result if result else {
        'total_entries': 0,
        'total_hours': 0,
        'working_days': 0,
        'avg_hours_per_day': 0
    }
