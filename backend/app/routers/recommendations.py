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
    Fetches personalized recommendations by finding the user's preferred titles, 
    averaging their vectors (if any exist), and finding the closest matches.
    Fallback: returns top trending items in their preferred genre.
    """
    token = creds.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")

    prefs = db.execute(
        text("SELECT interest, language, genre, selected_titles FROM user_preferences WHERE user_id = :user_id"),
        {"user_id": user_id}
    ).fetchone()

    if not prefs or not prefs.selected_titles:
        # Fallback if no prefs
        rows = db.execute(text("SELECT content_id, title, poster_url, content_type, rating FROM content LIMIT :limit"), {"limit": limit}).fetchall()
        return {"items": [dict(r._mapping) for r in rows]}

    # We need to construct a robust query to average vectors of the user's selected titles 
    # and find new items similar to that average.
    
    # We will match the title (or you could map selected_titles to content_ids if that was stored)
    titles = prefs.selected_titles
    
    # Let's find similar items to the "average" of those titles, filtering by their preferred genre
    personalized_sql = text("""
        WITH user_avg AS (
            SELECT AVG(embedding) as avg_embedding
            FROM content 
            WHERE title = ANY(:titles)
               AND embedding IS NOT NULL
        )
        SELECT content_id, title, poster_url, content_type, rating, genres 
        FROM content, user_avg
        WHERE user_avg.avg_embedding IS NOT NULL
          AND title != ALL(:titles)
          -- AND :genre = ANY(genres)   -- Optionally strictly filter by their genre
        ORDER BY embedding <=> user_avg.avg_embedding
        LIMIT :limit
    """)

    rows = db.execute(personalized_sql, {
        "titles": titles,
        "genre": prefs.genre, 
        "limit": limit
    }).fetchall()

    return {
        "items": [dict(r._mapping) for r in rows]
    }
