"""
seed.py — Populate the database with realistic demo data.

Run ONCE after the first server startup:
    python seed.py

Creates:
  • Demo user: prathamesh@gmail.com / 1304Pra  (already seeded by the server)
  • 2 demo vehicles
  • 3 parking sessions that mirror the frontend seedDemoParkings() function
"""
import sys
import time

# Add the project root to the path so imports work
sys.path.insert(0, ".")

from database import SessionLocal, engine
import models
import auth as auth_utils

models.Base.metadata.create_all(bind=engine)

ONE_HOUR = 3_600_000
NOW = int(time.time() * 1000)

db = SessionLocal()

try:
    # ── 1. Ensure demo user exists ─────────────────────────────────────────────
    user = db.query(models.User).filter(models.User.email == "prathamesh@gmail.com").first()
    if not user:
        user = models.User(
            name       = "Prathamesh",
            email      = "prathamesh@gmail.com",
            password   = auth_utils.hash_password("1304Pra"),
            tier       = "free",
            created_at = NOW,
        )
        db.add(user)
        db.flush()
        print("✅ Demo user created")
    else:
        print("ℹ️  Demo user already exists")

    # ── 2. Vehicles ────────────────────────────────────────────────────────────
    existing_nums = {v.number for v in user.vehicles}

    tesla = None
    if "MH12PA1234" not in existing_nums:
        tesla = models.Vehicle(user_id=user.id, number="MH12PA1234", type="car",  name="Tesla Model 3")
        db.add(tesla)

    re = None
    if "MH12RE0007" not in existing_nums:
        re = models.Vehicle(user_id=user.id, number="MH12RE0007", type="bike", name="Royal Enfield")
        db.add(re)

    db.flush()
    print("✅ Vehicles seeded")

    # Refresh to get IDs
    db.refresh(user)
    v1 = db.query(models.Vehicle).filter(models.Vehicle.number == "MH12PA1234").first()
    v2 = db.query(models.Vehicle).filter(models.Vehicle.number == "MH12RE0007").first()

    # ── 3. Counter ─────────────────────────────────────────────────────────────
    counter = db.query(models.ParkingCounter).first()
    if not counter:
        counter = models.ParkingCounter(id=1, counter=1)
        db.add(counter)
        db.flush()

    def next_id():
        n = counter.counter
        counter.counter += 1
        return f"PKG{str(n).zfill(6)}"

    # ── 4. Parking sessions ────────────────────────────────────────────────────
    existing_ids = {p.id for p in db.query(models.ParkingSession.id).all()}

    sessions = [
        # Active — 14 h ago (overtime for free plan → should have fine)
        {
            "start_time": NOW - 14 * ONE_HOUR,
            "end_time":   None,
            "vehicle":    v1,
            "city":       "Pune",
            "facility":   "MIT ADT College - SOC",
            "area":       "BN",
            "slot":       5,
            "entry":      "Main Entrance",
            "tier":       "free",
            "fine":       1000,
            "fine_reason":"Overtime parking (2.0h)",
            "fine_paid":  False,
            "auto_fine_applied": 1000,
        },
        # Active — 2 h ago (within free limit, no fine)
        {
            "start_time": NOW - 2 * ONE_HOUR,
            "end_time":   None,
            "vehicle":    v2,
            "city":       "Pune",
            "facility":   "Phoenix Marketcity",
            "area":       "B1",
            "slot":       12,
            "entry":      "North Gate",
            "tier":       "free",
            "fine":       0,
            "fine_paid":  False,
            "auto_fine_applied": 0,
        },
        # Completed history — premium user, 3 h session
        {
            "start_time": NOW - 25 * ONE_HOUR,
            "end_time":   NOW - 22 * ONE_HOUR,
            "vehicle":    v1,
            "city":       "Mumbai",
            "facility":   "R City Mall",
            "area":       "O2",
            "slot":       25,
            "entry":      "South Gate",
            "tier":       "premium",
            "fine":       0,
            "fine_paid":  False,
            "auto_fine_applied": 0,
        },
    ]

    for s in sessions:
        pid = next_id()
        if pid in existing_ids:
            print(f"  ⏭  {pid} already exists, skipping")
            continue
        p = models.ParkingSession(
            id               = pid,
            user_id          = user.id,
            user_email       = user.email,
            user_name        = user.name,
            user_tier        = s["tier"],
            vehicle_id       = s["vehicle"].id if s["vehicle"] else None,
            vehicle_number   = s["vehicle"].number if s["vehicle"] else "UNKNOWN",
            vehicle_name     = s["vehicle"].name   if s["vehicle"] else "Unknown",
            vehicle_type     = s["vehicle"].type   if s["vehicle"] else "car",
            state            = "Maharashtra",
            city             = s["city"],
            facility         = s["facility"],
            area             = s["area"],
            slot             = s["slot"],
            entry            = s["entry"],
            start_time       = s["start_time"],
            end_time         = s.get("end_time"),
            fine             = s["fine"],
            fine_reason      = s.get("fine_reason", ""),
            fine_paid        = s["fine_paid"],
            auto_fine_applied= s["auto_fine_applied"],
            notified_warn    = True if s["start_time"] < NOW - 10 * ONE_HOUR else False,
            notified_overtime= True if s["fine"] > 0 else False,
        )
        db.add(p)
        print(f"  ➕ Seeded {pid} — {s['facility']} / {s['area']}-{s['slot']}")

    db.commit()
    print("\n🎉 Seed complete!")

except Exception as e:
    db.rollback()
    print(f"\n❌ Seed failed: {e}")
    raise
finally:
    db.close()
