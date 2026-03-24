"""
schemas.py — Pydantic request / response models
All keys use camelCase where the frontend expects camelCase.
"""
from pydantic import BaseModel
from typing import Optional, List


# ─────────────────────────────────────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    name:     str
    email:    str
    password: str

class LoginRequest(BaseModel):
    email:    str
    password: str

class UserOut(BaseModel):
    id:             int
    name:           str
    email:          str
    tier:           str
    premium_expiry: Optional[int] = None

    model_config = {"from_attributes": True}

class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserOut


# ─────────────────────────────────────────────────────────────────────────────
# Vehicle
# ─────────────────────────────────────────────────────────────────────────────
class VehicleCreate(BaseModel):
    number: str
    type:   str = "car"   # car | bike | truck
    name:   str

class VehicleOut(BaseModel):
    id:     int
    number: str
    type:   str
    name:   str

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────────────────────
# Family
# ─────────────────────────────────────────────────────────────────────────────
class FamilyMemberCreate(BaseModel):
    name:  str
    email: str

class FamilyMemberOut(BaseModel):
    id:    int
    name:  str
    email: str

    model_config = {"from_attributes": True}


# ─────────────────────────────────────────────────────────────────────────────
# Parking
# ─────────────────────────────────────────────────────────────────────────────
class ParkingCreate(BaseModel):
    vehicle_id: int
    state:      str
    city:       str
    facility:   str
    area:       str
    slot:       int
    entry:      str

class VehicleSnapshot(BaseModel):
    number: str
    name:   str
    type:   str

# This dict shape matches the frontend's localStorage parking objects exactly
class ParkingOut(BaseModel):
    id:              str
    email:           str
    userName:        str
    vehicle:         VehicleSnapshot
    state:           str
    city:            str
    facility:        str
    area:            str
    slot:            int
    entry:           str
    time:            int            # start_time (epoch ms)
    endTime:         Optional[int]  # None = still active
    fine:            int
    fineReason:      str
    finePaid:        bool
    finePaidMethod:  Optional[str]
    fineTime:        Optional[int]
    userTier:        str
    autoFineApplied: int
    notified10h:     bool           # warn flag (2h before overtime)
    notifiedOvertime:bool


# ─────────────────────────────────────────────────────────────────────────────
# Fines
# ─────────────────────────────────────────────────────────────────────────────
class ApplyFineRequest(BaseModel):
    amount: int
    reason: str
    notes:  Optional[str] = ""

class PayFineRequest(BaseModel):
    method: str   # upi | card | net | cash


# ─────────────────────────────────────────────────────────────────────────────
# Premium
# ─────────────────────────────────────────────────────────────────────────────
class ActivatePlanRequest(BaseModel):
    plan: str     # premium | family


# ─────────────────────────────────────────────────────────────────────────────
# Slot map
# ─────────────────────────────────────────────────────────────────────────────
class SlotMapOut(BaseModel):
    facility:       str
    area:           str
    total:          int
    occupied:       List[int]
    overtime_slots: List[int]
    available:      int
    parkings:       List[ParkingOut]


# ─────────────────────────────────────────────────────────────────────────────
# Admin stats
# ─────────────────────────────────────────────────────────────────────────────
class AdminStats(BaseModel):
    total_parkings:  int
    active_parkings: int
    overtime_count:  int
    total_fines:     int
    paid_fines:      int
    unpaid_fines:    int
    unique_users:    int
