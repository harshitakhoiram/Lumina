import os
import time
from jose import jwt


JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-key-32-bytes-long-min")
JWT_ALG = "HS256"
JWT_EXP_SECONDS = 60 * 60 * 24  # 24 hours

def create_access_token(user_id: str) -> str:
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + JWT_EXP_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
