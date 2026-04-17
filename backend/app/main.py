import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, jira, timesheet, calendar

logger = logging.getLogger(__name__)

app = FastAPI(
    title="TimeSync API - Phase 1",
    description="Express Analytics Timesheet & Jira Sync System",
    version="1.0.0"
)

# Debug: confirm the FRONTEND_URL value that was loaded from the environment
logger.warning("CORS config — FRONTEND_URL resolved to: %s", settings.FRONTEND_URL)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(jira.router)
app.include_router(timesheet.router)
app.include_router(calendar.router)

@app.get("/")
async def root():
    return {
        "message": "TimeSync API - Phase 1",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
