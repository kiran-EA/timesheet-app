from pydantic import BaseModel
from typing import Optional
from datetime import date


class TimesheetEntryCreate(BaseModel):
    task_id: str
    task_title: str
    entry_date: date
    work_description: str
    hours: float


class TimesheetEntryResponse(BaseModel):
    id: str
    user_id: str
    task_id: str
    task_title: str
    entry_date: date
    work_description: str
    hours: float
    est_hours: Optional[float] = None
    total_logged: Optional[float] = None


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
