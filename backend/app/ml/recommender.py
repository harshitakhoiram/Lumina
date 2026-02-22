from sqlalchemy import text
from sqlalchemy.orm import Session

SIMILARITY_SQL = text("""
SELECT content_id, title, poster_url
FROM content
WHERE content_id != :content_id
ORDER BY embedding <=> :input_embedding
LIMIT :limit
""")

def get_similar_content(db: Session, content_id: str, input_embedding: list[float], limit: int = 10):
    result = db.execute(
        SIMILARITY_SQL,
        {
            "content_id": content_id,
            "input_embedding": input_embedding,
            "limit": limit
        }
    ).fetchall()

    return [dict(row._mapping) for row in result]