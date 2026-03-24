"""
utils.py — Shared constants, overtime calculations, and parking serialiser.

All constants are kept identical to the frontend (app.js) so the
fine / warning logic is always in sync.
"""
import math
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models import ParkingSession

# ── Constants (mirror frontend app.js) ───────────────────────────────────────
FREE_HOURS              = 12       # free-plan free hours
PAID_HOURS              = 20       # premium-plan free hours
WARN_BEFORE             = 2        # warn N hours BEFORE overtime starts
FINE_FREE               = 50       # ₹ / hr  for free-plan users
FINE_PAID               = 30       # ₹ / hr  for premium users
FINE_FAMILY             = 0        # family plan — no fines ever
AUTO_FINE_INTERVAL_MINS = 60       # scheduler cadence
PLAN_EXPIRY_MS          = 60 * 24 * 60 * 60 * 1000   # 60 days in ms

ADMIN_EMAIL = "admin@smartpark.com"
ADMIN_PASS  = "Admin@123"


# ── Tier helpers ──────────────────────────────────────────────────────────────
def get_free_hours(tier: str) -> float:
    if tier == "family":
        return float("inf")
    return PAID_HOURS if tier == "premium" else FREE_HOURS

def get_fine_per_hour(tier: str) -> int:
    if tier == "family":
        return FINE_FAMILY
    return FINE_PAID if tier == "premium" else FINE_FREE

def get_max_vehicles(tier: str) -> int:
    return 5 if tier in ("premium", "family") else 1


# ── Overtime calculator ───────────────────────────────────────────────────────
def calc_overtime(p: "ParkingSession", now: int = None) -> dict:
    """
    Returns a dict with overtime details for a parking session.
    ``now`` is epoch-ms; defaults to current time.
    """
    if now is None:
        now = int(time.time() * 1000)

    hrs    = (now - p.start_time) / 3_600_000
    free_h = get_free_hours(p.user_tier)
    fine_ph= get_fine_per_hour(p.user_tier)

    if p.user_tier == "family":
        return {
            "is_overtime":    False,
            "ot_hours":       0.0,
            "suggested_fine": 0,
            "hours_parked":   round(hrs, 2),
            "free_hours":     float("inf"),
            "fine_per_hour":  0,
            "warn_threshold": float("inf"),
        }

    is_over   = hrs > free_h
    ot_hrs    = max(0.0, hrs - free_h) if is_over else 0.0
    suggested = math.ceil(ot_hrs) * fine_ph if is_over else 0

    return {
        "is_overtime":    is_over,
        "ot_hours":       round(ot_hrs, 2),
        "suggested_fine": suggested,
        "hours_parked":   round(hrs, 2),
        "free_hours":     free_h,
        "fine_per_hour":  fine_ph,
        "warn_threshold": free_h - WARN_BEFORE,
    }


# ── Parking → dict (matches frontend localStorage shape) ─────────────────────
def parking_to_dict(p: "ParkingSession") -> dict:
    """
    Serialise a ParkingSession ORM row to a plain dict whose keys match
    the camelCase object shape the frontend stores in localStorage.
    """
    return {
        "id":               p.id,
        "email":            p.user_email,
        "userName":         p.user_name,
        "vehicle": {
            "number": p.vehicle_number,
            "name":   p.vehicle_name,
            "type":   p.vehicle_type,
        },
        "state":            p.state,
        "city":             p.city,
        "facility":         p.facility,
        "area":             p.area,
        "slot":             p.slot,
        "entry":            p.entry,
        "time":             p.start_time,
        "endTime":          p.end_time,
        "fine":             p.fine or 0,
        "fineReason":       p.fine_reason or "",
        "finePaid":         p.fine_paid,
        "finePaidMethod":   p.fine_paid_method,
        "fineTime":         p.fine_time,
        "userTier":         p.user_tier,
        "autoFineApplied":  p.auto_fine_applied or 0,
        "notified10h":      p.notified_warn,
        "notifiedOvertime": p.notified_overtime,
    }
