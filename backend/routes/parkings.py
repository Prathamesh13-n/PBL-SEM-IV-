"""
routers/parkings.py — Save, end, list and pay-fine for parking sessions
"""
import math
import time
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
import auth as auth_utils
from database import get_db
from utils import (
    parking_to_dict, get_free_hours, get_fine_per_hour, calc_overtime
)
from ws_manager import manager

router = APIRouter(prefix="/parkings", tags=["Parkings"])


# ── ID counter helpers ────────────────────────────────────────────────────────
def _next_id(db: Session) -> str:
    row = db.query(models.ParkingCounter).first()
    if not row:
        row = models.ParkingCounter(id=1, counter=1)
        db.add(row)
        db.flush()
    n       = row.counter
    row.counter += 1
    db.flush()
    return f"PKG{str(n).zfill(6)}"


# ── Active sessions ───────────────────────────────────────────────────────────
@router.get("/active", summary="My active parking sessions")
def get_active(
    current_user: models.User = Depends(auth_utils.get_current_user),
    db:           Session      = Depends(get_db),
):
    rows = (
        db.query(models.ParkingSession)
          .filter(
              models.ParkingSession.user_id  == current_user.id,
              models.ParkingSession.end_time.is_(None),
          )
          .order_by(models.ParkingSession.start_time.desc())
          .all()
    )
    return [parking_to_dict(p) for p in rows]


# ── Parking history ───────────────────────────────────────────────────────────
@router.get("/history", summary="My completed parking history")
def get_history(
    current_user: models.User = Depends(auth_utils.get_current_user),
    db:           Session      = Depends(get_db),
):
    rows = (
        db.query(models.ParkingSession)
          .filter(
              models.ParkingSession.user_id  == current_user.id,
              models.ParkingSession.end_time.isnot(None),
          )
          .order_by(models.ParkingSession.start_time.desc())
          .all()
    )
    return [parking_to_dict(p) for p in rows]


# ── Save / create a parking ───────────────────────────────────────────────────
@router.post("", summary="Save a new parking session")
async def save_parking(
    req:          schemas.ParkingCreate,
    db:           Session      = Depends(get_db),
    current_user: models.User  = Depends(auth_utils.get_current_user),
):
    # 1 — vehicle belongs to user?
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id      == req.vehicle_id,
        models.Vehicle.user_id == current_user.id,
    ).first()
    if not vehicle:
        raise HTTPException(404, "Vehicle not found")

    # 2 — slot not already occupied?
    if db.query(models.ParkingSession).filter(
        models.ParkingSession.facility == req.facility,
        models.ParkingSession.area     == req.area,
        models.ParkingSession.slot     == req.slot,
        models.ParkingSession.end_time.is_(None),
    ).first():
        raise HTTPException(400, f"Slot {req.area}-{req.slot} is already occupied")

    # 3 — vehicle not already parked anywhere?
    if db.query(models.ParkingSession).filter(
        models.ParkingSession.vehicle_number == vehicle.number,
        models.ParkingSession.end_time.is_(None),
    ).first():
        raise HTTPException(400, f"{vehicle.number} is already parked")

    # 4 — within active-session limit for the plan?
    my_active = (
        db.query(models.ParkingSession)
          .filter(
              models.ParkingSession.user_id == current_user.id,
              models.ParkingSession.end_time.is_(None),
          )
          .count()
    )
    is_family  = current_user.tier == "family"
    is_premium = current_user.tier == "premium"
    fam_slots  = min(len(current_user.family_members) + 1, 3) if is_family else 0
    max_active = fam_slots if is_family else (5 if is_premium else 1)

    if my_active >= max_active:
        raise HTTPException(
            400,
            f"Active session limit reached ({max_active} for {current_user.tier} plan)",
        )

    # 5 — create the session
    now        = int(time.time() * 1000)
    parking_id = _next_id(db)

    p = models.ParkingSession(
        id              = parking_id,
        user_id         = current_user.id,
        user_email      = current_user.email,
        user_name       = current_user.name,
        user_tier       = current_user.tier,
        vehicle_id      = vehicle.id,
        vehicle_number  = vehicle.number,
        vehicle_name    = vehicle.name,
        vehicle_type    = vehicle.type,
        state           = req.state,
        city            = req.city,
        facility        = req.facility,
        area            = req.area,
        slot            = req.slot,
        entry           = req.entry,
        start_time      = now,
        end_time        = None,
        fine            = 0,
        fine_reason     = "",
        fine_paid       = False,
        auto_fine_applied = 0,
        notified_warn   = False,
        notified_overtime = False,
    )
    db.add(p)
    db.commit()
    db.refresh(p)

    result = parking_to_dict(p)

    # 6 — broadcast slot occupied
    await manager.broadcast_all({
        "event":    "slot_occupied",
        "facility": req.facility,
        "area":     req.area,
        "slot":     req.slot,
        "parking":  result,
    })
    await manager.broadcast_to_room(
        f"{req.facility}:{req.area}",
        {"event": "slot_occupied", "slot": req.slot, "parking": result},
    )

    return result


# ── End parking ───────────────────────────────────────────────────────────────
@router.put("/{parking_id}/end", summary="End an active parking session")
async def end_parking(
    parking_id:   str,
    db:           Session      = Depends(get_db),
    current_user: models.User  = Depends(auth_utils.get_current_user),
):
    p = db.query(models.ParkingSession).filter(
        models.ParkingSession.id      == parking_id,
        models.ParkingSession.user_id == current_user.id,
        models.ParkingSession.end_time.is_(None),
    ).first()
    if not p:
        raise HTTPException(404, "Active parking session not found")

    now = int(time.time() * 1000)

    # Final auto-fine calculation on checkout
    if p.user_tier != "family":
        hrs    = (now - p.start_time) / 3_600_000
        free_h = get_free_hours(p.user_tier)
        if hrs > free_h:
            ot_hrs   = max(0.0, hrs - free_h)
            fine_ph  = get_fine_per_hour(p.user_tier)
            final_fine = math.ceil(ot_hrs) * fine_ph
            if final_fine > (p.fine or 0):
                p.fine        = final_fine
                p.fine_reason = f"Overtime parking ({ot_hrs:.1f}h)"
                p.fine_time   = now

    p.end_time = now
    db.commit()

    result = parking_to_dict(p)

    await manager.broadcast_all({
        "event":      "slot_freed",
        "facility":   p.facility,
        "area":       p.area,
        "slot":       p.slot,
        "parkingId":  parking_id,
    })
    await manager.broadcast_to_room(
        f"{p.facility}:{p.area}",
        {"event": "slot_freed", "slot": p.slot},
    )

    return result


# ── Pay fine ──────────────────────────────────────────────────────────────────
@router.post("/{parking_id}/pay-fine", summary="Pay outstanding fine for a session")
async def pay_fine(
    parking_id:   str,
    req:          schemas.PayFineRequest,
    db:           Session      = Depends(get_db),
    current_user: models.User  = Depends(auth_utils.get_current_user),
):
    p = db.query(models.ParkingSession).filter(
        models.ParkingSession.id      == parking_id,
        models.ParkingSession.user_id == current_user.id,
    ).first()
    if not p:
        raise HTTPException(404, "Parking session not found")
    if p.fine_paid:
        raise HTTPException(400, "Fine already paid")

    now = int(time.time() * 1000)
    ot  = calc_overtime(p, now)

    # Recalculate total including any accumulated overtime
    total_fine = max(p.fine or 0, ot["suggested_fine"])

    p.fine             = total_fine
    p.fine_paid        = True
    p.fine_paid_method = req.method
    p.fine_paid_time   = now
    if not p.fine_reason and ot["is_overtime"]:
        p.fine_reason  = f"Overtime ({ot['ot_hours']:.1f}h)"

    db.commit()

    await manager.broadcast_all({
        "event":      "fine_paid",
        "parkingId":  parking_id,
        "userEmail":  current_user.email,
        "amount":     total_fine,
        "method":     req.method,
    })

    return {
        "message": f"Payment of ₹{total_fine:,} via {req.method.upper()} confirmed!",
        "amount":  total_fine,
    }


# ── Single parking by ID (for re-park / ticket) ───────────────────────────────
@router.get("/{parking_id}", summary="Get a specific parking record by ID")
def get_parking(
    parking_id:   str,
    db:           Session      = Depends(get_db),
    current_user: models.User  = Depends(auth_utils.get_current_user),
):
    p = db.query(models.ParkingSession).filter(
        models.ParkingSession.id == parking_id,
    ).first()
    if not p:
        raise HTTPException(404, "Parking not found")
    # Users can only see their own; admins can see all
    if p.user_id != current_user.id and current_user.tier != "admin":
        raise HTTPException(403, "Access denied")
    return parking_to_dict(p)
