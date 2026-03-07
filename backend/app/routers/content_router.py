from fastapi import APIRouter, HTTPException, Query, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.services.movie_service import movie_service
from app.services.book_service import book_service
from app.core.database import get_db

router = APIRouter(
    prefix="/content",
    tags=["Content"]
)

@router.get("")
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

@router.get("/{content_id}")
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
