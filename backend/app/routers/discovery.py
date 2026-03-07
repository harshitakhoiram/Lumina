from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.services.movie_service import movie_service
from app.services.book_service import book_service
from app.schemas.content_schema import InteractionRequest, InteractionResponse
from app.core.database import get_db
from app.core.security import decode_token
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
security = HTTPBearer()

import uuid

router = APIRouter(
    prefix="/discovery",
    tags=["Discovery"]
)

# --- MOVIE ENDPOINTS ---

@router.get("/movies/trending")
async def get_trending():
    """Returns real-time trending movies for the dashboard home."""
    results = await movie_service.get_trending_movies()
    if isinstance(results, dict) and "error" in results:
        raise HTTPException(status_code=500, detail=results["error"])
    return results

@router.get("/movies/search")
async def search_movies(q: str = Query(..., min_length=1)):
    """Searches the global TMDB database based on user input."""
    results = await movie_service.search_movies(q)
    if isinstance(results, dict) and "error" in results:
        raise HTTPException(status_code=500, detail=results["error"])
    return results

@router.get("/movies/similar/{movie_id}")
async def get_similar_movies(movie_id: int):
    """Fetches real-time similarities for a specific movie choice."""
    results = await movie_service.get_similar_content(movie_id)
    if isinstance(results, dict) and "error" in results:
        raise HTTPException(status_code=500, detail=results["error"])
    return results

# --- BOOK ENDPOINTS ---

@router.get("/books/search")
async def search_books(q: str = Query(..., min_length=1)):
    """Searches the global Google Books database."""
    results = await book_service.search_books(q)
    if isinstance(results, dict) and "error" in results:
        raise HTTPException(status_code=500, detail=results["error"])
    return results

@router.get("/books/similar")
async def get_similar_books(author: str, category: str):
    """Fetches similar books based on author and category in real-time."""
    results = await book_service.get_similar_books(author, category)
    if isinstance(results, dict) and "error" in results:
        raise HTTPException(status_code=500, detail=results["error"])
    return results

# --- ONBOARDING ENDPOINTS ---

@router.get("/onboarding/items")
async def get_onboarding_items(
    type: str = Query(..., enum=["video", "books"]),
    genre: str = Query(...),
    lang: str = Query(...)
):
    """
    Returns items (movies/books) for onboarding based on 
    user's selected type, genre, and language preference.
    """
    try:
        if type == "video":
            results = await movie_service.search_by_genre_lang(genre, lang)
        elif type == "books":
            results = await book_service.search_by_genre_lang(genre, lang)
        else:
            raise HTTPException(status_code=400, detail="Invalid type")
        
        items = [item.get("title") or item.get("name") for item in results]
        return {"items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/interactions")
async def track_interaction(
    interaction: InteractionRequest,
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """
    Track user interactions: like, bookmark, rate, review, view.
    Stores implicit behavioral data for recommendation engine.
    """
    try:
        print(f"Interaction: {interaction.action} on {interaction.content_id}")
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
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
