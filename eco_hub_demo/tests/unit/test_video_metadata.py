from __future__ import annotations

import sqlite3
from datetime import UTC, datetime, timedelta

from services.video_metadata import (
    ensure_schema,
    insert_video,
    list_active_videos_for_shop,
    log_video_deletion,
    mark_deleted,
    mark_uploaded,
)


def test_ensure_schema_is_idempotent(temp_db_path):
    ensure_schema(temp_db_path)
    ensure_schema(temp_db_path)

    conn = sqlite3.connect(temp_db_path)
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='videos'")
        assert cur.fetchone() is not None
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='video_delete_log'")
        assert cur.fetchone() is not None
    finally:
        conn.close()


def test_insert_and_list_active_videos(temp_db_path):
    created_at = datetime.now(UTC) - timedelta(hours=1)
    video_id = insert_video(
        temp_db_path,
        shop_id="shop-a",
        order_id="ORD-1",
        file_path="videos/ORD-1.mp4",
        size_bytes=1234,
        duration_sec=20,
        created_at=created_at,
        is_uploaded=False,
        is_disputed=False,
    )

    assert isinstance(video_id, int)

    records = list_active_videos_for_shop(temp_db_path, "shop-a")
    assert len(records) == 1
    rec = records[0]
    assert rec.order_id == "ORD-1"
    assert rec.file_path == "videos/ORD-1.mp4"
    assert rec.is_uploaded is False
    assert rec.is_deleted is False
    assert rec.created_at.isoformat() == created_at.isoformat()


def test_mark_uploaded_and_mark_deleted(temp_db_path):
    video_id = insert_video(
        temp_db_path,
        shop_id="shop-a",
        order_id="ORD-2",
        file_path="videos/ORD-2.mp4",
        size_bytes=100,
        duration_sec=5,
    )
    mark_uploaded(temp_db_path, video_id)

    before_delete = list_active_videos_for_shop(temp_db_path, "shop-a")
    assert len(before_delete) == 1
    assert before_delete[0].is_uploaded is True

    mark_deleted(temp_db_path, video_id)
    after_delete = list_active_videos_for_shop(temp_db_path, "shop-a")
    assert after_delete == []


def test_list_active_videos_with_none_shop_includes_all_non_deleted(temp_db_path):
    insert_video(
        temp_db_path,
        shop_id="shop-a",
        order_id="ORD-A",
        file_path="videos/A.mp4",
        size_bytes=100,
        duration_sec=3,
        created_at=datetime.now(UTC) - timedelta(minutes=2),
    )
    insert_video(
        temp_db_path,
        shop_id="shop-b",
        order_id="ORD-B",
        file_path="videos/B.mp4",
        size_bytes=100,
        duration_sec=3,
        created_at=datetime.now(UTC) - timedelta(minutes=1),
    )

    records = list_active_videos_for_shop(temp_db_path, None)
    assert len(records) == 2
    assert records[0].order_id == "ORD-A"
    assert records[1].order_id == "ORD-B"


def test_log_video_deletion_writes_audit_record(temp_db_path):
    ensure_schema(temp_db_path)
    log_video_deletion(
        temp_db_path,
        video_id=10,
        shop_id="shop-a",
        file_path="videos/ORD-10.mp4",
        reason="manual_delete",
        trigger="admin_action",
        deleted_by="admin",
    )

    conn = sqlite3.connect(temp_db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT video_id, shop_id, file_path, reason, trigger, deleted_by, deleted_at FROM video_delete_log"
        )
        row = cur.fetchone()
        assert row is not None
        assert row[0] == 10
        assert row[1] == "shop-a"
        assert row[2] == "videos/ORD-10.mp4"
        assert row[3] == "manual_delete"
        assert row[4] == "admin_action"
        assert row[5] == "admin"
        assert isinstance(row[6], str)
    finally:
        conn.close()
