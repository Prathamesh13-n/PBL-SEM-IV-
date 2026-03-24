# SmartPark Pro — FastAPI Backend

> Python · FastAPI · SQLite · WebSockets · APScheduler

A full REST + WebSocket backend for the SmartPark Pro intelligent parking system.
Mirrors every feature of the HTML/JS frontend — auth, vehicles, parking sessions,
overtime fines, premium plans, family packs, admin panel, and live slot map.

---

## Quick Start

```bash
# 1. Clone / copy this folder, then:
cd smartpark-backend

# 2. Create a virtual environment (recommended)
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Start the server
uvicorn main:app --reload --port 8000

# 5. (Optional) Seed demo parking data
python seed.py
```

Server is now live at **http://localhost:8000**

| URL | Description |
|-----|-------------|
| http://localhost:8000/docs | Swagger interactive docs |
| http://localhost:8000/redoc | ReDoc docs |
| http://localhost:8000/health | Health check |

---

## Test Credentials

| Role | Email | Password |
|------|-------|----------|
| User (demo) | prathamesh@gmail.com | 1304Pra |
| Admin | admin@smartpark.com | Admin@123 |

Both accounts are **auto-seeded** on first startup — no manual setup needed.

---

## Project Structure

```
smartpark-backend/
├── main.py              ← FastAPI app, lifespan, WebSocket endpoint
├── database.py          ← SQLAlchemy engine + session factory (SQLite)
├── models.py            ← ORM table definitions (5 tables)
├── schemas.py           ← Pydantic request / response models
├── auth.py              ← JWT creation, password hashing, auth dependencies
├── utils.py             ← Constants, overtime calculator, parking serialiser
├── ws_manager.py        ← WebSocket connection manager (rooms + global)
├── scheduler.py         ← APScheduler jobs (auto-fines + notifications)
├── seed.py              ← Demo data seeder script
├── test_api.py          ← 50-test suite using FastAPI TestClient
├── requirements.txt
└── routers/
    ├── auth.py          ← /auth/*
    ├── vehicles.py      ← /vehicles/*
    ├── parkings.py      ← /parkings/*
    ├── admin.py         ← /admin/*
    ├── premium.py       ← /premium/*
    └── slots.py         ← /slots/*
```

---

## API Reference

### Auth  `/auth`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | — | Create user account |
| POST | `/auth/login` | — | User login → JWT |
| POST | `/auth/admin-login` | — | Admin login → JWT |
| GET  | `/auth/me` | User | Current user profile |

**Login response** (all three endpoints return the same shape):
```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "user": { "id": 1, "name": "Prathamesh", "email": "...", "tier": "free" }
}
```

Pass the token in every subsequent request:
```
Authorization: Bearer eyJ...
```

---

### Vehicles  `/vehicles`

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/vehicles` | List my vehicles |
| POST   | `/vehicles` | Add a vehicle |
| DELETE | `/vehicles/{id}` | Remove a vehicle |

**Add vehicle body:**
```json
{ "number": "MH12AB1234", "type": "car", "name": "Honda City" }
```
`type` → `car` · `bike` · `truck`

**Limits:** Free plan = 1 vehicle · Premium / Family = 5 vehicles

---

### Parking  `/parkings`

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/parkings` | Save a new parking session |
| GET    | `/parkings/active` | My active sessions |
| GET    | `/parkings/history` | My completed sessions |
| GET    | `/parkings/{id}` | Single session by ID |
| PUT    | `/parkings/{id}/end` | End a session |
| POST   | `/parkings/{id}/pay-fine` | Pay outstanding fine |

**Save parking body:**
```json
{
  "vehicle_id": 1,
  "state":    "Maharashtra",
  "city":     "Pune",
  "facility": "MIT ADT College - SOC",
  "area":     "BN",
  "slot":     7,
  "entry":    "Main Entrance"
}
```

**Pay fine body:**
```json
{ "method": "upi" }
```
`method` → `upi` · `card` · `net` · `cash`

---

### Slots  `/slots`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/slots/{facility}/{area}` | Occupied + available slot numbers |

```json
{
  "facility": "MIT ADT College - SOC",
  "area": "BN",
  "total": 50,
  "occupied": [5, 12, 23],
  "available": 47
}
```

---

### Premium  `/premium`

| Method | Path | Description |
|--------|------|-------------|
| POST   | `/premium/activate` | Activate premium or family plan |
| GET    | `/premium/status` | Current plan + expiry |
| GET    | `/premium/family` | List family members |
| POST   | `/premium/family` | Add a family member |
| DELETE | `/premium/family/{id}` | Remove a family member |

**Activate body:**
```json
{ "plan": "premium" }   // or "family"
```

| Plan | Price | Free hours | Overtime fine | Vehicles | Family |
|------|-------|-----------|---------------|----------|--------|
| Free | ₹0 | 12h | ₹50/hr | 1 | — |
| Premium | ₹399/2mo | 20h | ₹30/hr | 5 | — |
| Family | ₹999/2mo | ♾️ | ₹0 | 5 each | 3 members |

---

### Admin  `/admin`  *(admin JWT required)*

| Method | Path | Description |
|--------|------|-------------|
| GET    | `/admin/stats` | System-wide statistics |
| GET    | `/admin/parkings` | All active sessions (supports `?q=` search) |
| GET    | `/admin/parkings/all` | All sessions including history |
| GET    | `/admin/overtime` | Sessions currently in overtime |
| GET    | `/admin/fines` | Fine collection log |
| POST   | `/admin/fines/{id}` | Apply a fine |
| PUT    | `/admin/parkings/{id}/end` | Force-end a session |
| GET    | `/admin/slots/{facility}/{area}` | Live slot map with overtime flags |
| GET    | `/admin/users` | All registered users |

**Apply fine body:**
```json
{ "amount": 500, "reason": "Overtime parking", "notes": "Optional notes" }
```

---

## WebSocket  `/ws/slots`

Connect for real-time slot events.

```
ws://localhost:8000/ws/slots
ws://localhost:8000/ws/slots?facility=Phoenix+Marketcity&area=B1
```

Omit query params to receive **all** events globally.
Add `facility` + `area` to subscribe to a **specific room**.

### Events sent by the server

```jsonc
// New parking saved
{ "event": "slot_occupied", "facility": "...", "area": "B1", "slot": 7, "parking": {...} }

// Session ended
{ "event": "slot_freed", "facility": "...", "area": "B1", "slot": 7 }

// Admin applied a fine
{ "event": "fine_applied", "parkingId": "PKG000001", "amount": 500, "reason": "..." }

// User paid a fine
{ "event": "fine_paid", "parkingId": "PKG000001", "amount": 500, "method": "upi" }

// Scheduler charged overtime
{ "event": "auto_fine", "parkingId": "PKG000001", "fineAmount": 100, "otHours": 2.0 }

// 2h warning before overtime
{ "event": "warn_notification", "parkingId": "...", "hoursLeft": 1.8, "message": "⚠️ ..." }

// Overtime started
{ "event": "overtime_started", "parkingId": "...", "finePerHour": 50, "message": "🚨 ..." }
```

### Keepalive
```json
→ { "type": "ping" }
← { "type": "pong" }
```

### JavaScript example (drop into the frontend)
```javascript
const ws = new WebSocket(
  'ws://localhost:8000/ws/slots?facility=MIT+ADT+College+-+SOC&area=BN'
);

ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.event === 'slot_occupied') updateSlot(msg.slot, 'occupied');
  if (msg.event === 'slot_freed')    updateSlot(msg.slot, 'free');
  if (msg.event === 'auto_fine')     showToast(`💸 Auto-fine ₹${msg.fineAmount}`, 'error');
  if (msg.event === 'warn_notification') showToast(msg.message, 'warning');
  if (msg.event === 'overtime_started')  showToast(msg.message, 'error');
};

// Keepalive
setInterval(() => ws.send(JSON.stringify({ type: 'ping' })), 30000);
```

---

## Background Scheduler

Two jobs run automatically — no configuration needed.

| Job | Interval | What it does |
|-----|----------|-------------|
| `run_auto_fines` | Every 60 min | Calculates and applies overtime fines for all active non-family sessions |
| `check_notifications` | Every 1 min | Fires `warn_notification` (2h before overtime) and `overtime_started` WS events |

---

## Connecting the Frontend

Add this block to your `app.js` to swap `localStorage` for the real API.

### 1. Store the JWT
```javascript
const API = 'http://localhost:8000';
let apiToken = null;

async function apiLogin(email, password) {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.detail);
  apiToken = d.access_token;
  return d.user;
}
```

### 2. Authenticated helper
```javascript
async function api(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    const e = await r.json();
    throw new Error(e.detail || 'API error');
  }
  return r.json();
}
```

### 3. Replace localStorage calls
```javascript
// Was:   savedParkings.push(parking); localStorage.setItem(...)
// Now:
const parking = await api('POST', '/parkings', { vehicle_id, state, city, facility, area, slot, entry });

// Was:   savedParkings.filter(p => !p.endTime && p.email === currentUser.email)
// Now:
const active = await api('GET', '/parkings/active');

// Was:   savedParkings[idx].endTime = Date.now(); localStorage.setItem(...)
// Now:
await api('PUT', `/parkings/${id}/end`);
```

---

## Running Tests

```bash
python3 test_api.py
```

Runs 50 in-process tests covering every endpoint — no server required.

Expected output:
```
── Auth ────────────────────────────────────────────────────
  ✅ 01. Health: healthy
  ✅ 02. Register tier: free
  ...
══════════════════════════════════════════════════════
  Results: 50 passed  |  0 failed  |  50 total
  🎉  All tests passed — backend is production-ready!
```

---

## Environment Variables

For production, set these before running:

```bash
# In auth.py — replace the default with a strong random string
SECRET_KEY=your_super_secret_jwt_key_here

# Database (default: SQLite file in project root)
DATABASE_URL=sqlite:///./smartpark.db

# For PostgreSQL (install psycopg2 first):
# DATABASE_URL=postgresql://user:pass@localhost/smartpark
```

---

## Production Checklist

- [ ] Change `SECRET_KEY` in `auth.py` to a long random string
- [ ] Set `allow_origins` in `main.py` CORS to your actual domain
- [ ] Use PostgreSQL instead of SQLite for multi-worker deployments
- [ ] Run behind a reverse proxy (nginx / Caddy) with HTTPS
- [ ] Use `uvicorn main:app --workers 4` (not `--reload`) in production
- [ ] Set `AUTO_FINE_INTERVAL_MINS = 60` in `utils.py` (already default)
