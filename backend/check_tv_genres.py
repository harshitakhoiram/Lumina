import os
import requests
from dotenv import load_dotenv

load_dotenv()
TMDB_TOKEN = os.getenv("TMDB_BEARER_TOKEN")

def check_tv_genres():
    url = "https://api.themoviedb.org/3/genre/tv/list?language=en"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {TMDB_TOKEN}"
    }
    response = requests.get(url, headers=headers)
    print(response.json())

if __name__ == "__main__":
    check_tv_genres()
