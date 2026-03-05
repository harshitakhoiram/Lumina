from pydantic import BaseModel
from typing import Optional, List

class ContentBase(BaseModel):
    content_id: str
    title: str
    content_type: str  # "movie", "series", "book"
    description: Optional[str] = None
    poster_url: Optional[str] = None
    rating: Optional[float] = None
    genre: Optional[List[str]] = []
    release_date: Optional[str] = None

class ContentDetail(ContentBase):
    """Extended content details like IMDb"""
    runtime: Optional[int] = None  # minutes
    directors: Optional[List[str]] = []
    cast: Optional[List[str]] = []
    authors: Optional[List[str]] = []  # for books
    publisher: Optional[str] = None  # for books
    language: Optional[str] = None
    imdb_url: Optional[str] = None
    tmdb_url: Optional[str] = None
    review_count: Optional[int] = 0
    user_rating: Optional[float] = None  # avg user rating from db

class ContentSearchResponse(BaseModel):
    items: List[ContentBase]
    total: int

class InteractionRequest(BaseModel):
    content_id: str
    action: str  # "like", "bookmark", "rate", "review", "view"
    rating: Optional[float] = None  # 0-10, for "rate" action
    review_text: Optional[str] = None  # for "review" action

class InteractionResponse(BaseModel):
    success: bool
    message: str
