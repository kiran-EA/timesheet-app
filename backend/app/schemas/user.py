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
