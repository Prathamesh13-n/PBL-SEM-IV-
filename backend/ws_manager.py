"""
ws_manager.py — WebSocket connection manager

Supports two broadcast scopes:
  • room broadcast  — send to all sockets subscribed to a specific "facility:area" room
  • global broadcast— send to every connected socket (used for admin panel, fine alerts, etc.)
"""
import json
import logging
from typing import Dict, List
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self):
        # room_id (e.g. "Phoenix Marketcity:B1") → list of websockets
        self.rooms: Dict[str, List[WebSocket]] = {}

        # flat list of every connected socket (for global broadcasts)
        self.all:   List[WebSocket] = []

    # ── Connection lifecycle ──────────────────────────────────────────────────
    async def connect(self, websocket: WebSocket, room: str = "global") -> None:
        await websocket.accept()
        self.rooms.setdefault(room, []).append(websocket)
        self.all.append(websocket)
        logger.info(f"WS connected — room={room!r}  total={len(self.all)}")

    def disconnect(self, websocket: WebSocket, room: str = "global") -> None:
        self.rooms.get(room, [])
        self.rooms[room] = [ws for ws in self.rooms.get(room, []) if ws is not websocket]
        self.all          = [ws for ws in self.all if ws is not websocket]
        logger.info(f"WS disconnected — room={room!r}  total={len(self.all)}")

    # ── Broadcast helpers ─────────────────────────────────────────────────────
    async def broadcast_to_room(self, room: str, data: dict) -> None:
        """Send a message to all sockets in one specific room."""
        dead: List[WebSocket] = []
        for ws in self.rooms.get(room, []):
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        self._prune(dead, room)

    async def broadcast_all(self, data: dict) -> None:
        """Send a message to every connected socket."""
        dead: List[WebSocket] = []
        for ws in self.all:
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        self._prune(dead)

    # ── Internal cleanup ──────────────────────────────────────────────────────
    def _prune(self, dead: List[WebSocket], room: str = None) -> None:
        """Remove stale / closed websockets."""
        for ws in dead:
            self.all = [x for x in self.all if x is not ws]
            if room:
                self.rooms[room] = [x for x in self.rooms.get(room, []) if x is not ws]
            else:
                for r in self.rooms:
                    self.rooms[r] = [x for x in self.rooms[r] if x is not ws]


# Module-level singleton — imported by routers and scheduler
manager = ConnectionManager()


# ── WebSocket event types ─────────────────────────────────────────────────────
# These string constants are used by both server and frontend:
#
#   slot_occupied    — a new parking session was created
#   slot_freed       — a session was ended (by user or admin)
#   fine_applied     — admin applied a fine
#   fine_paid        — user paid a fine
#   auto_fine        — scheduler applied an auto-fine for overtime
#   warn_notification— user approaching overtime limit
#   overtime_started — user has entered overtime
