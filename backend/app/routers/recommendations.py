from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.core.database import get_db

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
):
    rows = db.execute(SIMILAR_SQL, {"content_id": content_id, "limit": limit}).fetchall()
    return {
        "items": [dict(r._mapping) for r in rows]
    }