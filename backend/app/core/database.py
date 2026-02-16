# backend/app/core/database.py
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# This URL will come from your .env file eventually
# Example: postgresql://user:password@localhost:5432/lumina_db
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# This is the "Dependency" your router is looking for
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()