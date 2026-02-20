from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
import uuid

from app.core.database import get_db
from app.core.security import create_access_token
from app.schemas.auth import SignupRequest, LoginRequest, AuthResponse

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.get("/ping")
def ping():
    return {"ok": True}

@router.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    # Check if email already exists
    existing = db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": body.email}
    ).fetchone()

    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())

    # NOTE: For demo, we are NOT hashing passwords. Don't do this in real apps.
    db.execute(
        text("""
            INSERT INTO users (id, name, email, created_at)
            VALUES (:id, :name, :email, NOW())
        """),
        {"id": user_id, "name": body.name, "email": body.email}
    )
    db.commit()

    token = create_access_token(user_id)
    return AuthResponse(access_token=token, user_id=user_id)

@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": body.email}
    ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    # For demo: accept any password OR enforce a fixed password like "pass123"
    # If you want fixed:
    # if body.password != "pass123": raise HTTPException(401, "Invalid credentials")

    user_id = row[0]
    token = create_access_token(user_id)
    return AuthResponse(access_token=token, user_id=user_id)