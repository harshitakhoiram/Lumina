import sys
from pathlib import Path

from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.scripts.ingest_tmdb import SessionLocal, ingest_movies, ingest_series


def main() -> None:
    # Full ko/zh pools matching the main ingestion script.
    ingest_series(target=220, original_language="ko", sort_by="popularity.desc", vote_count_gte=0)
    ingest_series(target=140, original_language="ko", sort_by="first_air_date.desc", vote_count_gte=0)
    ingest_movies(target=120, original_language="ko", sort_by="popularity.desc", vote_count_gte=0)

    ingest_series(target=260, original_language="zh", sort_by="popularity.desc", vote_count_gte=0)
    ingest_series(target=160, original_language="zh", sort_by="first_air_date.desc", vote_count_gte=0)
    ingest_movies(target=140, original_language="zh", sort_by="popularity.desc", vote_count_gte=0)

    db = SessionLocal()
    try:
        rows = db.execute(
            text(
                """
                SELECT language, content_type, COUNT(*) AS n
                FROM content
                WHERE external_source = 'TMDB' AND language IN ('ko', 'zh')
                GROUP BY language, content_type
                ORDER BY language, content_type
                """
            )
        ).fetchall()
        total = db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM content
                WHERE external_source = 'TMDB' AND language IN ('ko', 'zh')
                """
            )
        ).scalar_one()
    finally:
        db.close()

    print("COUNTS_BY_LANGUAGE_AND_TYPE:", [tuple(r) for r in rows])
    print("TOTAL_KO_ZH_TMDB_ROWS:", total)


if __name__ == "__main__":
    main()
