"""
routers/admin.py — Admin-only endpoints
  GET  /admin/stats
  GET  /admin/parkings          (all active; supports ?q= search)
  GET  /admin/overtime
  GET  /admin/fines
  POST /admin/fines/{id}        (apply a fine)
  PUT  /admin/parkings/{id}/end (admin force-end)
  GET  /admin/slots/{facility}/{area}   (live slot map data)
  GET  /admin/users             (all registered users)
"""
import math
import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
import auth as auth_utils
from database import get_db
from utils import parking_to_dict, calc_overtime, get_fine_per_hour, get_free_hours
from ws_manager import manager

router = APIRouter(prefix="/admin", tags=["Admin"])


# ── Helper: is a session overtime right now? ──────────────────────────────────
def _is_overtime(p: models.ParkingSession, now: int) -> bool:
    if p.end_time or p.user_tier == "family":
        return False
    return calc_overtime(p, now)["is_overtime"]


# ── Stats ─────────────────────────────────────────────────────────────────────
@router.get("/stats", response_model=schemas.AdminStats, summary="System-wide statistics")
def get_stats(
    db: Session = Depends(get_db),
    _:  models.User = Depends(auth_utils.get_current_admin),
):
    now   = int(time.time() * 1000)
    all_p = db.query(models.ParkingSession).all()
    active = [p for p in all_p if not p.end_time]
    fined  = [p for p in all_p if p.fine > 0]

    return {
        "total_parkings":  len(all_p),
        "active_parkings": len(active),
        "overtime_count":  sum(1 for p in active if _is_overtime(p, now)),
        "total_fines":     sum(p.fine for p in fined),
        "paid_fines":      sum(p.fine for p in fined if p.fine_paid),
        "unpaid_fines":    sum(p.fine for p in fined if not p.fine_paid),
        "unique_users":    len({p.user_email for p in active}),
    }


# ── All active parkings ───────────────────────────────────────────────────────
@router.get("/parkings", summary="All active parking sessions")
def get_all_active(
    q:  Optional[str] = None,
    db: Session        = Depends(get_db),
    _:  models.User    = Depends(auth_utils.get_current_admin),
):
    rows = (
        db.query(models.ParkingSession)
          .filter(models.ParkingSession.end_time.is_(None))
          .order_by(models.ParkingSession.start_time.asc())
          .all()
    )
    if q:
        q = q.lower()
        rows = [
            p for p in rows
            if q in p.id.lower() or q in p.vehicle_number.lower() or q in p.user_name.lower()
        ]
    return [parking_to_dict(p) for p in rows]


# ── All parkings (including history) ─────────────────────────────────────────
@router.get("/parkings/all", summary="All parking sessions (active + history)")
def get_all_parkings(
    db: Session     = Depends(get_db),
    _:  models.User = Depends(auth_utils.get_current_admin),
):
    rows = (
        db.query(models.ParkingSession)
          .order_by(models.ParkingSession.start_time.desc())
          .all()
    )
    return [parking_to_dict(p) for p in rows]


# ── Overtime list ─────────────────────────────────────────────────────────────
@router.get("/overtime", summary="Sessions currently in overtime")
def get_overtime(
    db: Session     = Depends(get_db),
    _:  models.User = Depends(auth_utils.get_current_admin),
):
    now  = int(time.time() * 1000)
    rows = (
        db.query(models.ParkingSession)
          .filter(models.ParkingSession.end_time.is_(None))
          .all()
    )
    return [parking_to_dict(p) for p in rows if _is_overtime(p, now)]


# ── Fine log ──────────────────────────────────────────────────────────────────
@router.get("/fines", summary="Fine collection log")
def get_fines(
    db: Session     = Depends(get_db),
    _:  models.User = Depends(auth_utils.get_current_admin),
):
    rows = (
        db.query(models.ParkingSession)
          .filter(models.ParkingSession.fine > 0)
          .order_by(models.ParkingSession.fine_time.desc())
          .all()
    )
    return [parking_to_dict(p) for p in rows]


# ── Apply fine ────────────────────────────────────────────────────────────────
@router.post("/fines/{parking_id}", summary="Apply a fine to a parking session")
async def apply_fine(
    parking_id: str,
    req:        schemas.ApplyFineRequest,
    db:         Session     = Depends(get_db),
    _:          models.User = Depends(auth_utils.get_current_admin),
):
    p = db.query(models.ParkingSession).filter(
        models.ParkingSession.id == parking_id
    ).first()
    if not p:
        raise HTTPException(404, "Parking session not found")
    if req.amount <= 0:
        raise HTTPException(400, "Fine amount must be a positive integer (₹)")

    full_reason = req.reason + (f" — {req.notes}" if req.notes else "")
    p.fine        = req.amount
    p.fine_reason = full_reason
    p.fine_time   = int(time.time() * 1000)
    p.fine_paid   = False
    db.commit()

    await manager.broadcast_all({
        "event":      "fine_applied",
        "parkingId":  parking_id,
        "userEmail":  p.user_email,
        "vehicle":    p.vehicle_number,
        "amount":     req.amount,
        "reason":     full_reason,
        "message":    f"💸 Fine of ₹{req.amount:,} applied to {parking_id}. Reason: {req.reason}",
    })

    return {"message": f"Fine of ₹{req.amount:,} applied to {parking_id}"}


# ── Admin force-end parking ───────────────────────────────────────────────────
@router.put("/parkings/{parking_id}/end", summary="Admin: force-end a parking session")
async def admin_end_parking(
    parking_id: str,
    db:         Session     = Depends(get_db),
    _:          models.User = Depends(auth_utils.get_current_admin),
):
    p = db.query(models.ParkingSession).filter(
        models.ParkingSession.id == parking_id,
        models.ParkingSession.end_time.is_(None),
    ).first()
    if not p:
        raise HTTPException(404, "Active parking session not found")

    p.end_time = int(time.time() * 1000)
    db.commit()

    await manager.broadcast_all({
        "event":     "slot_freed",
        "facility":  p.facility,
        "area":      p.area,
        "slot":      p.slot,
        "parkingId": parking_id,
    })
    await manager.broadcast_to_room(
        f"{p.facility}:{p.area}",
        {"event": "slot_freed", "slot": p.slot},
    )

    return {"message": f"Parking {parking_id} ended by admin"}


# ── Live slot map ─────────────────────────────────────────────────────────────
@router.get(
    "/slots/{facility}/{area}",
    response_model=schemas.SlotMapOut,
    summary="Live slot-map data for a facility/area",
)
def get_slot_map(
    facility: str,
    area:     str,
    db:       Session     = Depends(get_db),
    _:        models.User = Depends(auth_utils.get_current_admin),
):
    now  = int(time.time() * 1000)
    rows = (
        db.query(models.ParkingSession)
          .filter(
              models.ParkingSession.facility == facility,
              models.ParkingSession.area     == area,
              models.ParkingSession.end_time.is_(None),
          )
          .all()
    )

    occupied       = [p.slot for p in rows]
    overtime_slots = [p.slot for p in rows if _is_overtime(p, now)]

    return {
        "facility":       facility,
        "area":           area,
        "total":          50,
        "occupied":       occupied,
        "overtime_slots": overtime_slots,
        "available":      50 - len(occupied),
        "parkings":       [parking_to_dict(p) for p in rows],
    }


# ── All users ─────────────────────────────────────────────────────────────────
@router.get("/users", summary="All registered users")
def get_all_users(
    db: Session     = Depends(get_db),
    _:  models.User = Depends(auth_utils.get_current_admin),
):
    users = db.query(models.User).filter(models.User.tier != "admin").all()
    return [
        {
            "id":             u.id,
            "name":           u.name,
            "email":          u.email,
            "tier":           u.tier,
            "premium_expiry": u.premium_expiry,
            "vehicles":       len(u.vehicles),
            "created_at":     u.created_at,
        }
        for u in users
    ]
