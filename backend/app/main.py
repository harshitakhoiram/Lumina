from fastapi import FastAPI
from app.routers import auth_router, recommendations, discovery, content_router
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.security import decode_token
from dotenv import load_dotenv
load_dotenv()
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from fastapi import Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.routers import recommendations

app = FastAPI(title="Lumina API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5500", "http://localhost:5500", "http://localhost:8080", "http://127.0.0.1:8080"], # Added 8080 for Python http.server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(auth_router.router)
app.include_router(recommendations.router)
app.include_router(discovery.router)
app.include_router(content_router.router)

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
