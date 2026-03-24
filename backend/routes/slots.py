"""
routers/slots.py — User-facing slot availability
  GET /slots/{facility}/{area}
      Returns which slot numbers are occupied so the frontend can render
      the parking grid.  No admin required.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
import auth as auth_utils
from database import get_db

router = APIRouter(prefix="/slots", tags=["Slots"])


@router.get("/{facility}/{area}", summary="Available slots in a facility/area")
def get_slot_availability(
    facility:     str,
    area:         str,
    db:           Session      = Depends(get_db),
    current_user: models.User  = Depends(auth_utils.get_current_user),
):
    occupied_rows = (
        db.query(models.ParkingSession.slot)
          .filter(
              models.ParkingSession.facility == facility,
              models.ParkingSession.area     == area,
              models.ParkingSession.end_time.is_(None),
          )
          .all()
    )
    occupied = [r.slot for r in occupied_rows]

    return {
        "facility":  facility,
        "area":      area,
        "total":     50,
        "occupied":  occupied,
        "available": 50 - len(occupied),
    }
