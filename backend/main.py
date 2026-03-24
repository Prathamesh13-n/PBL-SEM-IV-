"""
main.py — SmartPark Pro FastAPI application

Start with:
    uvicorn main:app --reload --port 8000

Interactive docs:
    http://localhost:8000/docs
    http://localhost:8000/redoc
"""
import json
import logging
import time
from contextlib import asynccontextmanager
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

import auth as auth_utils
import models
from database import SessionLocal, engine
from routers import admin, auth, parkings, premium, slots, vehicles
from scheduler import check_notifications, run_auto_fines
from utils import ADMIN_EMAIL, ADMIN_PASS
from ws_manager import manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
)
logger = logging.getLogger("smartpark")

# Create all DB tables on startup
models.Base.metadata.create_all(bind=engine)

scheduler = AsyncIOScheduler()


# ── Application lifespan ──────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1 — Seed admin user if not present
    db = SessionLocal()
    try:
        if not db.query(models.User).filter(models.User.email == ADMIN_EMAIL).first():
            db.add(
                models.User(
                    name       = "Admin",
                    email      = ADMIN_EMAIL,
                    password   = auth_utils.hash_password(ADMIN_PASS),
                    tier       = "admin",
                    created_at = int(time.time() * 1000),
                )
            )
            db.commit()
            logger.info("Admin user seeded")

        # 2 — Seed demo user if no users exist (besides admin)
        non_admin = db.query(models.User).filter(models.User.tier != "admin").count()
        if non_admin == 0:
            demo = models.User(
                name       = "Prathamesh",
                email      = "prathamesh@gmail.com",
                password   = auth_utils.hash_password("1304Pra"),
                tier       = "free",
                created_at = int(time.time() * 1000),
            )
            db.add(demo)
            db.commit()
            logger.info("Demo user seeded  (prathamesh@gmail.com / 1304Pra)")
    finally:
        db.close()

    # 3 — Start background scheduler
    scheduler.add_job(
        run_auto_fines,
        trigger  = "interval",
        minutes  = 60,
        id       = "auto_fines",
        max_instances = 1,
    )
    scheduler.add_job(
        check_notifications,
        trigger  = "interval",
        minutes  = 1,
        id       = "notifications",
        max_instances = 1,
    )
    scheduler.start()
    logger.info("Scheduler started — auto-fines every 60 min, notifications every 1 min")

    yield  # ← app runs here

    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title       = "SmartPark Pro API",
    description = (
        "REST + WebSocket backend for SmartPark Pro.\n\n"
        "**Test credentials**\n"
        "- User: `prathamesh@gmail.com` / `1304Pra`\n"
        "- Admin: `admin@smartpark.com` / `Admin@123`\n\n"
        "Authenticate via `/auth/login` or `/auth/admin-login` to get a Bearer token, "
        "then click **Authorize** and paste it."
    ),
    version  = "1.0.0",
    lifespan = lifespan,
)

# CORS — allow the HTML frontend (served from file:// or a local dev server)
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],   # ← restrict to your domain in production
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(vehicles.router)
app.include_router(parkings.router)
app.include_router(admin.router)
app.include_router(premium.router)
app.include_router(slots.router)


# ── WebSocket — real-time slot updates ────────────────────────────────────────
@app.websocket("/ws/slots")
async def websocket_endpoint(
    websocket: WebSocket,
    facility:  Optional[str] = Query(default=None, description="Subscribe to a specific facility"),
    area:      Optional[str] = Query(default=None, description="Subscribe to a specific area"),
):
    """
    Connect to receive real-time slot events.

    **Room subscription:**  pass `?facility=Phoenix+Marketcity&area=B1` to receive
    only events for that facility/area combination.  Omit both to receive all events.

    **Event types** (JSON objects sent by the server):
    | event               | when it fires                              |
    |---------------------|--------------------------------------------|
    | `slot_occupied`     | new parking saved                          |
    | `slot_freed`        | session ended (by user or admin)           |
    | `fine_applied`      | admin applied a fine                       |
    | `fine_paid`         | user paid a fine                           |
    | `auto_fine`         | scheduler charged an overtime fine         |
    | `warn_notification` | user approaching overtime limit (2h left)  |
    | `overtime_started`  | user has entered overtime                  |

    **Keepalive:** send `{"type":"ping"}` — the server replies `{"type":"pong"}`.
    """
    room = f"{facility}:{area}" if facility and area else "global"
    await manager.connect(websocket, room)
    logger.info(f"WS client joined room={room!r}")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass  # ignore malformed messages
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)
        logger.info(f"WS client left room={room!r}")


# ── Health / root ─────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def root():
    return {
        "app":     "SmartPark Pro API",
        "version": "1.0.0",
        "docs":    "/docs",
        "redoc":   "/redoc",
        "status":  "running",
    }

@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy", "timestamp": int(time.time() * 1000)}
