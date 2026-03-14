from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.services.movie_service import movie_service
from app.services.book_service import book_service
from app.schemas.content_schema import InteractionRequest
from app.core.database import get_db
from app.core.security import decode_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from urllib.parse import urlparse
import httpx
import uuid
import random

security = HTTPBearer()
router = APIRouter(prefix="/discovery", tags=["Discovery"])

_ALLOWED_IMAGE_HOSTS = {
    "image.tmdb.org",
    "books.google.com",
    "books.googleusercontent.com",
    "covers.openlibrary.org",
}

# Curated clean genre lists per content type
_VIDEO_GENRES = [
    {"value": "action", "label": "Action"},
    {"value": "drama", "label": "Drama"},
    {"value": "comedy", "label": "Comedy"},
    {"value": "sci-fi", "label": "Sci-Fi"},
    {"value": "mystery", "label": "Mystery"},
    {"value": "fantasy", "label": "Fantasy"},
    {"value": "romance", "label": "Romance"},
    {"value": "horror", "label": "Horror"},
    {"value": "animation", "label": "Animation"},
    {"value": "thriller", "label": "Thriller"},
    {"value": "documentary", "label": "Documentary"},
    {"value": "war", "label": "War"},
    {"value": "crime", "label": "Crime"},
]

_BOOK_GENRES = [
    {"value": "fiction", "label": "Fiction"},
    {"value": "fantasy", "label": "Fantasy"},
    {"value": "mystery", "label": "Mystery"},
    {"value": "science fiction", "label": "Science Fiction"},
    {"value": "romance", "label": "Romance"},
    {"value": "thriller", "label": "Thriller"},
    {"value": "horror", "label": "Horror"},
    {"value": "biography", "label": "Biography"},
    {"value": "history", "label": "History"},
    {"value": "science", "label": "Science"},
]

_LANG_LABELS = {
    "en": "English", "hi": "Hindi", "es": "Spanish", "fr": "French",
    "ta": "Tamil", "te": "Telugu", "ml": "Malayalam", "kn": "Kannada",
    "bn": "Bengali", "mr": "Marathi", "de": "German", "it": "Italian",
    "pt": "Portuguese", "ja": "Japanese", "ko": "Korean", "zh": "Chinese",
    "ru": "Russian", "ar": "Arabic", "th": "Thai", "tr": "Turkish",
    "id": "Indonesian", "tl": "Filipino", "he": "Hebrew", "no": "Norwegian",
    "fi": "Finnish", "pl": "Polish", "cs": "Czech", "sr": "Serbian",
    "lv": "Latvian", "af": "Afrikaans", "et": "Estonian",
}


@router.get("/onboarding/options")
async def get_onboarding_options(
    type: str = Query("video", description="video or books"),
    db: Session = Depends(get_db)
):
    """Return all available languages and genres from the content DB."""
    lang_rows = db.execute(
        text("SELECT DISTINCT language FROM content WHERE language IS NOT NULL AND language != '' ORDER BY language")
    ).fetchall()
    db_langs = [r[0] for r in lang_rows if r[0]]

    languages = []
    for code in db_langs:
        label = _LANG_LABELS.get(code)
        if not label:
            try:
                from babel import Locale
                label = Locale.parse(code).get_display_name("en") or code.upper()
            except Exception:
                label = code.upper()
        languages.append({"value": code, "label": label})

    genres = _VIDEO_GENRES if type == "video" else _BOOK_GENRES
    return {"languages": languages, "genres": genres}


@router.get("/image-proxy")
async def image_proxy(url: str = Query(..., description="Remote image URL")):
    """Proxy remote images through backend to bypass client TLS trust issues.

    Only allows known poster hosts.
    """
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in {"http", "https"} or host not in _ALLOWED_IMAGE_HOSTS:
        raise HTTPException(status_code=400, detail="Unsupported image URL")

    async with httpx.AsyncClient(timeout=15.0, verify=False) as client:
        try:
            resp = await client.get(url)
            resp.raise_for_status()
        except Exception:
            raise HTTPException(status_code=502, detail="Failed to fetch image")

    content_type = resp.headers.get("content-type", "image/jpeg")
    return Response(content=resp.content, media_type=content_type)


# --- MOVIE ENDPOINTS ---

@router.get("/onboarding/items")
async def get_onboarding_items(
    type: str = Query(..., description="video or books"),
    genre: str = Query(..., description="e.g., action, fiction"),
    lang: str = Query("en")
):
    if type == "video":
        lang_codes = [l.strip() for l in lang.split(',') if l.strip()] or ['en']
        all_items: list = []
        seen_ids: set = set()
        for lc in lang_codes:
            batch = await movie_service.search_by_genre_lang(genre, lc, limit=12)
            for item in batch:
                iid = str(item.get("id") or "")
                if iid and iid in seen_ids:
                    continue
                if iid:
                    seen_ids.add(iid)
                all_items.append(item)
        if not all_items:
            all_items = await movie_service.search_by_genre_lang(genre, 'en')
        random.shuffle(all_items)
        return {"items": all_items}
    if type == "books":
        items = await book_service.search_by_genre_lang(genre, lang)
        if not items and lang.lower() != 'en':
            items = await book_service.search_by_genre_lang(genre, 'en')
        random.shuffle(items)
        return {"items": items}
    return {"items": []}

@router.post("/onboarding/people")
async def get_onboarding_people(payload: dict):
    titles = payload.get("titles", [])
    genres = payload.get("genres", "") # Comma-separated
    lang = payload.get("lang", "en")
    interest = payload.get("type", "video")
    
    if interest == "video":
        lang_codes = [l.strip() for l in lang.split(',') if l.strip()] or ['en']
        all_people: list = []
        seen_names: set = set()
        for lc in lang_codes:
            batch = await movie_service.get_popular_people_by_genre(genres, lc)
            for p in batch:
                nm = p.get("name", "")
                if nm in seen_names:
                    continue
                seen_names.add(nm)
                all_people.append(p)
        import random as _rnd
        _rnd.shuffle(all_people)
        people = all_people[:15]
    else:
        people = await book_service.get_authors_from_titles(titles, lang)
    return {"people": people}

@router.get("/movies/trending")
async def get_trending():
    return await movie_service.get_trending_movies()

@router.get("/series/trending")
async def get_trending_series():
    return await movie_service.get_trending_series()

@router.get("/movies/search")
async def search_movies(q: str = Query(..., min_length=1)):
    return await movie_service.search_movies(q)

@router.get("/series/search")
async def search_series(q: str = Query(..., min_length=1)):
    return await movie_service.search_series(q)

@router.get("/movies/similar/{movie_id}")
async def get_similar_movies(movie_id: int):
    return await movie_service.get_similar_content(movie_id)

@router.get("/series/similar/{series_id}")
async def get_similar_series(series_id: int):
    return await movie_service.get_similar_series(series_id)

@router.get("/books/search")
async def search_books(q: str = Query(..., min_length=1)):
    return await book_service.search_books(q)

@router.get("/books/similar")
async def get_similar_books(author: str = None, category: str = None, book_id: str = None):
    if book_id:
        # If we have a book_id, fetch its detail first to get author/category
        detail = await book_service.get_book_detail(book_id)
        if detail:
            author = detail.get("authors", [""])[0]
            category = detail.get("genres", [""])[0]
    
    if not author and not category:
        return []
        
    return await book_service.get_similar_books(author or "", category or "")

@router.get("/movie/{movie_id}")
async def get_movie_detail(movie_id: str):
    cleaned = str(movie_id).strip()
    if cleaned.lower() in {"", "undefined", "null", "none", "nan"}:
        raise HTTPException(status_code=400, detail="Invalid movie_id")
    
    # Always try to fetch fresh English metadata from movie_service
    results = await movie_service.get_movie_detail(cleaned)
    if not results or "error" in results:
        raise HTTPException(status_code=404, detail="Movie not found")
    
    results["content_type"] = "movie"
    return results

@router.get("/series/{series_id}")
async def get_series_detail(series_id: str):
    cleaned = str(series_id).strip()
    if cleaned.lower() in {"", "undefined", "null", "none", "nan"}:
        raise HTTPException(status_code=400, detail="Invalid series_id")
    
    # Always try to fetch fresh English metadata
    results = await movie_service.get_series_detail(cleaned)
    if not results or "error" in results:
        raise HTTPException(status_code=404, detail="Series not found")
    
    results["content_type"] = "series"
    return results

@router.get("/book/{book_id}")
async def get_book_detail(book_id: str):
    # Book IDs are strings sometimes, not always digits
    results = await book_service.get_book_detail(book_id)
    if not results:
        raise HTTPException(status_code=404, detail="Book not found")
    return results

@router.post("/interactions")
async def track_interaction(
    interaction: InteractionRequest,
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = creds.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    interaction_id = str(uuid.uuid4())
    db.execute(
        text("""
            INSERT INTO user_interactions (interaction_id, user_id, content_id, interaction_type, rating_value, created_at)
            VALUES (:interaction_id, :user_id, :content_id, :interaction_type, :rating_value, NOW())
        """),
        {
            "interaction_id": interaction_id,
            "user_id": user_id,
            "content_id": interaction.content_id,
            "interaction_type": interaction.action,
            "rating_value": interaction.rating
        }
    )
    db.commit()
    return {"success": True, "message": f"Recorded {interaction.action} for content {interaction.content_id}"}
