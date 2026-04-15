#!/bin/bash

# TimeSync Phase 1 - Complete Backend File Generator
# This creates all Python files for the backend

set -e

echo "🚀 Creating all backend Python files..."

cd "$(dirname "$0")/backend"

# Create __init__.py files
touch app/__init__.py
touch app/api/__init__.py
touch app/core/__init__.py
touch app/db/__init__.py
touch app/schemas/__init__.py
touch app/services/__init__.py

# ============================================
# app/main.py
# ============================================
cat > app/main.py << 'ENDOFFILE'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth

app = FastAPI(
    title="TimeSync API",
    description="Express Analytics Timesheet & Jira Sync System",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)

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
ENDOFFILE

# ============================================
# app/core/config.py
# ============================================
cat > app/core/config.py << 'ENDOFFILE'
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    REDSHIFT_HOST: str
    REDSHIFT_PORT: int = 5439
    REDSHIFT_DATABASE: str
    REDSHIFT_USER: str
    REDSHIFT_PASSWORD: str
    REDSHIFT_SCHEMA: str = "KIRAN"
    
    JIRA_DOMAIN: str
    JIRA_EMAIL: str
    JIRA_TOKEN: str
    
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_EMAIL: str
    SMTP_PASSWORD: str
    
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    GOOGLE_REDIRECT_URI: str
    
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    FRONTEND_URL: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
ENDOFFILE

# ============================================
# app/core/security.py
# ============================================
cat > app/core/security.py << 'ENDOFFILE'
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )

async def get_current_user(token: str = Depends(oauth2_scheme)):
    return verify_token(token)
ENDOFFILE

# ============================================
# app/db/database.py
# ============================================
cat > app/db/database.py << 'ENDOFFILE'
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2.pool import SimpleConnectionPool
from contextlib import contextmanager
from app.core.config import settings

pool = SimpleConnectionPool(
    1, 20,
    host=settings.REDSHIFT_HOST,
    port=settings.REDSHIFT_PORT,
    database=settings.REDSHIFT_DATABASE,
    user=settings.REDSHIFT_USER,
    password=settings.REDSHIFT_PASSWORD,
    sslmode='require'
)

@contextmanager
def get_db_connection():
    conn = pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"SET search_path TO {settings.REDSHIFT_SCHEMA}")
        conn.commit()
        yield conn
    finally:
        pool.putconn(conn)

@contextmanager
def get_db_cursor(commit=True):
    with get_db_connection() as conn:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        try:
            yield cursor
            if commit:
                conn.commit()
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()

def execute_query(query: str, params: tuple = None, fetch_one=False, fetch_all=True):
    with get_db_cursor() as cursor:
        cursor.execute(query, params)
        if fetch_one:
            return cursor.fetchone()
        elif fetch_all:
            return cursor.fetchall()
        return None
ENDOFFILE

# ============================================
# app/db/queries.py
# ============================================
cat > app/db/queries.py << 'ENDOFFILE'
from typing import Optional, Dict, Any
from app.db.database import execute_query

def find_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    query = "SELECT * FROM users WHERE email = %s"
    return execute_query(query, (email,), fetch_one=True)

def create_user(email: str, full_name: str, role: str = 'resource') -> Dict[str, Any]:
    user_id = f"USR{hash(email) % 100000000:08d}"
    avatar = ''.join([name[0].upper() for name in full_name.split()[:2]])
    
    query = """
        INSERT INTO users (user_id, email, full_name, role, avatar, is_active)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
    """
    return execute_query(query, (user_id, email, full_name, role, avatar, True), fetch_one=True)

def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    query = "SELECT * FROM users WHERE user_id = %s"
    return execute_query(query, (user_id,), fetch_one=True)
ENDOFFILE

# ============================================
# app/services/jira_service.py
# ============================================
cat > app/services/jira_service.py << 'ENDOFFILE'
import requests
from requests.auth import HTTPBasicAuth
from typing import Optional, Dict, Any
from app.core.config import settings

class JiraService:
    def __init__(self):
        self.base_url = f"https://{settings.JIRA_DOMAIN}/rest/api/3"
        self.auth = HTTPBasicAuth(settings.JIRA_EMAIL, settings.JIRA_TOKEN)
        self.headers = {"Accept": "application/json"}
    
    def verify_user(self, email: str) -> Optional[Dict[str, Any]]:
        try:
            response = requests.get(
                f"{self.base_url}/myself",
                auth=self.auth,
                headers=self.headers,
                timeout=10
            )
            response.raise_for_status()
            user_data = response.json()
            
            if user_data.get('emailAddress', '').lower() == email.lower():
                return {
                    'account_id': user_data['accountId'],
                    'email': user_data['emailAddress'],
                    'display_name': user_data['displayName']
                }
            
            search_response = requests.get(
                f"{self.base_url}/user/search",
                auth=self.auth,
                headers=self.headers,
                params={'query': email},
                timeout=10
            )
            search_response.raise_for_status()
            users = search_response.json()
            
            for user in users:
                if user.get('emailAddress', '').lower() == email.lower():
                    return {
                        'account_id': user['accountId'],
                        'email': user['emailAddress'],
                        'display_name': user['displayName']
                    }
            return None
        except Exception as e:
            print(f"Jira verification error: {e}")
            return None

jira_service = JiraService()
ENDOFFILE

# ============================================
# app/schemas/user.py
# ============================================
cat > app/schemas/user.py << 'ENDOFFILE'
from pydantic import BaseModel, EmailStr
from typing import Optional

class UserLogin(BaseModel):
    email: EmailStr

class UserResponse(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: str
    avatar: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse
ENDOFFILE

# ============================================
# app/api/auth.py
# ============================================
cat > app/api/auth.py << 'ENDOFFILE'
from fastapi import APIRouter, HTTPException, status, Depends
from datetime import timedelta
from app.schemas.user import UserLogin, Token, UserResponse
from app.core.security import create_access_token, get_current_user
from app.core.config import settings
from app.db.queries import find_user_by_email, create_user, get_user_by_id
from app.services.jira_service import jira_service

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/login", response_model=Token)
async def login(credentials: UserLogin):
    jira_user = jira_service.verify_user(credentials.email)
    if not jira_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found in Jira or invalid credentials"
        )
    
    db_user = find_user_by_email(credentials.email)
    if not db_user:
        db_user = create_user(
            email=jira_user['email'],
            full_name=jira_user['display_name'],
            role='resource'
        )
    
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
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": UserResponse(**db_user)
    }

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    user = get_user_by_id(current_user['sub'])
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse(**user)
ENDOFFILE

echo "✅ All backend files created successfully!"
echo ""
echo "Files created:"
echo "  - app/main.py"
echo "  - app/core/config.py"
echo "  - app/core/security.py"
echo "  - app/db/database.py"
echo "  - app/db/queries.py"
echo "  - app/services/jira_service.py"
echo "  - app/schemas/user.py"
echo "  - app/api/auth.py"
echo "  - All __init__.py files"
