import httpx
import os
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

    async def search_movies(self, query: str):
        url = f"{self.base_url}/search/movie"
        data = await self._make_request(url, params={"query": query})
        return self._format_movie_data(data.get("results", [])) if data else []

    async def search_by_genre_lang(self, genre: str, lang: str = "en"):
        genre_map = {
            "action": 28, "drama": 18, "comedy": 35,
            "sci-fi": 878, "mystery": 9648, "fantasy": 14
        }
        genre_id = genre_map.get(genre.lower())
        if not genre_id: return []
        
        url = f"{self.base_url}/discover/movie"
        params = {
            "with_genres": genre_id,
            "with_original_language": lang,
            "sort_by": "popularity.desc"
        }
        
        data = await self._make_request(url, params=params)
        if not data: return []
        
        results = data.get("results", [])
        return [
            {
                "id": m.get("id"),
                "title": m.get("title"),
                "image": f"https://image.tmdb.org/t/p/w500{m.get('poster_path')}" if m.get('poster_path') else None,
            }
            for m in results[:6] if m.get("poster_path")
        ]

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
            "overview": m.get("overview"),
            "genres": [g.get("name") for g in m.get("genres", [])],
            "director": director,
            "cast": credits.get("cast", [])[:10]  # First 10 cast members
        }
    
    def _format_movie_data(self, results):
        return [
            {
                "id": m.get("id"),
                "title": m.get("title"),
                "image": f"https://image.tmdb.org/t/p/w500{m.get('poster_path')}" if m.get('poster_path') else None,
                "rating": round(m.get("vote_average", 0), 1),
                "overview": m.get("overview"),
                "release_date": m.get("release_date")
            }
            for m in results if m.get("poster_path")
        ]

movie_service = MovieService()