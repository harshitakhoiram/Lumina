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

DEFAULT_HERO_LIMIT = 12
ROW_LIMIT = 18
MIN_ROW_FILL = 12
POOL_LIMIT = 60
GENRE_SEED_LIMIT = 60 # Increased to match pool
ROMANCE_SERIES_PROXY_TAGS = ["soap", "romance"]


def _normalize_media_mode(value: str | None) -> str:
    normalized = str(value or "all").strip().lower()
    alias_map = {
        "movies": "movie",
        "tv": "series",
        "shows": "series",
    }
    normalized = alias_map.get(normalized, normalized)
    if normalized not in {"all", "movie", "series", "books"}:
        return "all"
    return normalized


def _resolve_target_types(interest: str | None, media_mode: str | None):
    normalized = _normalize_media_mode(media_mode)
    if str(interest or "").lower() == "books":
        return ["BOOK"], "books"
    if normalized == "movie":
        return ["MOVIE"], "movie"
    if normalized == "series":
        return ["SERIES"], "series"
    if str(interest or "").lower() == "video":
        return ["MOVIE", "SERIES"], "all"
    return ["MOVIE", "SERIES", "BOOK"], "all"


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


def _normalize_language_code(raw: str) -> str:
    value = str(raw or "").strip().lower()
    label_to_code = {
        "english": "en",
        "korean": "ko",
        "chinese": "zh",
        "mandarin": "zh",
        "hindi": "hi",
        "japanese": "ja",
        "spanish": "es",
        "french": "fr",
        "german": "de",
        "italian": "it",
        "portuguese": "pt",
        "russian": "ru",
        "arabic": "ar",
        "thai": "th",
        "turkish": "tr",
        "indonesian": "id",
        "filipino": "tl",
    }
    return label_to_code.get(value, value)


def _row_to_dict(row):
    """Safely convert a SQLAlchemy Row or a plain dict to a plain dict."""
    if isinstance(row, dict):
        return row
    return dict(row._mapping)


def _normalize_row(row: dict):
    external_id = row.get("external_id")
    normalized_type = str(row.get("content_type", "movie")).lower()
    return {
        "id": external_id or row.get("content_id"),
        "tmdb_id": external_id,
        "content_id": row.get("content_id"),
        "title": row.get("title"),
        "poster_url": row.get("poster_url"),
        "overview": row.get("overview") or row.get("description"),
        "description": row.get("description") or row.get("overview"),
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


def _needs_romance_series_proxy(genre: str, media_mode: str) -> bool:
    return str(genre or "").strip().lower() == "romance" and media_mode in {"all", "series"}


def _daily_rotate(items: list[dict], user_id: str, salt: str = "slider"):
    if not items:
        return items
    key = f"{user_id}:{date.today().isoformat()}:{salt}"
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    offset = int(digest[:8], 16) % len(items)
    return items[offset:] + items[:offset]


def _rotate_with_request_seed(items: list[dict], user_id: str, salt: str, request_seed: str | None = None):
    if not items:
        return items
    if not request_seed:
        return _daily_rotate(items, user_id=user_id, salt=salt)

    key = f"{user_id}:{date.today().isoformat()}:{salt}:{request_seed}"
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


def _mix_by_content_type(items: list[dict], limit: int | None = None):
    if not items:
        return []

    ordered_types = ["movie", "series", "book"]
    buckets: dict[str, list[dict]] = {content_type: [] for content_type in ordered_types}
    others: list[dict] = []

    for item in items:
        content_type = str(item.get("content_type") or "").strip().lower()
        if content_type in buckets:
            buckets[content_type].append(item)
        else:
            others.append(item)

    mixed: list[dict] = []
    while True:
        progressed = False
        for content_type in ordered_types:
            if buckets[content_type]:
                mixed.append(buckets[content_type].pop(0))
                progressed = True
                if limit and len(mixed) >= limit:
                    return mixed
        if not progressed:
            break

    mixed.extend(others)
    return mixed[:limit] if limit else mixed


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


def _keep_any_language(items: list[dict], langs: list[str]):
    """Keep items whose language matches any of the given language codes."""
    targets = {str(l or "").strip().lower() for l in (langs or []) if l}
    if not targets:
        return items
    return [i for i in items if _item_language(i) in targets]


def _has_non_english_selected(langs: list[str]) -> bool:
    return any(str(l or "").strip().lower() != "en" for l in (langs or []) if str(l or "").strip())


def _language_mix_order(langs: list[str]) -> list[str]:
    ordered = []
    seen = set()
    for l in langs or []:
        code = str(l or "").strip().lower()
        if not code or code in seen:
            continue
        seen.add(code)
        ordered.append(code)

    if len(ordered) <= 1:
        return ordered

    non_en = [l for l in ordered if l != "en"]
    en = [l for l in ordered if l == "en"]
    if not non_en:
        return en
    return non_en + en


def _mix_by_languages(items: list[dict], langs: list[str], limit: int | None = None):
    """Interleave items across selected languages to avoid single-language dominance."""
    if not items:
        return []

    ordered_langs = _language_mix_order(langs)
    if not ordered_langs:
        return items[:limit] if limit else items

    buckets: dict[str, list[dict]] = {l: [] for l in ordered_langs}
    others: list[dict] = []
    for item in items:
        lang = _item_language(item)
        if lang in buckets:
            buckets[lang].append(item)
        else:
            others.append(item)

    mixed: list[dict] = []
    # If we have buckets, rotate through them
    if ordered_langs:
        while True:
            progressed = False
            for l in ordered_langs:
                if buckets[l]:
                    mixed.append(buckets[l].pop(0))
                    progressed = True
                    if limit and len(mixed) >= limit:
                        return mixed
            if not progressed:
                break

    mixed.extend(others)
    return mixed[:limit] if limit else mixed


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
    langs: list[str] | None = None,
    limit: int = 12,
    include_series: bool = True,
    content_mode: str = "all",
):
    """Builds a preference-aware fallback list from TMDB similar endpoints.
    Accepts a list of language codes (`langs`) to produce a mixed result.
    """
    from app.services.movie_service import movie_service

    effective_langs = langs if langs else [lang]
    collected = []
    seen_ids: set = set()
    mode = _normalize_media_mode(content_mode)

    for _lang in effective_langs:
        lang_items = []
        # Per language, gather up to the limit to ensure valid mix
        for title in titles[:3]:
            query = str(title).strip()
            if not query:
                continue

            if mode != "series":
                movie_hits = await movie_service.search_movies(query, original_language=_lang)
                if not movie_hits and _lang.lower() != "en":
                    movie_hits = await movie_service.search_movies(query)
                if movie_hits:
                    seed = movie_hits[0]
                    seed_id = seed.get("id")
                    if seed_id:
                        sims = await movie_service.get_similar_content(seed_id, original_language=_lang)
                        if not sims and _lang.lower() != "en":
                            sims = await movie_service.get_similar_content(seed_id)
                        for item in sims:
                            item_id = str(item.get("id") or "")
                            if not item_id or item_id in seen_ids:
                                continue
                            seen_ids.add(item_id)
                            lang_items.append(item)

            if include_series and mode != "movie":
                series_hits = await movie_service.search_series(query, original_language=_lang)
                if not series_hits and _lang.lower() != "en":
                    series_hits = await movie_service.search_series(query)
            else:
                series_hits = []

            if series_hits:
                seed = series_hits[0]
                seed_id = seed.get("id")
                if seed_id:
                    sims = await movie_service.get_similar_series(seed_id, original_language=_lang)
                    if not sims and _lang.lower() != "en":
                        sims = await movie_service.get_similar_series(seed_id)
                    for item in sims:
                        item_id = str(item.get("id") or "")
                        if not item_id or item_id in seen_ids:
                            continue
                        seen_ids.add(item_id)
                        lang_items.append(item)
        
        collected.extend(lang_items)

    return _mix_by_languages(collected, effective_langs, limit=limit)

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
    limit: int = Query(DEFAULT_HERO_LIMIT, ge=1, le=50),
    media_mode: str = Query("all"),
    refresh_seed: str | None = Query(None, alias="t"),
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

    # Set DB seed if refresh_seed is provided to make RANDOM() varied but predictable per seed
    if refresh_seed:
        try:
            # Hash to a float between -1.0 and 1.0 for setseed
            seed_hash = int(hashlib.md5(str(refresh_seed).encode()).hexdigest(), 16)
            seed_float = (seed_hash % 2000000) / 1000000.0 - 1.0
            db.execute(text("SELECT setseed(:s)"), {"s": seed_float})
        except Exception:
            pass

    token = creds.credentials
    payload = decode_token(token)
    user_id = payload.get("sub")
    target_types, resolved_media_mode = _resolve_target_types("video", media_mode)

    prefs = db.execute(
        text("SELECT interest, language, languages, genre, selected_titles, favorite_content FROM user_preferences WHERE user_id = :user_id"),
        {"user_id": user_id}
    ).fetchone()

    # Default if no prefs
    if not prefs:
        rows = db.execute(text("""
            SELECT content_id, external_id, title, poster_url, content_type, rating, description
            FROM content
            WHERE UPPER(content_type) = ANY(:types)
            ORDER BY popularity_score DESC
            LIMIT 72
        """), {"types": target_types}).fetchall()
        items = [_normalize_row(dict(r._mapping)) for r in rows]
        return {
            "slider": items[:limit],
            "genre_highlights": items[limit:limit + ROW_LIMIT],
            "interest_trending": items[limit + ROW_LIMIT:limit + (ROW_LIMIT * 2)],
            "global_top": items[limit + (ROW_LIMIT * 2):limit + (ROW_LIMIT * 3)],
            "genre_name": "Trending",
            "media_mode": resolved_media_mode,
            "available_media_modes": ["all", "movie", "series"],
        }

    interest = prefs.interest
    language = _normalize_language_code(prefs.language or "en")
    target_types, resolved_media_mode = _resolve_target_types(interest, media_mode)
    # Use the full languages list; fall back to [language] for old rows
    languages_list = _ensure_list(prefs.languages) if prefs.languages else [language]
    if not languages_list:
        languages_list = [language]
    languages_list = [_normalize_language_code(l) for l in languages_list]
    languages_list = _language_mix_order(languages_list)
    has_non_english = _has_non_english_selected(languages_list)
    genres = _ensure_list(prefs.genre)
    titles = _ensure_list(prefs.selected_titles)
    if not titles and prefs.favorite_content:
        titles = [str(prefs.favorite_content)]
    
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
                SELECT content_id, external_id, title, poster_url, content_type, rating, language, description FROM content, user_avg
        WHERE user_avg.avg_embedding IS NOT NULL 
          AND title NOT ILIKE ALL(:title_patterns)
          AND UPPER(content_type) = ANY(:types)
          AND language = ANY(:langs)
          AND NOT (genres && ARRAY['Reality', 'Talk', 'Variety', 'Talk Show'])
        ORDER BY embedding <=> user_avg.avg_embedding LIMIT :limit
    """)
    slider_rows = db.execute(
        vec_sql,
        {
            "title_patterns": title_patterns or ["%__no_title_match__%"],
            "types": target_types,
            "langs": languages_list,
            "limit": max(20, ROW_LIMIT),
        },
    ).fetchall()
    
    if len(slider_rows) < max(20, ROW_LIMIT):
        fallback_sql = text("""
            SELECT content_id, external_id, title, poster_url, content_type, rating, language, description
            FROM content
            WHERE UPPER(content_type) = ANY(:types)
              AND language = :lang
              AND NOT (genres && ARRAY['Reality', 'Talk', 'Variety', 'Talk Show'])
            ORDER BY (popularity_score * (0.5 + RANDOM() * 1.0)) DESC LIMIT 50
        """)
        
        total_fallback_rows = []
        for _lang in languages_list:
            db_rows = db.execute(fallback_sql, {"types": target_types, "lang": _lang}).fetchall()
            total_fallback_rows.extend(db_rows)
            
        # Add English as a base if not already present or if pool still small
        if "en" not in languages_list:
            en_rows = db.execute(fallback_sql, {"types": target_types, "lang": "en"}).fetchall()
            total_fallback_rows.extend(en_rows)

        relaxed_rows = _mix_by_languages([_row_to_dict(r) for r in total_fallback_rows], languages_list + ["en"])
        
        existing = {str(_row_to_dict(r).get("content_id")) for r in slider_rows}
        slider_rows = list(slider_rows)
        for r in relaxed_rows:
            cid = str(r.get("content_id"))
            if cid in existing:
                continue
            existing.add(cid)
            slider_rows.append(r)
            if len(slider_rows) >= 50: # Larger pool for rotation
                break

    # TMDB fill per-language to ensure each has representation
    if languages_list != ["en"]:
        from app.services.movie_service import movie_service
        existing_ids = {str((r._mapping.get("external_id") or "") if hasattr(r, '_mapping') else (r.get("external_id") or "")) for r in slider_rows}
        slider_rows = list(slider_rows)
        
        for _lang in languages_list:
            if _lang == "en": continue
            
            # Check representation for this lang
            lang_items = [r for r in slider_rows if _item_language(r) == _lang]
            if len(lang_items) < 5:
                if resolved_media_mode == "series":
                    tmdb_fill = await movie_service.search_series_by_genre_lang(
                        primary_genre, _lang, limit=12,
                        seed_key=f"{user_id}:slider-tmdb:{_lang}:{refresh_seed or ''}",
                    )
                else:
                    tmdb_fill = await movie_service.search_by_genre_lang(
                        primary_genre, _lang, limit=12,
                        seed_key=f"{user_id}:slider-tmdb:{_lang}:{refresh_seed or ''}",
                    )
                for item in tmdb_fill:
                    ext_id = str(item.get("id") or "")
                    if ext_id and ext_id in existing_ids:
                        continue
                    slider_rows.append({
                        "content_id": f"tmdb-{ext_id}",
                        "external_id": ext_id,
                        "title": item.get("title"),
                        "poster_url": item.get("image"),
                        "content_type": item.get("content_type") or ("series" if resolved_media_mode == "series" else "movie"),
                        "rating": item.get("rating"),
                        "language": item.get("original_language") or _lang,
                    })
                    if ext_id:
                        existing_ids.add(ext_id)
        
        # Final mix
        slider_rows = _mix_by_languages(slider_rows, languages_list)

    normalized_slider = []
    for row in slider_rows:
        if isinstance(row, dict):
            normalized_slider.append(_normalize_row(row))
        else:
            normalized_slider.append(_normalize_row(dict(row._mapping)))

    slider_items = _rotate_with_request_seed(
        normalized_slider,
        user_id=user_id,
        salt="hero",
        request_seed=refresh_seed,
    )
    slider_items = slider_items[:limit]

    # --- 2. GENRE HIGHLIGHTS ---
    genre_sql_strict = text("""
        SELECT content_id, external_id, title, poster_url, content_type, rating, language, description
        FROM content
        WHERE UPPER(content_type) = ANY(:types)
          AND (
                EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE :genre_pattern)
                OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE LOWER(g) = LOWER(:genre_exact))
                OR (:has_proxy_tags AND UPPER(content_type) = 'SERIES' AND EXISTS (SELECT 1 FROM unnest(genres) g WHERE LOWER(g) = ANY(:proxy_tags)))
          )
          AND title NOT ILIKE ALL(:title_patterns)
          AND language = ANY(:langs)
          AND NOT (genres && ARRAY['Reality', 'Talk', 'Variety', 'Talk Show'])
        ORDER BY (popularity_score * (0.5 + RANDOM() * 1.0)) DESC LIMIT :seed_limit
    """)
    genre_types = target_types
    if interest == "video" and resolved_media_mode == "movie":
        # Keep "Explore <genre>" focused on movies first for video users.
        genre_types = ["MOVIE"]

    genre_rows = []
    genre_existing = set()
    genre_external = set()
    
    proxy_tags = ROMANCE_SERIES_PROXY_TAGS if _needs_romance_series_proxy(primary_genre_exact, resolved_media_mode) else []

    # Fetch per language to ensure representation
    total_db_pool = []
    for _lang in languages_list:
        # For English, we only want strict matches or explicit 'romance' tag.
        # proxy_tags can be too broad for 'en'.
        effective_proxy = proxy_tags if _lang != "en" else ["romance"]
        db_lang_rows = db.execute(
            genre_sql_strict,
            {
                "types": genre_types,
                "genre_pattern": genre_pattern,
                "genre_exact": primary_genre_exact,
                "has_proxy_tags": len(effective_proxy) > 0,
                "proxy_tags": effective_proxy,
                "title_patterns": title_patterns or ["%__no_title_match__%"],
                "langs": [_lang],
                "seed_limit": 50, # Sufficient pool per lang
            },
        ).fetchall()
        total_db_pool.extend(db_lang_rows)

    # Mix DB results
    genre_rows = _mix_by_languages([_row_to_dict(r) for r in total_db_pool], languages_list)
    genre_existing = {str(r.get("content_id") or "") for r in genre_rows}
    genre_external = {str(r.get("external_id") or "") for r in genre_rows if r.get("external_id")}

    # For romance + series/all mode, TMDB is essential. Fetch per-language if DB pool is shallow.
    if _needs_romance_series_proxy(primary_genre_exact, resolved_media_mode):
        from app.services.movie_service import movie_service
        # Ensure each non-English language has at least ~10 quality items
        for _lang in languages_list:
            if _lang == "en" and len(genre_rows) >= GENRE_SEED_LIMIT:
                continue
                
            lang_items = [r for r in genre_rows if _item_language(r) == _lang]
            if len(lang_items) < 10:
                tmdb_romance = await movie_service.search_series_by_genre_lang(
                    "romance",
                    _lang,
                    limit=24,
                    exclude_ids=genre_external,
                    seed_key=f"{user_id}:romance-proxy-tmdb:{_lang}:{refresh_seed or ''}",
                )
                for item in tmdb_romance:
                    ext_id = str(item.get("id") or "")
                    if ext_id and ext_id in genre_external:
                        continue
                    genre_rows.append({
                        "content_id": f"tmdb-{ext_id}",
                        "external_id": ext_id,
                        "title": item.get("title"),
                        "poster_url": item.get("image"),
                        "content_type": "series",
                        "rating": item.get("rating"),
                        "language": item.get("original_language") or _lang,
                        "description": item.get("overview"),
                    })
                    if ext_id:
                        genre_external.add(ext_id)
                    genre_existing.add(f"tmdb-{ext_id}")
            
            # Re-mix after each lang addition to keep balance
            genre_rows = _mix_by_languages(genre_rows, languages_list)

        # Last resort DB proxy only if still very empty
        if len(genre_rows) < MIN_ROW_FILL:
            romance_series_proxy_sql = text("""
                SELECT content_id, external_id, title, poster_url, content_type, rating, language, description
                FROM content
                WHERE UPPER(content_type) = 'SERIES'
                  AND EXISTS (
                        SELECT 1 FROM unnest(genres) g
                        WHERE LOWER(g) = ANY(:proxy_tags)
                  )
                  AND title NOT ILIKE ALL(:title_patterns)
                  AND language = ANY(:langs)
                  AND NOT (genres && ARRAY['Reality', 'Talk', 'Variety', 'Talk Show'])
                ORDER BY (popularity_score * (0.5 + RANDOM() * 1.0)) DESC LIMIT 150
            """)
            proxy_lang_rows = db.execute(
                romance_series_proxy_sql,
                {
                    "proxy_tags": ROMANCE_SERIES_PROXY_TAGS,
                    "title_patterns": [
                        "%knowing bros%", "%men on a mission%", "%running man%",
                        "%infinite challenge%", "%reality%", "%talk show%",
                        "%variety show%", "%episode %",
                    ],
                    "langs": languages_list,
                },
            ).fetchall()
            
            p_mixed = _mix_by_languages([_row_to_dict(r) for r in proxy_lang_rows], languages_list)
            for r in p_mixed:
                cid = str(r.get("content_id") or "")
                if cid and cid in genre_existing:
                    continue
                genre_rows.append(r)
                if cid:
                    genre_existing.add(cid)
                if len(genre_rows) >= GENRE_SEED_LIMIT:
                    break

    if interest == "video" and resolved_media_mode == "all" and len(genre_rows) < GENRE_SEED_LIMIT:
        genre_sql_series_fill = text("""
            SELECT content_id, external_id, title, poster_url, content_type, rating, language, description
            FROM content
            WHERE UPPER(content_type) = 'SERIES'
              AND (
                    EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE :genre_pattern)
                    OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE LOWER(g) = LOWER(:genre_exact))
                    OR (:has_proxy_tags AND EXISTS (SELECT 1 FROM unnest(genres) g WHERE LOWER(g) = ANY(:proxy_tags)))
              )
              AND title NOT ILIKE ALL(:title_patterns)
              AND language = ANY(:langs)
              AND NOT (genres && ARRAY['Reality', 'Talk', 'Variety', 'Talk Show'])
            ORDER BY (popularity_score + (RANDOM() * popularity_score * 0.15)) DESC LIMIT :fill_limit
        """)
        series_fill_rows = db.execute(
            genre_sql_series_fill,
            {
                "genre_pattern": genre_pattern,
                "genre_exact": primary_genre_exact,
                "has_proxy_tags": len(proxy_tags) > 0,
                "proxy_tags": proxy_tags,
                "title_patterns": title_patterns or ["%__no_title_match__%"],
                "langs": languages_list,
                "fill_limit": ROW_LIMIT,
            },
        ).fetchall()
        existing = {str(_row_to_dict(r).get("content_id") or "") for r in genre_rows}
        genre_rows = list(genre_rows)
        for r in series_fill_rows:
            cid = str(_row_to_dict(r).get("content_id") or "")
            if cid and cid in existing:
                continue
            if cid:
                existing.add(cid)
            genre_rows.append(r)
            if len(genre_rows) >= GENRE_SEED_LIMIT:
                break

    tmdb_genre_fallback = []
    if len(genre_rows) < MIN_ROW_FILL:
        from app.services.movie_service import movie_service
        slider_external_ids = {
            str(i.get("tmdb_id") or i.get("external_id") or i.get("id") or "")
            for i in slider_items
            if str(i.get("tmdb_id") or i.get("external_id") or i.get("id") or "").strip()
        }
        all_genre_batches = []
        for _lang in languages_list:
            exclude_ids = slider_external_ids | {str(i.get("id") or i.get("tmdb_id") or "") for i in all_genre_batches}
            if resolved_media_mode == "series":
                _batch = await movie_service.search_series_by_genre_lang(
                    primary_genre, _lang, limit=ROW_LIMIT,
                    exclude_ids=exclude_ids,
                    seed_key=f"{user_id}:genre-series:{primary_genre}:{_lang}:{refresh_seed or ''}",
                )
            elif resolved_media_mode == "all":
                movie_batch = await movie_service.search_by_genre_lang(
                    primary_genre, _lang, limit=ROW_LIMIT,
                    exclude_ids=exclude_ids,
                    seed_key=f"{user_id}:genre-all-movie:{primary_genre}:{_lang}:{refresh_seed or ''}",
                )
                series_batch = await movie_service.search_series_by_genre_lang(
                    primary_genre, _lang, limit=ROW_LIMIT,
                    exclude_ids=exclude_ids | {str(i.get("id") or "") for i in movie_batch if str(i.get("id") or "")},
                    seed_key=f"{user_id}:genre-all-series:{primary_genre}:{_lang}:{refresh_seed or ''}",
                )
                _batch = _mix_by_content_type(movie_batch + series_batch, limit=ROW_LIMIT)
            else:
                _batch = await movie_service.search_by_genre_lang(
                    primary_genre, _lang, limit=ROW_LIMIT,
                    exclude_ids=exclude_ids,
                    seed_key=f"{user_id}:genre:{primary_genre}:{_lang}:{refresh_seed or ''}",
                )
            for item in _batch:
                item["content_type"] = item.get("content_type") or ("series" if resolved_media_mode == "series" else "movie")
                if "tmdb_id" not in item:
                    item["tmdb_id"] = item.get("id")
                if "language" not in item:
                    item["language"] = item.get("original_language") or _lang
                all_genre_batches.append(item)
        
        tmdb_genre_fallback = _mix_by_languages(all_genre_batches, languages_list, limit=POOL_LIMIT)

    # --- 3. INTEREST-BASED PICKS (explicitly tied to selected titles) ---
    interest_sql_strict = text("""
        WITH liked AS (
            SELECT DISTINCT c.content_id, c.embedding
            FROM content c
            JOIN unnest(:title_patterns) p ON c.title ILIKE p
            WHERE c.embedding IS NOT NULL
            LIMIT 6
        )
        SELECT c.content_id, c.external_id, c.title, c.poster_url, c.content_type, c.rating, c.language, c.description
        FROM content c
        JOIN liked l ON TRUE
        WHERE c.embedding IS NOT NULL
          AND c.title NOT ILIKE ALL(:title_patterns)
          AND UPPER(c.content_type) = ANY(:types)
          AND c.language = ANY(:langs)
          AND NOT (c.genres && ARRAY['Reality', 'Talk', 'Variety', 'Talk Show'])
        ORDER BY c.embedding <=> l.embedding, (c.popularity_score * (0.8 + RANDOM() * 0.4)) DESC
        LIMIT 150
    """)
    interest_rows = []
    i_existing = set()
    i_external = set()
    
    total_interest_pool = []
    for _lang in languages_list:
        db_rows = db.execute(
            interest_sql_strict,
            {
                "title_patterns": title_patterns or ["%__no_title_match__%"],
                "types": target_types,
                "langs": [_lang],
            },
        ).fetchall()
        total_interest_pool.extend(db_rows)

    interest_rows = _mix_by_languages([_row_to_dict(r) for r in total_interest_pool], languages_list)
    i_existing = {str(r.get("content_id") or "") for r in interest_rows}
    i_external = {str(r.get("external_id") or "") for r in interest_rows if r.get("external_id")}

    # Relaxation per language if needed
    if len(interest_rows) < MIN_ROW_FILL:
        interest_sql_relaxed = text("""
            WITH liked AS (
                SELECT DISTINCT c.content_id, c.embedding FROM content c
                JOIN unnest(:title_patterns) p ON c.title ILIKE p
                WHERE c.embedding IS NOT NULL LIMIT 6
            )
            SELECT c.content_id, c.external_id, c.title, c.poster_url, c.content_type, c.rating, c.language, c.description
            FROM content c JOIN liked l ON TRUE
            WHERE c.embedding IS NOT NULL
              AND c.title NOT ILIKE ALL(:title_patterns)
              AND UPPER(c.content_type) = ANY(:types)
              AND c.language = :lang
              AND NOT (c.genres && ARRAY['Reality', 'Talk', 'Variety', 'Talk Show'])
            ORDER BY c.embedding <=> l.embedding, (c.popularity_score * (0.8 + RANDOM() * 0.4)) DESC LIMIT 50
        """)
        
        for _lang in languages_list:
            if len(interest_rows) >= ROW_LIMIT * 2: break
            lang_items = [r for r in interest_rows if _item_language(r) == _lang]
            if len(lang_items) < 8:
                db_relaxed = db.execute(
                    interest_sql_relaxed,
                    {
                        "title_patterns": title_patterns or ["%__no_title_match__%"],
                        "types": target_types,
                        "lang": _lang,
                    },
                ).fetchall()
                for r in db_relaxed:
                    cid = str(_row_to_dict(r).get("content_id") or "")
                    if cid and cid in i_existing: continue
                    interest_rows.append(_row_to_dict(r))
                    if cid: i_existing.add(cid)
            
            interest_rows = _mix_by_languages(interest_rows, languages_list)

    # If similarity couldn't produce rows, fallback to genre-highlight rows first.
    if not interest_rows and genre_rows:
        interest_rows = genre_rows

    # Title-driven recommendations should reflect user-picked titles first.
    tmdb_interest_fallback = await _tmdb_similarity_fallback(
        titles,
        lang=language,
        langs=languages_list,
        limit=ROW_LIMIT,
        include_series=resolved_media_mode != "movie",
        content_mode=resolved_media_mode,
    ) if titles else []

    # --- 4. DYNAMIC TRENDING ---
    from app.services.movie_service import movie_service
    non_en_langs = [l for l in languages_list if l.lower() != "en"]
    if resolved_media_mode == "series":
        if non_en_langs:
            trending_items = []
            seen_ids: set = set()

            def push_series(item):
                item_id = str(item.get("id") or "")
                if not item_id or item_id in seen_ids:
                    return
                seen_ids.add(item_id)
                item["content_type"] = "series"
                if "tmdb_id" not in item:
                    item["tmdb_id"] = item_id
                trending_items.append(item)

            total_trending_pool = []
            for _lang in non_en_langs:
                base_trending = await movie_service.get_trending_series_by_language(
                    _lang, limit=ROW_LIMIT,
                    seed_key=f"{user_id}:trending-base-series:{_lang}:{refresh_seed or ''}"
                )
                genre_driven = await movie_service.search_series_by_genre_lang(
                    primary_genre, _lang, limit=ROW_LIMIT,
                    exclude_ids={str(i.get("id") or "") for i in base_trending if str(i.get("id") or "")},
                    seed_key=f"{user_id}:trending-series:{primary_genre}:{_lang}:{refresh_seed or ''}",
                )
                
                # Zip them together for this language
                lang_batch = []
                for idx in range(max(len(base_trending), len(genre_driven))):
                    if idx < len(genre_driven): lang_batch.append(genre_driven[idx])
                    if idx < len(base_trending): lang_batch.append(base_trending[idx])
                total_trending_pool.extend(lang_batch)
                
            trending_items = _mix_by_languages(total_trending_pool, non_en_langs)

            if not trending_items:
                trending_items = await movie_service.get_trending_series()
        else:
            trending_items = await movie_service.get_trending_series()
    elif resolved_media_mode == "movie":
        if non_en_langs:
            trending_items = []
            seen_ids: set = set()

            def push_item(item):
                item_id = str(item.get("id") or "")
                if not item_id or item_id in seen_ids:
                    return
                seen_ids.add(item_id)
                item["content_type"] = "movie"
                if "tmdb_id" not in item:
                    item["tmdb_id"] = item_id
                trending_items.append(item)

            total_trending_pool = []
            for _lang in non_en_langs:
                base_trending = await movie_service.get_trending_movies_by_language(
                    _lang, limit=ROW_LIMIT,
                    seed_key=f"{user_id}:trending-base-movie:{_lang}:{refresh_seed or ''}"
                )
                genre_driven = await movie_service.search_by_genre_lang(
                    primary_genre, _lang, limit=ROW_LIMIT,
                    exclude_ids={str(i.get("id") or "") for i in base_trending if str(i.get("id") or "")},
                    seed_key=f"{user_id}:trending:{primary_genre}:{_lang}:{refresh_seed or ''}",
                )
                lang_batch = []
                for idx in range(max(len(base_trending), len(genre_driven))):
                    if idx < len(genre_driven): lang_batch.append(genre_driven[idx])
                    if idx < len(base_trending): lang_batch.append(base_trending[idx])
                total_trending_pool.extend(lang_batch)
                
            trending_items = _mix_by_languages(total_trending_pool, non_en_langs)

            if not trending_items:
                trending_items = await movie_service.get_trending_movies()
        else:
            trending_items = await movie_service.get_trending_movies()
    elif non_en_langs:
        trending_items = []
        seen_ids: set = set()

        def push_item(item):
            item_id = str(item.get("id") or "")
            if not item_id or item_id in seen_ids:
                return
            seen_ids.add(item_id)
            item["content_type"] = "movie"
            if "tmdb_id" not in item:
                item["tmdb_id"] = item_id
            trending_items.append(item)

        total_trending_pool = []
        for _lang in non_en_langs:
            movie_batch = await movie_service.get_trending_movies_by_language(
                _lang, limit=ROW_LIMIT,
                seed_key=f"{user_id}:trending-mix-movie:{_lang}:{refresh_seed or ''}"
            )
            series_batch = await movie_service.get_trending_series_by_language(
                _lang, limit=ROW_LIMIT,
                seed_key=f"{user_id}:trending-mix-series:{_lang}:{refresh_seed or ''}"
            )
            
            lang_batch = []
            for idx in range(max(len(movie_batch), len(series_batch))):
                if idx < len(movie_batch): lang_batch.append(movie_batch[idx])
                if idx < len(series_batch): lang_batch.append(series_batch[idx])
            total_trending_pool.extend(lang_batch)
            
        trending_items = _mix_by_languages(total_trending_pool, non_en_langs)

        if not trending_items:
            movie_batch = await movie_service.get_trending_movies()
            series_batch = await movie_service.get_trending_series()
            trending_items = []
            for idx in range(max(len(movie_batch), len(series_batch))):
                if idx < len(movie_batch):
                    trending_items.append(movie_batch[idx])
                if idx < len(series_batch):
                    trending_items.append(series_batch[idx])
                if len(trending_items) >= ROW_LIMIT:
                    break
    else:
        movie_batch = await movie_service.get_trending_movies()
        series_batch = await movie_service.get_trending_series()
        trending_items = []
        for idx in range(max(len(movie_batch), len(series_batch))):
            if idx < len(movie_batch):
                trending_items.append(movie_batch[idx])
            if idx < len(series_batch):
                trending_items.append(series_batch[idx])
            if len(trending_items) >= ROW_LIMIT:
                break
    for t in trending_items:
        if resolved_media_mode == "movie":
            t["content_type"] = "movie"
        elif resolved_media_mode == "series":
            t["content_type"] = "series"
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
        # Fetch from service if not in DB, but never fail the full recommendations API.
        from app.services.book_service import book_service
        try:
            book_res = await book_service.search_by_genre_lang(primary_genre, "en")
            if book_res:
                book_rec = book_res[0]
        except Exception:
            book_rec = None

    # Pick one of the liked titles to show in "Since you like {title}"
    liked_title = titles[0] if titles else "your favorites"

    interest_payload = (
        tmdb_interest_fallback
        or [_normalize_row(_row_to_dict(r)) for r in interest_rows]
        or [_normalize_row(_row_to_dict(r)) for r in genre_rows]
    )

    genre_payload = [_normalize_row(_row_to_dict(r)) for r in genre_rows]
    if tmdb_genre_fallback:
        seen = {str(i.get("id") or i.get("content_id") or "") for i in genre_payload}
        for item in tmdb_genre_fallback:
            item_id = str(item.get("id") or item.get("content_id") or "")
            if item_id and item_id in seen:
                continue
            genre_payload.append(item)
            if item_id:
                seen.add(item_id)
            if len(genre_payload) >= ROW_LIMIT:
                break

    if interest == "video" and resolved_media_mode == "movie":
        genre_payload = _movie_first(genre_payload)
        interest_payload = _movie_first(interest_payload)

    if resolved_media_mode == "all":
        genre_payload = _mix_by_content_type(genre_payload)
        interest_payload = _mix_by_content_type(interest_payload)

    # Keep rows distinct on the dashboard to avoid same-card repetition.
    genre_payload = _dedupe_by_id(genre_payload)
    interest_payload = _exclude_existing(_dedupe_by_id(interest_payload), [genre_payload])

    if has_non_english or len(languages_list) > 1:
        genre_payload = _keep_any_language(genre_payload, languages_list)

    # Ensure Explore has visible representation from each selected language when possible.
    if len(languages_list) > 1:
        from app.services.movie_service import movie_service
        current_langs = {_item_language(i) for i in genre_payload if _item_language(i)}
        used_ids_for_mix = _collect_used_ids(slider_items, genre_payload, interest_payload)
        
        all_lang_fills = []
        for _lang in languages_list:
            code = str(_lang or "").strip().lower()
            if not code or code in current_langs:
                continue
            if resolved_media_mode == "series":
                lang_fill = await movie_service.search_series_by_genre_lang(
                    primary_genre,
                    code,
                    limit=8,
                    exclude_ids=used_ids_for_mix,
                    seed_key=f"{user_id}:genre-mix-series:{primary_genre}:{code}:{refresh_seed or ''}",
                )
            elif resolved_media_mode == "all":
                movie_fill = await movie_service.search_by_genre_lang(
                    primary_genre,
                    code,
                    limit=8,
                    exclude_ids=used_ids_for_mix,
                    seed_key=f"{user_id}:genre-mix-all-movie:{primary_genre}:{code}:{refresh_seed or ''}",
                )
                series_fill = await movie_service.search_series_by_genre_lang(
                    primary_genre,
                    code,
                    limit=8,
                    exclude_ids=used_ids_for_mix | {str(i.get("id") or "") for i in movie_fill if str(i.get("id") or "")},
                    seed_key=f"{user_id}:genre-mix-all-series:{primary_genre}:{code}:{refresh_seed or ''}",
                )
                lang_fill = _mix_by_content_type(movie_fill + series_fill, limit=8)
            else:
                lang_fill = await movie_service.search_by_genre_lang(
                    primary_genre,
                    code,
                    limit=8,
                    exclude_ids=used_ids_for_mix,
                    seed_key=f"{user_id}:genre-mix:{primary_genre}:{code}:{refresh_seed or ''}",
                )
            
            for item in lang_fill:
                if resolved_media_mode == "series":
                    item["content_type"] = "series"
                elif resolved_media_mode == "all":
                    item["content_type"] = item.get("content_type") or "movie"
                else:
                    item["content_type"] = item.get("content_type") or "movie"
                if "tmdb_id" not in item:
                    item["tmdb_id"] = item.get("id")
                if "language" not in item:
                    item["language"] = item.get("original_language") or code
                all_lang_fills.append(item)
                item_id = str(item.get("id") or item.get("tmdb_id") or "")
                if item_id:
                    used_ids_for_mix.add(item_id)
        
        if all_lang_fills:
            genre_payload.extend(all_lang_fills)

    # Ensure non-English selected languages get romance series representation in Explore.
    # This avoids movie-dominant rows when local DB lacks KO/ZH romance series.
    if resolved_media_mode in {"all", "series"} and languages_list:
        from app.services.movie_service import movie_service
        used_ids_for_series = _collect_used_ids(slider_items, genre_payload, interest_payload)
        min_series_per_lang = 3 if resolved_media_mode == "all" else 4

        all_series_fills = []
        for _lang in languages_list:
            code = str(_lang or "").strip().lower()
            if not code or code == "en":
                continue

            current_series_count = sum(
                1
                for item in genre_payload
                if str(item.get("content_type", "")).lower() == "series"
                and _item_language(item) == code
            )
            if current_series_count >= min_series_per_lang:
                continue

            series_fill = await movie_service.search_series_by_genre_lang(
                primary_genre,
                code,
                limit=12,
                exclude_ids=used_ids_for_series,
                seed_key=f"{user_id}:genre-series-quota:{primary_genre}:{code}:{refresh_seed or ''}",
            )

            for item in series_fill:
                item["content_type"] = "series"
                if "tmdb_id" not in item:
                    item["tmdb_id"] = item.get("id")
                if "language" not in item:
                    item["language"] = item.get("original_language") or code

                item_id = str(item.get("id") or item.get("tmdb_id") or "")
                item_title = _title_key(item)
                if item_id and item_id in _collect_used_ids(slider_items, genre_payload, interest_payload):
                    continue
                if item_title and item_title in _collect_used_titles(slider_items, genre_payload, interest_payload):
                    continue

                all_series_fills.append(item)
                if item_id:
                    used_ids_for_series.add(item_id)

                current_series_count += 1
                if current_series_count >= min_series_per_lang:
                    break
        
        if all_series_fills:
            genre_payload.extend(all_series_fills)

    genre_payload = _mix_by_languages(genre_payload, languages_list, limit=POOL_LIMIT)

    if len(interest_payload) < POOL_LIMIT:
        refill_from_tmdb = await _tmdb_similarity_fallback(
            titles,
            lang=language,
            langs=languages_list,
            limit=POOL_LIMIT,
            include_series=resolved_media_mode != "movie",
            content_mode=resolved_media_mode,
        ) if titles else []
        refill_from_tmdb = _exclude_existing(_dedupe_by_id(refill_from_tmdb), [genre_payload, interest_payload])
        for item in refill_from_tmdb:
            interest_payload.append(item)
            if len(interest_payload) >= POOL_LIMIT:
                break

    genre_payload, interest_payload = _cross_section_unique(
        genre_payload,
        interest_payload,
    )

    # Final hero composition: use preference-driven pools so it changes with user choices.
    # For non-English users, prioritize interest+genre first to avoid English-dominant hero output.
    if any(l.lower() != "en" for l in languages_list):
        hero_candidates = _dedupe_by_id(interest_payload + genre_payload + trending_items)
    else:
        hero_candidates = _dedupe_by_id(slider_items + interest_payload + genre_payload)

    if resolved_media_mode == "all":
        hero_candidates = _mix_by_content_type(hero_candidates)

    slider_items = _rotate_with_request_seed(
        hero_candidates,
        user_id=user_id,
        salt="hero-final",
        request_seed=refresh_seed,
    )[:limit]

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
        if len(filtered_global_top) >= POOL_LIMIT:
            break

    # If strict dedupe leaves too few cards, backfill from trending while
    # still preventing duplicates within the fan-favorites row itself.
    if len(filtered_global_top) < ROW_LIMIT:
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
            if len(filtered_global_top) >= POOL_LIMIT:
                break

    # Final anti-duplication pass across all visible rows.
    genre_payload, interest_payload, filtered_global_top = _cross_section_unique(
        genre_payload,
        interest_payload,
        filtered_global_top,
    )

    if resolved_media_mode == "all":
        genre_payload = _mix_by_content_type(genre_payload, limit=POOL_LIMIT)
        interest_payload = _mix_by_content_type(interest_payload, limit=POOL_LIMIT)
        filtered_global_top = _mix_by_content_type(filtered_global_top, limit=POOL_LIMIT)

    # Genre-specific TMDB refill: runs *before* the generic DB refill so the Explore
    # row is topped up with actual genre-matching content rather than generic trending.
    if any(l.lower() != "en" for l in languages_list) and len(genre_payload) < POOL_LIMIT:
        from app.services.movie_service import movie_service
        used_set = _collect_used_ids(slider_items, genre_payload, interest_payload, filtered_global_top)
        
        all_extras = []
        for _lang in languages_list:
            if resolved_media_mode == "series":
                extra_genre = await movie_service.search_series_by_genre_lang(
                    primary_genre, _lang, limit=POOL_LIMIT,
                    exclude_ids=used_set,
                    seed_key=f"{user_id}:genre-language-lock-series:{primary_genre}:{_lang}:{refresh_seed or ''}",
                )
            elif resolved_media_mode == "all":
                _movie_extra = await movie_service.search_by_genre_lang(
                    primary_genre, _lang, limit=POOL_LIMIT,
                    exclude_ids=used_set,
                    seed_key=f"{user_id}:genre-language-lock-all-movie:{primary_genre}:{_lang}:{refresh_seed or ''}",
                )
                _series_extra = await movie_service.search_series_by_genre_lang(
                    primary_genre, _lang, limit=POOL_LIMIT,
                    exclude_ids=used_set | {str(i.get("id") or "") for i in _movie_extra if str(i.get("id") or "")},
                    seed_key=f"{user_id}:genre-language-lock-all-series:{primary_genre}:{_lang}:{refresh_seed or ''}",
                )
                extra_genre = _mix_by_content_type(_movie_extra + _series_extra)
            else:
                extra_genre = await movie_service.search_by_genre_lang(
                    primary_genre, _lang, limit=POOL_LIMIT,
                    exclude_ids=used_set,
                    seed_key=f"{user_id}:genre-language-lock:{primary_genre}:{_lang}:{refresh_seed or ''}",
                )
            
            for item in extra_genre:
                if resolved_media_mode == "series":
                    item["content_type"] = "series"
                elif resolved_media_mode == "all":
                    item["content_type"] = item.get("content_type") or "movie"
                else:
                    item["content_type"] = item.get("content_type") or "movie"
                if "tmdb_id" not in item:
                    item["tmdb_id"] = item.get("id")
                if "language" not in item:
                    item["language"] = item.get("original_language") or _lang
                
                item_id = str(item.get("id") or item.get("tmdb_id") or "")
                if item_id:
                    used_set.add(item_id)
                all_extras.append(item)

        if all_extras:
            mixed_extras = _mix_by_languages(all_extras, languages_list, limit=POOL_LIMIT)
            for item in mixed_extras:
                genre_payload.append(item)
                if len(genre_payload) >= POOL_LIMIT:
                    break


    # Generic DB refill for rows that are still thin after the genre-specific pass.
    # genre_payload is only topped up if it is still below POOL_LIMIT so we never
    # dilute it with non-genre content once it already has enough real genre items.
    if len(genre_payload) < POOL_LIMIT or len(interest_payload) < POOL_LIMIT or len(filtered_global_top) < POOL_LIMIT:
        used_ids = _collect_used_ids(slider_items, genre_payload, interest_payload, filtered_global_top)
        used_titles = _collect_used_titles(slider_items, genre_payload, interest_payload, filtered_global_top)
        total_refill_pool = []
        for _lang in languages_list:
            rows = db.execute(
                text("""
                    SELECT content_id, external_id, title, poster_url, content_type, rating, language, description
                    FROM content
                    WHERE UPPER(content_type) = ANY(:types)
                      AND language = :lang
                      AND NOT (genres && ARRAY['Reality', 'Talk', 'Variety', 'Talk Show'])
                    ORDER BY (popularity_score * (0.6 + RANDOM() * 0.8)) DESC
                    LIMIT 30
                """),
                {"types": target_types, "lang": _lang},
            ).fetchall()
            total_refill_pool.extend(rows)
        
        # Add a bit of English as a base if not already in langs, but keep it low priority
        if "en" not in languages_list:
            en_rows = db.execute(
                text("""
                    SELECT content_id, external_id, title, poster_url, content_type, rating, language, description
                    FROM content
                    WHERE UPPER(content_type) = ANY(:types)
                      AND language = 'en'
                      AND NOT (genres && ARRAY['Reality', 'Talk', 'Variety', 'Talk Show'])
                    ORDER BY (popularity_score * (0.5 + RANDOM() * 0.5)) DESC
                    LIMIT 20
                """),
                {"types": target_types},
            ).fetchall()
            total_refill_pool.extend(en_rows)

        refill_items = _mix_by_languages([_normalize_row(_row_to_dict(r)) for r in total_refill_pool], languages_list + (["en"] if "en" not in languages_list else []))
        if has_non_english and len(languages_list) > 1:
            non_en_refill = [i for i in refill_items if _item_language(i) and _item_language(i) != "en"]
            if non_en_refill:
                refill_items = non_en_refill + [i for i in refill_items if i not in non_en_refill]
        for item in refill_items:
            item_id = str(item.get("content_id") or item.get("id") or item.get("tmdb_id") or "")
            item_title = _title_key(item)
            item_lang = _item_language(item)
            if item_id and item_id in used_ids:
                continue
            if item_title and item_title in used_titles:
                continue

            if len(genre_payload) < POOL_LIMIT:
                if has_non_english and len(languages_list) > 1 and item_lang == "en":
                    continue
                genre_payload.append(item)
            elif len(interest_payload) < POOL_LIMIT:
                interest_payload.append(item)
            elif len(filtered_global_top) < POOL_LIMIT:
                filtered_global_top.append(item)
            else:
                break

            if item_id:
                used_ids.add(item_id)
            if item_title:
                used_titles.add(item_title)

    # Build per-genre rows so dashboard can show recommendations for each chosen genre.
    if not genre_payload and interest_payload:
        genre_payload = interest_payload[:POOL_LIMIT]

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
        extra_proxy_tags = ROMANCE_SERIES_PROXY_TAGS if _needs_romance_series_proxy(extra_exact, resolved_media_mode) else []
        # Fetch per language to ensure representation for extra genre rows
        total_extra_pool = []
        for _lang in languages_list:
            effective_proxy = extra_proxy_tags if _lang != "en" else ["romance"]
            extra_lang_rows = db.execute(
                genre_sql_strict,
                {
                    "types": genre_types,
                    "genre_pattern": extra_pattern,
                    "genre_exact": extra_exact,
                    "has_proxy_tags": len(effective_proxy) > 0,
                    "proxy_tags": effective_proxy,
                    "title_patterns": title_patterns or ["%__no_title_match__%"],
                    "langs": [_lang],
                    "seed_limit": 40,
                },
            ).fetchall()
            total_extra_pool.extend(extra_lang_rows)

        mixed_extra_rows = _mix_by_languages([_row_to_dict(r) for r in total_extra_pool], languages_list)
        extra_rows = mixed_extra_rows

        # Same TMDB-first logic for extra genre romance sections
        if _needs_romance_series_proxy(extra_exact, resolved_media_mode) and len(extra_rows) < GENRE_SEED_LIMIT:
            extra_romance_existing = {str(_row_to_dict(r).get("content_id") or "") for r in extra_rows}
            extra_romance_external = {str(_row_to_dict(r).get("external_id") or "") for r in extra_rows if _row_to_dict(r).get("external_id")}
            extra_rows = list(extra_rows)

            for _lang in languages_list:
                if len(extra_rows) >= GENRE_SEED_LIMIT:
                    break
                tmdb_romance_extra = await movie_service.search_series_by_genre_lang(
                    "romance",
                    _lang,
                    limit=ROW_LIMIT,
                    exclude_ids=extra_romance_external,
                    seed_key=f"{user_id}:romance-extra-tmdb:{_lang}:{refresh_seed or ''}",
                )
                for item in tmdb_romance_extra:
                    ext_id = str(item.get("id") or "")
                    if ext_id and ext_id in extra_romance_external:
                        continue
                    extra_rows.append({
                        "content_id": f"tmdb-{ext_id}",
                        "external_id": ext_id,
                        "title": item.get("title"),
                        "poster_url": item.get("image"),
                        "content_type": "series",
                        "rating": item.get("rating"),
                        "language": item.get("original_language") or _lang,
                        "description": item.get("overview"),
                    })
                    if ext_id:
                        extra_romance_external.add(ext_id)
                    if len(extra_rows) >= GENRE_SEED_LIMIT:
                        break

            # DB proxy only if TMDB also returned nothing
            if len(extra_rows) < MIN_ROW_FILL:
                romance_series_proxy_sql = text("""
                    SELECT content_id, external_id, title, poster_url, content_type, rating, language, description
                    FROM content
                    WHERE UPPER(content_type) = 'SERIES'
                      AND EXISTS (
                            SELECT 1 FROM unnest(genres) g
                            WHERE LOWER(g) = ANY(:proxy_tags)
                      )
                      AND title NOT ILIKE ALL(:title_patterns)
                      AND language = ANY(:langs)
                ORDER BY (popularity_score * (0.5 + RANDOM() * 1.0)) DESC LIMIT 150
            """)
                proxy_rows = db.execute(
                    romance_series_proxy_sql,
                    {
                        "proxy_tags": ROMANCE_SERIES_PROXY_TAGS,
                        "title_patterns": [
                            "%knowing bros%",
                            "%men on a mission%",
                            "%running man%",
                            "%infinite challenge%",
                            "%reality%",
                            "%talk show%",
                            "%variety show%",
                            "%episode %",
                        ],
                        "langs": [l for l in languages_list if l != "en"] or languages_list,
                        "fill_limit": 150,
                    },
                ).fetchall()
                
                import random as _rnd
                proxy_rows = list(proxy_rows)
                _rnd.shuffle(proxy_rows)
                
                for r in proxy_rows:
                    cid = str(_row_to_dict(r).get("content_id") or "")
                    if cid and cid in extra_romance_existing:
                        continue
                    if cid:
                        extra_romance_existing.add(cid)
                    extra_rows.append(r)
                    if len(extra_rows) >= GENRE_SEED_LIMIT:
                        break

        if interest == "video" and resolved_media_mode == "all" and len(extra_rows) < GENRE_SEED_LIMIT:
            series_fill_rows = db.execute(
                text("""
                    SELECT content_id, external_id, title, poster_url, content_type, rating, description
                    FROM content
                    WHERE UPPER(content_type) = 'SERIES'
                      AND (
                            EXISTS (SELECT 1 FROM unnest(genres) g WHERE g ILIKE :genre_pattern)
                            OR EXISTS (SELECT 1 FROM unnest(genres) g WHERE LOWER(g) = LOWER(:genre_exact))
                      )
                      AND title NOT ILIKE ALL(:title_patterns)
                      AND language = ANY(:langs)
                    ORDER BY popularity_score DESC LIMIT :fill_limit
                """),
                {
                    "genre_pattern": extra_pattern,
                    "genre_exact": extra_exact,
                    "title_patterns": title_patterns or ["%__no_title_match__%"],
                    "langs": languages_list,
                    "fill_limit": ROW_LIMIT,
                },
            ).fetchall()
            existing = {str(_row_to_dict(r).get("content_id") or "") for r in extra_rows}
            extra_rows = list(extra_rows)
            for r in series_fill_rows:
                cid = str(_row_to_dict(r).get("content_id") or "")
                if cid and cid in existing:
                    continue
                if cid:
                    existing.add(cid)
                extra_rows.append(r)
                if len(extra_rows) >= GENRE_SEED_LIMIT:
                    break

        extra_payload = [_normalize_row(_row_to_dict(r)) for r in extra_rows]
        if interest == "video" and resolved_media_mode == "movie":
            extra_payload = _movie_first(extra_payload)
        if resolved_media_mode == "all":
            extra_payload = _mix_by_content_type(extra_payload)
        extra_payload = _dedupe_by_id(extra_payload)

        if has_non_english or len(languages_list) > 1:
            extra_payload = _keep_any_language(extra_payload, languages_list)

        if len(languages_list) > 1:
            current_langs = {_item_language(i) for i in extra_payload if _item_language(i)}
            used_extra_ids = _collect_used_ids(slider_items, genre_payload, interest_payload, filtered_global_top, extra_payload)
            for _lang in languages_list:
                code = str(_lang or "").strip().lower()
                if not code or code in current_langs:
                    continue
                if resolved_media_mode == "series":
                    # Fetch series for this language to avoid movie content being filtered out
                    lang_fill = await movie_service.search_series_by_genre_lang(
                        extra_exact,
                        code,
                        limit=8,
                        exclude_ids=used_extra_ids,
                        seed_key=f"{user_id}:genre-section-mix-series:{extra_exact}:{code}:{refresh_seed or ''}",
                    )
                    for item in lang_fill:
                        item["content_type"] = "series"
                        if "tmdb_id" not in item:
                            item["tmdb_id"] = item.get("id")
                        if "language" not in item:
                            item["language"] = item.get("original_language") or code
                        extra_payload.append(item)
                        item_id = str(item.get("id") or item.get("tmdb_id") or "")
                        if item_id:
                            used_extra_ids.add(item_id)
                elif resolved_media_mode == "all" and _needs_romance_series_proxy(extra_exact, "all"):
                    # For romance in all-mode, mix movies AND series for each language
                    movie_fill = await movie_service.search_by_genre_lang(
                        extra_exact, code, limit=4,
                        exclude_ids=used_extra_ids,
                        seed_key=f"{user_id}:genre-section-mix-movie:{extra_exact}:{code}:{refresh_seed or ''}",
                    )
                    series_fill = await movie_service.search_series_by_genre_lang(
                        extra_exact, code, limit=4,
                        exclude_ids=used_extra_ids | {str(i.get("id") or "") for i in movie_fill if str(i.get("id") or "")},
                        seed_key=f"{user_id}:genre-section-mix-series:{extra_exact}:{code}:{refresh_seed or ''}",
                    )
                    lang_fill = _mix_by_content_type(movie_fill + series_fill, limit=8)
                    for item in lang_fill:
                        item["content_type"] = item.get("content_type") or "movie"
                        if "tmdb_id" not in item:
                            item["tmdb_id"] = item.get("id")
                        if "language" not in item:
                            item["language"] = item.get("original_language") or code
                        extra_payload.append(item)
                        item_id = str(item.get("id") or item.get("tmdb_id") or "")
                        if item_id:
                            used_extra_ids.add(item_id)
                else:
                    lang_fill = await movie_service.search_by_genre_lang(
                        extra_exact,
                        code,
                        limit=8,
                        exclude_ids=used_extra_ids,
                        seed_key=f"{user_id}:genre-section-mix:{extra_exact}:{code}:{refresh_seed or ''}",
                    )
                    for item in lang_fill:
                        item["content_type"] = "movie"
                        if "tmdb_id" not in item:
                            item["tmdb_id"] = item.get("id")
                        if "language" not in item:
                            item["language"] = item.get("original_language") or code
                        extra_payload.append(item)
                        item_id = str(item.get("id") or item.get("tmdb_id") or "")
                        if item_id:
                            used_extra_ids.add(item_id)
                current_langs = {_item_language(i) for i in extra_payload if _item_language(i)}
        extra_payload = _mix_by_languages(extra_payload, languages_list, limit=POOL_LIMIT)

        if len(extra_payload) < POOL_LIMIT:
            extra_tmdb_all = []
            for _lang in languages_list:
                exclude_ids = {
                    str(i.get("id") or i.get("tmdb_id") or i.get("external_id") or "")
                    for i in extra_payload + extra_tmdb_all
                    if str(i.get("id") or i.get("tmdb_id") or i.get("external_id") or "").strip()
                }
                if resolved_media_mode == "series":
                    _fill = await movie_service.search_series_by_genre_lang(
                        extra_exact, _lang, limit=POOL_LIMIT,
                        exclude_ids=exclude_ids,
                        seed_key=f"{user_id}:genre-section-series:{extra_exact}:{_lang}:{refresh_seed or ''}",
                    )
                elif resolved_media_mode == "all":
                    _movie_fill = await movie_service.search_by_genre_lang(
                        extra_exact, _lang, limit=POOL_LIMIT,
                        exclude_ids=exclude_ids,
                        seed_key=f"{user_id}:genre-section-all-movie:{extra_exact}:{_lang}:{refresh_seed or ''}",
                    )
                    _series_fill = await movie_service.search_series_by_genre_lang(
                        extra_exact, _lang, limit=POOL_LIMIT,
                        exclude_ids=exclude_ids | {str(i.get("id") or "") for i in _movie_fill if str(i.get("id") or "")},
                        seed_key=f"{user_id}:genre-section-all-series:{extra_exact}:{_lang}:{refresh_seed or ''}",
                    )
                    _fill = _mix_by_content_type(_movie_fill + _series_fill, limit=POOL_LIMIT)
                else:
                    _fill = await movie_service.search_by_genre_lang(
                        extra_exact, _lang, limit=POOL_LIMIT,
                        exclude_ids=exclude_ids,
                        seed_key=f"{user_id}:genre-section:{extra_exact}:{_lang}:{refresh_seed or ''}",
                    )
                extra_tmdb_all.extend(_fill)
            extra_tmdb_fill = extra_tmdb_all
            for item in extra_tmdb_fill:
                item["content_type"] = item.get("content_type") or ("series" if resolved_media_mode == "series" else "movie")
                if "tmdb_id" not in item:
                    item["tmdb_id"] = item.get("id")
                extra_payload.append(item)
                if len(extra_payload) >= POOL_LIMIT:
                    break

        genre_sections.append(
            {
                "genre": extra_exact,
                "genre_name": _display_genre_name(extra_exact),
                "items": _mix_by_content_type(_mix_by_languages(_dedupe_by_id(extra_payload), languages_list, limit=POOL_LIMIT), limit=POOL_LIMIT) if resolved_media_mode == "all" else _mix_by_languages(_dedupe_by_id(extra_payload), languages_list, limit=POOL_LIMIT),
            }
        )

    if refresh_seed:
        genre_payload = _rotate_with_request_seed(genre_payload, user_id=user_id, salt="genre-final", request_seed=refresh_seed)
        interest_payload = _rotate_with_request_seed(interest_payload, user_id=user_id, salt="interest-final", request_seed=refresh_seed)
        filtered_global_top = _rotate_with_request_seed(filtered_global_top, user_id=user_id, salt="global-final", request_seed=refresh_seed)
        for section in genre_sections:
            section_genre = str(section.get("genre") or section.get("genre_name") or "section")
            section["items"] = _rotate_with_request_seed(
                section.get("items") or [],
                user_id=user_id,
                salt=f"genre-section-{section_genre}",
                request_seed=refresh_seed,
            )

    return {
        "slider": slider_items,
        "genre_highlights": genre_payload[:ROW_LIMIT],
        "genre_sections": [{"genre": s.get("genre", ""), "genre_name": s.get("genre_name", ""), "items": (s.get("items") or [])[:ROW_LIMIT]} for s in genre_sections],
        "interest_trending": interest_payload[:ROW_LIMIT],
        "global_top": filtered_global_top[:ROW_LIMIT],
        "book_recommendation": book_rec,
        "genre_name": display_genre_name,
        "liked_title": liked_title,
        "language": language,
        "languages": languages_list,
        "media_mode": resolved_media_mode,
        "available_media_modes": ["all", "movie", "series"] if interest != "books" else ["books"],
        "row_size": ROW_LIMIT,
    }