from fastapi import FastAPI
from app.routers import auth

app = FastAPI()

# Include the auth routes
app.include_router(auth.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to Lumina AI API"}