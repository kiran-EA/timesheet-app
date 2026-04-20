from pydantic import BaseModel
from typing import Optional
from datetime import date


class TimesheetEntryCreate(BaseModel):
    task_id: str
    task_title: str
    entry_date: date
    work_description: str
    hours: float
    target_user_id: Optional[str] = None   # admin only: log entry for another user
    epic: Optional[str] = None              # Jira epic key


class TimesheetEntryResponse(BaseModel):
    id: str
    user_id: str
    task_id: str
    task_title: str
    entry_date: date
    work_description: str
    hours: float
    status: Optional[str] = "pending"
    rejection_reason: Optional[str] = None
    approved_by: Optional[str] = None
    est_hours: Optional[float] = None
    total_logged: Optional[float] = None
    epic: Optional[str] = None


class JiraTask(BaseModel):
    id: str
    key: str
    title: str
    epic: Optional[str] = None
    story_points: Optional[float] = None
    est_hours: Optional[float] = None
    logged_hours: float = 0
    status: str
    sprint: Optional[str] = None
    is_active_sprint: bool = False
    assignee: Optional[str] = None
