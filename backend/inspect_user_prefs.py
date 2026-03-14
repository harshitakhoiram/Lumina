
from app.core.database import SessionLocal
from app.models.models import UserPreferences
from sqlalchemy import text

def inspect_user():
    db = SessionLocal()
    try:
        # Get the first user (there is likely only one in this dev env, or I can use a generic query)
        user_prefs = db.execute(text("SELECT user_id, interest, language, languages, genre FROM user_preferences LIMIT 1")).fetchone()
        if user_prefs:
            print(f"User ID: {user_prefs.user_id}")
            print(f"Interest: {user_prefs.interest}")
            print(f"Base Language: {user_prefs.language}")
            print(f"Languages: {user_prefs.languages}")
            print(f"Genre: {user_prefs.genre}")
        else:
            print("No user preferences found.")
    finally:
        db.close()

if __name__ == "__main__":
    inspect_user()
