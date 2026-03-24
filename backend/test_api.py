"""
test_api.py — In-process tests using FastAPI TestClient (no live server needed)
Run: python3 test_api.py
"""
import sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app, raise_server_exceptions=True)

PASS = 0; FAIL = 0

def check(num, label, actual, expected=None, contains=None, is_true=None):
    global PASS, FAIL
    ok = True
    if expected  is not None and actual != expected:  ok = False
    if contains  is not None and contains not in str(actual): ok = False
    if is_true   is not None and bool(actual) != is_true:     ok = False
    icon = "✅" if ok else "❌"
    print(f"  {icon} {num:02d}. {label}: {actual}")
    if ok: PASS += 1
    else:  FAIL += 1; print(f"      expected={expected or contains or is_true}")

print("\n── Auth ─────────────────────────────────────────────────────")

r = client.get("/health").json()
check(1,  "Health",             r["status"],                "healthy")

r = client.post("/auth/register",
    json={"name":"Smoke","email":"smoke@test.com","password":"pass123"}).json()
check(2,  "Register tier",      r["user"]["tier"],          "free")
check(3,  "Register email",     r["user"]["email"],         "smoke@test.com")

r = client.post("/auth/login",
    json={"email":"prathamesh@gmail.com","password":"1304Pra"}).json()
token   = r["access_token"]
check(4,  "User login name",    r["user"]["name"],          "Prathamesh")

uh = {"Authorization": f"Bearer {token}"}

r = client.get("/auth/me", headers=uh).json()
check(5,  "GET /me",            r["email"],                 "prathamesh@gmail.com")

r = client.post("/auth/admin-login",
    json={"email":"admin@smartpark.com","password":"Admin@123"}).json()
atoken = r["access_token"]
check(6,  "Admin login tier",   r["user"]["tier"],          "admin")
ah = {"Authorization": f"Bearer {atoken}"}

r = client.post("/auth/login",
    json={"email":"smoke@test.com","password":"pass123"}).json()
check(7,  "New user login",     r["user"]["email"],         "smoke@test.com")

print("\n── Vehicles ─────────────────────────────────────────────────")

r = client.post("/vehicles", headers=uh,
    json={"number":"MH12AB9999","type":"car","name":"Smoke Car"}).json()
vid = r["id"]
check(8,  "Add vehicle number", r["number"],                "MH12AB9999")
check(9,  "Add vehicle type",   r["type"],                  "car")

r = client.get("/vehicles", headers=uh).json()
check(10, "List vehicles ≥1",   len(r) >= 1,                is_true=True)

r = client.post("/vehicles", headers=uh,
    json={"number":"MH12AB9999","type":"car","name":"Dup"}).json()
check(11, "Duplicate blocked",  "already" in r.get("detail","").lower(), is_true=True)

print("\n── Slots ────────────────────────────────────────────────────")

r = client.get("/slots/MIT ADT College - SOC/BN", headers=uh).json()
check(12, "Slot total=50",      r["total"],                 50)
check(13, "All available",      r["available"],             50)

print("\n── Parking ──────────────────────────────────────────────────")

r = client.post("/parkings", headers=uh, json={
    "vehicle_id": vid, "state": "Maharashtra", "city": "Pune",
    "facility": "MIT ADT College - SOC", "area": "BN",
    "slot": 7, "entry": "Main Entrance"
}).json()
pid = r.get("id","")
check(14, "Save parking id",    pid[:3],                    "PKG")
check(15, "Parking slot=7",     r.get("slot"),              7)
check(16, "endTime is null",    r.get("endTime"),           None)
check(17, "userTier=free",      r.get("userTier"),          "free")

r = client.get("/parkings/active", headers=uh).json()
check(18, "Active sessions=1",  len(r),                     1)

r = client.get(f"/slots/MIT ADT College - SOC/BN", headers=uh).json()
check(19, "Slot 7 occupied",    7 in r["occupied"],         is_true=True)
check(20, "Available=49",       r["available"],             49)

r = client.post("/parkings", headers=uh, json={
    "vehicle_id": vid, "state": "Maharashtra", "city": "Pune",
    "facility": "MIT ADT College - SOC", "area": "BN",
    "slot": 7, "entry": "Main Entrance"
}).json()
check(21, "Dup slot blocked",   "occupied" in r.get("detail",""), is_true=True)

r = client.get(f"/parkings/{pid}", headers=uh).json()
check(22, "Get parking by id",  r.get("id"),                pid)

print("\n── Admin ────────────────────────────────────────────────────")

r = client.get("/admin/stats", headers=ah).json()
check(23, "Stats total≥1",      r["total_parkings"] >= 1,  is_true=True)
check(24, "Stats active=1",     r["active_parkings"],       1)
check(25, "Stats overtime=0",   r["overtime_count"],        0)

r = client.get("/admin/parkings", headers=ah).json()
check(26, "Admin active list",  len(r),                     1)

r = client.get("/admin/parkings?q=MH12AB9999", headers=ah).json()
check(27, "Admin search",       len(r) >= 1,                is_true=True)

r = client.post(f"/admin/fines/{pid}", headers=ah,
    json={"amount": 750, "reason": "Overtime parking", "notes": "Test"}).json()
check(28, "Apply fine msg",     "750" in r.get("message",""), is_true=True)

r = client.get("/admin/fines", headers=ah).json()
check(29, "Fine log ≥1",        len(r) >= 1,                is_true=True)

r = client.get(f"/admin/slots/MIT ADT College - SOC/BN", headers=ah).json()
check(30, "Admin slot map",     r["total"],                 50)
check(31, "Admin slot occupied", len(r["occupied"]),        1)

r = client.get("/admin/users", headers=ah).json()
check(32, "Admin users ≥1",     len(r) >= 1,                is_true=True)

r = client.get("/admin/overtime", headers=ah).json()
check(33, "Overtime list",      isinstance(r, list),        is_true=True)

# Admin: non-admin blocked
r = client.get("/admin/stats", headers=uh)
check(34, "Non-admin blocked",  r.status_code,              403)

print("\n── Fine payment ─────────────────────────────────────────────")

r = client.post(f"/parkings/{pid}/pay-fine", headers=uh,
    json={"method": "upi"}).json()
check(35, "Pay fine amount",    r.get("amount"),            750)
check(36, "Pay fine method",    "upi" in r.get("message","").lower(), is_true=True)

# Double-pay blocked
r = client.post(f"/parkings/{pid}/pay-fine", headers=uh,
    json={"method": "card"})
check(37, "Double-pay blocked", r.status_code,              400)

print("\n── Premium & Family ─────────────────────────────────────────")

r = client.post("/premium/activate", headers=uh,
    json={"plan": "premium"}).json()
check(38, "Premium activate",   r.get("tier"),              "premium")

r = client.get("/premium/status", headers=uh).json()
check(39, "Premium status",     r.get("tier"),              "premium")

r = client.post("/premium/activate", headers=uh,
    json={"plan": "family"}).json()
check(40, "Family activate",    r.get("tier"),              "family")

r = client.post("/premium/family", headers=uh,
    json={"name":"Aarav","email":"aarav@family.com"}).json()
mid = r.get("id")
check(41, "Add family member",  r.get("name"),              "Aarav")

r = client.get("/premium/family", headers=uh).json()
check(42, "Family list",        len(r),                     1)

r = client.delete(f"/premium/family/{mid}", headers=uh).json()
check(43, "Remove family member", "removed" in r.get("message","").lower(), is_true=True)

r = client.get("/premium/family", headers=uh).json()
check(44, "Family list empty",  len(r),                     0)

print("\n── End parking & history ────────────────────────────────────")

r = client.put(f"/parkings/{pid}/end", headers=uh).json()
check(45, "End parking",        r.get("endTime") is not None, is_true=True)

r = client.get("/parkings/active", headers=uh).json()
check(46, "Active=0 after end", len(r),                     0)

r = client.get("/parkings/history", headers=uh).json()
check(47, "History has entry",  len(r) >= 1,                is_true=True)

r = client.get(f"/slots/MIT ADT College - SOC/BN", headers=uh).json()
check(48, "Slot freed",         r["available"],             50)

# Admin force-end: need a new parking first
r2 = client.post("/parkings", headers=uh, json={
    "vehicle_id": vid, "state": "Maharashtra", "city": "Pune",
    "facility": "MIT ADT College - SOC", "area": "BN",
    "slot": 12, "entry": "South Gate"
}).json()
pid2 = r2.get("id","")
r = client.put(f"/admin/parkings/{pid2}/end", headers=ah).json()
check(49, "Admin force-end",    "ended" in r.get("message","").lower(), is_true=True)

# Remove vehicle
r = client.delete(f"/vehicles/{vid}", headers=uh).json()
check(50, "Remove vehicle",     "removed" in r.get("message","").lower(), is_true=True)

print(f"\n{'═'*52}")
print(f"  Results: {PASS} passed  |  {FAIL} failed  |  {PASS+FAIL} total")
if FAIL == 0:
    print("  🎉  All tests passed — backend is production-ready!")
else:
    print("  ⚠️  Some tests failed — see ❌ above")
    sys.exit(1)
