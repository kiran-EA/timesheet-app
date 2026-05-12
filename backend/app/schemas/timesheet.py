from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import date, time as _time


class TimesheetEntryCreate(BaseModel):
    task_id: str
    task_title: str
    entry_date: date
    work_description: str
    hours: float
    target_user_id: Optional[str] = None   # admin only: log entry for another user
    epic: Optional[str] = None
    is_assisted: bool = False
    assisted_user_id: Optional[str] = None  # user_id of the task owner
    start_time: Optional[str] = None        # HH:MM, used as worklog start time on approval


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
    is_assisted: bool = False
    assisted_user_id: Optional[str] = None
    start_time: Optional[str] = None

    @field_validator('start_time', mode='before')
    @classmethod
    def coerce_start_time(cls, v):
        if isinstance(v, _time):
            return v.strftime('%H:%M:%S')
        return v


class JiraTask(BaseModel):
    id: str
    key: str
    title: str
    epic: Optional[str] = None        # epic key, e.g. "HSB-5"
    epic_name: Optional[str] = None   # epic summary/title, e.g. "Phase 1 Development"
    story_points: Optional[float] = None
    est_hours: Optional[float] = None
    logged_hours: float = 0
    status: str
    sprint: Optional[str] = None
    is_active_sprint: bool = False
    assignee: Optional[str] = None
