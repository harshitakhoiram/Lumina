import httpx
import os
from dotenv import load_dotenv

# Load environment variables from the root .env file
load_dotenv()

class MovieService:
    def __init__(self):
        # Use the specific Bearer Token for TMDB
        self.token = os.getenv("TMDB_BEARER_TOKEN")
        self.base_url = "https://api.themoviedb.org/3"
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "accept": "application/json"
        }

    async def get_trending_movies(self):
        """Fetches current trending movies for the initial dashboard view."""
        url = f"{self.base_url}/trending/movie/day"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers)
            if response.status_code != 200:
                return {"error": f"TMDB Fetch Error: {response.status_code}"}
            
            data = response.json()
            return self._format_movie_data(data.get("results", []))

    async def search_movies(self, query: str):
        """Allows users to search for any movie in the TMDB global database."""
        url = f"{self.base_url}/search/movie?query={query}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers)
            data = response.json()
            return self._format_movie_data(data.get("results", []))

    async def get_similar_content(self, movie_id: int):
        """
        The Core Logic: Fetches real-time recommendations based on a specific 
        movie the user just searched for or clicked.
        """
        url = f"{self.base_url}/movie/{movie_id}/recommendations"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers)
            if response.status_code != 200:
                return {"error": "Could not fetch similar content"}
            
            data = response.json()
            return self._format_movie_data(data.get("results", []))

    async def search_by_genre_lang(self, genre: str, lang: str = "en"):
        """
        Searches TMDB for movies matching genre and language.
        Used during onboarding flow.
        """
        # Mapping of genre names to TMDB genre IDs
        genre_map = {
            "action": 28,
            "drama": 18,
            "comedy": 35,
            "sci-fi": 878,
            "mystery": 9648,
            "fantasy": 14
        }
        genre_id = genre_map.get(genre.lower())
        if not genre_id:
            return []
        
        url = f"{self.base_url}/discover/movie"
        params = {
            "with_genres": genre_id,
            "with_original_language": lang,
            "sort_by": "popularity.desc",
            "page": 1
        }
        
    
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params)
            if response.status_code != 200:
                return []
            
            data = response.json()
            results = data.get("results", [])
            # Return first 10 results with title and poster
            return [
                {
                    "title": m.get("title"),
                    "image": f"https://image.tmdb.org/t/p/w500{m.get('poster_path')}" if m.get('poster_path') else None,
                }
                for m in results[:6] if m.get("poster_path")
            ]
    async def get_cast_from_titles(self, titles: list, lang: str = "en"):
        all_actors = {}
    
        async with httpx.AsyncClient() as client:
            for title in titles[:3]:  # Limit to first 3 selected movies to keep it fast
            # 1. Search for the movie ID by title
                search_url = f"{self.base_url}/search/movie?query={title}&language={lang}"
                search_res = await client.get(search_url, headers=self.headers)
            
                if search_res.status_code == 200:
                    results = search_res.json().get("results", [])
                    if not results: continue
                    movie_id = results[0]["id"]
                
                    # 2. Get the credits (cast) for that movie ID
                    credits_url = f"{self.base_url}/movie/{movie_id}/credits?language={lang}"
                    credits_res = await client.get(credits_url, headers=self.headers)
                
                    if credits_res.status_code == 200:
                        cast = credits_res.json().get("cast", [])
                        for actor in cast[:5]:  # Take top 5 billed actors per movie
                            actor_name = actor.get("name")
                            profile_path = actor.get("profile_path")
                            if profile_path:
                                all_actors[actor_name] = f"https://image.tmdb.org/t/p/w185{profile_path}"

    # Return as a list of objects for the frontend
        return [{"name": name, "image": img} for name, img in all_actors.items()]

    async def get_movie_detail(self, movie_id: str):
        """
        Fetches detailed information about a specific movie (like IMDb page).
        """
        url = f"{self.base_url}/movie/{movie_id}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers)
            if response.status_code != 200:
                return {"error": "Could not fetch movie details"}
            
            m = response.json()
            return {
                "id": m.get("id"),
                "content_id": str(m.get("id")),
                "title": m.get("title"),
                "content_type": "movie",
                "image": f"https://image.tmdb.org/t/p/w500{m.get('poster_path')}" if m.get('poster_path') else None,
                "rating": round(m.get("vote_average", 0), 1),
                "overview": m.get("overview"),
                "release_date": m.get("release_date"),
                "runtime": m.get("runtime"),
                "genres": [g.get("name") for g in m.get("genres", [])],
                "director": m.get("director"),
                "cast": m.get("cast", []),
                "language": m.get("original_language"),
                "imdb_id": m.get("imdb_id"),
                "tmdb_url": f"https://www.themoviedb.org/movie/{m.get('id')}"
            }

    def _format_movie_data(self, results):
        """Helper to clean and format data for your frontend dashboard."""
        return [
            {
                "id": m.get("id"),
                "title": m.get("title"),
                "image": f"https://image.tmdb.org/t/p/w500{m.get('poster_path')}" if m.get('poster_path') else None,
                "rating": round(m.get("vote_average", 0), 1),
                "overview": m.get("overview"),
                "release_date": m.get("release_date")
            }
            for m in results if m.get("poster_path") # Only return movies with images
        ]

movie_service = MovieService()