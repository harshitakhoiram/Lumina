from pydantic import BaseModel, EmailStr
from typing import Optional

class SignupRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str


class ProfileRequest(BaseModel):
    fullName: Optional[str] = None
    email: Optional[EmailStr] = None
    interest: Optional[str] = None
    language: Optional[str] = None
    languages: Optional[list[str]] = []
    genre: Optional[list[str]] = []
    selectedTitles: Optional[list] = []
    selectedActors: Optional[list] = []
    favoriteContent: Optional[str] = None
    finalConfirmation: Optional[bool] = False

