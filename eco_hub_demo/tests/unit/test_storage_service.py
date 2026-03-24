from __future__ import annotations

import subprocess

from services import storage_service


def test_start_new_recording_sanitizes_order_code(tmp_path):
    path = storage_service.start_new_recording(str(tmp_path), 'ORD<>:"/\\|?*X')
    assert path.endswith(".mp4")
    assert "ORD_________X" in path


def test_get_storage_status_thresholds():
    max_bytes = 100
    assert storage_service.get_storage_status(50, max_bytes) == "An toàn"
    assert storage_service.get_storage_status(81, max_bytes) == "Sắp tràn dung lượng"
    assert storage_service.get_storage_status(101, max_bytes) == "Đã vượt giới hạn"


def test_delete_video_rejects_path_traversal(tmp_path):
    try:
        storage_service.delete_video(str(tmp_path), "../a.mp4")
        assert False, "Expected ValueError"
    except ValueError as exc:
        assert "không hợp lệ" in str(exc)


def test_delete_video_missing_file_raises(tmp_path):
    try:
        storage_service.delete_video(str(tmp_path), "a.mp4")
        assert False, "Expected FileNotFoundError"
    except FileNotFoundError as exc:
        assert "không tồn tại" in str(exc)


def test_delete_video_success(tmp_path):
    f = tmp_path / "a.mp4"
    f.write_bytes(b"x")
    storage_service.delete_video(str(tmp_path), "a.mp4")
    assert not f.exists()


def test_get_videos_info_lists_and_sorts(tmp_path):
    f1 = tmp_path / "old.mp4"
    f1.write_bytes(b"1")
    f2 = tmp_path / "new.mp4"
    f2.write_bytes(b"12")

    videos, total = storage_service.get_videos_info(str(tmp_path))
    assert total == 3
    assert {v.name for v in videos} == {"old.mp4", "new.mp4"}


def test_delete_video_retries_on_permission_error_then_succeeds(tmp_path, monkeypatch):
    f = tmp_path / "retry.mp4"
    f.write_bytes(b"x")

    calls = {"n": 0}
    original_remove = storage_service.os.remove

    def fake_remove(path):
        calls["n"] += 1
        if calls["n"] < 3:
            raise PermissionError("busy")
        return original_remove(path)

    monkeypatch.setattr(storage_service.os, "remove", fake_remove)
    monkeypatch.setattr(storage_service.time, "sleep", lambda _x: None)

    storage_service.delete_video(str(tmp_path), "retry.mp4")
    assert calls["n"] == 3
    assert not f.exists()


def test_delete_video_raises_after_permission_error_retries(tmp_path, monkeypatch):
    f = tmp_path / "locked.mp4"
    f.write_bytes(b"x")

    monkeypatch.setattr(storage_service.os, "remove", lambda _path: (_ for _ in ()).throw(PermissionError("busy")))
    monkeypatch.setattr(storage_service.time, "sleep", lambda _x: None)

    try:
        storage_service.delete_video(str(tmp_path), "locked.mp4")
        assert False, "Expected PermissionError"
    except PermissionError as exc:
        assert "đang được sử dụng" in str(exc)


def test_finish_recording_no_temp_path_returns():
    storage_service._order_index["ORD-1"] = {}
    storage_service.finish_recording_for_order("ORD-1", duration_seconds=10)
    assert storage_service._order_index["ORD-1"] == {}


def test_finish_recording_sets_base_when_no_resume_window(tmp_path):
    temp = tmp_path / "temp.mp4"
    temp.write_bytes(b"x")
    storage_service._order_index["ORD-2"] = {"temp_path": str(temp)}

    storage_service.finish_recording_for_order("ORD-2", duration_seconds=10)
    assert storage_service._order_index["ORD-2"]["base_path"] == str(temp)
    assert "last_record_end" in storage_service._order_index["ORD-2"]


def test_finish_recording_concat_success_replaces_base(tmp_path, monkeypatch):
    base = tmp_path / "base.mp4"
    temp = tmp_path / "temp.mp4"
    base.write_bytes(b"base")
    temp.write_bytes(b"temp")

    storage_service._order_index["ORD-3"] = {"temp_path": str(temp), "base_path": str(base)}
    monkeypatch.setattr(storage_service, "_should_resume_with", lambda _p: True)

    def fake_run(cmd, check, stdout, stderr):
        output_path = cmd[-1]
        with open(output_path, "wb") as f:
            f.write(b"merged")
        return None

    monkeypatch.setattr(storage_service.subprocess, "run", fake_run)
    storage_service.finish_recording_for_order("ORD-3", duration_seconds=10)

    assert base.exists()
    assert not temp.exists()
    assert storage_service._order_index["ORD-3"]["base_path"] == str(base)


def test_finish_recording_concat_error_falls_back_to_temp(tmp_path, monkeypatch):
    base = tmp_path / "base.mp4"
    temp = tmp_path / "temp.mp4"
    base.write_bytes(b"base")
    temp.write_bytes(b"temp")

    storage_service._order_index["ORD-4"] = {"temp_path": str(temp), "base_path": str(base)}
    monkeypatch.setattr(storage_service, "_should_resume_with", lambda _p: True)

    def fail_run(*args, **kwargs):
        raise subprocess.CalledProcessError(returncode=1, cmd="ffmpeg")

    monkeypatch.setattr(storage_service.subprocess, "run", fail_run)
    storage_service.finish_recording_for_order("ORD-4", duration_seconds=10)
    assert storage_service._order_index["ORD-4"]["base_path"] == str(temp)
