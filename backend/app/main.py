from fastapi import FastAPI
from app.routers import auth_router
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.security import decode_token
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from fastapi import Depends
from sqlalchemy.orm import Session
from app.core.database import get_db

app = FastAPI(title="Lumina API")

app.include_router(auth_router.router)

@app.get("/db-check")
def db_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"db": "ok"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/")
def read_root():
    return {"message": "Welcome to Lumina AI API"}

security = HTTPBearer()
@app.get("/me")
def me(creds: HTTPAuthorizationCredentials = Depends(security)):
    token = creds.credentials  # already strips "Bearer "
    payload = decode_token(token)
    return {"user_id": payload["sub"]}

@app.get("/simple")
def simple():
    return {"ok": True}
