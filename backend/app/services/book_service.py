import httpx
import os
from dotenv import load_dotenv

load_dotenv()

class BookService:
    def __init__(self):
        self.api_key = os.getenv("GOOGLE_BOOKS_API_KEY")
        self.base_url = "https://www.googleapis.com/books/v1/volumes"

    async def search_books(self, query: str):
        """Search the global Google Books database in real-time."""
        url = f"{self.base_url}?q={query}&key={self.api_key}&maxResults=20"
        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            if response.status_code != 200:
                return {"error": "Google Books API Error"}
                
            data = response.json()
            return self._format_book_data(data.get("items", []))

    async def get_similar_books(self, author: str, category: str):
        """
        Finds similar books by looking up other titles in the same 
        category or by the same author.
        """
        # We combine author and category for a 'recommendation' style search
        query = f"subject:{category}+inauthor:{author}"
        return await self.search_books(query)

    async def search_by_genre_lang(self, genre: str, lang: str = "en"):
        """
        Searches Google Books for books matching genre and language.
        Used during onboarding flow.
        """
        lang_map = {"en": "en", "hi": "hi", "es": "es", "fr": "fr"}
        lang_code = lang_map.get(lang, "en")
        
        query = f"subject:{genre} language:{lang_code}"
        params = {
            "q": query,
            "key": self.api_key,
            "maxResults": 10
        }
        
        async with httpx.AsyncClient() as client:
            response = await client.get(self.base_url, params=params)
            if response.status_code != 200:
                return []
            
            data = response.json()
            items = data.get("items", [])
            return [
                {
                    "title": item.get("volumeInfo", {}).get("title"),
                    "image": item.get("volumeInfo", {}).get("imageLinks", {}).get("thumbnail"),
                }
                for item in items[:6] if item.get("volumeInfo", {}).get("imageLinks", {}).get("thumbnail")
            ]
    async def get_authors_from_titles(self, titles: list, lang: str = "en"):
        all_authors = {}
        async with httpx.AsyncClient() as client:
            for title in titles[:3]: # Limit to top 3 selections
                url = f"{self.base_url}?q=intitle:{title}&langRestrict={lang}&key={self.api_key}&maxResults=1"
                response = await client.get(url)
                if response.status_code == 200:
                    items = response.json().get("items", [])
                    if items:
                        volume_info = items[0].get("volumeInfo", {})
                        authors = volume_info.get("authors", [])
                        # Google Books doesn't provide specific author images easily, 
                        # so we use a generic stylish avatar or an author-related search.
                        for author in authors:
                            all_authors[author] = "assests/author_placeholder.png" # Standard local placeholder
        return [{"name": name, "image": img} for name, img in all_authors.items()]

    def _format_book_data(self, items):
        """Standardizes book data for the Lumina Dashboard."""
        return [
            {
                "id": item.get("id"),
                "title": item["volumeInfo"].get("title"),
                "authors": item["volumeInfo"].get("authors", ["Unknown"]),
                "image": item["volumeInfo"].get("imageLinks", {}).get("thumbnail"),
                "description": item["volumeInfo"].get("description", "No description available."),
                "categories": item["volumeInfo"].get("categories", ["General"])
            }
            for item in items if item["volumeInfo"].get("imageLinks")
        ]

book_service = BookService()