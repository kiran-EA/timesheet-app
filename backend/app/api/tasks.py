from fastapi import APIRouter, Depends, HTTPException, status, Query
import logging
from datetime import datetime, timedelta
from typing import Optional
from pydantic import BaseModel
from app.core.security import get_current_user
from app.db.queries import get_user_by_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tasks", tags=["Tasks Management"])

class TaskCreate(BaseModel):
    title: str
    description: str = ""
    status: str = "pending"  # pending, in-progress, completed
    priority: str = "medium"  # low, medium, high
    due_date: Optional[datetime] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None

# In-memory task storage (in production, use database)
tasks_store = {}

@router.post("/")
async def create_task(task: TaskCreate, current_user: dict = Depends(get_current_user)):
    """Create a new task"""
    logger.info(f"📝 Creating task: {task.title}")
    
    try:
        task_id = f"Task_{current_user['sub']}_{datetime.now().timestamp()}"
        
        task_data = {
            "id": task_id,
            "user_id": current_user['sub'],
            "title": task.title,
            "description": task.description,
            "status": task.status,
            "priority": task.priority,
            "due_date": task.due_date,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        
        tasks_store[task_id] = task_data
        logger.info(f"✅ Task created: {task_id}")
        
        return {
            "success": True,
            "message": "Task created successfully",
            "task": task_data
        }
    except Exception as e:
        logger.error(f"❌ Error creating task: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create task: {str(e)}"
        )

@router.get("/")
async def get_user_tasks(
    current_user: dict = Depends(get_current_user),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None)
):
    """Get all tasks for current user with optional filtering"""
    logger.info(f"📋 Fetching tasks for user: {current_user['sub']}")
    
    try:
        user_tasks = [
            task for task in tasks_store.values() 
            if task['user_id'] == current_user['sub']
        ]
        
        # Apply filters
        if status:
            user_tasks = [t for t in user_tasks if t['status'] == status]
        if priority:
            user_tasks = [t for t in user_tasks if t['priority'] == priority]
        
        logger.info(f"✅ Retrieved {len(user_tasks)} tasks")
        
        return {
            "success": True,
            "count": len(user_tasks),
            "tasks": user_tasks
        }
    except Exception as e:
        logger.error(f"❌ Error fetching tasks: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch tasks: {str(e)}"
        )

@router.get("/{task_id}")
async def get_task_details(task_id: str, current_user: dict = Depends(get_current_user)):
    """Get detailed information for a specific task"""
    logger.info(f"📖 Fetching task: {task_id}")
    
    try:
        task = tasks_store.get(task_id)
        if not task:
            logger.warning(f"❌ Task not found: {task_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found"
            )
        
        # Check if user owns this task
        if task['user_id'] != current_user['sub']:
            logger.warning(f"❌ Unauthorized access to task: {task_id}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to access this task"
            )
        
        logger.info(f"✅ Retrieved task: {task_id}")
        return {
            "success": True,
            "task": task
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error fetching task: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch task: {str(e)}"
        )

@router.put("/{task_id}")
async def update_task(task_id: str, task: TaskUpdate, current_user: dict = Depends(get_current_user)):
    """Update a task"""
    logger.info(f"✏️ Updating task: {task_id}")
    
    try:
        existing_task = tasks_store.get(task_id)
        if not existing_task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found"
            )
        
        # Check if user owns this task
        if existing_task['user_id'] != current_user['sub']:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to update this task"
            )
        
        # Update fields
        if task.title is not None:
            existing_task['title'] = task.title
        if task.description is not None:
            existing_task['description'] = task.description
        if task.status is not None:
            existing_task['status'] = task.status
        if task.priority is not None:
            existing_task['priority'] = task.priority
        if task.due_date is not None:
            existing_task['due_date'] = task.due_date
        
        existing_task['updated_at'] = datetime.now()
        logger.info(f"✅ Task updated: {task_id}")
        
        return {
            "success": True,
            "message": "Task updated successfully",
            "task": existing_task
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error updating task: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update task: {str(e)}"
        )

@router.delete("/{task_id}")
async def delete_task(task_id: str, current_user: dict = Depends(get_current_user)):
    """Delete a task"""
    logger.info(f"🗑️ Deleting task: {task_id}")
    
    try:
        task = tasks_store.get(task_id)
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found"
            )
        
        # Check if user owns this task
        if task['user_id'] != current_user['sub']:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to delete this task"
            )
        
        del tasks_store[task_id]
        logger.info(f"✅ Task deleted: {task_id}")
        
        return {
            "success": True,
            "message": "Task deleted successfully"
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error deleting task: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete task: {str(e)}"
        )

@router.get("/stats/summary")
async def get_task_stats(current_user: dict = Depends(get_current_user)):
    """Get task statistics/summary for current user"""
    logger.info(f"📊 Getting task statistics for user: {current_user['sub']}")
    
    try:
        user_tasks = [
            task for task in tasks_store.values() 
            if task['user_id'] == current_user['sub']
        ]
        
        stats = {
            "total_tasks": len(user_tasks),
            "pending": len([t for t in user_tasks if t['status'] == 'pending']),
            "in_progress": len([t for t in user_tasks if t['status'] == 'in-progress']),
            "completed": len([t for t in user_tasks if t['status'] == 'completed']),
            "high_priority": len([t for t in user_tasks if t['priority'] == 'high']),
            "overdue": len([t for t in user_tasks if t['due_date'] and t['due_date'] < datetime.now()])
        }
        
        logger.info(f"✅ Task stats: {stats}")
        
        return {
            "success": True,
            "stats": stats
        }
    except Exception as e:
        logger.error(f"❌ Error getting task stats: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get task statistics: {str(e)}"
        )
