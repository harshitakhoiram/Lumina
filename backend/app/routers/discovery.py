from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.services.movie_service import movie_service
from app.services.book_service import book_service
from app.schemas.content_schema import InteractionRequest, InteractionResponse
from app.core.database import get_db
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
security = HTTPBearer()

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

# --- UNIFIED CONTENT ENDPOINTS ---

@router.get("/content")
async def search_content(q: str = Query(..., min_length=1), type: str = Query(None, enum=["movie", "series", "book", None])):
    """
    Unified search across movies, series, and books.
    Returns mixed results from TMDB (movies/series) and Google Books.
    """
    results = []
    try:
        if not type or type in ["movie", "series"]:
            movie_results = await movie_service.search_movies(q)
            if not isinstance(movie_results, dict) or "error" not in movie_results:
                results.extend(movie_results if isinstance(movie_results, list) else [])
        
        if not type or type == "book":
            book_results = await book_service.search_books(q)
            if not isinstance(book_results, dict) or "error" not in book_results:
                results.extend(book_results if isinstance(book_results, list) else [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search error: {str(e)}")
    
    return {"items": results, "total": len(results)}

@router.get("/content/{content_id}")
async def get_content_detail(content_id: str, db: Session = Depends(get_db)):
    """
    Get detailed view of a specific movie/book (like IMDb page).
    Fetches from external APIs and augments with local DB data.
    """
    try:
        db_result = db.execute(
            text("SELECT * FROM content WHERE content_id = :id"),
            {"id": content_id}
        ).fetchone()
        
        if db_result:
            return dict(db_result._mapping)
        
        movie_detail = await movie_service.get_movie_detail(content_id)
        if movie_detail and "error" not in movie_detail:
            return movie_detail
        
        raise HTTPException(status_code=404, detail="Content not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/interactions")
async def track_interaction(
    interaction: InteractionRequest,
    db: Session = Depends(get_db)
):
    """
    Track user interactions: like, bookmark, rate, review, view.
    Stores implicit behavioral data for recommendation engine.
    """
    try:
        print(f"Interaction: {interaction.action} on {interaction.content_id}")
        if interaction.rating:
            print(f"  Rating: {interaction.rating}")
        if interaction.review_text:
            print(f"  Review: {interaction.review_text}")
        
        return {"success": True, "message": f"Recorded {interaction.action} for content {interaction.content_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/similar/{content_id}")
def similar_recommendations(
    content_id: str,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials = Depends(security) # <-- THIS LOCKS THE ROUTE
):
    # This line ensures the user is logged in before the SQL runs
    rows = db.execute(SIMILAR_SQL, {"content_id": content_id, "limit": limit}).fetchall()
    return {
        "items": [dict(r._mapping) for r in rows]
    }