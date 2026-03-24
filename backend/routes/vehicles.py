"""
routers/vehicles.py — List, add and remove vehicles for the current user
"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import models
import schemas
import auth as auth_utils
from database import get_db
from utils import get_max_vehicles

router = APIRouter(prefix="/vehicles", tags=["Vehicles"])


@router.get("", response_model=List[schemas.VehicleOut], summary="List my vehicles")
def get_vehicles(current_user: models.User = Depends(auth_utils.get_current_user)):
    return current_user.vehicles


@router.post("", response_model=schemas.VehicleOut, summary="Register a new vehicle")
def add_vehicle(
    vehicle: schemas.VehicleCreate,
    db:      Session      = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    number  = vehicle.number.strip().upper()
    max_v   = get_max_vehicles(current_user.tier)

    if len(current_user.vehicles) >= max_v:
        raise HTTPException(
            400,
            f"Vehicle limit reached ({max_v} for {current_user.tier} plan). Upgrade to add more.",
        )
    if db.query(models.Vehicle).filter(
        models.Vehicle.user_id == current_user.id,
        models.Vehicle.number  == number,
    ).first():
        raise HTTPException(400, "Vehicle already registered")

    v = models.Vehicle(
        user_id = current_user.id,
        number  = number,
        type    = vehicle.type,
        name    = vehicle.name.strip() or f"My {vehicle.type}",
    )
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


@router.delete("/{vehicle_id}", summary="Remove a vehicle")
def remove_vehicle(
    vehicle_id: int,
    db:         Session      = Depends(get_db),
    current_user: models.User = Depends(auth_utils.get_current_user),
):
    v = db.query(models.Vehicle).filter(
        models.Vehicle.id      == vehicle_id,
        models.Vehicle.user_id == current_user.id,
    ).first()
    if not v:
        raise HTTPException(404, "Vehicle not found")

    db.delete(v)
    db.commit()
    return {"message": f"Vehicle {v.number} removed"}
