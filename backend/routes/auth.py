"""
routers/auth.py — Register, User Login, Admin Login, /me
"""
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
import auth as auth_utils
from database import get_db
from utils import ADMIN_EMAIL, ADMIN_PASS

router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Register ──────────────────────────────────────────────────────────────────
@router.post("/register", response_model=schemas.TokenResponse, summary="Create a new user account")
def register(req: schemas.RegisterRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()

    if len(req.password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    if db.query(models.User).filter(models.User.email == email).first():
        raise HTTPException(400, "Email already registered. Please sign in.")

    user = models.User(
        name       = req.name.strip(),
        email      = email,
        password   = auth_utils.hash_password(req.password),
        tier       = "free",
        created_at = int(time.time() * 1000),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = auth_utils.create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "user": user}


# ── User Login ────────────────────────────────────────────────────────────────
@router.post("/login", response_model=schemas.TokenResponse, summary="User login")
def login(req: schemas.LoginRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    user  = db.query(models.User).filter(models.User.email == email).first()

    if not user or not auth_utils.verify_password(req.password, user.password):
        raise HTTPException(401, "Invalid email or password")

    # Expire premium if past due
    now = int(time.time() * 1000)
    if user.tier in ("premium", "family") and user.premium_expiry and now > user.premium_expiry:
        user.tier = "free"
        db.commit()

    token = auth_utils.create_access_token({"sub": user.email})
    return {"access_token": token, "token_type": "bearer", "user": user}


# ── Admin Login ───────────────────────────────────────────────────────────────
@router.post("/admin-login", response_model=schemas.TokenResponse, summary="Admin login")
def admin_login(req: schemas.LoginRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()

    if email != ADMIN_EMAIL or req.password != ADMIN_PASS:
        raise HTTPException(401, "Invalid admin credentials")

    # Get or create the admin user row
    admin = db.query(models.User).filter(models.User.email == ADMIN_EMAIL).first()
    if not admin:
        admin = models.User(
            name       = "Admin",
            email      = ADMIN_EMAIL,
            password   = auth_utils.hash_password(ADMIN_PASS),
            tier       = "admin",
            created_at = int(time.time() * 1000),
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)

    token = auth_utils.create_access_token({"sub": admin.email})
    return {"access_token": token, "token_type": "bearer", "user": admin}


# ── Current user ──────────────────────────────────────────────────────────────
@router.get("/me", response_model=schemas.UserOut, summary="Get current user profile")
def get_me(current_user: models.User = Depends(auth_utils.get_current_user)):
    return current_user
