from __future__ import annotations

import os
import sqlite3
import time
from dataclasses import dataclass


@dataclass
class TikTokAuthorization:
    id: int
    state: str
    auth_code: str
    merchant_id: str
    shop_id: str
    shop_cipher: str
    access_token: str
    refresh_token: str
    created_at: int
    raw_query_json: str
    raw_exchange_json: str


def _connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: str) -> None:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    with _connect(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tiktok_authorizations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              state TEXT DEFAULT '',
              auth_code TEXT DEFAULT '',
              merchant_id TEXT DEFAULT '',
              shop_id TEXT DEFAULT '',
              shop_cipher TEXT DEFAULT '',
              access_token TEXT DEFAULT '',
              refresh_token TEXT DEFAULT '',
              created_at INTEGER DEFAULT 0,
              raw_query_json TEXT DEFAULT '',
              raw_exchange_json TEXT DEFAULT ''
            )
            """
        )
        columns = {str(r["name"]) for r in conn.execute("PRAGMA table_info(tiktok_authorizations)").fetchall()}
        if "merchant_id" not in columns:
            conn.execute("ALTER TABLE tiktok_authorizations ADD COLUMN merchant_id TEXT DEFAULT ''")
        conn.commit()


def insert_authorization(
    db_path: str,
    *,
    state: str = "",
    auth_code: str = "",
    merchant_id: str = "",
    shop_id: str = "",
    shop_cipher: str = "",
    access_token: str = "",
    refresh_token: str = "",
    raw_query_json: str = "",
    raw_exchange_json: str = "",
) -> None:
    with _connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO tiktok_authorizations(
              state, auth_code, merchant_id, shop_id, shop_cipher, access_token, refresh_token,
              created_at, raw_query_json, raw_exchange_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                state,
                auth_code,
                merchant_id,
                shop_id,
                shop_cipher,
                access_token,
                refresh_token,
                int(time.time()),
                raw_query_json,
                raw_exchange_json,
            ),
        )
        conn.commit()


def list_authorizations(db_path: str) -> list[TikTokAuthorization]:
    with _connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT id, state, auth_code, merchant_id, shop_id, shop_cipher, access_token, refresh_token,
                   created_at, raw_query_json, raw_exchange_json
            FROM tiktok_authorizations
            ORDER BY id DESC
            """
        ).fetchall()
    out: list[TikTokAuthorization] = []
    for r in rows:
        out.append(
            TikTokAuthorization(
                id=int(r["id"]),
                state=str(r["state"] or ""),
                auth_code=str(r["auth_code"] or ""),
                merchant_id=str(r["merchant_id"] or ""),
                shop_id=str(r["shop_id"] or ""),
                shop_cipher=str(r["shop_cipher"] or ""),
                access_token=str(r["access_token"] or ""),
                refresh_token=str(r["refresh_token"] or ""),
                created_at=int(r["created_at"] or 0),
                raw_query_json=str(r["raw_query_json"] or ""),
                raw_exchange_json=str(r["raw_exchange_json"] or ""),
            )
        )
    return out
