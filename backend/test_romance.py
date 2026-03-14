import asyncio
from app.services.movie_service import movie_service

async def test():
    res = await movie_service.search_series_by_genre_lang("romance", "ko", limit=18)
    print("Korean Romance TV Shows:")
    for r in res:
        print(r['title'])
    
    res2 = await movie_service.search_series_by_genre_lang("romance", "zh", limit=18)
    print("\nChinese Romance TV Shows:")
    for r in res2:
        print(r['title'])

if __name__ == "__main__":
    asyncio.run(test())
