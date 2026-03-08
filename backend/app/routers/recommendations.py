from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.security import decode_token

security = HTTPBearer()

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])

SIMILAR_SQL = text("""
SELECT content_id, title, poster_url, content_type, rating
FROM content
WHERE content_id != :content_id
ORDER BY embedding <=> (
  SELECT embedding FROM content WHERE content_id = :content_id
)
LIMIT :limit
""")

@router.get("/similar/{content_id}")
def similar_recommendations(
    content_id: str,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    # Validates token
    token = creds.credentials
    decode_token(token)

    rows = db.execute(SIMILAR_SQL, {"content_id": content_id, "limit": limit}).fetchall()
    return {
        "items": [dict(r._mapping) for r in rows]
    }

@router.get("/personalized")
def personalized_recommendations(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Fetches personalized recommendations for the entire dashboard:
    1. Slider: Vector-based or direct interest matches.
    2. Genre Highlights: Top items in user's favorite genre.
    3. Interest Trending: Top items in user's general interest.
    4. Global Top: Highest rated items across all types.
    """
    token = creds.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")

    prefs = db.execute(
        text("SELECT interest, language, genre, selected_titles FROM user_preferences WHERE user_id = :user_id"),
        {"user_id": user_id}
    ).fetchone()

    # Default if no prefs
    if not prefs:
        rows = db.execute(text("SELECT content_id, title, poster_url, content_type, rating FROM content ORDER BY popularity_score DESC LIMIT 20")).fetchall()
        items = [dict(r._mapping) for r in rows]
        return {
            "slider": items[:10],
            "genre_highlights": items[10:16],
            "interest_trending": items[:6],
            "global_top": items[6:12],
            "genre_name": "Trending"
        }

    interest = prefs.interest
    genre = prefs.genre
    titles = prefs.selected_titles or []
    
    type_map = {"video": ["MOVIE", "SERIES"], "books": ["BOOK"]}
    target_types = type_map.get(interest, ["MOVIE", "SERIES", "BOOK"])
    genre_pattern = f"%{genre}%"

    # --- 1. SLIDER (Vector or Interest Fallback) ---
    vec_sql = text("""
        WITH user_avg AS (
            SELECT AVG(embedding) as avg_embedding
            FROM content WHERE title = ANY(:titles) AND embedding IS NOT NULL
        )
        SELECT content_id, title, poster_url, content_type, rating FROM content, user_avg
        WHERE user_avg.avg_embedding IS NOT NULL AND title != ALL(:titles) AND content_type = ANY(:types)
        ORDER BY embedding <=> user_avg.avg_embedding LIMIT :limit
    """)
    slider_rows = db.execute(vec_sql, {"titles": titles, "types": target_types, "limit": limit}).fetchall()
    
    if not slider_rows:
        fallback_sql = text("SELECT content_id, title, poster_url, content_type, rating FROM content WHERE content_type = ANY(:types) ORDER BY popularity_score DESC LIMIT :limit")
        slider_rows = db.execute(fallback_sql, {"types": target_types, "limit": limit}).fetchall()

    # --- 2. GENRE HIGHLIGHTS ---
    genre_sql = text("""
        SELECT content_id, title, poster_url, content_type, rating
        FROM content
        WHERE content_type = ANY(:types)
          AND (EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE :genre) OR :genre = ANY(genres))
          AND title != ALL(:titles)
        ORDER BY popularity_score DESC LIMIT 6
    """)
    genre_rows = db.execute(genre_sql, {"types": target_types, "genre": genre_pattern, "titles": titles}).fetchall()

    # --- 3. INTEREST TRENDING ---
    trending_sql = text("""
        SELECT content_id, title, poster_url, content_type, rating
        FROM content
        WHERE content_type = ANY(:types)
        ORDER BY popularity_score DESC LIMIT 12
    """)
    trending_rows = db.execute(trending_sql, {"types": target_types}).fetchall()

    # --- 4. GLOBAL TOP ---
    top_sql = text("""
        SELECT content_id, title, poster_url, content_type, rating
        FROM content
        ORDER BY rating DESC, popularity_score DESC LIMIT 6
    """)
    top_rows = db.execute(top_sql).fetchall()

    return {
        "slider": [dict(r._mapping) for r in slider_rows],
        "genre_highlights": [dict(r._mapping) for r in genre_rows],
        "interest_trending": [dict(r._mapping) for r in trending_rows],
        "global_top": [dict(r._mapping) for r in top_rows],
        "genre_name": genre.capitalize() if genre else "Favorites"
    }
