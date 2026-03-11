from pydantic import BaseModel


class WatchlistItemCreate(BaseModel):
    external_id: str
    title: str
    poster_url: str | None = None
    content_type: str = "movie"
    rating: float | None = None


class WatchlistItemResponse(BaseModel):
    id: str
    external_id: str
    title: str
    poster_url: str | None = None
    content_type: str
    rating: float | None = None
    created_at: str | None = None
