from fastapi import APIRouter, Depends, HTTPException, status, Query
import logging
from pydantic import BaseModel
from app.core.security import get_current_user
from app.services.google_calendar_service import google_calendar_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/calendar", tags=["Google Calendar"])

class EventData(BaseModel):
    summary: str
    description: str = ""
    start: dict
    end: dict
    location: str = ""
    attendees: list = []

@router.get("/auth-url")
async def get_auth_url():
    """Get Google OAuth authentication URL"""
    logger.info("🔐 Generating Google Calendar auth URL")
    
    try:
        auth_url = google_calendar_service.get_auth_url()
        if not auth_url:
            logger.error("❌ Failed to generate auth URL")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to generate authentication URL"
            )
        
        logger.info("✅ Auth URL generated")
        return {
            "success": True,
            "auth_url": auth_url,
            "message": "Visit this URL to authenticate with Google Calendar"
        }
    except Exception as e:
        logger.error(f"❌ Error generating auth URL: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate auth URL: {str(e)}"
        )

@router.post("/callback")
async def handle_callback(code: str = Query(...), current_user: dict = Depends(get_current_user)):
    """Handle Google OAuth callback after user authentication"""
    logger.info(f"🔄 Processing Google OAuth callback for user: {current_user['sub']}")
    
    try:
        token_data = google_calendar_service.exchange_code_for_token(code)
        if not token_data:
            logger.error("❌ Failed to exchange code for token")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Failed to authenticate with Google Calendar"
            )
        
        logger.info("✅ Google authentication successful")
        # In production, you would store this token in the database
        
        return {
            "success": True,
            "message": "Successfully authenticated with Google Calendar",
            "token": token_data['access_token'][:20] + "..." # Don't expose full token
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error in OAuth callback: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process authentication: {str(e)}"
        )

@router.get("/events")
async def get_calendar_events(
    access_token: str = Query(...),
    days: int = Query(7, ge=1, le=90)
):
    """Get upcoming events from Google Calendar"""
    logger.info(f"📅 Fetching calendar events for next {days} days")
    
    try:
        events = google_calendar_service.get_events(access_token, days)
        logger.info(f"✅ Retrieved {len(events)} events")
        
        return {
            "success": True,
            "count": len(events),
            "events": events
        }
    except Exception as e:
        logger.error(f"❌ Error fetching calendar events: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch calendar events: {str(e)}"
        )

@router.post("/events")
async def create_calendar_event(event_data: EventData, access_token: str = Query(...)):
    """Create a new event in Google Calendar"""
    logger.info(f"📝 Creating calendar event: {event_data.summary}")
    
    try:
        event_body = {
            'summary': event_data.summary,
            'description': event_data.description,
            'start': event_data.start,
            'end': event_data.end,
            'location': event_data.location
        }
        
        if event_data.attendees:
            event_body['attendees'] = [
                {'email': attendee} if isinstance(attendee, str) else attendee
                for attendee in event_data.attendees
            ]
        
        event = google_calendar_service.create_event(access_token, event_body)
        if not event:
            logger.error("❌ Failed to create event")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create calendar event"
            )
        
        logger.info(f"✅ Event created: {event['id']}")
        return {
            "success": True,
            "message": "Event created successfully",
            "event": event
        }
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"❌ Error creating event: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create event: {str(e)}"
        )

@router.get("/status")
async def calendar_connection_status(access_token: str = Query(...)):
    """Check Google Calendar connection status"""
    logger.info("🔍 Checking Google Calendar connection status")
    
    try:
        events = google_calendar_service.get_events(access_token, days=1)
        logger.info("✅ Google Calendar connection is healthy")
        
        return {
            "status": "connected",
            "message": "Google Calendar connection is healthy",
            "upcoming_events": len(events)
        }
    except Exception as e:
        logger.error(f"❌ Google Calendar connection error: {e}")
        return {
            "status": "error",
            "message": f"Google Calendar connection failed: {str(e)}"
        }
