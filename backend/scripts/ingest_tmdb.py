# pyre-ignore-all-errors
import os
import uuid
import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
load_dotenv()
TMDB_TOKEN = os.getenv("TMDB_BEARER_TOKEN")
DATABASE_URL = os.getenv("DATABASE_URL")

if not TMDB_TOKEN:
    raise RuntimeError("TMDB_BEARER_TOKEN is not set in .env")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set in .env")

# SQLAlchemy engine (Render needs SSL)
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

BASE = "https://api.themoviedb.org/3"
POSTER_BASE = "https://image.tmdb.org/t/p/w500"

def tmdb_get(path: str, params: dict | None = None) -> dict:
    url = f"{BASE}{path}"
    headers = {"Authorization": f"Bearer {TMDB_TOKEN}", "accept": "application/json"}
    r = requests.get(url, headers=headers, params=params, timeout=30)
    r.raise_for_status()
    return r.json()

def fetch_genre_map(kind: str) -> dict[int, str]:
    # kind: "movie" or "tv"
    data = tmdb_get(f"/genre/{kind}/list", params={"language": "en-US"})
    return {g["id"]: g["name"] for g in data.get("genres", [])}

def upsert_items(db, items: list[dict], content_type: str, genre_map: dict[int, str], title_key: str, date_key: str):
    inserted = 0
    for it in items:
        external_id = str(it.get("id"))
        title = (it.get(title_key) or "").strip()
        if not external_id or not title:
            continue

        overview = it.get("overview") or None
        poster_path = it.get("poster_path")
        poster_url = f"{POSTER_BASE}{poster_path}" if poster_path else None
        release_date = it.get(date_key) or None
        language = it.get("original_language") or None
        rating = it.get("vote_average")
        popularity = it.get("popularity")

        genre_ids = it.get("genre_ids") or []
        genres = [genre_map[g] for g in genre_ids if g in genre_map] or []

        db.execute(
            UPSERT_SQL,
            {
                "content_id": str(uuid.uuid4()),
                "external_source": "TMDB",
                "external_id": external_id,
                "title": title,
                "content_type": content_type,
                "description": overview,
                "poster_url": poster_url,
                "release_date": release_date,  # Postgres can accept YYYY-MM-DD string
                "language": language,
                "genres": genres,
                "rating": float(rating) if rating is not None else None,
                "popularity_score": float(popularity) if popularity is not None else None,
            },
        )
        inserted += 1
    return inserted

def ingest_movies(
    target: int = 500,
    original_language: str | None = None,
    sort_by: str = "popularity.desc",
    vote_count_gte: int | None = None,
):
    movie_genres = fetch_genre_map("movie")
    db = SessionLocal()
    try:
        total = 0
        page = 1
        lang_label = original_language or "all"
        while total < target:
            params = {
                "sort_by": sort_by,
                "page": page,
                "language": "en-US",
            }
            if original_language:
                params["with_original_language"] = original_language
            if vote_count_gte is not None:
                params["vote_count.gte"] = vote_count_gte

            data = tmdb_get("/discover/movie", params=params)
            items = data.get("results", [])
            if not items:
                break
            total += upsert_items(db, items, "MOVIE", movie_genres, title_key="title", date_key="release_date")
            db.commit()
            print(f"[TMDB] Movies lang={lang_label} sort={sort_by} page={page} total_upserted={total}")
            page += 1
        print(f"[TMDB] Movies done lang={lang_label} sort={sort_by}. Upserted ~{total}")
    finally:
        db.close()

def ingest_series(
    target: int = 300,
    original_language: str | None = None,
    sort_by: str = "popularity.desc",
    vote_count_gte: int | None = None,
):
    tv_genres = fetch_genre_map("tv")
    db = SessionLocal()
    try:
        total = 0
        page = 1
        lang_label = original_language or "all"
        while total < target:
            params = {
                "sort_by": sort_by,
                "page": page,
                "language": "en-US",
            }
            if original_language:
                params["with_original_language"] = original_language
            if vote_count_gte is not None:
                params["vote_count.gte"] = vote_count_gte

            data = tmdb_get("/discover/tv", params=params)
            items = data.get("results", [])
            if not items:
                break
            total += upsert_items(db, items, "SERIES", tv_genres, title_key="name", date_key="first_air_date")
            db.commit()
            print(f"[TMDB] Series lang={lang_label} sort={sort_by} page={page} total_upserted={total}")
            page += 1
        print(f"[TMDB] Series done lang={lang_label} sort={sort_by}. Upserted ~{total}")
    finally:
        db.close()

if __name__ == "__main__":
    # Broad pool across all languages.
    ingest_movies(target=500, sort_by="popularity.desc", vote_count_gte=50)
    ingest_series(target=300, sort_by="popularity.desc", vote_count_gte=30)

    # Hindi-focused pools for stronger non-English personalization.
    ingest_movies(target=300, original_language="hi", sort_by="popularity.desc", vote_count_gte=5)
    ingest_movies(target=200, original_language="hi", sort_by="primary_release_date.desc", vote_count_gte=0)
    ingest_series(target=120, original_language="hi", sort_by="popularity.desc", vote_count_gte=0)