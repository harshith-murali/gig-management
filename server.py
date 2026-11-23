#!/usr/bin/env python3
"""Sahaaya cooperative services web app: stdlib HTTP API + SQLite."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
import uuid
from datetime import date
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parent
UI_DIR = ROOT / "ui"
DB_PATH = Path(os.environ.get("SAHAAYA_DB_PATH", ROOT / "data" / "sahaaya.sqlite3"))
PORT = int(os.environ.get("PORT", "8000"))
SESSION_SECONDS = 60 * 60 * 24 * 14
PBKDF2_ROUNDS = 310_000
AREAS = ["Indiranagar", "Domlur", "HAL"]
SERVICES = {
    "electrician": {"name": "Electrical repair", "skill": "Electrician", "description": "Repairs, switches, lights and wiring.", "base_price": 450, "wage_floor": 350},
    "plumber": {"name": "Plumbing service", "skill": "Plumber", "description": "Leaks, fittings, taps and everyday fixes.", "base_price": 600, "wage_floor": 450},
    "carpenter": {"name": "Carpentry service", "skill": "Carpenter", "description": "Furniture repair, doors and small builds.", "base_price": 550, "wage_floor": 420},
    "care-worker": {"name": "Care support", "skill": "Care worker", "description": "Reliable daily and community care.", "base_price": 700, "wage_floor": 500},
}
INIT_LOCK = threading.Lock()


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=15)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA journal_mode = WAL")
    return db


def password_digest(password: str, salt: bytes | None = None) -> tuple[str, str]:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ROUNDS)
    return salt.hex(), digest.hex()


def init_database() -> None:
    with INIT_LOCK, connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                role TEXT NOT NULL CHECK(role IN ('customer','worker','admin')),
                salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS workers (
                user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                skill TEXT NOT NULL,
                cooperative TEXT NOT NULL,
                certificate TEXT NOT NULL DEFAULT '',
                service_areas TEXT NOT NULL,
                verified INTEGER NOT NULL DEFAULT 0,
                available INTEGER NOT NULL DEFAULT 1,
                rating REAL NOT NULL DEFAULT 0,
                last_assigned_at INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK(id=1),
                welfare_rate REAL NOT NULL DEFAULT 0.07,
                operations_rate REAL NOT NULL DEFAULT 0.05
            );
            CREATE TABLE IF NOT EXISTS services (
                slug TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                skill TEXT NOT NULL,
                description TEXT NOT NULL,
                base_price INTEGER NOT NULL,
                wage_floor INTEGER NOT NULL,
                active INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE IF NOT EXISTS bookings (
                id TEXT PRIMARY KEY,
                customer_id TEXT NOT NULL REFERENCES users(id),
                worker_id TEXT REFERENCES users(id),
                service_slug TEXT NOT NULL REFERENCES services(slug),
                address TEXT NOT NULL,
                area TEXT NOT NULL,
                service_date TEXT NOT NULL,
                time_window TEXT NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                quote_total INTEGER NOT NULL,
                payout INTEGER NOT NULL,
                welfare INTEGER NOT NULL,
                operations INTEGER NOT NULL,
                status TEXT NOT NULL,
                declined_workers TEXT NOT NULL DEFAULT '[]',
                created_at INTEGER NOT NULL,
                accepted_at INTEGER,
                started_at INTEGER,
                completed_at INTEGER,
                settled_at INTEGER,
                payment_method TEXT,
                rating INTEGER,
                feedback TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                booking_id TEXT NOT NULL REFERENCES bookings(id),
                worker_id TEXT NOT NULL REFERENCES users(id),
                entry_type TEXT NOT NULL,
                amount INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                UNIQUE(booking_id, entry_type)
            );
            """
        )
        db.execute("INSERT OR IGNORE INTO settings(id) VALUES (1)")
        for slug, service in SERVICES.items():
            db.execute(
                "INSERT OR IGNORE INTO services(slug,name,skill,description,base_price,wage_floor) VALUES (?,?,?,?,?,?)",
                (slug, service["name"], service["skill"], service["description"], service["base_price"], service["wage_floor"]),
            )
        admin = db.execute("SELECT id FROM users WHERE role='admin' LIMIT 1").fetchone()
        if not admin:
            email = os.environ.get("SAHAAYA_ADMIN_EMAIL", "admin@sahaaya.local").strip().lower()
            password = os.environ.get("SAHAAYA_ADMIN_PASSWORD") or secrets.token_urlsafe(18)
            salt, digest = password_digest(password)
            db.execute(
                "INSERT INTO users(id,name,email,role,salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?)",
                (str(uuid.uuid4()), "Federation Admin", email, "admin", salt, digest, int(time.time())),
            )
            if "SAHAAYA_ADMIN_PASSWORD" not in os.environ:
                print(f"\nFirst-run federation login\n  Email: {email}\n  Password: {password}\nSave this password now. It will not be shown again.\n", flush=True)


def public_user(row: sqlite3.Row | dict) -> dict:
    return {"id": row["id"], "name": row["name"], "email": row["email"], "role": row["role"]}


def session_user(db: sqlite3.Connection, raw_token: str | None) -> sqlite3.Row | None:
    if not raw_token:
        return None
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    row = db.execute(
        "SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?",
        (token_hash, int(time.time())),
    ).fetchone()
    return row


def new_session(db: sqlite3.Connection, user_id: str) -> tuple[str, int]:
    raw = secrets.token_urlsafe(32)
    expires = int(time.time()) + SESSION_SECONDS
    db.execute("DELETE FROM sessions WHERE expires_at<=?", (int(time.time()),))
    db.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)", (hashlib.sha256(raw.encode()).hexdigest(), user_id, expires))
    return raw, expires


def quote_for(db: sqlite3.Connection, service_slug: str) -> dict:
    service = db.execute("SELECT * FROM services WHERE slug=? AND active=1", (service_slug,)).fetchone()
    if not service:
        raise ApiError(404, "That service is not available.")
    settings = db.execute("SELECT * FROM settings WHERE id=1").fetchone()
    total = max(1, int(service["base_price"]))
    floor = max(1, int(service["wage_floor"]))
    while True:
        welfare = round(total * settings["welfare_rate"])
        operations = round(total * settings["operations_rate"])
        payout = total - welfare - operations
        if payout >= floor:
            break
        total += 1
    return {"total": total, "payout": payout, "welfare": welfare, "operations": operations, "floor": floor}


def worker_row(db: sqlite3.Connection, user_id: str) -> dict | None:
    row = db.execute(
        "SELECT u.id,u.name,u.email,w.skill,w.cooperative,w.certificate,w.service_areas,w.verified,w.available,w.rating,w.last_assigned_at "
        "FROM users u JOIN workers w ON w.user_id=u.id WHERE u.id=?",
        (user_id,),
    ).fetchone()
    if not row:
        return None
    result = dict(row)
    result["service_areas"] = json.loads(result["service_areas"])
    result["verified"] = bool(result["verified"])
    result["available"] = bool(result["available"])
    result["recent_jobs"] = db.execute(
        "SELECT COUNT(*) FROM bookings WHERE worker_id=? AND created_at>? AND status IN ('offered','confirmed','in_progress','completed','settled')",
        (user_id, int(time.time()) - 7 * 86400),
    ).fetchone()[0]
    return result


def serialize_booking(db: sqlite3.Connection, row: sqlite3.Row) -> dict:
    customer = db.execute("SELECT name,email FROM users WHERE id=?", (row["customer_id"],)).fetchone()
    worker = db.execute("SELECT name,email FROM users WHERE id=?", (row["worker_id"],)).fetchone() if row["worker_id"] else None
    service = db.execute("SELECT name,skill FROM services WHERE slug=?", (row["service_slug"],)).fetchone()
    return {
        "id": row["id"], "service_slug": row["service_slug"], "service": service["name"], "skill": service["skill"],
        "customer": dict(customer), "worker": dict(worker) if worker else None, "worker_id": row["worker_id"],
        "address": row["address"], "area": row["area"], "date": row["service_date"], "time": row["time_window"], "note": row["note"],
        "quote": {"total": row["quote_total"], "payout": row["payout"], "welfare": row["welfare"], "operations": row["operations"]},
        "status": row["status"], "created_at": row["created_at"], "accepted_at": row["accepted_at"],
        "completed_at": row["completed_at"], "settled_at": row["settled_at"], "payment_method": row["payment_method"],
        "rating": row["rating"], "feedback": row["feedback"],
    }


def choose_worker(db: sqlite3.Connection, service_slug: str, area: str, day: str, time_window: str, excluded: list[str] | None = None) -> str | None:
    service = db.execute("SELECT skill FROM services WHERE slug=? AND active=1", (service_slug,)).fetchone()
    if not service:
        return None
    excluded = set(excluded or [])
    rows = db.execute(
        "SELECT u.id,w.service_areas,w.last_assigned_at FROM workers w JOIN users u ON u.id=w.user_id "
        "WHERE w.verified=1 AND w.available=1 AND w.skill=? ORDER BY w.last_assigned_at ASC,u.name COLLATE NOCASE ASC",
        (service["skill"],),
    ).fetchall()
    eligible = []
    cutoff = int(time.time()) - 7 * 86400
    for row in rows:
        if row["id"] in excluded or area not in json.loads(row["service_areas"]):
            continue
        conflict = db.execute(
            "SELECT 1 FROM bookings WHERE worker_id=? AND service_date=? AND time_window=? AND status IN ('offered','confirmed','in_progress') LIMIT 1",
            (row["id"], day, time_window),
        ).fetchone()
        if conflict:
            continue
        workload = db.execute(
            "SELECT COUNT(*) FROM bookings WHERE worker_id=? AND created_at>? AND status IN ('offered','confirmed','in_progress','completed','settled')",
            (row["id"], cutoff),
        ).fetchone()[0]
        eligible.append((workload, int(row["last_assigned_at"]), row["id"]))
    eligible.sort()
    return eligible[0][2] if eligible else None


class Handler(BaseHTTPRequestHandler):
    server_version = "Sahaaya/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} - {fmt % args}")

    def send_json(self, status: int, body: dict, cookie: str | None = None, clear_cookie: bool = False) -> None:
        payload = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if cookie:
            max_age = SESSION_SECONDS
            self.send_header("Set-Cookie", f"sahaaya_session={cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}" + ("; Secure" if os.environ.get("SAHAAYA_SECURE_COOKIE") == "1" else ""))
        elif clear_cookie:
            self.send_header("Set-Cookie", "sahaaya_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0" + ("; Secure" if os.environ.get("SAHAAYA_SECURE_COOKIE") == "1" else ""))
        self.end_headers()
        self.wfile.write(payload)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ApiError(400, "Invalid request size.")
        if length > 64_000:
            raise ApiError(413, "Request is too large.")
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ApiError(400, "Request body must be valid JSON.")
        if not isinstance(body, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        return body

    def cookie_token(self) -> str | None:
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            return None
        morsel = cookie.get("sahaaya_session")
        return morsel.value if morsel else None

    def current_user(self, db: sqlite3.Connection, roles: tuple[str, ...] | None = None) -> sqlite3.Row:
        user = session_user(db, self.cookie_token())
        if not user:
            raise ApiError(401, "Please sign in to continue.")
        if roles and user["role"] not in roles:
            raise ApiError(403, "Your account does not have permission for this action.")
        return user

    def check_origin(self) -> None:
        origin = self.headers.get("Origin")
        if origin and urlsplit(origin).netloc.lower() != self.headers.get("Host", "").lower():
            raise ApiError(403, "Cross-site requests are not allowed.")

    def do_GET(self) -> None:
        path = unquote(urlsplit(self.path).path)
        if path.startswith("/api/"):
            try:
                with connect() as db:
                    if path == "/api/session":
                        user = session_user(db, self.cookie_token())
                        self.send_json(200, {"authenticated": bool(user), "user": public_user(user) if user else None})
                        return
                    if path == "/api/bootstrap":
                        user = self.current_user(db)
                        payload = self.bootstrap(db, user)
                        self.send_json(200, payload)
                        return
                    invoice_match = re.fullmatch(r"/api/bookings/([^/]+)/invoice", path)
                    if invoice_match:
                        user = self.current_user(db)
                        self.send_json(200, self.invoice(db, user, invoice_match.group(1)))
                        return
                    raise ApiError(404, "API route not found.")
            except ApiError as error:
                self.send_json(error.status, {"error": error.message})
            except Exception as error:
                print(f"API error: {error}")
                self.send_json(500, {"error": "The server could not complete that request."})
            return
        self.serve_static(path)

    def do_POST(self) -> None:
        self.check_origin()
        path = unquote(urlsplit(self.path).path)
        if not path.startswith("/api/"):
            self.send_json(404, {"error": "Not found."})
            return
        try:
            data = self.read_json()
            with connect() as db:
                if path == "/api/auth/register":
                    self.register(db, data)
                    return
                if path == "/api/auth/login":
                    self.login(db, data)
                    return
                if path == "/api/auth/logout":
                    token = self.cookie_token()
                    if token:
                        db.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))
                    self.send_json(200, {"ok": True}, clear_cookie=True)
                    return
                if path == "/api/bookings":
                    user = self.current_user(db, ("customer",))
                    self.create_booking(db, user, data)
                    return
                match = re.fullmatch(r"/api/bookings/([^/]+)/(accept|decline|start|complete|cancel|settle|review)", path)
                if match:
                    user = self.current_user(db)
                    self.booking_action(db, user, match.group(1), match.group(2), data)
                    return
                assign_match = re.fullmatch(r"/api/admin/bookings/([^/]+)/assign", path)
                if assign_match:
                    user = self.current_user(db, ("admin",))
                    self.assign_booking(db, user, assign_match.group(1), data)
                    return
                if path == "/api/admin/workers":
                    self.current_user(db, ("admin",))
                    self.add_worker(db, data)
                    return
                raise ApiError(404, "API route not found.")
        except ApiError as error:
            self.send_json(error.status, {"error": error.message})
        except sqlite3.IntegrityError:
            self.send_json(409, {"error": "That account or record already exists."})
        except Exception as error:
            print(f"API error: {error}")
            self.send_json(500, {"error": "The server could not complete that request."})

    def do_PATCH(self) -> None:
        self.check_origin()
        path = unquote(urlsplit(self.path).path)
        try:
            data = self.read_json()
            with connect() as db:
                if path == "/api/workers/availability":
                    user = self.current_user(db, ("worker",))
                    available = bool(data.get("available"))
                    db.execute("UPDATE workers SET available=? WHERE user_id=?", (int(available), user["id"]))
                    self.send_json(200, {"ok": True, "available": available})
                    return
                worker_match = re.fullmatch(r"/api/admin/workers/([^/]+)", path)
                if worker_match:
                    self.current_user(db, ("admin",))
                    self.update_worker(db, worker_match.group(1), data)
                    return
                if path == "/api/admin/settings":
                    self.current_user(db, ("admin",))
                    self.update_settings(db, data)
                    return
                raise ApiError(404, "API route not found.")
        except ApiError as error:
            self.send_json(error.status, {"error": error.message})
        except Exception as error:
            print(f"API error: {error}")
            self.send_json(500, {"error": "The server could not complete that request."})

    def do_DELETE(self) -> None:
        self.check_origin()
        path = unquote(urlsplit(self.path).path)
        match = re.fullmatch(r"/api/admin/workers/([^/]+)", path)
        try:
            with connect() as db:
                self.current_user(db, ("admin",))
                if not match:
                    raise ApiError(404, "API route not found.")
                user_id = match.group(1)
                busy = db.execute("SELECT 1 FROM bookings WHERE worker_id=? LIMIT 1", (user_id,)).fetchone()
                if busy:
                    raise ApiError(409, "This worker has booking history. Pause the profile to preserve the co-operative ledger.")
                db.execute("DELETE FROM users WHERE id=? AND role='worker'", (user_id,))
                self.send_json(200, {"ok": True})
        except ApiError as error:
            self.send_json(error.status, {"error": error.message})
        except Exception as error:
            print(f"API error: {error}")
            self.send_json(500, {"error": "The server could not complete that request."})

    def register(self, db: sqlite3.Connection, data: dict) -> None:
        name = str(data.get("name", "")).strip()[:80]
        email = str(data.get("email", "")).strip().lower()[:254]
        password = str(data.get("password", ""))
        role = str(data.get("role", "customer"))
        if not name or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise ApiError(400, "Enter your name and a valid email address.")
        if len(password) < 10 or len(password) > 128:
            raise ApiError(400, "Use a password between 10 and 128 characters.")
        if role not in ("customer", "worker"):
            raise ApiError(400, "Choose a customer or worker account.")
        skill = str(data.get("skill", ""))
        areas = data.get("areas", [])
        if role == "worker":
            if skill not in {item["skill"] for item in SERVICES.values()}:
                raise ApiError(400, "Choose a valid service skill.")
            if not isinstance(areas, list) or not areas or any(area not in AREAS for area in areas):
                raise ApiError(400, "Select at least one valid service area.")
        salt, digest = password_digest(password)
        user_id = str(uuid.uuid4())
        db.execute("INSERT INTO users(id,name,email,role,salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?)", (user_id, name, email, role, salt, digest, int(time.time())))
        if role == "worker":
            cooperative = str(data.get("cooperative", "Local cooperative")).strip()[:100] or "Local cooperative"
            certificate = str(data.get("certificate", "")).strip()[:100]
            db.execute("INSERT INTO workers(user_id,skill,cooperative,certificate,service_areas) VALUES (?,?,?,?,?)", (user_id, skill, cooperative, certificate, json.dumps(areas)))
        token, _ = new_session(db, user_id)
        self.send_json(201, {"ok": True, "user": {"id": user_id, "name": name, "email": email, "role": role}}, cookie=token)

    def login(self, db: sqlite3.Connection, data: dict) -> None:
        email = str(data.get("email", "")).strip().lower()
        password = str(data.get("password", ""))
        user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        ok = False
        if user:
            _, digest = password_digest(password, bytes.fromhex(user["salt"]))
            ok = hmac.compare_digest(digest, user["password_hash"])
        if not ok:
            raise ApiError(401, "Email or password is incorrect.")
        token, _ = new_session(db, user["id"])
        self.send_json(200, {"ok": True, "user": public_user(user)}, cookie=token)

    def bootstrap(self, db: sqlite3.Connection, user: sqlite3.Row) -> dict:
        service_rows = db.execute("SELECT * FROM services WHERE active=1 ORDER BY name").fetchall()
        services = [dict(row) for row in service_rows]
        if user["role"] == "customer":
            rows = db.execute("SELECT * FROM bookings WHERE customer_id=? ORDER BY created_at DESC", (user["id"],)).fetchall()
        elif user["role"] == "worker":
            rows = db.execute("SELECT * FROM bookings WHERE worker_id=? ORDER BY created_at DESC", (user["id"],)).fetchall()
        else:
            rows = db.execute("SELECT * FROM bookings ORDER BY created_at DESC").fetchall()
        result = {"user": public_user(user), "services": services, "areas": AREAS, "bookings": [serialize_booking(db, row) for row in rows]}
        if user["role"] == "worker":
            result["worker"] = worker_row(db, user["id"])
            result["ledger"] = [dict(row) for row in db.execute("SELECT entry_type,amount,created_at,booking_id FROM ledger WHERE worker_id=? ORDER BY created_at DESC", (user["id"],)).fetchall()]
        if user["role"] == "admin":
            result["workers"] = [worker_row(db, row["id"]) for row in db.execute("SELECT id FROM users WHERE role='worker' ORDER BY name COLLATE NOCASE").fetchall()]
            result["settings"] = dict(db.execute("SELECT welfare_rate,operations_rate FROM settings WHERE id=1").fetchone())
            result["metrics"] = {
                "workers": db.execute("SELECT COUNT(*) FROM workers").fetchone()[0],
                "verified": db.execute("SELECT COUNT(*) FROM workers WHERE verified=1").fetchone()[0],
                "bookings": db.execute("SELECT COUNT(*) FROM bookings").fetchone()[0],
                "welfare": db.execute("SELECT COALESCE(SUM(welfare),0) FROM bookings WHERE status='settled'").fetchone()[0],
            }
        return result

    def create_booking(self, db: sqlite3.Connection, customer: sqlite3.Row, data: dict) -> None:
        slug = str(data.get("service", ""))
        area = str(data.get("area", ""))
        day = str(data.get("date", ""))
        time_window = str(data.get("time", ""))
        address = str(data.get("address", "")).strip()[:160]
        note = str(data.get("note", "")).strip()[:500]
        if area not in AREAS or not address or not time_window or len(time_window) > 60:
            raise ApiError(400, "Complete the service area, address, and time window.")
        try:
            service_day = date.fromisoformat(day)
            if service_day < date.today():
                raise ValueError
        except ValueError:
            raise ApiError(400, "Choose a valid service date that is today or later.")
        quote = quote_for(db, slug)
        worker_id = choose_worker(db, slug, area, day, time_window)
        booking_id = "SH-" + secrets.token_hex(4).upper()
        db.execute(
            "INSERT INTO bookings(id,customer_id,worker_id,service_slug,address,area,service_date,time_window,note,quote_total,payout,welfare,operations,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (booking_id, customer["id"], worker_id, slug, address, area, day, time_window, note, quote["total"], quote["payout"], quote["welfare"], quote["operations"], "offered" if worker_id else "pending", int(time.time())),
        )
        if worker_id:
            db.execute("UPDATE workers SET last_assigned_at=? WHERE user_id=?", (int(time.time()), worker_id))
        self.send_json(201, {"ok": True, "id": booking_id, "status": "offered" if worker_id else "pending", "quote": quote})

    def booking_action(self, db: sqlite3.Connection, user: sqlite3.Row, booking_id: str, action: str, data: dict) -> None:
        row = db.execute("SELECT * FROM bookings WHERE id=?", (booking_id,)).fetchone()
        if not row:
            raise ApiError(404, "Booking not found.")
        if user["role"] == "customer" and row["customer_id"] != user["id"]:
            raise ApiError(403, "This booking belongs to another customer.")
        if user["role"] == "worker" and row["worker_id"] != user["id"]:
            raise ApiError(403, "This booking is not assigned to your account.")
        now = int(time.time())
        if action == "accept" and user["role"] == "worker" and row["status"] == "offered":
            db.execute("UPDATE bookings SET status='confirmed',accepted_at=? WHERE id=?", (now, booking_id))
        elif action == "decline" and user["role"] == "worker" and row["status"] == "offered":
            excluded = json.loads(row["declined_workers"] or "[]") + [user["id"]]
            next_worker = choose_worker(db, row["service_slug"], row["area"], row["service_date"], row["time_window"], excluded)
            db.execute("UPDATE bookings SET worker_id=?,declined_workers=?,status=? WHERE id=?", (next_worker, json.dumps(excluded), "offered" if next_worker else "pending", booking_id))
        elif action == "start" and user["role"] == "worker" and row["status"] == "confirmed":
            db.execute("UPDATE bookings SET status='in_progress',started_at=? WHERE id=?", (now, booking_id))
        elif action == "complete" and user["role"] == "worker" and row["status"] == "in_progress":
            db.execute("UPDATE bookings SET status='completed',completed_at=? WHERE id=?", (now, booking_id))
        elif action == "cancel" and user["role"] == "customer" and row["status"] in ("offered", "pending", "confirmed"):
            db.execute("UPDATE bookings SET status='cancelled' WHERE id=?", (booking_id,))
        elif action == "settle" and user["role"] == "customer" and row["status"] == "completed":
            if not row["worker_id"]:
                raise ApiError(409, "This booking has no assigned worker.")
            db.execute("UPDATE bookings SET status='settled',settled_at=?,payment_method='demo settlement' WHERE id=?", (now, booking_id))
            db.execute("INSERT OR IGNORE INTO ledger(booking_id,worker_id,entry_type,amount,created_at) VALUES (?,?,?,?,?)", (booking_id, row["worker_id"], "Member payout", row["payout"], now))
            db.execute("INSERT OR IGNORE INTO ledger(booking_id,worker_id,entry_type,amount,created_at) VALUES (?,?,?,?,?)", (booking_id, row["worker_id"], "Welfare contribution", row["welfare"], now))
        elif action == "review" and user["role"] == "customer" and row["status"] == "settled":
            try:
                rating = int(data.get("rating"))
            except (ValueError, TypeError):
                raise ApiError(400, "Choose a rating between one and five stars.")
            feedback = str(data.get("feedback", "")).strip()[:500]
            if not 1 <= rating <= 5:
                raise ApiError(400, "Choose a rating between one and five stars.")
            db.execute("UPDATE bookings SET rating=?,feedback=? WHERE id=?", (rating, feedback, booking_id))
            if row["worker_id"]:
                db.execute("UPDATE workers SET rating=(SELECT AVG(rating) FROM bookings WHERE worker_id=? AND rating IS NOT NULL) WHERE user_id=?", (row["worker_id"], row["worker_id"]))
        else:
            raise ApiError(409, "That action is not available for this booking status or account.")
        self.send_json(200, {"ok": True})

    def invoice(self, db: sqlite3.Connection, user: sqlite3.Row, booking_id: str) -> dict:
        row = db.execute("SELECT * FROM bookings WHERE id=?", (booking_id,)).fetchone()
        if not row:
            raise ApiError(404, "Invoice not found.")
        if user["role"] == "customer" and row["customer_id"] != user["id"]:
            raise ApiError(403, "This invoice belongs to another customer.")
        if user["role"] == "worker" and row["worker_id"] != user["id"]:
            raise ApiError(403, "This invoice belongs to another worker.")
        return {"invoice": serialize_booking(db, row), "issued_at": row["settled_at"], "reference": f"SAH-{row['id']}"}

    def update_worker(self, db: sqlite3.Connection, user_id: str, data: dict) -> None:
        current = worker_row(db, user_id)
        if not current:
            raise ApiError(404, "Worker not found.")
        verified = int(bool(data.get("verified", current["verified"])))
        available = int(bool(data.get("available", current["available"])))
        db.execute("UPDATE workers SET verified=?,available=? WHERE user_id=?", (verified, available, user_id))
        if not verified:
            self.reassign_open_requests(db, user_id)
        self.send_json(200, {"ok": True})

    def reassign_open_requests(self, db: sqlite3.Connection, worker_id: str) -> None:
        rows = db.execute("SELECT * FROM bookings WHERE worker_id=? AND status='offered'", (worker_id,)).fetchall()
        for row in rows:
            excluded = json.loads(row["declined_workers"] or "[]") + [worker_id]
            next_worker = choose_worker(db, row["service_slug"], row["area"], row["service_date"], row["time_window"], excluded)
            db.execute("UPDATE bookings SET worker_id=?,declined_workers=?,status=? WHERE id=?", (next_worker, json.dumps(excluded), "offered" if next_worker else "pending", row["id"]))

    def assign_booking(self, db: sqlite3.Connection, user: sqlite3.Row, booking_id: str, data: dict) -> None:
        row = db.execute("SELECT * FROM bookings WHERE id=?", (booking_id,)).fetchone()
        worker_id = str(data.get("worker_id", ""))
        worker = worker_row(db, worker_id)
        if not row or not worker:
            raise ApiError(404, "Booking or worker not found.")
        if not worker["verified"] or not worker["available"] or worker["skill"] != row["skill"] or row["area"] not in worker["service_areas"]:
            raise ApiError(409, "The selected worker is not eligible for this booking.")
        conflict = db.execute("SELECT 1 FROM bookings WHERE worker_id=? AND service_date=? AND time_window=? AND status IN ('offered','confirmed','in_progress') AND id<>? LIMIT 1", (worker_id, row["service_date"], row["time_window"], booking_id)).fetchone()
        if conflict:
            raise ApiError(409, "The selected worker already has a booking in that time window.")
        db.execute("UPDATE bookings SET worker_id=?,status='offered' WHERE id=?", (worker_id, booking_id))
        db.execute("UPDATE workers SET last_assigned_at=? WHERE user_id=?", (int(time.time()), worker_id))
        self.send_json(200, {"ok": True})

    def add_worker(self, db: sqlite3.Connection, data: dict) -> None:
        name = str(data.get("name", "")).strip()[:80]
        email = str(data.get("email", "")).strip().lower()[:254]
        password = str(data.get("password", ""))
        skill = str(data.get("skill", ""))
        areas = data.get("areas", [])
        if not name or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or len(password) < 10:
            raise ApiError(400, "Enter a name, valid email, and temporary password of at least 10 characters.")
        if skill not in {item["skill"] for item in SERVICES.values()} or not isinstance(areas, list) or not areas or any(area not in AREAS for area in areas):
            raise ApiError(400, "Choose a valid skill and at least one service area.")
        salt, digest = password_digest(password)
        user_id = str(uuid.uuid4())
        db.execute("INSERT INTO users(id,name,email,role,salt,password_hash,created_at) VALUES (?,?,?,?,?,?,?)", (user_id, name, email, "worker", salt, digest, int(time.time())))
        db.execute("INSERT INTO workers(user_id,skill,cooperative,certificate,service_areas,verified) VALUES (?,?,?,?,?,1)", (user_id, skill, str(data.get("cooperative", "Local cooperative"))[:100], str(data.get("certificate", ""))[:100], json.dumps(areas)))
        self.send_json(201, {"ok": True, "id": user_id})

    def update_settings(self, db: sqlite3.Connection, data: dict) -> None:
        try:
            welfare = float(data.get("welfare_rate"))
            operations = float(data.get("operations_rate"))
        except (ValueError, TypeError):
            raise ApiError(400, "Enter valid contribution percentages.")
        if welfare < 0 or operations < 0 or welfare + operations >= 0.5:
            raise ApiError(400, "Combined welfare and operations contributions must be below 50%.")
        services = data.get("services", [])
        if not isinstance(services, list) or len(services) != len(SERVICES):
            raise ApiError(400, "All service prices and wage floors are required.")
        for item in services:
            slug = str(item.get("slug", ""))
            try:
                base = int(item.get("base_price"))
                floor = int(item.get("wage_floor"))
            except (ValueError, TypeError):
                raise ApiError(400, "Prices and wage floors must be whole rupee amounts.")
            if slug not in SERVICES or base < 1 or floor < 1 or base > 1_000_000 or floor > 1_000_000:
                raise ApiError(400, "Prices and wage floors must be positive, valid amounts.")
            db.execute("UPDATE services SET base_price=?,wage_floor=? WHERE slug=?", (base, floor, slug))
        db.execute("UPDATE settings SET welfare_rate=?,operations_rate=? WHERE id=1", (welfare, operations))
        self.send_json(200, {"ok": True})

    def serve_static(self, path: str) -> None:
        if path == "/":
            path = "/index.html"
        target = (UI_DIR / path.lstrip("/")).resolve()
        if not target.is_relative_to(UI_DIR.resolve()) or not target.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        mime = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml"}.get(target.suffix, "application/octet-stream")
        payload = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(payload)


if __name__ == "__main__":
    init_database()
    server = ThreadingHTTPServer((os.environ.get("HOST", "127.0.0.1"), PORT), Handler)
    print(f"Sahaaya is running at http://{os.environ.get('HOST', '127.0.0.1')}:{PORT}")
    server.serve_forever()
