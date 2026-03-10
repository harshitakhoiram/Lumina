import os
import uuid
import time
import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
GOOGLE_BOOKS_API_KEY = os.getenv("GOOGLE_BOOKS_API_KEY")  # optional

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in .env")

engine = create_engine(DATABASE_URL, pool_pre_ping=True, connect_args={"sslmode": "require"})
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

UPSERT_SQL = text("""
INSERT INTO content (
  content_id, external_source, external_id,
  title, content_type, description, poster_url,
  release_date, language, genres, rating, popularity_score,
  embedding, embedding_model
) VALUES (
  :content_id, :external_source, :external_id,
  :title, :content_type, :description, :poster_url,
  :release_date, :language, :genres, :rating, :popularity_score,
  NULL, NULL
)
ON CONFLICT (external_source, external_id) DO UPDATE SET
  title = EXCLUDED.title,
  content_type = EXCLUDED.content_type,
  description = EXCLUDED.description,
  poster_url = EXCLUDED.poster_url,
  release_date = EXCLUDED.release_date,
  language = EXCLUDED.language,
  genres = EXCLUDED.genres,
  rating = EXCLUDED.rating,
  popularity_score = EXCLUDED.popularity_score;
""")

BASE = "https://www.googleapis.com/books/v1/volumes"

def gb_get(params: dict) -> dict:
    if GOOGLE_BOOKS_API_KEY:
        params = {**params, "key": GOOGLE_BOOKS_API_KEY}
    r = requests.get(BASE, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def pick_date(published: str | None) -> str | None:
    """
    Google Books publishedDate can be:
      - YYYY
      - YYYY-MM
      - YYYY-MM-DD
    Our DB column is DATE, so we convert:
      - YYYY -> YYYY-01-01
      - YYYY-MM -> YYYY-MM-01
      - YYYY-MM-DD -> as-is
    If invalid -> None
    """
    if not published:
        return None
    s = published.strip()
    try:
        if len(s) == 4 and s.isdigit():
            return f"{s}-01-01"
        if len(s) == 7 and s[4] == "-" and s[:4].isdigit() and s[5:7].isdigit():
            return f"{s}-01"
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            return s
    except Exception:
        return None
    return None

def get_best_image_url(image_links: dict | None) -> str | None:
    if not image_links:
        return None
    
    # Preference order for higher resolution
    priority = ["extraLarge", "large", "medium", "small", "thumbnail", "smallThumbnail"]
    url = None
    for key in priority:
        if key in image_links:
            url = image_links[key]
            break
            
    if not url:
        return None
        
    # Transformations:
    # 1. Force HTTPS
    if url.startswith("http:"):
        url = url.replace("http:", "https:", 1)
        
    # 2. Increase zoom level
    if "&zoom=1" in url:
        url = url.replace("&zoom=1", "&zoom=3")
    elif "?zoom=1" in url:
        url = url.replace("?zoom=1", "?zoom=3")
        
    # 3. Remove curly edges
    if "&edge=curl" in url:
        url = url.replace("&edge=curl", "")
    elif "?edge=curl" in url:
        url = url.replace("?edge=curl", "")
        
    return url

def normalize(item: dict) -> dict | None:
    external_id = item.get("id")
    vi = item.get("volumeInfo") or {}
    title = (vi.get("title") or "").strip()
    if not external_id or not title:
        return None

    description = vi.get("description")
    language = vi.get("language")
    published = pick_date(vi.get("publishedDate"))
    categories = vi.get("categories") or []
    genres = [c.strip() for c in categories if isinstance(c, str) and c.strip()]

    image_links = vi.get("imageLinks")
    poster_url = get_best_image_url(image_links)

    rating = vi.get("averageRating")  # can be missing
    # popularity_score isn't available consistently; keep NULL
    popularity_score = None

    return {
        "content_id": str(uuid.uuid4()),
        "external_source": "GOOGLE_BOOKS",
        "external_id": external_id,
        "title": title,
        "content_type": "BOOK",
        "description": description,
        "poster_url": poster_url,
        "release_date": published,
        "language": language,
        "genres": genres,
        "rating": float(rating) if rating is not None else None,
        "popularity_score": popularity_score,
    }

def ingest_books(target: int = 500):
    # Multiple queries to diversify results
    queries = [
        "subject:fiction",
        "subject:fantasy",
        "subject:thriller",
        "subject:romance",
        "subject:science",
        "subject:history",
        "subject:biography",
    ]

    db = SessionLocal()
    try:
        upserted = 0
        max_results = 40  # Google Books max
        q_index = 0
        start_index = 0

        while upserted < target:
            q = queries[q_index]
            params = {
                "q": q,
                "startIndex": start_index,
                "maxResults": max_results,
                "printType": "books"
            }

            data = gb_get(params)
            items = data.get("items") or []
            if not items:
                # move to next query
                q_index = (q_index + 1) % len(queries)
                start_index = 0
                continue

            batch = 0
            for item in items:
                row = normalize(item)
                if not row:
                    continue
                db.execute(UPSERT_SQL, row)
                batch += 1
                upserted += 1
                if upserted >= target:
                    break

            db.commit()
            print(f"[GOOGLE_BOOKS] q='{q}' startIndex={start_index} batch={batch} total_upserted={upserted}")

            start_index += max_results
            # After a few pages, rotate query for variety
            if start_index >= 200:
                q_index = (q_index + 1) % len(queries)
                start_index = 0

            # be gentle to API
            time.sleep(0.2)

        print(f"[GOOGLE_BOOKS] Done. Upserted ~{upserted} books.")
    finally:
        db.close()

if __name__ == "__main__":
    ingest_books(target=500)