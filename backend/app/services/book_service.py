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
        
        # Handle multiple genres
        input_genres = [g.strip().lower() for g in genre.split(',') if g.strip()]
        
        all_items = []
        async with httpx.AsyncClient() as client:
            for ig in input_genres:
                # We search by genre but keep titles in English by restricting results or query
                query = f"subject:{ig}"
                params = {
                    "q": query,
                    "langRestrict": "en", # Force English results
                    "key": self.api_key,
                    "maxResults": 20 
                }
                response = await client.get(self.base_url, params=params)
                if response.status_code == 200:
                    data = response.json()
                    all_items.extend(data.get("items", []))
            
            # Randomize
            import random
            random.shuffle(all_items)
            
            return [
                {
                    "title": item.get("volumeInfo", {}).get("title"),
                    "image": self._get_high_res_image(item.get("volumeInfo", {})),
                }
                for item in all_items[:12] if item.get("volumeInfo", {}).get("imageLinks")
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

    async def get_book_detail(self, book_id: str):
        url = f"{self.base_url}/{book_id}"
        async with httpx.AsyncClient() as client:
            response = await client.get(url, params={"key": self.api_key})
            if response.status_code != 200:
                # Fallback if ID is invalid or not found
                return None
            
            data = response.json()
            info = data.get("volumeInfo", {})
            return {
                "id": data.get("id"),
                "title": info.get("title"),
                "image": self._get_high_res_image(info), # Pass whole info dict
                "rating": info.get("averageRating", 0),
                "overview": info.get("description"),
                "genres": info.get("categories", []),
                "authors": info.get("authors", []),
                "publisher": info.get("publisher"),
                "published_date": info.get("publishedDate"),
                "content_type": "book"
            }

    def _get_high_res_image(self, volume_info: dict) -> str | None:
        """Selects the best available image and forces high resolution, with Open Library fallback."""
        image_links = volume_info.get("imageLinks")
        isbn_list = volume_info.get("industryIdentifiers", [])
        isbn = next((i["identifier"] for i in isbn_list if i["type"] in ["ISBN_13", "ISBN_10"]), None)

        url = None
        if image_links:
            # Preference order for higher resolution
            priority = ["extraLarge", "large", "medium", "small", "thumbnail", "smallThumbnail"]
            for key in priority:
                if key in image_links:
                    url = image_links[key]
                    break
            
            if url:
                # Transformations:
                if url.startswith("http:"):
                    url = url.replace("http:", "https:", 1)
                if "&zoom=1" in url:
                    url = url.replace("&zoom=1", "&zoom=3")
                elif "?zoom=1" in url:
                    url = url.replace("?zoom=1", "?zoom=3")
                if "&edge=curl" in url:
                    url = url.replace("&edge=curl", "")
                elif "?edge=curl" in url:
                    url = url.replace("?edge=curl", "")

        # Fallback to Open Library if URL is still low-res or missing
        if isbn and (not url or "zoom=3" not in url):
            # Open Library Covers API is often higher quality
            ol_url = f"https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false"
            # We don't check if it exists here to avoid slow sync calls, 
            # but usually the 'default=false' would return a 404 which can be handled by frontend onerror
            return ol_url

        return url

    def _format_book_data(self, items):
        """Standardizes book data for the Lumina Dashboard."""
        return [
            {
                "id": item.get("id"),
                "title": item["volumeInfo"].get("title"),
                "authors": item["volumeInfo"].get("authors", ["Unknown"]),
                "image": self._get_high_res_image(item["volumeInfo"]), # Pass whole info dict
                "description": item["volumeInfo"].get("description", "No description available."),
                "categories": item["volumeInfo"].get("categories", ["General"]),
                "content_type": "book"
            }
            for item in items if item["volumeInfo"].get("imageLinks")
        ]

book_service = BookService()