"""
scheduler.py — APScheduler async jobs

Jobs registered here:
  1. run_auto_fines()       — every 60 min: apply hourly overtime fines
  2. check_notifications()  — every 1 min : send warn / overtime WS events
"""
import math
import time
import logging

from database import SessionLocal
import models
from utils import (
    FREE_HOURS, PAID_HOURS, FINE_FREE, FINE_PAID,
    get_free_hours, get_fine_per_hour, parking_to_dict
)
from ws_manager import manager

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Job 1 — Auto-fine (runs every 60 minutes)
# ─────────────────────────────────────────────────────────────────────────────
async def run_auto_fines() -> None:
    """
    For every active, non-family session that is in overtime,
    recalculate the fine and update the DB.  Broadcasts a WS event
    so the frontend can update the UI without a page refresh.
    """
    db    = SessionLocal()
    now   = int(time.time() * 1000)
    count = 0

    try:
        active = (
            db.query(models.ParkingSession)
              .filter(models.ParkingSession.end_time.is_(None))
              .all()
        )

        for p in active:
            if p.user_tier == "family":
                continue

            hrs    = (now - p.start_time) / 3_600_000
            free_h = get_free_hours(p.user_tier)

            if hrs <= free_h:
                continue

            ot_hrs  = max(0.0, hrs - free_h)
            fine_ph = get_fine_per_hour(p.user_tier)
            new_fine = math.ceil(ot_hrs) * fine_ph

            if new_fine > (p.auto_fine_applied or 0):
                p.fine             = new_fine
                p.fine_reason      = f"Overtime parking ({ot_hrs:.1f}h)"
                p.fine_time        = now
                p.auto_fine_applied= new_fine
                p.fine_paid        = False
                count             += 1

                await manager.broadcast_all({
                    "event":      "auto_fine",
                    "parkingId":  p.id,
                    "userEmail":  p.user_email,
                    "vehicle":    p.vehicle_number,
                    "facility":   p.facility,
                    "area":       p.area,
                    "slot":       p.slot,
                    "fineAmount": new_fine,
                    "otHours":    round(ot_hrs, 2),
                    "userTier":   p.user_tier,
                })

        if count:
            db.commit()
            logger.info(f"Auto-fine job: updated {count} session(s)")

    except Exception as exc:
        logger.exception(f"Auto-fine job error: {exc}")
        db.rollback()
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# Job 2 — Notification check (runs every 1 minute)
# ─────────────────────────────────────────────────────────────────────────────
async def check_notifications() -> None:
    """
    Sends warn / overtime WS events to connected clients.
    Sets the notified_warn / notified_overtime flags so alerts fire only once.
    """
    db    = SessionLocal()
    now   = int(time.time() * 1000)
    dirty = False

    try:
        active = (
            db.query(models.ParkingSession)
              .filter(models.ParkingSession.end_time.is_(None))
              .all()
        )

        for p in active:
            if p.user_tier == "family":
                continue

            hrs    = (now - p.start_time) / 3_600_000
            free_h = get_free_hours(p.user_tier)
            warn_h = free_h - 2          # 2 h before overtime (mirrors WARN_BEFORE)
            fine_ph= get_fine_per_hour(p.user_tier)

            # ── 2-hour warning ─────────────────────────────────────────────
            if hrs >= warn_h and not p.notified_warn:
                p.notified_warn = True
                dirty = True

                await manager.broadcast_all({
                    "event":         "warn_notification",
                    "parkingId":     p.id,
                    "userEmail":     p.user_email,
                    "vehicle":       p.vehicle_number,
                    "facility":      p.facility,
                    "hoursLeft":     round(free_h - hrs, 2),
                    "finePerHour":   fine_ph,
                    "userTier":      p.user_tier,
                    "message":       (
                        f"⚠️ {p.vehicle_number}: Only "
                        f"{max(0, free_h - hrs):.1f}h before overtime fines "
                        f"of ₹{fine_ph}/hr apply!"
                    ),
                })

            # ── Overtime start ──────────────────────────────────────────────
            if hrs >= free_h and not p.notified_overtime:
                p.notified_overtime = True
                dirty = True

                await manager.broadcast_all({
                    "event":       "overtime_started",
                    "parkingId":   p.id,
                    "userEmail":   p.user_email,
                    "vehicle":     p.vehicle_number,
                    "facility":    p.facility,
                    "area":        p.area,
                    "slot":        p.slot,
                    "finePerHour": fine_ph,
                    "userTier":    p.user_tier,
                    "message":     (
                        f"🚨 {p.vehicle_number} is now in OVERTIME! "
                        f"₹{fine_ph}/hr fine is being charged."
                    ),
                })

        if dirty:
            db.commit()

    except Exception as exc:
        logger.exception(f"Notification check error: {exc}")
        db.rollback()
    finally:
        db.close()
