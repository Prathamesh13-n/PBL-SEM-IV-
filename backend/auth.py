"""
auth.py — JWT token creation / decoding and FastAPI auth dependencies
"""
from datetime import datetime, timedelta
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

import models
from database import get_db

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY              = "smartpark_super_secret_key_2024_CHANGE_IN_PROD"
ALGORITHM               = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS= 30

pwd_context   = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ── Password helpers ──────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT helpers ───────────────────────────────────────────────────────────────
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    payload = data.copy()
    expire  = datetime.utcnow() + (expires_delta or timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS))
    payload.update({"exp": expire})
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ── FastAPI dependencies ──────────────────────────────────────────────────────
def get_current_user(
    token: str        = Depends(oauth2_scheme),
    db:    Session    = Depends(get_db),
) -> models.User:
    """Decode JWT and return the matching User row. Raises 401 on failure."""
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if not email:
            raise exc
    except JWTError:
        raise exc

    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise exc
    return user


def get_current_admin(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    """Same as get_current_user but enforces admin tier."""
    if current_user.tier != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

# this always we have to run 
# cd backends/smartpark-backend
# python -m uvicorn main:app --reload --port 8000