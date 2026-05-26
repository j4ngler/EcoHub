from __future__ import annotations

import os
import sqlite3
import time
from dataclasses import dataclass

from werkzeug.security import generate_password_hash


@dataclass
class UserRecord:
    id: int
    username: str
    full_name: str
    contact: str
    password_hash: str
    role: str
    is_active: int
    created_at: int


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str) -> None:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    with _connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              username TEXT NOT NULL UNIQUE,
              full_name TEXT DEFAULT '',
              contact TEXT DEFAULT '',
              password_hash TEXT NOT NULL,
              role TEXT NOT NULL DEFAULT 'operator',
              is_active INTEGER NOT NULL DEFAULT 1,
              created_at INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        columns = {str(r["name"]) for r in conn.execute("PRAGMA table_info(users)").fetchall()}
        if "full_name" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN full_name TEXT DEFAULT ''")
        if "contact" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN contact TEXT DEFAULT ''")
        conn.commit()


def count_users(db_path: str) -> int:
    with _connect(db_path) as conn:
        row = conn.execute("SELECT COUNT(1) AS c FROM users").fetchone()
    return int(row["c"] if row else 0)


def get_user_by_username(db_path: str, username: str) -> UserRecord | None:
    if not username:
        return None
    with _connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT id, username, full_name, contact, password_hash, role, is_active, created_at
            FROM users
            WHERE LOWER(username)=LOWER(?)
            LIMIT 1
            """,
            (username.strip(),),
        ).fetchone()
    if not row:
        return None
    return UserRecord(
        id=int(row["id"]),
        username=str(row["username"]),
        full_name=str(row["full_name"] or ""),
        contact=str(row["contact"] or ""),
        password_hash=str(row["password_hash"]),
        role=str(row["role"] or "operator"),
        is_active=int(row["is_active"] or 0),
        created_at=int(row["created_at"] or 0),
    )


def get_user_by_contact(db_path: str, contact: str) -> UserRecord | None:
    val = (contact or "").strip()
    if not val:
        return None
    with _connect(db_path) as conn:
        row = conn.execute(
            """
            SELECT id, username, full_name, contact, password_hash, role, is_active, created_at
            FROM users
            WHERE LOWER(contact)=LOWER(?)
            LIMIT 1
            """,
            (val,),
        ).fetchone()
    if not row:
        return None
    return UserRecord(
        id=int(row["id"]),
        username=str(row["username"]),
        full_name=str(row["full_name"] or ""),
        contact=str(row["contact"] or ""),
        password_hash=str(row["password_hash"]),
        role=str(row["role"] or "operator"),
        is_active=int(row["is_active"] or 0),
        created_at=int(row["created_at"] or 0),
    )


def create_user(
    db_path: str,
    username: str,
    password: str,
    role: str = "operator",
    full_name: str = "",
    contact: str = "",
) -> int:
    uname = (username or "").strip()
    pwd = password or ""
    r = (role or "operator").strip().lower()
    if not uname:
        raise RuntimeError("Thiếu username")
    if len(pwd) < 8:
        raise RuntimeError("Mật khẩu phải tối thiểu 8 ký tự")
    if r not in {"admin", "operator"}:
        r = "operator"
    pw_hash = generate_password_hash(pwd)
    now_ts = int(time.time())
    with _connect(db_path) as conn:
        cur = conn.execute(
            """
            INSERT INTO users(username, full_name, contact, password_hash, role, is_active, created_at)
            VALUES(?, ?, ?, ?, ?, 1, ?)
            """,
            (uname, (full_name or "").strip(), (contact or "").strip(), pw_hash, r, now_ts),
        )
        conn.commit()
        return int(cur.lastrowid)


def update_user_password(db_path: str, user_id: int, new_password: str) -> None:
    pwd = new_password or ""
    if len(pwd) < 8:
        raise RuntimeError("Mật khẩu phải tối thiểu 8 ký tự")
    pw_hash = generate_password_hash(pwd)
    with _connect(db_path) as conn:
        conn.execute(
            "UPDATE users SET password_hash=? WHERE id=?",
            (pw_hash, int(user_id)),
        )
        conn.commit()
