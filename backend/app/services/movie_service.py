import httpx
import os
import hashlib
from datetime import date
from dotenv import load_dotenv

load_dotenv()

class MovieService:
    def __init__(self):
        self.token = os.getenv("TMDB_BEARER_TOKEN")
        self.base_url = "https://api.themoviedb.org/3"
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "accept": "application/json"
        }
        # This configuration is now correctly passed to every client
        self.client_config = {
            "timeout": 15.0, 
            "verify": False  # Bypasses local SSL/Handshake blocks
        }

    async def _make_request(self, url: str, params: dict = None):
        """Helper to handle all TMDB requests with error catching."""
        async with httpx.AsyncClient(**self.client_config) as client:
            try:
                response = await client.get(url, headers=self.headers, params=params)
                response.raise_for_status()
                return response.json()
            except Exception as e:
                print(f"TMDB Request Failed: {e}")
                return None

    async def get_trending_movies(self):
        url = f"{self.base_url}/trending/movie/day"
        data = await self._make_request(url)
        return self._format_movie_data(data.get("results", [])) if data else []

    async def get_trending_series(self):
        url = f"{self.base_url}/trending/tv/day"
        data = await self._make_request(url)
        results = data.get("results", []) if data else []
        # Filter out Reality (10764) and Talk (10767)
        filtered = [m for m in results if 10764 not in (m.get("genre_ids") or []) and 10767 not in (m.get("genre_ids") or [])]
        return self._format_movie_data(filtered, "series")

    async def get_trending_movies_by_language(self, lang: str = "en", limit: int = 12, seed_key: str | None = None):
        """Returns actual trending/day items filtered by original language.
        If not enough results are available for that language, backfill from discover.
        """
        trending_url = f"{self.base_url}/trending/movie/day"
        trending_data = await self._make_request(trending_url)
        if not trending_data:
            return []

        results = trending_data.get("results", [])
        lang_filtered = [m for m in results if m.get("original_language") == lang]
        formatted = self._format_movie_data(lang_filtered[:limit], "movie")

        # ALWAYS mix in discovery results to ensure NEW content on refresh, 
        # even if trending list is static.
        page = 1
        if seed_key:
            rotate_key = f"{seed_key}:{lang}:{date.today().isoformat()}:movie-trending"
            digest = hashlib.sha256(rotate_key.encode("utf-8")).hexdigest()
            # Wider pool of pages for discovery (up to 40)
            page = (int(digest[:8], 16) % 40) + 1

        discover_url = f"{self.base_url}/discover/movie"
        discover_data = await self._make_request(discover_url, params={
            "with_original_language": lang,
            "sort_by": "popularity.desc",
            "vote_count.gte": 25, # Lowered for more variety
            "page": page,
        })

        if not discover_data:
            return formatted

        discover_results = self._format_movie_data(discover_data.get("results", []), "movie")
        
        # Interleave trending and discovery for maximum perceived variety
        mixed = []
        seen_ids = {str(m.get("id")) for m in formatted if m.get("id")}
        
        # Take up to half from trending, rest from discovery
        trending_quota = formatted[:limit//2]
        mixed.extend(trending_quota)
        
        for m in discover_results:
            m_id = str(m.get("id") or "")
            if m_id and m_id not in seen_ids:
                mixed.append(m)
                seen_ids.add(m_id)
            if len(mixed) >= limit:
                break
        
        # Final backfill from trending if discovery was thin
        if len(mixed) < limit:
            for m in formatted:
                m_id = str(m.get("id") or "")
                if m_id not in seen_ids:
                    mixed.append(m)
                    seen_ids.add(m_id)
                if len(mixed) >= limit:
                    break

        return mixed

    async def get_trending_series_by_language(self, lang: str = "en", limit: int = 12, seed_key: str | None = None):
        """Returns trending TV items filtered by original language with discover backfill."""
        trending_url = f"{self.base_url}/trending/tv/day"
        trending_data = await self._make_request(trending_url)
        if not trending_data:
            return []

        results = trending_data.get("results", [])
        # Filter by language and exclude Reality/Talk
        lang_filtered = [
            m for m in results 
            if m.get("original_language") == lang 
            and 10764 not in (m.get("genre_ids") or []) 
            and 10767 not in (m.get("genre_ids") or [])
        ]
        formatted = self._format_movie_data(lang_filtered[:limit], "series")

        # ALWAYS mix in discovery results
        page = 1
        if seed_key:
            rotate_key = f"{seed_key}:{lang}:{date.today().isoformat()}:series-trending"
            digest = hashlib.sha256(rotate_key.encode("utf-8")).hexdigest()
            page = (int(digest[:8], 16) % 40) + 1

        discover_url = f"{self.base_url}/discover/tv"
        params = {
            "with_original_language": lang,
            "sort_by": "popularity.desc",
            "vote_count.gte": 10, # Lower floor for series variety
            "page": page,
            "without_genres": "10764,10767" 
        }
        discover_data = await self._make_request(discover_url, params=params)
        if not discover_data:
            return formatted

        discover_results = self._format_movie_data(discover_data.get("results", []), "series")
        
        mixed = []
        seen_ids = {str(m.get("id")) for m in formatted if m.get("id")}
        
        # Interleave
        trending_quota = formatted[:limit//2]
        mixed.extend(trending_quota)
        
        for item in discover_results:
            item_id = str(item.get("id") or "")
            if item_id and item_id not in seen_ids:
                mixed.append(item)
                seen_ids.add(item_id)
            if len(mixed) >= limit:
                break
        
        if len(mixed) < limit:
            for item in formatted:
                item_id = str(item.get("id") or "")
                if item_id not in seen_ids:
                    mixed.append(item)
                    seen_ids.add(item_id)
                if len(mixed) >= limit:
                    break

        return mixed

    async def search_movies(self, query: str, original_language: str | None = None):
        url = f"{self.base_url}/search/movie"
        data = await self._make_request(url, params={"query": query})
        if not data:
            return []
        results = data.get("results", [])
        if original_language:
            results = [m for m in results if m.get("original_language") == original_language]
        return self._format_movie_data(results, "movie")

    async def search_series(self, query: str, original_language: str | None = None):
        url = f"{self.base_url}/search/tv"
        data = await self._make_request(url, params={"query": query})
        if not data:
            return []
        results = data.get("results", [])
        if original_language:
            results = [m for m in results if m.get("original_language") == original_language]
        return self._format_movie_data(results, "series")

    async def _discover_by_genre_lang(
        self,
        endpoint: str,
        genre: str,
        lang: str = "en",
        limit: int = 12,
        exclude_ids: set[str] | None = None,
        seed_key: str | None = None,
        content_type: str = "movie",
    ):
        genre_map = {
            "action": 28, "drama": 18, "comedy": 35,
            "sci-fi": 878, "mystery": 9648, "fantasy": 14,
            "romance": 10749, "horror": 27, "animation": 16
        }

        input_genres = [g.strip().lower() for g in genre.split(',') if g.strip()]
        
        # TV-specific genre mapping as TMDB doesn't have a 1:1 'Romance' for TV
        if content_type == "series":
            tv_genre_map = {
                "action": 10759, # Action & Adventure
                "drama": 18,
                "comedy": 35,
                "sci-fi": 10765, # Sci-Fi & Fantasy
                "mystery": 9648,
                "fantasy": 10765,
                "romance": 10749, # TMDB TV genre is 10749 (Romance).
                "horror": 27,
                "animation": 16,
                "thriller": 80, # Thriller/Crime
                "documentary": 99,
                "war": 10768, # War & Politics
                "crime": 80
            }
            genre_ids = [str(tv_genre_map.get(ig)) for ig in input_genres if tv_genre_map.get(ig)]
        else:
            genre_map = {
                "action": 28, "drama": 18, "comedy": 35,
                "sci-fi": 878, "mystery": 9648, "fantasy": 14,
                "romance": 10749, "horror": 27, "animation": 16
            }
            genre_ids = [str(genre_map.get(ig)) for ig in input_genres if genre_map.get(ig)]

        if not genre_ids:
            return []

        excluded = {str(i) for i in (exclude_ids or set()) if str(i).strip()}
        if lang.lower() == "en":
            vote_floor = 80
        elif lang.lower() in ["ko", "zh"]:
            vote_floor = 10  # More inclusive for recent/popular Asian dramas
        else:
            vote_floor = 25
        url = f"{self.base_url}/{endpoint}"

        rotate_key = f"{seed_key or genre}:{lang}:{date.today().isoformat()}:{content_type}"
        digest = hashlib.sha256(rotate_key.encode("utf-8")).hexdigest()
        # Much larger page pool (up to 60 pages) for deep discovery variety
        start_page = (int(digest[:8], 16) % 60) + 1

        release_sort = "primary_release_date.desc" if content_type == "movie" else "first_air_date.desc"
        title_key = "title" if content_type == "movie" else "name"
        sort_options = [
            "popularity.desc",
            release_sort,
            "vote_average.desc",
        ]

        collected = []
        seen_ids = set(excluded)

        # Exclude Reality (10764) and Talk (10767) to avoid 'Knowing Bros' etc.
        without_genres = "10764,10767" if content_type == "series" else ""

        for genre_id in genre_ids:
            for sort_by in sort_options:
                probe_params = {
                    "with_genres": genre_id,
                    "with_original_language": lang,
                    "language": "en-US",
                    "sort_by": sort_by,
                    "page": 1,
                    "vote_count.gte": vote_floor,
                    "without_genres": without_genres, # Exclude Reality/Talk
                }
                probe = await self._make_request(url, params=probe_params)
                total_pages = max(1, min((probe or {}).get("total_pages", 1), 500))
                clamped_start = ((start_page - 1) % total_pages) + 1

                for offset in range(0, min(4, total_pages)):
                    page = ((clamped_start - 1 + offset) % total_pages) + 1
                    if page == 1 and offset == 0:
                        data = probe
                    else:
                        params = {
                            "with_genres": genre_id,
                            "with_original_language": lang,
                            "language": "en-US",
                            "sort_by": sort_by,
                            "page": page,
                            "vote_count.gte": vote_floor,
                            "without_genres": without_genres,
                        }
                        data = await self._make_request(url, params=params)
                    if not data:
                        continue

                    for item in data.get("results", []):
                        if not item.get("poster_path"):
                            continue

                        item_id = str(item.get("id") or "")
                        if not item_id or item_id in seen_ids:
                            continue

                        seen_ids.add(item_id)
                        collected.append(
                            {
                                "id": item.get("id"),
                                "title": item.get(title_key) or item.get("title") or item.get("name"),
                                "image": f"https://image.tmdb.org/t/p/w500{item.get('poster_path')}",
                                "rating": round(item.get("vote_average", 0), 1),
                                "overview": item.get("overview"),
                                "content_type": content_type,
                                "original_language": item.get("original_language"),
                            }
                        )
                        if len(collected) >= limit:
                            return collected

        return collected

    async def search_by_genre_lang(
        self,
        genre: str,
        lang: str = "en",
        limit: int = 12,
        exclude_ids: set[str] | None = None,
        seed_key: str | None = None,
    ):
        return await self._discover_by_genre_lang(
            endpoint="discover/movie",
            genre=genre,
            lang=lang,
            limit=limit,
            exclude_ids=exclude_ids,
            seed_key=seed_key,
            content_type="movie",
        )

    async def search_series_by_genre_lang(
        self,
        genre: str,
        lang: str = "en",
        limit: int = 12,
        exclude_ids: set[str] | None = None,
        seed_key: str | None = None,
    ):
        return await self._discover_by_genre_lang(
            endpoint="discover/tv",
            genre=genre,
            lang=lang,
            limit=limit,
            exclude_ids=exclude_ids,
            seed_key=seed_key,
            content_type="series",
        )

    async def get_popular_people_by_genre(self, genre: str, lang: str = "en"):
        """Fetches famous actors associated with the given genres."""
        genre_map = {
            "action": 28, "drama": 18, "comedy": 35,
            "sci-fi": 878, "mystery": 9648, "fantasy": 14
        }
        input_genres = [g.strip().lower() for g in genre.split(',') if g.strip()]
        genre_ids = [str(genre_map.get(ig)) for ig in input_genres if genre_map.get(ig)]
        
        # If no specific genre, just get generally popular people
        params = {"language": "en-US"}
        
        if genre_ids:
            # To get language-specific popular actors, we search for popular movies 
            # with that original language and then get their cast.
            url = f"{self.base_url}/discover/movie"
            params.update({
                "with_genres": ",".join(genre_ids),
                "with_original_language": lang,
                "sort_by": "popularity.desc",
                "vote_count.gte": 50 # Popularity floor
            })
            movie_data = await self._make_request(url, params=params)
            if movie_data and movie_data.get("results"):
                # Use top 5 popular movies to get a famous cast
                movie_ids = [m["id"] for m in movie_data["results"][:5]]
                return await self.get_cast_from_ids(movie_ids, "en-US")
        
        # Fallback: Generally popular people
        url = f"{self.base_url}/person/popular"
        data = await self._make_request(url, params=params)
        if not data: return []
        
        import random
        results = data.get("results", [])
        random.shuffle(results)
        
        return [
            {
                "name": p.get("name"),
                "image": f"https://image.tmdb.org/t/p/w185{p.get('profile_path')}" if p.get('profile_path') else None
            }
            for p in results[:10] if p.get("profile_path")
        ]

    async def get_cast_from_ids(self, movie_ids: list, lang: str = "en"):
        all_actors = {}
        async with httpx.AsyncClient(**self.client_config) as client:
            for m_id in movie_ids:
                credits_url = f"{self.base_url}/movie/{m_id}/credits"
                credits_res = await client.get(credits_url, headers=self.headers, params={"language": lang})
                
                if credits_res.status_code == 200:
                    cast = credits_res.json().get("cast", [])
                    for actor in cast[:8]: # 8 actors per movie
                        profile = actor.get("profile_path")
                        if profile:
                            all_actors[actor.get("name")] = f"https://image.tmdb.org/t/p/w185{profile}"
        
        import random
        items = [{"name": name, "image": img} for name, img in all_actors.items()]
        random.shuffle(items)
        return items[:15]

    async def get_cast_from_titles(self, titles: list, lang: str = "en"):
        all_actors = {}
        async with httpx.AsyncClient(**self.client_config) as client:
            for title in titles[:3]:
                search_url = f"{self.base_url}/search/movie"
                search_res = await client.get(search_url, headers=self.headers, params={"query": title, "language": lang})
                
                if search_res.status_code == 200:
                    results = search_res.json().get("results", [])
                    if not results: continue
                    movie_id = results[0]["id"]
                
                    credits_url = f"{self.base_url}/movie/{movie_id}/credits"
                    credits_res = await client.get(credits_url, headers=self.headers, params={"language": lang})
                
                    if credits_res.status_code == 200:
                        cast = credits_res.json().get("cast", [])
                        for actor in cast[:5]:
                            profile = actor.get("profile_path")
                            if profile:
                                all_actors[actor.get("name")] = f"https://image.tmdb.org/t/p/w185{profile}"

        return [{"name": name, "image": img} for name, img in all_actors.items()]

    async def get_similar_content(self, movie_id: int, original_language: str | None = None):
        url = f"{self.base_url}/movie/{movie_id}/similar"
        data = await self._make_request(url)
        if not data:
            return []
        results = data.get("results", [])
        if original_language:
            results = [m for m in results if m.get("original_language") == original_language]
        return self._format_movie_data(results, "movie")

    async def get_similar_series(self, series_id: int, original_language: str | None = None):
        url = f"{self.base_url}/tv/{series_id}/similar"
        data = await self._make_request(url)
        if not data:
            return []
        results = data.get("results", [])
        if original_language:
            results = [m for m in results if m.get("original_language") == original_language]
        return self._format_movie_data(results, "series")

    async def get_series_detail(self, series_id: str):
        url = f"{self.base_url}/tv/{series_id}"
        data = await self._make_request(url, params={"append_to_response": "credits"})
        if not data: return None
        
        credits = data.get("credits", {})
        creators = [c.get("name") for c in data.get("created_by", []) if c.get("name")]
        return {
            "id": data.get("id"),
            "title": data.get("name"),
            "image": f"https://image.tmdb.org/t/p/w500{data.get('poster_path')}" if data.get('poster_path') else None,
            "rating": round(data.get("vote_average", 0), 1),
            "vote_count": data.get("vote_count", 0),
            "overview": data.get("overview"),
            "genres": [g.get("name") for g in data.get("genres", [])],
            "release_date": data.get("first_air_date"),
            "runtime": data.get("episode_run_time", [0])[0] if data.get("episode_run_time") else 0,
            "director": ", ".join(creators) if creators else "Unknown",
            "cast": credits.get("cast", [])[:10],
            "content_type": "series"
        }

    async def get_movie_detail(self, movie_id: str):
        url = f"{self.base_url}/movie/{movie_id}"
        # Fetch main movie data
        m = await self._make_request(url, params={"append_to_response": "credits"})
        
        if not m:
            return {"error": "Could not fetch movie details"}
            
        # Extract director from credits
        credits = m.get("credits", {})
        crew = credits.get("crew", [])
        director = next((person.get("name") for person in crew if person.get("job") == "Director"), "-")

        return {
            "id": m.get("id"),
            "title": m.get("title"),
            "image": f"https://image.tmdb.org/t/p/w500{m.get('poster_path')}" if m.get('poster_path') else None,
            "rating": round(m.get("vote_average", 0), 1),
            "vote_count": m.get("vote_count", 0),
            "overview": m.get("overview"),
            "genres": [g.get("name") for g in m.get("genres", [])],
            "director": director,
            "runtime": m.get("runtime", 0),
            "release_date": m.get("release_date"),
            "cast": credits.get("cast", [])[:10]  # First 10 cast members
        }
    
    async def search_person_image(self, name: str) -> str | None:
        """Search TMDB for a person by name and return their profile image URL."""
        url = f"{self.base_url}/search/person"
        data = await self._make_request(url, params={"query": name})
        if data and data.get("results"):
            person = data["results"][0]
            if person.get("profile_path"):
                return f"https://image.tmdb.org/t/p/w185{person['profile_path']}"
        return None

    def _format_movie_data(self, results, content_type=None):
        return [
            {
                "id": m.get("id"),
                "title": m.get("title") or m.get("name"), # TV shows use 'name'
                "image": f"https://image.tmdb.org/t/p/w500{m.get('poster_path')}" if m.get('poster_path') else None,
                "rating": round(m.get("vote_average", 0), 1),
                "overview": m.get("overview"),
                "release_date": m.get("release_date") or m.get("first_air_date"), # TV shows use 'first_air_date'
                "content_type": content_type or ("movie" if "title" in m else "series"),
                "original_language": m.get("original_language"),
                "genre_ids": m.get("genre_ids") or []
            }
            for m in results if m.get("poster_path")
        ]

movie_service = MovieService()