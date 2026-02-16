from fastapi import FastAPI
from app.routers import auth_router

app = FastAPI(title="Lumina API")

app.include_router(auth_router.router)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/")
def read_root():
    return {"message": "Welcome to Lumina AI API"}
