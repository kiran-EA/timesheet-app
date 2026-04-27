from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, jira, timesheet, calendar, approvals, users

app = FastAPI(
    title="TimeSync API - Phase 1",
    description="Express Analytics Timesheet & Jira Sync System",
    version="1.0.0"
)

# CORS — allow configured frontend + localhost for dev
_origins = list({settings.FRONTEND_URL, "http://localhost:3000", "https://timesheet-app-orcin.vercel.app"})
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(jira.router)
app.include_router(timesheet.router)
app.include_router(calendar.router)
app.include_router(approvals.router)
app.include_router(users.router)

@app.on_event("startup")
async def write_service_account():
    """Write service-account.json from env var if file doesn't exist."""
    import os, json
    content = os.environ.get("GOOGLE_SERVICE_ACCOUNT_CONTENT", "").strip()
    if content and not os.path.exists("service-account.json"):
        try:
            # validate it's real JSON before writing
            json.loads(content)
            with open("service-account.json", "w") as f:
                f.write(content)
            print("service-account.json written from env var")
        except Exception as e:
            print(f"Failed to write service-account.json: {e}")


@app.on_event("startup")
async def run_migrations():
    """Add new columns that may not exist in the live DB yet."""
    from app.db.database import execute_query
    migrations = [
        "ALTER TABLE timesheet_entries ADD COLUMN IF NOT EXISTS epic VARCHAR(200)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_auth_enabled BOOLEAN DEFAULT false",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)",
    ]
    for sql in migrations:
        try:
            execute_query(sql, fetch_all=False)
        except Exception as e:
            print(f"Migration warning: {e}")


@app.get("/")
async def root():
    return {
        "message": "TimeSync API - Phase 1",
        "version": "1.0.0",
        "status": "running"
    }

@app.api_route("/health", methods=["GET", "HEAD"])
async def health_check():
    import os
    from app.core.config import settings
    return {
        "status": "healthy",
        "service_account_env": bool(os.environ.get("GOOGLE_SERVICE_ACCOUNT_CONTENT", "").strip()),
        "service_account_file": os.path.exists("service-account.json"),
        "frontend_url": settings.FRONTEND_URL,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
