from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from fastapi.responses import RedirectResponse
import logging
import urllib.parse
import requests as http_requests
from datetime import timedelta
from app.schemas.user import UserLogin, Token, UserResponse
from app.core.security import create_access_token, get_current_user
from app.core.config import settings
from app.db.queries import find_user_by_email, create_user, get_user_by_id, set_google_id
from app.services.jira_service import jira_service
from app.api.jira import _fetch_tasks_cached

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, background_tasks: BackgroundTasks):
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
            "sub":            db_user['user_id'],
            "email":          db_user['email'],
            "role":           db_user['role'],
            "manager_id":     db_user.get('manager_id'),
            "jira_account_id": jira_user['account_id']
        },
        expires_delta=access_token_expires
    )
    
    logger.info(f"🎟️  JWT token created for user: {db_user['user_id']}")

    # Pre-warm Jira task cache in background — by the time the browser
    # navigates to /timesheet the cache is hot and tasks load instantly.
    background_tasks.add_task(_fetch_tasks_cached, db_user['email'])

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse(**db_user)
    }

@router.get("/google")
async def google_login():
    """Redirect user to Google OAuth consent screen."""
    if not settings.GOOGLE_LOGIN_CLIENT_ID:
        raise HTTPException(status_code=501, detail="Google login not configured")
    params = urllib.parse.urlencode({
        "client_id":     settings.GOOGLE_LOGIN_CLIENT_ID,
        "redirect_uri":  settings.GOOGLE_LOGIN_REDIRECT_URI,
        "response_type": "code",
        "scope":         "openid email profile",
        "access_type":   "offline",
        "hd":            "expressanalytics.net",
        "prompt":        "select_account",
    })
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
async def google_callback(code: str = None, error: str = None):
    """Handle Google OAuth callback, issue JWT, redirect to frontend."""
    frontend = settings.FRONTEND_URL.rstrip("/")

    if error or not code:
        return RedirectResponse(f"{frontend}/login?error=google_cancelled")

    # Exchange code → tokens
    token_resp = http_requests.post("https://oauth2.googleapis.com/token", data={
        "client_id":     settings.GOOGLE_LOGIN_CLIENT_ID,
        "client_secret": settings.GOOGLE_LOGIN_CLIENT_SECRET,
        "code":          code,
        "grant_type":    "authorization_code",
        "redirect_uri":  settings.GOOGLE_LOGIN_REDIRECT_URI,
    }, timeout=10)

    if not token_resp.ok:
        logger.error(f"Google token exchange failed: {token_resp.text}")
        return RedirectResponse(f"{frontend}/login?error=google_failed")

    id_token = token_resp.json().get("id_token")
    if not id_token:
        return RedirectResponse(f"{frontend}/login?error=google_failed")

    # Verify ID token and extract user info via Google's tokeninfo endpoint
    info_resp = http_requests.get(
        f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}", timeout=10
    )
    if not info_resp.ok:
        return RedirectResponse(f"{frontend}/login?error=google_failed")

    info = info_resp.json()
    email     = info.get("email", "")
    google_id = info.get("sub", "")
    hd        = info.get("hd", "")

    if hd != "expressanalytics.net":
        return RedirectResponse(f"{frontend}/login?error=wrong_domain")

    db_user = find_user_by_email(email)
    if not db_user:
        return RedirectResponse(f"{frontend}/login?error=no_account")

    if not db_user.get("google_auth_enabled"):
        return RedirectResponse(f"{frontend}/login?error=google_not_enabled")

    # Link Google ID on first login
    if not db_user.get("google_id"):
        set_google_id(db_user["user_id"], google_id)

    access_token = create_access_token(
        data={
            "sub":        db_user["user_id"],
            "email":      db_user["email"],
            "role":       db_user["role"],
            "manager_id": db_user.get("manager_id"),
        },
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    params = urllib.parse.urlencode({
        "token":      access_token,
        "user_id":    db_user["user_id"],
        "email":      db_user["email"],
        "name":       db_user["full_name"],
        "role":       db_user["role"],
        "avatar":     db_user.get("avatar") or "",
        "manager_id": db_user.get("manager_id") or "",
    })
    return RedirectResponse(f"{frontend}/auth/callback?{params}")


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    logger.info(f"📖 Fetching current user info: {current_user['sub']}")
    user = get_user_by_id(current_user['sub'])
    if not user:
        logger.error(f"❌ User not found: {current_user['sub']}")
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)
