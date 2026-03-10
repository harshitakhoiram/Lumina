from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.services.movie_service import movie_service
from app.services.book_service import book_service
from app.schemas.content_schema import InteractionRequest
from app.core.database import get_db
from app.core.security import decode_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import uuid

security = HTTPBearer()
router = APIRouter(prefix="/discovery", tags=["Discovery"])

# --- MOVIE ENDPOINTS ---

@router.get("/onboarding/items")
async def get_onboarding_items(
    type: str = Query(..., description="video or books"),
    genre: str = Query(..., description="e.g., action, fiction"),
    lang: str = Query("en")
):
    if type == "video":
        items = await movie_service.search_by_genre_lang(genre, lang)
        return {"items": items}
    if type == "books":
        items = await book_service.search_by_genre_lang(genre, lang)
        return {"items": items}
    return {"items": []}

@router.post("/onboarding/people")
async def get_onboarding_people(payload: dict):
    titles = payload.get("titles", [])
    lang = payload.get("lang", "en")
    interest = payload.get("type", "video")
    people = await movie_service.get_cast_from_titles(titles, lang) if interest == "video" else await book_service.get_authors_from_titles(titles, lang)
    return {"people": people}

@router.get("/movies/trending")
async def get_trending():
    return await movie_service.get_trending_movies()

@router.get("/movies/search")
async def search_movies(q: str = Query(..., min_length=1)):
    return await movie_service.search_movies(q)

@router.get("/movies/similar/{movie_id}")
async def get_similar_movies(movie_id: int):
    return await movie_service.get_similar_content(movie_id)

@router.get("/books/search")
async def search_books(q: str = Query(..., min_length=1)):
    return await book_service.search_books(q)

@router.get("/books/similar")
async def get_similar_books(author: str, category: str):
    return await book_service.get_similar_books(author, category)

@router.get("/movie/{movie_id}")
async def get_movie_detail(movie_id: str):
    cleaned = str(movie_id).strip().lower()
    if cleaned in {"", "undefined", "null", "none", "nan"} or not cleaned.isdigit():
        raise HTTPException(status_code=400, detail="Invalid movie_id")
    results = await movie_service.get_movie_detail(cleaned)
    if not results or "error" in results:
        raise HTTPException(status_code=404, detail="Movie not found")
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
