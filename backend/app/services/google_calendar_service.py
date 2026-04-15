import logging
from typing import Optional, Dict, Any, List
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from datetime import datetime, timedelta
from app.core.config import settings

logger = logging.getLogger(__name__)

class GoogleCalendarService:
    def __init__(self):
        self.scopes = ['https://www.googleapis.com/auth/calendar']
        self.service = None
        logger.info("📅 GoogleCalendarService initialized")
    
    def create_auth_flow(self) -> Flow:
        """Create OAuth flow for user authorization"""
        try:
            logger.info("🔐 Creating Google OAuth flow")
            
            client_config = {
                "installed": {
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                    "token_uri": "https://oauth2.googleapis.com/token",
                    "redirect_uris": [settings.GOOGLE_REDIRECT_URI]
                }
            }
            
            flow = Flow.from_client_config(
                client_config,
                scopes=self.scopes,
                redirect_uri=settings.GOOGLE_REDIRECT_URI
            )
            
            logger.info("✅ OAuth flow created")
            return flow
        except Exception as e:
            logger.error(f"❌ Error creating OAuth flow: {e}", exc_info=True)
            raise
    
    def get_auth_url(self) -> str:
        """Get the authorization URL for user to authenticate"""
        try:
            flow = self.create_auth_flow()
            auth_url, _ = flow.authorization_url(prompt='consent')
            logger.info(f"✅ Auth URL generated: {auth_url[:50]}...")
            return auth_url
        except Exception as e:
            logger.error(f"❌ Error generating auth URL: {e}", exc_info=True)
            return ""
    
    def exchange_code_for_token(self, code: str) -> Optional[Dict[str, Any]]:
        """Exchange authorization code for access token"""
        try:
            logger.info("🔄 Exchanging authorization code for token")
            
            flow = self.create_auth_flow()
            flow.fetch_token(code=code)
            
            credentials = flow.credentials
            token_data = {
                'access_token': credentials.token,
                'refresh_token': credentials.refresh_token,
                'expires_at': credentials.expiry.timestamp() if credentials.expiry else None
            }
            
            logger.info("✅ Token exchange successful")
            return token_data
        except Exception as e:
            logger.error(f"❌ Error exchanging code for token: {e}", exc_info=True)
            return None
    
    def build_service(self, access_token: str):
        """Build Google Calendar service with access token"""
        try:
            credentials = Credentials(token=access_token)
            self.service = build('calendar', 'v3', credentials=credentials)
            logger.info("✅ Google Calendar service built")
            return self.service
        except Exception as e:
            logger.error(f"❌ Error building service: {e}", exc_info=True)
            return None
    
    def get_events(self, access_token: str, days: int = 7) -> List[Dict[str, Any]]:
        """Fetch events from user's primary calendar"""
        try:
            logger.info(f"📅 Fetching events for next {days} days")
            
            service = self.build_service(access_token)
            if not service:
                return []
            
            now = datetime.utcnow().isoformat() + 'Z'
            end_time = (datetime.utcnow() + timedelta(days=days)).isoformat() + 'Z'
            
            events_result = service.events().list(
                calendarId='primary',
                timeMin=now,
                timeMax=end_time,
                maxResults=100,
                singleEvents=True,
                orderBy='startTime'
            ).execute()
            
            events = events_result.get('items', [])
            logger.info(f"✅ Found {len(events)} events")
            
            formatted_events = []
            for event in events:
                start = event.get('start', {})
                end = event.get('end', {})
                
                formatted_events.append({
                    'id': event.get('id', ''),
                    'summary': event.get('summary', ''),
                    'description': event.get('description', ''),
                    'start': start.get('dateTime', start.get('date', '')),
                    'end': end.get('dateTime', end.get('date', '')),
                    'location': event.get('location', ''),
                    'organizer': event.get('organizer', {}).get('email', ''),
                    'attendees': [
                        {
                            'email': attendee.get('email', ''),
                            'displayName': attendee.get('displayName', ''),
                            'responseStatus': attendee.get('responseStatus', '')
                        }
                        for attendee in event.get('attendees', [])
                    ]
                })
            
            return formatted_events
        except Exception as e:
            logger.error(f"❌ Error fetching events: {e}", exc_info=True)
            return []
    
    def create_event(self, access_token: str, event_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Create a new calendar event"""
        try:
            logger.info(f"📝 Creating event: {event_data.get('summary', '')}")
            
            service = self.build_service(access_token)
            if not service:
                return None
            
            event = service.events().insert(
                calendarId='primary',
                body=event_data
            ).execute()
            
            logger.info(f"✅ Event created: {event['id']}")
            
            return {
                'id': event.get('id', ''),
                'summary': event.get('summary', ''),
                'start': event.get('start', {}),
                'end': event.get('end', {}),
                'htmlLink': event.get('htmlLink', '')
            }
        except Exception as e:
            logger.error(f"❌ Error creating event: {e}", exc_info=True)
            return None

google_calendar_service = GoogleCalendarService()
