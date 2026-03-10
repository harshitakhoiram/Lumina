import asyncio
import os
import sys

# Add backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.services.book_service import BookService

async def verify():
    service = BookService()
    print("Searching for 'Harry Potter'...")
    results = await service.search_books("Harry Potter")
    
    if "error" in results:
        print(f"Error: {results['error']}")
        return

    for book in results[:3]:
        print(f"\nTitle: {book['title']}")
        print(f"Poster URL: {book['image']}")
        
        if book['image']:
            if not book['image'].startswith("https"):
                print("FAILED: URL is not HTTPS")
            elif "zoom=1" in book['image']:
                print("FAILED: URL still has zoom=1")
            elif "edge=curl" in book['image']:
                print("FAILED: URL still has edge=curl")
            else:
                print("PASSED: URL looks high quality and secure.")
        else:
            print("INFO: No image available for this book.")

if __name__ == "__main__":
    asyncio.run(verify())
