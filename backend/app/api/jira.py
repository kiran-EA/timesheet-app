from fastapi import APIRouter, Depends, HTTPException, status
import logging
from app.core.security import get_current_user
from app.services.jira_service import jira_service
from app.db.queries import get_user_by_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/jira", tags=["Jira Integration"])

@router.get("/issues")
async def get_user_issues(current_user: dict = Depends(get_current_user)):
    """Get all Jira issues assigned to current user"""
    logger.info(f"📌 Fetching Jira issues for user: {current_user['sub']}")
    
    try:
        jira_account_id = current_user.get('jira_account_id')
        if not jira_account_id:
            logger.error(f"❌ No Jira account ID found for user: {current_user['sub']}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Jira account ID not found. Please re-authenticate."
            )
        
        issues = jira_service.get_user_issues(jira_account_id)
        logger.info(f"✅ Retrieved {len(issues)} issues for user")
        
        return {
            "success": True,
            "count": len(issues),
            "issues": issues
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error fetching issues: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch Jira issues: {str(e)}"
        )

@router.get("/issues/{issue_key}")
async def get_issue_details(issue_key: str, current_user: dict = Depends(get_current_user)):
    """Get detailed information for a specific Jira issue"""
    logger.info(f"📖 Fetching details for issue: {issue_key}")
    
    try:
        issue = jira_service.get_issue_details(issue_key)
        if not issue:
            logger.warning(f"❌ Issue not found: {issue_key}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Issue {issue_key} not found"
            )
        
        logger.info(f"✅ Retrieved details for issue: {issue_key}")
        return {
            "success": True,
            "issue": issue
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error fetching issue details: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch issue details: {str(e)}"
        )

@router.get("/status")
async def jira_connection_status(current_user: dict = Depends(get_current_user)):
    """Check Jira connection status"""
    logger.info("🔍 Checking Jira connection status")
    
    try:
        jira_account_id = current_user.get('jira_account_id')
        if not jira_account_id:
            return {
                "status": "error",
                "message": "No Jira account ID found"
            }
        
        # Try to fetch one issue to verify connection
        issues = jira_service.get_user_issues(jira_account_id)
        logger.info("✅ Jira connection is healthy")
        
        return {
            "status": "connected",
            "message": "Jira connection is healthy",
            "account_id": jira_account_id
        }
    except Exception as e:
        logger.error(f"❌ Jira connection error: {e}")
        return {
            "status": "error",
            "message": f"Jira connection failed: {str(e)}"
        }
