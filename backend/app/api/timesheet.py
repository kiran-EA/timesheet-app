from fastapi import APIRouter, Depends, HTTPException, status, Query
import logging
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
from app.core.security import get_current_user
from app.services.jira_service import jira_service
from app.db.queries import (
    create_timesheet_entry,
    get_timesheet_entries,
    update_timesheet_entry,
    delete_timesheet_entry,
    get_user_timesheet_summary
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/timesheet", tags=["Timesheet"])

class TimesheetEntry(BaseModel):
    jira_key: str
    task_description: str
    hours: float
    work_date: str
    notes: str = ""

class TimesheetUpdate(BaseModel):
    hours: Optional[float] = None
    notes: Optional[str] = None
    work_date: Optional[str] = None

@router.post("/sync-jira-tasks")
async def sync_jira_tasks(current_user: dict = Depends(get_current_user)):
    """Sync Jira tasks to timesheet"""
    logger.info(f"🔄 Syncing Jira tasks for user: {current_user['sub']}")
    
    try:
        jira_account_id = current_user.get('jira_account_id')
        if not jira_account_id:
            logger.error(f"❌ No Jira account ID for user: {current_user['sub']}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Jira account ID not found. Please re-authenticate."
            )
        
        # Fetch issues from Jira
        issues = jira_service.get_user_issues(jira_account_id)
        logger.info(f"📌 Fetched {len(issues)} issues from Jira")
        
        synced_count = 0
        synced_issues = []
        
        # Create timesheet entries for each issue
        for issue in issues:
            try:
                # Calculate hours from time spent and estimate
                time_spent = issue.get('timespent', 0) or 0
                time_estimate = issue.get('timeestimate', 0) or 0
                
                # Convert seconds to hours
                hours = max(
                    (time_spent / 3600) if time_spent else (time_estimate / 3600) if time_estimate else 0,
                    0.5  # Minimum 0.5 hours
                )
                
                work_date = issue.get('updated', datetime.now().date().isoformat())
                if isinstance(work_date, str) and 'T' in work_date:
                    work_date = work_date.split('T')[0]
                
                # Create timesheet entry
                entry = create_timesheet_entry(
                    user_id=current_user['sub'],
                    jira_key=issue['key'],
                    task_description=issue['summary'],
                    hours=round(hours, 2),
                    work_date=work_date,
                    notes=f"Status: {issue['status']} | Priority: {issue['priority']}"
                )
                
                if entry:
                    synced_count += 1
                    synced_issues.append({
                        'key': issue['key'],
                        'summary': issue['summary'],
                        'hours': round(hours, 2),
                        'date': work_date
                    })
                    logger.info(f"✅ Synced Jira issue: {issue['key']} ({round(hours, 2)}h)")
                    
            except Exception as e:
                logger.warning(f"⚠️  Failed to sync issue {issue.get('key')}: {e}")
                continue
        
        logger.info(f"✅ Sync complete: {synced_count} issues synced to timesheet")
        
        return {
            "success": True,
            "message": f"Successfully synced {synced_count} Jira tasks to timesheet",
            "synced_count": synced_count,
            "synced_issues": synced_issues
        }
        
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error syncing Jira tasks: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to sync Jira tasks: {str(e)}"
        )

@router.post("/entries")
async def create_entry(
    entry: TimesheetEntry,
    current_user: dict = Depends(get_current_user)
):
    """Create a new timesheet entry"""
    logger.info(f"📝 Creating timesheet entry for user: {current_user['sub']}")
    
    try:
        result = create_timesheet_entry(
            user_id=current_user['sub'],
            jira_key=entry.jira_key,
            task_description=entry.task_description,
            hours=entry.hours,
            work_date=entry.work_date,
            notes=entry.notes
        )
        
        logger.info(f"✅ Timesheet entry created: {entry.jira_key}")
        
        return {
            "success": True,
            "message": "Timesheet entry created successfully",
            "entry": result
        }
    except Exception as e:
        logger.error(f"❌ Error creating timesheet entry: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create timesheet entry: {str(e)}"
        )

@router.get("/entries")
async def get_entries(
    current_user: dict = Depends(get_current_user),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """Get timesheet entries for user"""
    logger.info(f"📋 Fetching timesheet entries for user: {current_user['sub']}")
    
    try:
        entries = get_timesheet_entries(
            user_id=current_user['sub'],
            start_date=start_date,
            end_date=end_date
        )
        
        logger.info(f"✅ Retrieved {len(entries) if entries else 0} timesheet entries")
        
        return {
            "success": True,
            "count": len(entries) if entries else 0,
            "entries": entries or []
        }
    except Exception as e:
        logger.error(f"❌ Error fetching timesheet entries: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch timesheet entries: {str(e)}"
        )

@router.put("/entries/{entry_id}")
async def update_entry(
    entry_id: str,
    entry_update: TimesheetUpdate,
    current_user: dict = Depends(get_current_user)
):
    """Update a timesheet entry"""
    logger.info(f"✏️ Updating timesheet entry: {entry_id}")
    
    try:
        result = update_timesheet_entry(
            entry_id=entry_id,
            hours=entry_update.hours,
            notes=entry_update.notes,
            work_date=entry_update.work_date
        )
        
        if not result:
            logger.warning(f"❌ Timesheet entry not found: {entry_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Timesheet entry not found"
            )
        
        logger.info(f"✅ Timesheet entry updated: {entry_id}")
        
        return {
            "success": True,
            "message": "Timesheet entry updated successfully",
            "entry": result
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error updating timesheet entry: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update timesheet entry: {str(e)}"
        )

@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a timesheet entry"""
    logger.info(f"🗑️ Deleting timesheet entry: {entry_id}")
    
    try:
        delete_timesheet_entry(entry_id)
        logger.info(f"✅ Timesheet entry deleted: {entry_id}")
        
        return {
            "success": True,
            "message": "Timesheet entry deleted successfully"
        }
    except Exception as e:
        logger.error(f"❌ Error deleting timesheet entry: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete timesheet entry: {str(e)}"
        )

@router.get("/summary")
async def get_summary(
    current_user: dict = Depends(get_current_user),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None)
):
    """Get timesheet summary"""
    logger.info(f"📊 Getting timesheet summary for user: {current_user['sub']}")
    
    try:
        summary = get_user_timesheet_summary(
            user_id=current_user['sub'],
            start_date=start_date,
            end_date=end_date
        )
        
        logger.info(f"✅ Retrieved timesheet summary: {summary['total_hours']}h")
        
        return {
            "success": True,
            "summary": summary
        }
    except Exception as e:
        logger.error(f"❌ Error getting timesheet summary: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get timesheet summary: {str(e)}"
        )

@router.get("/week-summary")
async def get_week_summary(current_user: dict = Depends(get_current_user)):
    """Get this week's timesheet summary"""
    try:
        today = datetime.now().date()
        week_start = today - timedelta(days=today.weekday())
        week_end = week_start + timedelta(days=6)
        
        summary = get_user_timesheet_summary(
            user_id=current_user['sub'],
            start_date=week_start.isoformat(),
            end_date=week_end.isoformat()
        )
        
        entries = get_timesheet_entries(
            user_id=current_user['sub'],
            start_date=week_start.isoformat(),
            end_date=week_end.isoformat()
        )
        
        logger.info(f"✅ Week summary retrieved: {summary['total_hours']}h from {len(entries) if entries else 0} entries")
        
        return {
            "success": True,
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "summary": summary,
            "entries": entries or []
        }
    except Exception as e:
        logger.error(f"❌ Error getting week summary: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get week summary: {str(e)}"
        )
