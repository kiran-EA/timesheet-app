from fastapi import FastAPI
import logging
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, jira, calendar, tasks, users, timesheet

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="TimeSync API",
    description="Express Analytics Timesheet & Jira Sync System",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json"
)

logger.info("🚀 Initializing TimeSync API")
logger.info(f"📍 Environment: {settings.ENVIRONMENT}")
logger.info(f"🔗 Jira Domain: {settings.JIRA_DOMAIN}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info("✅ CORS Middleware configured")

# Register all routers
app.include_router(auth.router)
logger.info("✅ Auth Router registered")

app.include_router(jira.router)
logger.info("✅ Jira Router registered")

app.include_router(calendar.router)
logger.info("✅ Calendar Router registered")

app.include_router(tasks.router)
logger.info("✅ Tasks Router registered")

app.include_router(users.router)
logger.info("✅ Users Router registered")

app.include_router(timesheet.router)
logger.info("✅ Timesheet Router registered")

logger.info("📋 Endpoint Summary:")
logger.info("  🔐 Auth: POST /auth/login, GET /auth/me")
logger.info("  📌 Jira: GET /jira/issues, GET /jira/issues/{key}, GET /jira/status")
logger.info("  📅 Calendar: GET /calendar/auth-url, POST /calendar/callback, GET /calendar/events")
logger.info("  📝 Tasks: CRUD /tasks/{id}, GET /tasks/stats/summary")
logger.info("  👤 Users: GET /users/me, PUT /users/me, GET /users/{id}")
logger.info("  ⏱️  Timesheet: POST /timesheet/sync-jira-tasks, CRUD /timesheet/entries, GET /timesheet/summary")

@app.get("/")
async def root():
    return {
        "message": "TimeSync API - Phase 1",
        "version": "1.0.0",
        "status": "running",
        "auth": "Jira-based",
        "features": {
            "jira_integration": True,
            "google_calendar": True,
            "task_management": True,
            "user_profiles": True
        },
        "docs": "http://127.0.0.1:8000/docs"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/api/info")
async def api_info():
    """Get detailed API information"""
    return {
        "api": "TimeSync",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "endpoints": {
            "authentication": {
                "login": "POST /auth/login",
                "get_profile": "GET /auth/me"
            },
            "jira": {
                "get_issues": "GET /jira/issues",
                "get_issue_details": "GET /jira/issues/{issue_key}",
                "check_status": "GET /jira/status"
            },
            "calendar": {
                "get_auth_url": "GET /calendar/auth-url",
                "handle_callback": "POST /calendar/callback",
                "get_events": "GET /calendar/events",
                "create_event": "POST /calendar/events",
                "check_status": "GET /calendar/status"
            },
            "tasks": {
                "create_task": "POST /tasks/",
                "get_tasks": "GET /tasks/",
                "get_task": "GET /tasks/{task_id}",
                "update_task": "PUT /tasks/{task_id}",
                "delete_task": "DELETE /tasks/{task_id}",
                "get_stats": "GET /tasks/stats/summary"
            },
            "users": {
                "get_profile": "GET /users/me",
                "update_profile": "PUT /users/me",
                "get_user": "GET /users/{user_id}",
                "search_users": "GET /users/search"
            }
        },
        "documentation": "http://127.0.0.1:8000/docs"
    }
