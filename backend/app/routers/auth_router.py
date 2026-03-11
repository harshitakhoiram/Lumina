from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from sqlalchemy import text
import uuid

from app.core.database import get_db
from app.core.security import decode_token
from app.core.auth_handler import create_access_token
from app.models.user import User
from app.models.user_preference import UserPreference
from app.schemas.auth import AuthResponse, SignupRequest, LoginRequest, ProfileRequest
from app.schemas.user_schema import ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer()


def get_current_user_record(
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = creds.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


@router.get("/ping")
def ping():
    return {"ok": True}


@router.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest, db: Session = Depends(get_db)):
    existing = db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": body.email}
    ).fetchone()

    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_id = str(uuid.uuid4())

    db.execute(
        text("""
            INSERT INTO users (id, name, email, created_at)
            VALUES (:id, :name, :email, NOW())
        """),
        {"id": user_id, "name": body.name, "email": body.email}
    )
    db.commit()

    token = create_access_token({"sub": user_id})
    return AuthResponse(access_token=token, user_id=user_id)


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    row = db.execute(
        text("SELECT id FROM users WHERE email = :email"),
        {"email": body.email}
    ).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user_id = row[0]
    token = create_access_token({"sub": user_id})
    return AuthResponse(access_token=token, user_id=user_id)


@router.post("/profile")
def save_profile(
    body: ProfileRequest,
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = creds.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    db.execute(
        text("""
            INSERT INTO user_preferences (
                user_id,
                interest,
                language,
                genre,
                selected_titles,
                selected_actors,
                favorite_content,
                created_at,
                updated_at
            )
            VALUES (
                :user_id,
                :interest,
                :language,
                :genre,
                :selected_titles,
                :selected_actors,
                :favorite_content,
                NOW(),
                NOW()
            )
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


@router.get("/me")
def get_me(
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = creds.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")

    user = db.execute(
        text("SELECT id, name, email FROM users WHERE id = :id"),
        {"id": user_id}
    ).fetchone()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return dict(user._mapping)


@router.get("/me/profile", response_model=ProfileResponse)
def get_my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_record)
):
    result = (
        db.query(User, UserPreference)
        .outerjoin(UserPreference, User.id == UserPreference.user_id)
        .filter(User.id == current_user.id)
        .first()
    )

    if not result:
        raise HTTPException(status_code=404, detail="User not found")

    user, preferences = result

    return ProfileResponse(
        name=user.name or "",
        email=user.email,
        language=preferences.language if preferences else None,
        genres=preferences.genre if preferences and preferences.genre else [],
        selected_titles=preferences.selected_titles if preferences and preferences.selected_titles else [],
        selected_actors=preferences.selected_actors if preferences and preferences.selected_actors else []
    )


@router.put("/me/profile", response_model=ProfileResponse)
def update_my_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_record)
):
    user = db.query(User).filter(User.id == current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    preferences = (
        db.query(UserPreference)
        .filter(UserPreference.user_id == current_user.id)
        .first()
    )

    if not preferences:
        preferences = UserPreference(user_id=current_user.id)
        db.add(preferences)

    user.name = payload.name
    preferences.language = payload.language
    preferences.genre = payload.genres
    preferences.selected_titles = payload.selected_titles
    preferences.selected_actors = payload.selected_actors
    preferences.updated_at = func.now()

    db.commit()
    db.refresh(user)
    db.refresh(preferences)

    return ProfileResponse(
        name=user.name or "",
        email=user.email,
        language=preferences.language,
        genres=preferences.genre or [],
        selected_titles=preferences.selected_titles or [],
        selected_actors=preferences.selected_actors or []
    )