from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
import uuid

from app.core.database import get_db
from app.core.security import decode_token
from app.schemas.watchlist import WatchlistItemCreate


router = APIRouter(prefix="/watchlist", tags=["watchlist"])
security = HTTPBearer()


def _get_user_id(creds: HTTPAuthorizationCredentials = Depends(security)) -> str:
    payload = decode_token(creds.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user_id


def _ensure_watchlist_table(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS user_watchlist (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            external_id TEXT NOT NULL,
            title TEXT NOT NULL,
            poster_url TEXT,
            content_type TEXT NOT NULL,
            rating DOUBLE PRECISION,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, external_id, content_type)
        )
    """))
    db.commit()


@router.get("")
def list_watchlist(
    db: Session = Depends(get_db),
    user_id: str = Depends(_get_user_id),
):
    _ensure_watchlist_table(db)
    rows = db.execute(
        text("""
            SELECT id, external_id, title, poster_url, content_type, rating,
                   TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
            FROM user_watchlist
            WHERE user_id = :user_id
            ORDER BY created_at DESC
        """),
        {"user_id": user_id},
    ).fetchall()
    return [dict(r._mapping) for r in rows]


@router.post("")
def add_to_watchlist(
    payload: WatchlistItemCreate,
    db: Session = Depends(get_db),
    user_id: str = Depends(_get_user_id),
):
    _ensure_watchlist_table(db)
    item_id = str(uuid.uuid4())

    row = db.execute(
        text("""
            INSERT INTO user_watchlist (id, user_id, external_id, title, poster_url, content_type, rating)
            VALUES (:id, :user_id, :external_id, :title, :poster_url, :content_type, :rating)
            ON CONFLICT (user_id, external_id, content_type) DO UPDATE SET
                title = EXCLUDED.title,
                poster_url = EXCLUDED.poster_url,
                rating = EXCLUDED.rating
            RETURNING id, external_id, title, poster_url, content_type, rating,
                      TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SSOF') AS created_at
        """),
        {
            "id": item_id,
            "user_id": user_id,
            "external_id": str(payload.external_id),
            "title": payload.title,
            "poster_url": payload.poster_url,
            "content_type": str(payload.content_type or "movie").lower(),
            "rating": payload.rating,
        },
    ).fetchone()
    db.commit()
    return {"status": "ok", "item": dict(row._mapping)}


@router.delete("/{external_id}")
def remove_from_watchlist(
    external_id: str,
    content_type: str,
    db: Session = Depends(get_db),
    user_id: str = Depends(_get_user_id),
):
    _ensure_watchlist_table(db)
    result = db.execute(
        text("""
            DELETE FROM user_watchlist
            WHERE user_id = :user_id
              AND external_id = :external_id
              AND content_type = :content_type
        """),
        {
            "user_id": user_id,
            "external_id": external_id,
            "content_type": str(content_type or "movie").lower(),
        },
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Watchlist item not found")
    return {"status": "removed"}
