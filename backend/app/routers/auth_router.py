from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
import uuid
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.database import get_db
from app.core.security import create_access_token, decode_token
from app.schemas.auth import SignupRequest, LoginRequest, AuthResponse, ProfileRequest

router = APIRouter(prefix="/auth", tags=["Authentication"])

security = HTTPBearer()

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


@router.post("/profile")
def save_profile(
    body: ProfileRequest,
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Store or log the user's onboarding preferences."""
    print("profile payload:", body.dict())
    token = creds.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    db.execute(
        text("""
            INSERT INTO user_preferences (user_id, interest, language, genre, selected_titles, selected_actors, favorite_content, created_at, updated_at)
            VALUES (:user_id, :interest, :language, :genre, :selected_titles, :selected_actors, :favorite_content, NOW(), NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                interest = EXCLUDED.interest,
                language = EXCLUDED.language,
                genre = EXCLUDED.genre,
                selected_titles = EXCLUDED.selected_titles,
                selected_actors = EXCLUDED.selected_actors,
                favorite_content = EXCLUDED.favorite_content,
                updated_at = NOW()
        """),
        {
            "user_id": user_id,
            "interest": body.interest,
            "language": body.language,
            "genre": body.genre,
            "selected_titles": body.selectedTitles,
            "selected_actors": body.selectedActors,
            "favorite_content": body.favoriteContent
        }
    )
    db.commit()

    return {"status": "profile saved"}

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

@router.get("/me")
def get_me(
    creds: HTTPAuthorizationCredentials = Depends(security), 
    db: Session = Depends(get_db)
):
    """Fetch the profile of the currently logged-in user."""
    token = creds.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")

    # Fetch user data from your PostgreSQL table
    user = db.execute(
        text("SELECT id, name, email FROM users WHERE id = :id"),
        {"id": user_id}
    ).fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return dict(user._mapping)