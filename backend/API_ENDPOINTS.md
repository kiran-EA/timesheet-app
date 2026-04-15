# TimeSync API - Complete Endpoint Documentation

## ✅ What's Implemented

- **Jira Task/Issue Fetching** ✅
- **Google Calendar Integration** ✅  
- **Task Management** ✅
- **User Profiles** ✅
- **Comprehensive Logging** ✅

---

## 🔐 Authentication Endpoints

### POST `/auth/login`
**Login with Jira credentials**
```json
{
  "email": "user@expressanalytics.net"
}
```
**Response:**
```json
{
  "access_token": "eyJhbG...",
  "token_type": "bearer",
  "user": {
    "user_id": "USR123456",
    "email": "user@expressanalytics.net",
    "full_name": "User Name",
    "role": "resource"
  }
}
```

### GET `/auth/me`
**Get current user info** (requires token)
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/auth/me
```

---

## 📌 Jira Integration Endpoints

### GET `/jira/issues`
**Get all Jira issues assigned to current user**
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/jira/issues
```
**Response:**
```json
{
  "success": true,
  "count": 5,
  "issues": [
    {
      "key": "PROJ-123",
      "id": "10000",
      "summary": "Issue title",
      "description": "Issue description",
      "status": "In Progress",
      "priority": "High",
      "assignee": "User Name",
      "created": "2026-04-15T10:00:00Z",
      "updated": "2026-04-15T11:00:00Z",
      "duedate": "2026-04-20",
      "timeestimate": 3600,
      "timespent": 1800
    }
  ]
}
```

### GET `/jira/issues/{issue_key}`
**Get details for specific Jira issue**
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/jira/issues/PROJ-123
```

### GET `/jira/status`
**Check Jira connection status**
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/jira/status
```

---

## 📅 Google Calendar Endpoints

### GET `/calendar/auth-url`
**Get Google OAuth authentication URL**
```bash
curl http://localhost:8000/calendar/auth-url
```
**Response:**
```json
{
  "success": true,
  "auth_url": "https://accounts.google.com/o/oauth2/auth?...",
  "message": "Visit this URL to authenticate with Google Calendar"
}
```

### POST `/calendar/callback?code=<AUTH_CODE>`
**Handle OAuth callback after Google authentication**
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:8000/calendar/callback?code=4/0AY0e-g7..."
```

### GET `/calendar/events?access_token=<TOKEN>&days=7`
**Get upcoming calendar events**
```bash
curl "http://localhost:8000/calendar/events?access_token=ya29_...&days=7"
```
**Response:**
```json
{
  "success": true,
  "count": 3,
  "events": [
    {
      "id": "event123",
      "summary": "Meeting Title",
      "description": "Meeting description",
      "start": "2026-04-15T14:00:00Z",
      "end": "2026-04-15T15:00:00Z",
      "location": "Conference Room",
      "organizer": "organizer@gmail.com",
      "attendees": [
        {
          "email": "attendee@gmail.com",
          "displayName": "Attendee Name",
          "responseStatus": "accepted"
        }
      ]
    }
  ]
}
```

### POST `/calendar/events?access_token=<TOKEN>`
**Create a new calendar event**
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{
    "summary": "Team Meeting",
    "description": "Weekly sync",
    "start": {"dateTime": "2026-04-16T14:00:00"},
    "end": {"dateTime": "2026-04-16T15:00:00"},
    "location": "Room 123",
    "attendees": ["colleague@gmail.com"]
  }' \
  "http://localhost:8000/calendar/events?access_token=ya29_..."
```

### GET `/calendar/status?access_token=<TOKEN>`
**Check Google Calendar connection status**

---

## 📝 Task Management Endpoints

### POST `/tasks/`
**Create a new task**
```bash
curl -X POST -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Task Title",
    "description": "Task description",
    "status": "pending",
    "priority": "high",
    "due_date": "2026-04-20T17:00:00Z"
  }' \
  http://localhost:8000/tasks/
```

### GET `/tasks/`
**Get all tasks for current user**
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/tasks/
```

**With filters:**
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:8000/tasks/?status=in-progress&priority=high"
```

### GET `/tasks/{task_id}`
**Get specific task details**
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/tasks/Task_USR123_1234567
```

### PUT `/tasks/{task_id}`
**Update a task**
```bash
curl -X PUT -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "completed",
    "priority": "medium"
  }' \
  http://localhost:8000/tasks/Task_USR123_1234567
```

### DELETE `/tasks/{task_id}`
**Delete a task**
```bash
curl -X DELETE -H "Authorization: Bearer <TOKEN>" \
  http://localhost:8000/tasks/Task_USR123_1234567
```

### GET `/tasks/stats/summary`
**Get task statistics**
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/tasks/stats/summary
```
**Response:**
```json
{
  "success": true,
  "stats": {
    "total_tasks": 10,
    "pending": 3,
    "in_progress": 4,
    "completed": 3,
    "high_priority": 2,
    "overdue": 1
  }
}
```

---

## 👤 User Management Endpoints

### GET `/users/me`
**Get current user profile**
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/users/me
```

### PUT `/users/me`
**Update current user profile**
```bash
curl -X PUT -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "New Name",
    "role": "manager"
  }' \
  http://localhost:8000/users/me
```

### GET `/users/{user_id}`
**Get specific user details**
```bash
curl -H "Authorization: Bearer <TOKEN>" http://localhost:8000/users/USR123456
```

### GET `/users/search?query=<SEARCH>`
**Search for users**
```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:8000/users/search?query=john"
```

---

## ℹ️ System Endpoints

### GET `/`
**Root endpoint - API info**
```bash
curl http://localhost:8000/
```

### GET `/health`
**Health check**
```bash
curl http://localhost:8000/health
```

### GET `/api/info`
**Detailed API information with all endpoints**
```bash
curl http://localhost:8000/api/info
```

---

## 📊 Key Features

✅ **Jira Integration**
- Fetch user's assigned issues
- Get issue details with comments
- Real-time Jira connection status

✅ **Google Calendar**
- OAuth 2.0 authentication
- Fetch upcoming events
- Create new events
- Manage attendees

✅ **Task Management**
- CRUD operations for tasks
- Filter by status/priority
- Task statistics & summaries
- Overdue tracking

✅ **User Management**
- User profiles
- Search functionality
- Role-based access

✅ **Logging & Monitoring**
- Detailed request/response logs
- Jira API call tracking
- Auth flow logging
- Error reporting

---

## 🔍 Live Logging

All API calls are logged with emojis for easy tracking:
- 🔐 Authentication events
- 📌 Jira operations
- 📅 Calendar operations
- 📝 Task operations
- 👤 User operations
- ✅ Successful operations
- ❌ Failed operations
- 🔄 Data syncing

Example log output:
```
2026-04-15 10:00:00 - app.api.auth - INFO - 🔐 Login attempt for email: user@expressanalytics.net
2026-04-15 10:00:01 - app.services.jira_service - INFO - 🔍 Verifying Jira user
2026-04-15 10:00:02 - app.services.jira_service - INFO - ✅ Jira verification successful
2026-04-15 10:00:03 - app.api.tasks - INFO - 📝 Creating task: Task Title
2026-04-15 10:00:04 - app.api.tasks - INFO - ✅ Task created successfully
```

---

## 📚 API Documentation

**Interactive API Docs:** http://127.0.0.1:8000/docs
**ReDoc:** http://127.0.0.1:8000/redoc

---

## Date: April 15, 2026
Status: ✅ All endpoints fully functional and tested
