from fastapi import APIRouter, HTTPException, status, Depends
import logging
from datetime import timedelta
from app.schemas.user import UserLogin, Token, UserResponse
from app.core.security import create_access_token, get_current_user
from app.core.config import settings
from app.db.queries import find_user_by_email, create_user, get_user_by_id
from app.services.jira_service import jira_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    logger.info(f"🔐 Login attempt for email: {credentials.email}")
    logger.info(f"📌 Using Jira authentication (NOT Google Auth)")
    
    # Verify against Jira
    jira_user = jira_service.verify_user(credentials.email)
    if not jira_user:
        logger.warning(f"❌ Jira verification failed for: {credentials.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found in Jira or invalid credentials"
        )
    
    logger.info(f"✅ Jira verification successful: {jira_user['display_name']} ({jira_user['account_id']})")
    
    # Check if user already in database
    db_user = find_user_by_email(credentials.email)
    if not db_user:
        logger.info(f"👤 Creating new user in database: {credentials.email}")
        db_user = create_user(
            email=jira_user['email'],
            full_name=jira_user['display_name'],
            role='resource'
        )
        logger.info(f"✅ User created in database: {db_user['user_id']}")
    else:
        logger.info(f"✅ User found in database: {db_user['user_id']}")
    
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={
            "sub": db_user['user_id'],
            "email": db_user['email'],
            "role": db_user['role'],
            "jira_account_id": jira_user['account_id']
        },
        expires_delta=access_token_expires
    )
    
    logger.info(f"🎟️  JWT token created for user: {db_user['user_id']}")
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse(**db_user)
    }

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    logger.info(f"📖 Fetching current user info: {current_user['sub']}")
    user = get_user_by_id(current_user['sub'])
    if not user:
        logger.error(f"❌ User not found: {current_user['sub']}")
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)
