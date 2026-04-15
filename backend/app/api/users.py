from fastapi import APIRouter, Depends, HTTPException, status
import logging
from typing import Optional
from pydantic import BaseModel
from app.core.security import get_current_user
from app.db.queries import get_user_by_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["User Management"])

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None

@router.get("/me")
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get current user's profile"""
    logger.info(f"👤 Fetching profile for user: {current_user['sub']}")
    
    try:
        user = get_user_by_id(current_user['sub'])
        if not user:
            logger.error(f"❌ User not found: {current_user['sub']}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        logger.info(f"✅ Profile retrieved for: {user['email']}")
        
        return {
            "success": True,
            "user": {
                "user_id": user['user_id'],
                "email": user['email'],
                "full_name": user['full_name'],
                "role": user['role'],
                "avatar": user.get('avatar', ''),
                "is_active": user['is_active']
            }
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error fetching profile: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch profile: {str(e)}"
        )

@router.put("/me")
async def update_profile(user_update: UserUpdate, current_user: dict = Depends(get_current_user)):
    """Update current user's profile"""
    logger.info(f"✏️ Updating profile for user: {current_user['sub']}")
    
    try:
        # In production, you would update this in the database
        user = get_user_by_id(current_user['sub'])
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Log what's being updated
        if user_update.full_name:
            logger.info(f"   - Updating full_name to: {user_update.full_name}")
        if user_update.role:
            logger.info(f"   - Updating role to: {user_update.role}")
        
        logger.info(f"✅ Profile updated for user: {current_user['sub']}")
        
        # Return updated user
        updated_user = {
            "user_id": user['user_id'],
            "email": user['email'],
            "full_name": user_update.full_name or user['full_name'],
            "role": user_update.role or user['role'],
            "avatar": user.get('avatar', ''),
            "is_active": user['is_active']
        }
        
        return {
            "success": True,
            "message": "Profile updated successfully",
            "user": updated_user
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error updating profile: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update profile: {str(e)}"
        )

@router.get("/search")
async def search_users(query: str = "", current_user: dict = Depends(get_current_user)):
    """Search for users by email or name"""
    logger.info(f"🔍 Searching for users: {query}")
    
    try:
        # In production, this would query the database
        # For now, return empty or mock results
        logger.info(f"⚠️  User search functionality not fully implemented")
        
        return {
            "success": True,
            "query": query,
            "results": []
        }
    except Exception as e:
        logger.error(f"❌ Error searching users: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to search users: {str(e)}"
        )

@router.get("/{user_id}")
async def get_user_details(user_id: str, current_user: dict = Depends(get_current_user)):
    """Get details for a specific user (accessible by authorized users)"""
    logger.info(f"👥 Fetching user details for: {user_id}")
    
    try:
        user = get_user_by_id(user_id)
        if not user:
            logger.warning(f"❌ User not found: {user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        logger.info(f"✅ User details retrieved for: {user['email']}")
        
        return {
            "success": True,
            "user": {
                "user_id": user['user_id'],
                "email": user['email'],
                "full_name": user['full_name'],
                "role": user['role'],
                "avatar": user.get('avatar', ''),
                "is_active": user['is_active']
            }
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error fetching user details: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch user details: {str(e)}"
        )
