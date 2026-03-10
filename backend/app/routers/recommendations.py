from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
import hashlib

from app.core.database import get_db
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.security import decode_token

security = HTTPBearer()

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])


def _ensure_list(value):
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    raw = str(value).strip()
    if not raw:
        return []

    # Supports Postgres text[] textual form: {a,b,c}
    if raw.startswith("{") and raw.endswith("}"):
        raw = raw[1:-1]

    parts = [p.strip().strip('"').strip("'") for p in raw.split(",")]
    return [p for p in parts if p]


def _normalize_row(row: dict):
    external_id = row.get("external_id")
    normalized_type = str(row.get("content_type", "movie")).lower()
    return {
        "id": external_id or row.get("content_id"),
        "tmdb_id": external_id,
        "content_id": row.get("content_id"),
        "title": row.get("title"),
        "poster_url": row.get("poster_url"),
        "content_type": normalized_type,
        "rating": row.get("rating"),
        "language": row.get("language") or row.get("original_language")
    }


def _non_empty_patterns(values: list[str]):
    return [f"%{v}%" for v in values if str(v).strip()]


def _display_genre_name(raw: str) -> str:
    value = str(raw or "").strip().lower()
    genre_display_map = {
        "sci-fi": "Science Fiction",
        "hi-tech": "High Tech",
        "non-fiction": "Non-Fiction",
        "nonfiction": "Non-Fiction",
    }
    if value in genre_display_map:
        return genre_display_map[value]
    if not value:
        return "Trending"
    return value.replace("-", " ").title()


def _daily_rotate(items: list[dict], user_id: str, salt: str = "slider"):
    if not items:
        return items
    key = f"{user_id}:{date.today().isoformat()}:{salt}"
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    offset = int(digest[:8], 16) % len(items)
    return items[offset:] + items[:offset]


def _dedupe_by_id(items: list[dict]):
    seen = set()
    out = []
    for item in items:
        key = str(item.get("id") or item.get("content_id") or item.get("tmdb_id") or "")
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        out.append(item)
    return out


def _movie_first(items: list[dict]):
    if not items:
        return []
    movies = [i for i in items if str(i.get("content_type", "")).lower() == "movie"]
    others = [i for i in items if str(i.get("content_type", "")).lower() != "movie"]
    return movies + others


def _exclude_existing(items: list[dict], existing_sections: list[list[dict]]):
    if not items:
        return []

    used_ids = _collect_used_ids(*existing_sections)
    used_titles = _collect_used_titles(*existing_sections)
    out = []
    seen_local_ids = set()
    seen_local_titles = set()

    for item in items:
        item_id = str(
            item.get("content_id")
            or item.get("id")
            or item.get("tmdb_id")
            or item.get("external_id")
            or ""
        )
        item_title = str(item.get("title", "")).strip().lower()

        if item_id and item_id in used_ids:
            continue
        if item_title and item_title in used_titles:
            continue
        if item_id and item_id in seen_local_ids:
            continue
        if item_title and item_title in seen_local_titles:
            continue

        out.append(item)
        if item_id:
            seen_local_ids.add(item_id)
        if item_title:
            seen_local_titles.add(item_title)

    return out


def _title_key(item: dict) -> str:
    return str(item.get("title", "")).strip().lower()


def _item_language(item: dict) -> str:
    return str(item.get("language") or item.get("original_language") or "").strip().lower()


def _keep_language(items: list[dict], lang: str):
    target = str(lang or "").strip().lower()
    if not target:
        return items
    return [i for i in items if _item_language(i) == target]


def _cross_section_unique(*sections: list[dict]):
    """Preserves row order while ensuring no title/id appears in more than one row."""
    used_ids = set()
    used_titles = set()
    cleaned_sections = []

    for section in sections:
        cleaned = []
        for item in section or []:
            item_id = str(
                item.get("content_id")
                or item.get("id")
                or item.get("tmdb_id")
                or item.get("external_id")
                or ""
            )
            item_title = _title_key(item)

            if item_id and item_id in used_ids:
                continue
            if item_title and item_title in used_titles:
                continue

            cleaned.append(item)
            if item_id:
                used_ids.add(item_id)
            if item_title:
                used_titles.add(item_title)

        cleaned_sections.append(cleaned)

    return cleaned_sections

def _collect_used_ids(*sections):
    used = set()
    for section in sections:
        if not section:
            continue
        for item in section:
            item_id = (
                item.get("content_id")
                or item.get("id")
                or item.get("tmdb_id")
                or item.get("external_id")
            )
            if item_id:
                used.add(str(item_id))
    return used


def _collect_used_titles(*sections):
    used = set()
    for section in sections:
        if not section:
            continue
        for item in section:
            title = item.get("title")
            if title:
                used.add(str(title).strip().lower())
    return used


async def _tmdb_similarity_fallback(
    titles: list[str],
    lang: str = "en",
    limit: int = 12,
    include_series: bool = True,
):
    """Builds a preference-aware fallback list from TMDB similar endpoints.
    This keeps rows dynamic even when local embeddings/title matches are unavailable.
    """
    from app.services.movie_service import movie_service

    collected = []
    seen_ids = set()

    for title in titles[:3]:
        query = str(title).strip()
        if not query:
            continue

        movie_hits = await movie_service.search_movies(query, original_language=lang)
        if not movie_hits and lang.lower() != "en":
            movie_hits = await movie_service.search_movies(query)
        if movie_hits:
            seed = movie_hits[0]
            seed_id = seed.get("id")
            if seed_id:
                sims = await movie_service.get_similar_content(seed_id, original_language=lang)
                if not sims and lang.lower() != "en":
                    sims = await movie_service.get_similar_content(seed_id)
                for item in sims:
                    item_id = str(item.get("id") or "")
                    if not item_id or item_id in seen_ids:
                        continue
                    seen_ids.add(item_id)
                    collected.append(item)
                    if len(collected) >= limit:
                        return collected

        if include_series:
            series_hits = await movie_service.search_series(query, original_language=lang)
            if not series_hits and lang.lower() != "en":
                series_hits = await movie_service.search_series(query)
        else:
            series_hits = []

        if series_hits:
            seed = series_hits[0]
            seed_id = seed.get("id")
            if seed_id:
                sims = await movie_service.get_similar_series(seed_id, original_language=lang)
                if not sims and lang.lower() != "en":
                    sims = await movie_service.get_similar_series(seed_id)
                for item in sims:
                    item_id = str(item.get("id") or "")
                    if not item_id or item_id in seen_ids:
                        continue
                    seen_ids.add(item_id)
                    collected.append(item)
                    if len(collected) >= limit:
                        return collected

    return collected

SIMILAR_SQL = text("""
SELECT content_id, title, poster_url, content_type, rating
FROM content
WHERE content_id != :content_id
ORDER BY embedding <=> (
  SELECT embedding FROM content WHERE content_id = :content_id
)
LIMIT :limit
""")

@router.get("/similar/{content_id}")
def similar_recommendations(
    content_id: str,
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    # Validates token
    token = creds.credentials
    decode_token(token)

    rows = db.execute(SIMILAR_SQL, {"content_id": content_id, "limit": limit}).fetchall()
    return {
        "items": [dict(r._mapping) for r in rows]
    }

@router.get("/personalized")
async def personalized_recommendations(
    limit: int = Query(10, ge=1, le=50),
    response: Response = None,
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials = Depends(security)
):
    """
    Fetches personalized recommendations for the entire dashboard:
    1. Slider: Vector-based or direct interest matches.
    2. Genre Highlights: Top items in user's favorite genre.
    3. Interest Trending: Top items in user's general interest.
    4. Global Top: Highest rated items across all types.
    """
    if response is not None:
        response.headers["Cache-Control"] = "no-store"

    token = creds.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")

    prefs = db.execute(
        text("SELECT interest, language, genre, selected_titles, favorite_content FROM user_preferences WHERE user_id = :user_id"),
        {"user_id": user_id}
    ).fetchone()

    # Default if no prefs
    if not prefs:
        rows = db.execute(text("""
            SELECT content_id, external_id, title, poster_url, content_type, rating
            FROM content
            ORDER BY popularity_score DESC
            LIMIT 30
        """)).fetchall()
        items = [_normalize_row(dict(r._mapping)) for r in rows]
        return {
            "slider": items[:10],
            "genre_highlights": items[10:16],
            "interest_trending": items[16:22],
            "global_top": items[22:28],
            "genre_name": "Trending"
        }

    interest = prefs.interest
    language = prefs.language or "en"
    genres = _ensure_list(prefs.genre)
    titles = _ensure_list(prefs.selected_titles)
    if not titles and prefs.favorite_content:
        titles = [str(prefs.favorite_content)]
    
    type_map = {"video": ["MOVIE", "SERIES"], "books": ["BOOK"]}
    target_types = type_map.get(interest, ["MOVIE", "SERIES", "BOOK"])
    
    # Keep all user-selected genres; primary remains the first one for compatibility.
    selected_genres = genres if genres else ["Trending"]
    primary_genre = selected_genres[0]
    primary_genre_exact = str(primary_genre).strip()
    genre_pattern = f"%{primary_genre_exact}%"
    display_genre_name = _display_genre_name(primary_genre)

    title_patterns = _non_empty_patterns(titles)

    # --- 1. SLIDER (language-first personalization) ---
    vec_sql = text("""
        WITH liked AS (
            SELECT DISTINCT c.content_id, c.embedding
            FROM content c
            JOIN unnest(:title_patterns) p ON c.title ILIKE p
            WHERE c.embedding IS NOT NULL
        ), user_avg AS (
            SELECT AVG(embedding) as avg_embedding
            FROM liked
        )
        SELECT content_id, external_id, title, poster_url, content_type, rating FROM content, user_avg
        WHERE user_avg.avg_embedding IS NOT NULL 
          AND title NOT ILIKE ALL(:title_patterns)
          AND UPPER(content_type) = ANY(:types)
          AND language = :lang
        ORDER BY embedding <=> user_avg.avg_embedding LIMIT :limit
    """)
    slider_rows = db.execute(
        vec_sql,
        {
            "title_patterns": title_patterns or ["%__no_title_match__%"],
            "types": target_types,
            "lang": language,
            "limit": 20,
        },
    ).fetchall()
    
    if len(slider_rows) < 20:
        fallback_sql = text("""
            SELECT content_id, external_id, title, poster_url, content_type, rating 
            FROM content 
            WHERE UPPER(content_type) = ANY(:types) 
              AND (language = :lang OR language IS NULL OR language = 'en')
            ORDER BY popularity_score DESC LIMIT 20
        """)
        relaxed_rows = db.execute(fallback_sql, {"types": target_types, "lang": language}).fetchall()
        existing = {str(r._mapping.get("content_id")) for r in slider_rows}
        slider_rows = list(slider_rows)
        for r in relaxed_rows:
            cid = str(r._mapping.get("content_id"))
            if cid in existing:
                continue
            existing.add(cid)
            slider_rows.append(r)
            if len(slider_rows) >= 20:
                break

    if len(slider_rows) < 20 and language.lower() != "en":
        from app.services.movie_service import movie_service
        tmdb_fill = await movie_service.search_by_genre_lang(
            primary_genre,
            language,
            limit=24,
            seed_key=f"{user_id}:slider:{primary_genre}:{language}",
        )
        existing_ids = {str((r._mapping.get("external_id") or "")) for r in slider_rows}
        for item in tmdb_fill:
            ext_id = str(item.get("id") or "")
            if ext_id and ext_id in existing_ids:
                continue
            slider_rows.append(
                {
                    "content_id": f"tmdb-{ext_id}",
                    "external_id": ext_id,
                    "title": item.get("title"),
                    "poster_url": item.get("image"),
                    "content_type": "movie",
                    "rating": item.get("rating"),
                }
            )
            if ext_id:
                existing_ids.add(ext_id)
            if len(slider_rows) >= 20:
                break

    normalized_slider = []
    for row in slider_rows:
        if isinstance(row, dict):
            normalized_slider.append(_normalize_row(row))
        else:
            normalized_slider.append(_normalize_row(dict(row._mapping)))

    slider_items = _daily_rotate(normalized_slider, user_id=user_id, salt="hero")
    slider_items = slider_items[:limit]

    # --- 2. GENRE HIGHLIGHTS ---
    genre_sql_strict = text("""
        SELECT content_id, external_id, title, poster_url, content_type, rating
        FROM content
        WHERE UPPER(content_type) = ANY(:types)
          AND (
                EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE :genre_pattern)
                OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE LOWER(g) = LOWER(:genre_exact))
          )
          AND title NOT ILIKE ALL(:title_patterns)
          AND language = :lang
        ORDER BY popularity_score DESC LIMIT 6
    """)
    genre_types = target_types
    if interest == "video":
        # Keep "Explore <genre>" focused on movies first for video users.
        genre_types = ["MOVIE"]

    genre_rows = db.execute(
        genre_sql_strict,
        {
            "types": genre_types,
            "genre_pattern": genre_pattern,
            "genre_exact": primary_genre_exact,
            "title_patterns": title_patterns or ["%__no_title_match__%"],
            "lang": language,
        },
    ).fetchall()

    if interest == "video" and len(genre_rows) < 6:
        genre_sql_series_fill = text("""
            SELECT content_id, external_id, title, poster_url, content_type, rating
            FROM content
            WHERE UPPER(content_type) = 'SERIES'
              AND (
                    EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE :genre_pattern)
                    OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE LOWER(g) = LOWER(:genre_exact))
              )
              AND title NOT ILIKE ALL(:title_patterns)
              AND language = :lang
            ORDER BY popularity_score DESC LIMIT 12
        """)
        series_fill_rows = db.execute(
            genre_sql_series_fill,
            {
                "genre_pattern": genre_pattern,
                "genre_exact": primary_genre_exact,
                "title_patterns": title_patterns or ["%__no_title_match__%"],
                "lang": language,
            },
        ).fetchall()
        existing = {str(r._mapping.get("content_id") or "") for r in genre_rows}
        genre_rows = list(genre_rows)
        for r in series_fill_rows:
            cid = str(r._mapping.get("content_id") or "")
            if cid and cid in existing:
                continue
            if cid:
                existing.add(cid)
            genre_rows.append(r)
            if len(genre_rows) >= 6:
                break

    tmdb_genre_fallback = []
    if len(genre_rows) < 6:
        from app.services.movie_service import movie_service
        slider_external_ids = {
            str(i.get("tmdb_id") or i.get("external_id") or i.get("id") or "")
            for i in slider_items
            if str(i.get("tmdb_id") or i.get("external_id") or i.get("id") or "").strip()
        }
        tmdb_genre_fallback = await movie_service.search_by_genre_lang(
            primary_genre,
            language,
            limit=12,
            exclude_ids=slider_external_ids,
            seed_key=f"{user_id}:genre:{primary_genre}:{language}",
        )
        for item in tmdb_genre_fallback:
            item["content_type"] = "movie"
            if "tmdb_id" not in item:
                item["tmdb_id"] = item.get("id")

    # --- 3. INTEREST-BASED PICKS (explicitly tied to selected titles) ---
    interest_sql_strict = text("""
        WITH liked AS (
            SELECT DISTINCT c.content_id, c.embedding
            FROM content c
            JOIN unnest(:title_patterns) p ON c.title ILIKE p
            WHERE c.embedding IS NOT NULL
            LIMIT 6
        )
        SELECT c.content_id, c.external_id, c.title, c.poster_url, c.content_type, c.rating
        FROM content c
        JOIN liked l ON TRUE
        WHERE c.embedding IS NOT NULL
          AND c.title NOT ILIKE ALL(:title_patterns)
          AND UPPER(c.content_type) = ANY(:types)
          AND c.language = :lang
        ORDER BY c.embedding <=> l.embedding, c.popularity_score DESC
        LIMIT 12
    """)
    interest_rows = db.execute(
        interest_sql_strict,
        {
            "title_patterns": title_patterns or ["%__no_title_match__%"],
            "types": target_types,
            "lang": language,
        },
    ).fetchall()

    if len(interest_rows) < 12:
        interest_sql_relaxed = text("""
            WITH liked AS (
                SELECT DISTINCT c.content_id, c.embedding
                FROM content c
                JOIN unnest(:title_patterns) p ON c.title ILIKE p
                WHERE c.embedding IS NOT NULL
                LIMIT 6
            )
            SELECT c.content_id, c.external_id, c.title, c.poster_url, c.content_type, c.rating
            FROM content c
            JOIN liked l ON TRUE
            WHERE c.embedding IS NOT NULL
              AND c.title NOT ILIKE ALL(:title_patterns)
              AND UPPER(c.content_type) = ANY(:types)
              AND (c.language = :lang OR c.language IS NULL OR c.language = 'en')
            ORDER BY c.embedding <=> l.embedding, c.popularity_score DESC
            LIMIT 24
        """)
        relaxed_rows = db.execute(
            interest_sql_relaxed,
            {
                "title_patterns": title_patterns or ["%__no_title_match__%"],
                "types": target_types,
                "lang": language,
            },
        ).fetchall()
        seen_ids = {str(r._mapping.get("content_id") or "") for r in interest_rows}
        interest_rows = list(interest_rows)
        for r in relaxed_rows:
            cid = str(r._mapping.get("content_id") or "")
            if cid and cid in seen_ids:
                continue
            if cid:
                seen_ids.add(cid)
            interest_rows.append(r)
            if len(interest_rows) >= 12:
                break

    # If similarity couldn't produce rows, fallback to genre-highlight rows first.
    if not interest_rows and genre_rows:
        interest_rows = genre_rows

    # Title-driven recommendations should reflect user-picked titles first.
    tmdb_interest_fallback = await _tmdb_similarity_fallback(
        titles,
        lang=language,
        limit=12,
        include_series=False if interest == "video" else True,
    ) if titles else []

    # --- 4. DYNAMIC TRENDING (always real trending movies) ---
    from app.services.movie_service import movie_service
    if language and language.lower() != "en":
        base_trending = await movie_service.get_trending_movies_by_language(language, limit=12)
        exclude_for_trending = {
            str(i.get("id") or i.get("tmdb_id") or i.get("external_id") or "")
            for i in base_trending
            if str(i.get("id") or i.get("tmdb_id") or i.get("external_id") or "").strip()
        }
        genre_driven = await movie_service.search_by_genre_lang(
            primary_genre,
            language,
            limit=12,
            exclude_ids=exclude_for_trending,
            seed_key=f"{user_id}:trending:{primary_genre}:{language}",
        )

        # Make Trending Now responsive to user genre by blending both lists.
        trending_items = []
        seen_ids = set()

        def push_item(item):
            item_id = str(item.get("id") or "")
            if not item_id or item_id in seen_ids:
                return
            seen_ids.add(item_id)
            item["content_type"] = "movie"
            if "tmdb_id" not in item:
                item["tmdb_id"] = item_id
            trending_items.append(item)

        max_len = max(len(base_trending), len(genre_driven))
        for idx in range(max_len):
            if idx < len(genre_driven):
                push_item(genre_driven[idx])
            if idx < len(base_trending):
                push_item(base_trending[idx])
            if len(trending_items) >= 12:
                break

        # Last fallback if language-specific pool is very thin.
        if not trending_items:
            trending_items = await movie_service.get_trending_movies()
    else:
        trending_items = await movie_service.get_trending_movies()
    for t in trending_items:
        t["content_type"] = "movie"
        if "tmdb_id" not in t:
            t["tmdb_id"] = t.get("id")

    # --- 5. BOOK RECOMMENDATION ---
    book_sql = text("""
        SELECT content_id, title, poster_url, content_type, rating
        FROM content
        WHERE content_type = 'BOOK'
          AND (
                EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE :genre_pattern)
                OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE LOWER(g) = LOWER(:genre_exact))
          )
        ORDER BY popularity_score DESC LIMIT 1
    """)
    book_row = db.execute(
        book_sql,
        {
            "genre_pattern": genre_pattern,
            "genre_exact": primary_genre_exact,
        },
    ).fetchone()
    
    book_rec = None
    if book_row:
        book_rec = dict(book_row._mapping)
    else:
        # Fetch from service if not in DB
        from app.services.book_service import book_service
        book_res = await book_service.search_by_genre_lang(primary_genre, "en")
        if book_res: book_rec = book_res[0]

    # Pick one of the liked titles to show in "Since you like {title}"
    liked_title = titles[0] if titles else "your favorites"

    interest_payload = (
        tmdb_interest_fallback
        or [_normalize_row(dict(r._mapping)) for r in interest_rows]
        or [_normalize_row(dict(r._mapping)) for r in genre_rows]
    )

    genre_payload = [_normalize_row(dict(r._mapping)) for r in genre_rows]
    if tmdb_genre_fallback:
        seen = {str(i.get("id") or i.get("content_id") or "") for i in genre_payload}
        for item in tmdb_genre_fallback:
            item_id = str(item.get("id") or item.get("content_id") or "")
            if item_id and item_id in seen:
                continue
            genre_payload.append(item)
            if item_id:
                seen.add(item_id)
            if len(genre_payload) >= 12:
                break

    if interest == "video":
        genre_payload = _movie_first(genre_payload)
        interest_payload = _movie_first(interest_payload)

    # Keep rows distinct on the dashboard to avoid same-card repetition.
    genre_payload = _dedupe_by_id(genre_payload)
    interest_payload = _exclude_existing(_dedupe_by_id(interest_payload), [genre_payload])

    if language.lower() != "en":
        genre_payload = _keep_language(genre_payload, language)

    if len(interest_payload) < 8:
        refill_from_tmdb = await _tmdb_similarity_fallback(
            titles,
            lang=language,
            limit=12,
            include_series=False if interest == "video" else True,
        ) if titles else []
        refill_from_tmdb = _exclude_existing(_dedupe_by_id(refill_from_tmdb), [genre_payload, interest_payload])
        for item in refill_from_tmdb:
            interest_payload.append(item)
            if len(interest_payload) >= 12:
                break

    genre_payload, interest_payload = _cross_section_unique(
        genre_payload,
        interest_payload,
    )

    # Final hero composition: use preference-driven pools so it changes with user choices.
    # For non-English users, prioritize interest+genre first to avoid English-dominant hero output.
    if language and language.lower() != "en":
        hero_candidates = _dedupe_by_id(interest_payload + genre_payload + trending_items)
    else:
        hero_candidates = _dedupe_by_id(slider_items + interest_payload + genre_payload)

    slider_items = _daily_rotate(hero_candidates, user_id=user_id, salt="hero-final")[:limit]

    used_ids_for_global = _collect_used_ids(
        slider_items, genre_payload, interest_payload
    )
    used_titles_for_global = _collect_used_titles(
        slider_items, genre_payload, interest_payload
    )

    filtered_global_top = []
    seen_global_ids = set()
    seen_global_titles = set()
    for item in trending_items:
        item_id = str(
            item.get("content_id")
            or item.get("id")
            or item.get("tmdb_id")
            or item.get("external_id")
            or ""
        )
        item_title = str(item.get("title", "")).strip().lower()

        if item_id and item_id in used_ids_for_global:
            continue
        if item_title and item_title in used_titles_for_global:
            continue
        if item_id and item_id in seen_global_ids:
            continue
        if item_title and item_title in seen_global_titles:
            continue

        filtered_global_top.append(item)
        if item_id:
            seen_global_ids.add(item_id)
        if item_title:
            seen_global_titles.add(item_title)
        if len(filtered_global_top) >= 12:
            break

    # If strict dedupe leaves too few cards, backfill from trending while
    # still preventing duplicates within the fan-favorites row itself.
    if len(filtered_global_top) < 12:
        for item in trending_items:
            item_id = str(
                item.get("content_id")
                or item.get("id")
                or item.get("tmdb_id")
                or item.get("external_id")
                or ""
            )
            item_title = str(item.get("title", "")).strip().lower()

            if item_id and item_id in seen_global_ids:
                continue
            if item_title and item_title in seen_global_titles:
                continue

            filtered_global_top.append(item)
            if item_id:
                seen_global_ids.add(item_id)
            if item_title:
                seen_global_titles.add(item_title)
            if len(filtered_global_top) >= 12:
                break

    # Final anti-duplication pass across all visible rows.
    genre_payload, interest_payload, filtered_global_top = _cross_section_unique(
        genre_payload,
        interest_payload,
        filtered_global_top,
    )

    # Refill rows from local DB when dedupe gets too aggressive.
    if len(genre_payload) < 8 or len(interest_payload) < 8 or len(filtered_global_top) < 8:
        used_ids = _collect_used_ids(slider_items, genre_payload, interest_payload, filtered_global_top)
        used_titles = _collect_used_titles(slider_items, genre_payload, interest_payload, filtered_global_top)
        refill_rows = db.execute(
            text("""
                SELECT content_id, external_id, title, poster_url, content_type, rating
                FROM content
                WHERE UPPER(content_type) = ANY(:types)
                  AND (language = :lang OR language IS NULL OR language = 'en')
                ORDER BY popularity_score DESC
                LIMIT 120
            """),
            {"types": target_types, "lang": language},
        ).fetchall()

        refill_items = [_normalize_row(dict(r._mapping)) for r in refill_rows]
        for item in refill_items:
            item_id = str(item.get("content_id") or item.get("id") or item.get("tmdb_id") or "")
            item_title = _title_key(item)
            item_lang = _item_language(item)
            if item_id and item_id in used_ids:
                continue
            if item_title and item_title in used_titles:
                continue

            if len(genre_payload) < 12:
                if language.lower() != "en" and item_lang != language.lower():
                    continue
                genre_payload.append(item)
            elif len(interest_payload) < 12:
                interest_payload.append(item)
            elif len(filtered_global_top) < 12:
                filtered_global_top.append(item)
            else:
                break

            if item_id:
                used_ids.add(item_id)
            if item_title:
                used_titles.add(item_title)

    if language.lower() != "en" and len(genre_payload) < 8:
        # Final language-locked refill for Explore when DB strict pool is thin.
        from app.services.movie_service import movie_service
        extra_genre = await movie_service.search_by_genre_lang(
            primary_genre,
            language,
            limit=12,
            exclude_ids=_collect_used_ids(slider_items, genre_payload, interest_payload, filtered_global_top),
            seed_key=f"{user_id}:genre-language-lock:{primary_genre}:{language}",
        )
        for item in extra_genre:
            item["content_type"] = "movie"
            if "tmdb_id" not in item:
                item["tmdb_id"] = item.get("id")
            if "language" not in item:
                item["language"] = item.get("original_language") or language

            item_id = str(item.get("id") or item.get("tmdb_id") or "")
            item_title = _title_key(item)
            if item_id and item_id in _collect_used_ids(slider_items, genre_payload, interest_payload, filtered_global_top):
                continue
            if item_title and item_title in _collect_used_titles(slider_items, genre_payload, interest_payload, filtered_global_top):
                continue

            genre_payload.append(item)
            if len(genre_payload) >= 12:
                break

    # Build per-genre rows so dashboard can show recommendations for each chosen genre.
    genre_sections = [
        {
            "genre": primary_genre,
            "genre_name": _display_genre_name(primary_genre),
            "items": genre_payload,
        }
    ]

    for extra_genre in selected_genres[1:]:
        extra_exact = str(extra_genre).strip()
        if not extra_exact:
            continue

        extra_pattern = f"%{extra_exact}%"
        extra_rows = db.execute(
            genre_sql_strict,
            {
                "types": genre_types,
                "genre_pattern": extra_pattern,
                "genre_exact": extra_exact,
                "title_patterns": title_patterns or ["%__no_title_match__%"],
                "lang": language,
            },
        ).fetchall()

        if interest == "video" and len(extra_rows) < 6:
            series_fill_rows = db.execute(
                text("""
                    SELECT content_id, external_id, title, poster_url, content_type, rating
                    FROM content
                    WHERE UPPER(content_type) = 'SERIES'
                      AND (
                            EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE :genre_pattern)
                            OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE LOWER(g) = LOWER(:genre_exact))
                      )
                      AND title NOT ILIKE ALL(:title_patterns)
                      AND language = :lang
                    ORDER BY popularity_score DESC LIMIT 12
                """),
                {
                    "genre_pattern": extra_pattern,
                    "genre_exact": extra_exact,
                    "title_patterns": title_patterns or ["%__no_title_match__%"],
                    "lang": language,
                },
            ).fetchall()
            existing = {str(r._mapping.get("content_id") or "") for r in extra_rows}
            extra_rows = list(extra_rows)
            for r in series_fill_rows:
                cid = str(r._mapping.get("content_id") or "")
                if cid and cid in existing:
                    continue
                if cid:
                    existing.add(cid)
                extra_rows.append(r)
                if len(extra_rows) >= 6:
                    break

        extra_payload = [_normalize_row(dict(r._mapping)) for r in extra_rows]
        if interest == "video":
            extra_payload = _movie_first(extra_payload)
        extra_payload = _dedupe_by_id(extra_payload)

        if language.lower() != "en":
            extra_payload = _keep_language(extra_payload, language)

        if len(extra_payload) < 8:
            extra_tmdb_fill = await movie_service.search_by_genre_lang(
                extra_exact,
                language,
                limit=12,
                exclude_ids={
                    str(i.get("id") or i.get("tmdb_id") or i.get("external_id") or "")
                    for i in extra_payload
                    if str(i.get("id") or i.get("tmdb_id") or i.get("external_id") or "").strip()
                },
                seed_key=f"{user_id}:genre-section:{extra_exact}:{language}",
            )
            for item in extra_tmdb_fill:
                item["content_type"] = "movie"
                if "tmdb_id" not in item:
                    item["tmdb_id"] = item.get("id")
                if language.lower() != "en" and _item_language(item) != language.lower():
                    item["language"] = language
                extra_payload.append(item)
                if len(extra_payload) >= 12:
                    break

        genre_sections.append(
            {
                "genre": extra_exact,
                "genre_name": _display_genre_name(extra_exact),
                "items": _dedupe_by_id(extra_payload)[:12],
            }
        )

    return {
        "slider": slider_items,
        "genre_highlights": genre_payload,
        "genre_sections": genre_sections,
        "interest_trending": interest_payload,
        "global_top": filtered_global_top,
        "book_recommendation": book_rec,
        "genre_name": display_genre_name,
        "liked_title": liked_title,
        "language": language
    }