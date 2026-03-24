"""
routers/premium.py — Plan activation and family pack management
"""
import time
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
import auth as auth_utils
from database import get_db
from utils import PLAN_EXPIRY_MS

router = APIRouter(prefix="/premium", tags=["Premium"])


# ── Activate plan ─────────────────────────────────────────────────────────────
@router.post("/activate", summary="Activate premium or family plan")
def activate_plan(
    req:          schemas.ActivatePlanRequest,
    db:           Session      = Depends(get_db),
    current_user: models.User  = Depends(auth_utils.get_current_user),
):
    if req.plan not in ("premium", "family"):
        raise HTTPException(400, "Invalid plan. Must be 'premium' or 'family'.")

    expiry = int(time.time() * 1000) + PLAN_EXPIRY_MS
    current_user.tier           = req.plan
    current_user.premium_expiry = expiry
    db.commit()
    db.refresh(current_user)

    label = "Premium Plan (20h free, ₹300/hr fine)" if req.plan == "premium" \
            else "Family Pack (♾️ Unlimited, zero fines)"

    return {
        "message":    f"{label} activated!",
        "tier":       current_user.tier,
        "expires_at": expiry,
        "expires_on": time.strftime(
            "%d %b %Y", time.localtime(expiry / 1000)
        ),
    }


# ── Get family members ────────────────────────────────────────────────────────
@router.get("/family", response_model=List[schemas.FamilyMemberOut], summary="List family members")
def get_family(
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    if current_user.tier != "family":
        raise HTTPException(403, "Family Pack required to access this endpoint")
    return current_user.family_members


# ── Add family member ─────────────────────────────────────────────────────────
@router.post("/family", response_model=schemas.FamilyMemberOut, summary="Add a family member")
def add_family_member(
    req:          schemas.FamilyMemberCreate,
    db:           Session      = Depends(get_db),
    current_user: models.User  = Depends(auth_utils.get_current_user),
):
    if current_user.tier != "family":
        raise HTTPException(403, "Family Pack required")
    if len(current_user.family_members) >= 3:
        raise HTTPException(400, "Maximum 3 family members per plan")

    email = req.email.strip().lower()
    if any(m.email == email for m in current_user.family_members):
        raise HTTPException(400, "This email is already in your family pack")

    member = models.FamilyMember(
        owner_id = current_user.id,
        name     = req.name.strip(),
        email    = email,
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


# ── Remove family member ──────────────────────────────────────────────────────
@router.delete("/family/{member_id}", summary="Remove a family member")
def remove_family_member(
    member_id:    int,
    db:           Session      = Depends(get_db),
    current_user: models.User  = Depends(auth_utils.get_current_user),
):
    m = db.query(models.FamilyMember).filter(
        models.FamilyMember.id       == member_id,
        models.FamilyMember.owner_id == current_user.id,
    ).first()
    if not m:
        raise HTTPException(404, "Family member not found")

    db.delete(m)
    db.commit()
    return {"message": f"{m.name} removed from family pack"}


# ── Plan info ─────────────────────────────────────────────────────────────────
@router.get("/status", summary="Current plan status")
def plan_status(
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    expiry = current_user.premium_expiry
    return {
        "tier":           current_user.tier,
        "premium_expiry": expiry,
        "expires_on":     (
            time.strftime("%d %b %Y", time.localtime(expiry / 1000))
            if expiry else None
        ),
        "family_members": (
            [{"id": m.id, "name": m.name, "email": m.email}
             for m in current_user.family_members]
            if current_user.tier == "family" else []
        ),
    }
