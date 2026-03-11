# backend/app/schemas/user_schema.py
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class ProfileResponse(BaseModel):
    name: str = ""
    email: EmailStr
    language: str | None = None
    genres: list[str] = Field(default_factory=list)
    selected_titles: list[str] = Field(default_factory=list)
    selected_actors: list[str] = Field(default_factory=list)

class ProfileUpdate(BaseModel):
    name: str
    language: str | None = None
    genres: list[str] = Field(default_factory=list)
    selected_titles: list[str] = Field(default_factory=list)
    selected_actors: list[str] = Field(default_factory=list)