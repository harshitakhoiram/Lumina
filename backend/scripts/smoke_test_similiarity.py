import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"sslmode": "require"}
)

SessionLocal = sessionmaker(bind=engine)

GET_RANDOM_CONTENT = text("""
SELECT content_id, title
FROM content
WHERE embedding IS NOT NULL
LIMIT 1
""")

SIMILARITY_SQL = text("""
SELECT content_id, title, content_type
FROM content
WHERE content_id != :content_id
ORDER BY embedding <=> (
    SELECT embedding FROM content WHERE content_id = :content_id
)
LIMIT 10
""")

def main():
    db = SessionLocal()

    try:
        base = db.execute(GET_RANDOM_CONTENT).fetchone()

        if not base:
            print("No content with embeddings found.")
            return

        content_id = base.content_id
        print(f"\nBase Content: {base.title}")
        print("-" * 40)

        results = db.execute(
            SIMILARITY_SQL,
            {"content_id": content_id}
        ).fetchall()

        for row in results:
            print(f"{row.title} ({row.content_type})")

    finally:
        db.close()

if __name__ == "__main__":
    main()