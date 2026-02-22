import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.ml.embeddings import generate_embedding

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL not set")

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"sslmode": "require"}
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

SELECT_SQL = text("""
SELECT content_id, title, description
FROM content
WHERE embedding IS NULL
""")

UPDATE_SQL = text("""
UPDATE content
SET embedding = :embedding
WHERE content_id = :content_id
""")

def main():
    db = SessionLocal()

    try:
        rows = db.execute(SELECT_SQL).fetchall()
        print(f"Found {len(rows)} rows without embeddings")

        count = 0

        for row in rows:
            content_id, title, description = row

            combined_text = f"{title or ''}. {description or ''}"

            embedding = generate_embedding(combined_text)

            db.execute(
                UPDATE_SQL,
                {
                    "embedding": embedding,
                    "content_id": content_id
                }
            )

            count += 1

            if count % 50 == 0:
                db.commit()
                print(f"Processed {count} rows")

        db.commit()
        print(f"Done. Total embeddings generated: {count}")

    finally:
        db.close()

if __name__ == "__main__":
    main()