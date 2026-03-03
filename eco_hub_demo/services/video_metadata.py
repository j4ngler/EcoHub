import os
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional


@dataclass
class VideoRecord:
    """
    Metadata 1 video để phục vụ tính dung lượng / auto cleanup.

    POC hiện tại chỉ mới dùng các field cơ bản; phần còn lại sẵn sàng mở rộng:
    - shop_id: sau này khi có multi-shop.
    - is_disputed: bảo vệ video tranh chấp không bị auto xóa.
    """

    id: Optional[int]
    shop_id: Optional[str]
    order_id: Optional[str]
    file_path: str
    size_bytes: int
    duration_sec: int
    created_at: datetime
    is_uploaded: bool
    is_disputed: bool
    is_deleted: bool


@dataclass
class VideoDeleteLog:
    """
    Bản ghi audit khi một video bị xóa (auto hoặc thủ công).
    Cho phép truy vết: xóa cái gì, lúc nào, vì sao, bởi ai.
    """

    id: Optional[int]
    video_id: Optional[int]
    shop_id: Optional[str]
    file_path: str
    reason: str
    trigger: str
    deleted_by: str
    deleted_at: datetime


def _connect(db_path: str) -> sqlite3.Connection:
    dir_name = os.path.dirname(db_path)
    if dir_name:
        os.makedirs(dir_name, exist_ok=True)
    conn = sqlite3.connect(db_path, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    return conn


def ensure_schema(db_path: str) -> None:
    """
    Khởi tạo schema SQLite cho metadata video nếu chưa tồn tại.
    """
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        # Bảng metadata video
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS videos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                shop_id TEXT,
                order_id TEXT,
                file_path TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                duration_sec INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                is_uploaded INTEGER NOT NULL DEFAULT 0,
                is_disputed INTEGER NOT NULL DEFAULT 0,
                is_deleted INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        # Index cho truy vấn video
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_videos_shop_created
            ON videos (shop_id, created_at)
            """
        )
        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_videos_deleted
            ON videos (is_deleted)
            """
        )

        # Bảng log xóa video (audit trail)
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS video_delete_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id INTEGER,
                shop_id TEXT,
                file_path TEXT,
                reason TEXT,
                trigger TEXT,
                deleted_by TEXT,
                deleted_at TEXT
            )
            """
        )

        cur.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_video_delete_log_time
            ON video_delete_log (deleted_at)
            """
        )

        conn.commit()
    finally:
        conn.close()


def insert_video(
    db_path: str,
    *,
    shop_id: Optional[str],
    order_id: Optional[str],
    file_path: str,
    size_bytes: int,
    duration_sec: int,
    created_at: Optional[datetime] = None,
    is_uploaded: bool = False,
    is_disputed: bool = False,
) -> int:
    """
    Tạo bản ghi metadata mới cho 1 video.

    POC: dùng khi video vừa quay xong; các field như is_uploaded sẽ được cập nhật sau.
    """
    ensure_schema(db_path)
    if created_at is None:
        created_at = datetime.utcnow()

    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO videos (
                shop_id,
                order_id,
                file_path,
                size_bytes,
                duration_sec,
                created_at,
                is_uploaded,
                is_disputed,
                is_deleted
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                shop_id,
                order_id,
                file_path,
                int(size_bytes),
                int(duration_sec),
                created_at.isoformat(),
                1 if is_uploaded else 0,
                1 if is_disputed else 0,
            ),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def mark_uploaded(db_path: str, video_id: int) -> None:
    """
    Đánh dấu video đã upload lên S3 thành công.
    """
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE videos SET is_uploaded = 1 WHERE id = ?",
            (int(video_id),),
        )
        conn.commit()
    finally:
        conn.close()


def mark_deleted(db_path: str, video_id: int) -> None:
    """
    Đánh dấu video đã bị xóa (auto hoặc thủ công).
    """
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE videos SET is_deleted = 1 WHERE id = ?",
            (int(video_id),),
        )
        conn.commit()
    finally:
        conn.close()


def list_active_videos_for_shop(
    db_path: str,
    shop_id: Optional[str],
) -> List[VideoRecord]:
    """
    Lấy danh sách video CHƯA bị xóa cho 1 shop (hoặc tất cả shop nếu shop_id=None),
    sắp xếp từ cũ tới mới (phục vụ auto cleanup oldest-first).
    """
    ensure_schema(db_path)
    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        if shop_id is None:
            cur.execute(
                """
                SELECT *
                FROM videos
                WHERE is_deleted = 0
                ORDER BY datetime(created_at) ASC
                """
            )
        else:
            cur.execute(
                """
                SELECT *
                FROM videos
                WHERE is_deleted = 0 AND (shop_id = ? OR shop_id IS NULL)
                ORDER BY datetime(created_at) ASC
                """,
                (shop_id,),
            )
        rows = cur.fetchall()

        result: List[VideoRecord] = []
        for row in rows:
            result.append(
                VideoRecord(
                    id=row["id"],
                    shop_id=row["shop_id"],
                    order_id=row["order_id"],
                    file_path=row["file_path"],
                    size_bytes=row["size_bytes"],
                    duration_sec=row["duration_sec"],
                    created_at=datetime.fromisoformat(row["created_at"]),
                    is_uploaded=bool(row["is_uploaded"]),
                    is_disputed=bool(row["is_disputed"]),
                    is_deleted=bool(row["is_deleted"]),
                )
            )
        return result
    finally:
        conn.close()


def log_video_deletion(
    db_path: str,
    *,
    video_id: Optional[int],
    shop_id: Optional[str],
    file_path: str,
    reason: str,
    trigger: str,
    deleted_by: str,
    deleted_at: Optional[datetime] = None,
) -> None:
    """
    Ghi log khi một video bị xóa (auto cleanup, admin xóa tay, v.v.).
    - reason: business reason (auto_cleanup, manual_delete, manual_s3_delete, ...)
    - trigger: bối cảnh (limit_exceeded, admin_action, ...)
    - deleted_by: "system" hoặc username admin
    """
    ensure_schema(db_path)
    if deleted_at is None:
        deleted_at = datetime.utcnow()

    conn = _connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO video_delete_log (
                video_id,
                shop_id,
                file_path,
                reason,
                trigger,
                deleted_by,
                deleted_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                int(video_id) if video_id is not None else None,
                shop_id,
                file_path,
                reason,
                trigger,
                deleted_by,
                deleted_at.isoformat(),
            ),
        )
        conn.commit()
    finally:
        conn.close()

