"""
smoke_test.py — Programmatic end-to-end tests for SmartPark Pro API
Run with:  python3 smoke_test.py
"""
import sys
import requests

BASE = "http://127.0.0.1:8001"
PASS = 0; FAIL = 0

def check(num, label, actual, expected=None, contains=None):
    global PASS, FAIL
    ok = True
    if expected is not None and actual != expected:
        ok = False
    if contains is not None and contains not in str(actual):
        ok = False
    icon = "✅" if ok else "❌"
    print(f"  {icon} {num:02d}. {label}: {actual}")
    if ok: PASS += 1
    else:   FAIL += 1

s = requests.Session()
s.headers.update({"Content-Type": "application/json"})

# 1 — Health
r = s.get(f"{BASE}/health").json()
check(1, "Health",            r["status"], "healthy")

# 2 — Register
r = s.post(f"{BASE}/auth/register",
    json={"name":"Smoke User","email":"smoke@test.com","password":"pass123"}).json()
check(2, "Register email",    r["user"]["email"],   "smoke@test.com")
check(3, "Register tier",     r["user"]["tier"],    "free")

# 4 — User login (demo account seeded on startup)
r = s.post(f"{BASE}/auth/login",
    json={"email":"prathamesh@gmail.com","password":"1304Pra"}).json()
user_token = r["access_token"]
check(4, "User login",        r["user"]["name"],    "Prathamesh")

uh = {"Authorization": f"Bearer {user_token}"}

# 5 — /me
r = s.get(f"{BASE}/auth/me", headers=uh).json()
check(5, "GET /me",           r["email"], "prathamesh@gmail.com")

# 6 — Add vehicle
r = s.post(f"{BASE}/vehicles", headers=uh,
    json={"number":"MH12AB9999","type":"car","name":"Smoke Car"}).json()
vid = r["id"]
check(6, "Add vehicle",       r["number"], "MH12AB9999")

# 7 — List vehicles
r = s.get(f"{BASE}/vehicles", headers=uh).json()
check(7, "List vehicles",     len(r) >= 1, True)

# 8 — Slot availability (all 50 free to start)
r = s.get(f"{BASE}/slots/MIT ADT College - SOC/BN", headers=uh).json()
check(8, "Slot availability", r["total"], 50)

# 9 — Admin login
r = s.post(f"{BASE}/auth/admin-login",
    json={"email":"admin@smartpark.com","password":"Admin@123"}).json()
admin_token = r["access_token"]
check(9, "Admin login",       r["user"]["tier"], "admin")
ah = {"Authorization": f"Bearer {admin_token}"}

# 10 — Admin stats (before any parking)
r = s.get(f"{BASE}/admin/stats", headers=ah).json()
check(10, "Admin stats keys", "total_parkings" in r, True)

# 11 — Save parking
r = s.post(f"{BASE}/parkings", headers=uh, json={
    "vehicle_id": vid, "state": "Maharashtra", "city": "Pune",
    "facility": "MIT ADT College - SOC", "area": "BN",
    "slot": 7, "entry": "Main Entrance"
}).json()
pid = r.get("id","")
check(11, "Save parking ID",  pid[:3], "PKG")
check(12, "Parking slot",     r.get("slot"), 7)
check(13, "Parking endTime",  r.get("endTime"), None)

# 14 — Active sessions
r = s.get(f"{BASE}/parkings/active", headers=uh).json()
check(14, "Active sessions",  len(r), 1)

# 15 — Slot now occupied
r = s.get(f"{BASE}/slots/MIT ADT College - SOC/BN", headers=uh).json()
check(15, "Slot occupied",    7 in r["occupied"], True)
check(16, "Available -1",     r["available"], 49)

# 17 — Duplicate slot blocked
r = s.post(f"{BASE}/parkings", headers=uh, json={
    "vehicle_id": vid, "state": "Maharashtra", "city": "Pune",
    "facility": "MIT ADT College - SOC", "area": "BN",
    "slot": 7, "entry": "Main Entrance"
}).json()
check(17, "Duplicate blocked", "occupied" in r.get("detail",""), True)

# 18 — Admin apply fine
r = s.post(f"{BASE}/admin/fines/{pid}", headers=ah,
    json={"amount": 500, "reason": "Overtime parking", "notes": "Test"}).json()
check(18, "Admin fine",       "500" in r.get("message",""), True)

# 19 — Pay fine
r = s.post(f"{BASE}/parkings/{pid}/pay-fine", headers=uh,
    json={"method": "upi"}).json()
check(19, "Pay fine",         r.get("amount"), 500)

# 20 — Fine log shows record
r = s.get(f"{BASE}/admin/fines", headers=ah).json()
check(20, "Fine log count",   len(r) >= 1, True)

# 21 — Activate premium
r = s.post(f"{BASE}/premium/activate", headers=uh,
    json={"plan": "premium"}).json()
check(21, "Premium activate", r.get("tier"), "premium")

# 22 — Activate family
r = s.post(f"{BASE}/premium/activate", headers=uh,
    json={"plan": "family"}).json()
check(22, "Family activate",  r.get("tier"), "family")

# 23 — Add family member
r = s.post(f"{BASE}/premium/family", headers=uh,
    json={"name": "Aarav", "email": "aarav@family.com"}).json()
check(23, "Family member",    r.get("name"), "Aarav")

# 24 — End parking
r = s.put(f"{BASE}/parkings/{pid}/end", headers=uh).json()
check(24, "End parking",      r.get("endTime") is not None, True)

# 25 — History has record
r = s.get(f"{BASE}/parkings/history", headers=uh).json()
check(25, "History count",    len(r) >= 1, True)

# 26 — Admin slot map (slot freed)
r = s.get(f"{BASE}/admin/slots/MIT ADT College - SOC/BN", headers=ah).json()
check(26, "Slot freed",       7 not in r["occupied"], True)
check(27, "Slot map avail",   r["available"], 50)

# 28 — Admin active parkings (should be 0 now)
r = s.get(f"{BASE}/admin/parkings", headers=ah).json()
check(28, "Admin active 0",   len(r), 0)

# 29 — Admin all users
r = s.get(f"{BASE}/admin/users", headers=ah).json()
check(29, "Admin users ≥1",   len(r) >= 1, True)

# 30 — Premium status endpoint
r = s.get(f"{BASE}/premium/status", headers=uh).json()
check(30, "Premium status",   r.get("tier"), "family")

print(f"\n{'='*40}")
print(f"  Results: {PASS} passed, {FAIL} failed out of {PASS+FAIL} tests")
if FAIL == 0:
    print("  🎉 All tests passed!")
else:
    print("  ⚠️  Some tests failed")
    sys.exit(1)
