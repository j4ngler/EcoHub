from __future__ import annotations

from datetime import UTC, datetime

from services.s3_service import S3Config, S3Service, bytes_to_human


class _FakePaginator:
    def __init__(self, pages):
        self._pages = pages

    def paginate(self, **kwargs):
        return self._pages


class _FakeClient:
    def __init__(self):
        self.uploaded = []
        self.deleted = []

    def upload_file(self, local_path, bucket, key, Config=None):
        self.uploaded.append((local_path, bucket, key))

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        return _FakePaginator(
            [
                {
                    "Contents": [
                        {"Key": "a.mp4", "Size": 100, "LastModified": datetime(2026, 1, 1, tzinfo=UTC)},
                        {"Key": "ignore.txt", "Size": 50, "LastModified": datetime(2026, 1, 1, tzinfo=UTC)},
                    ]
                },
                {
                    "Contents": [
                        {"Key": "b.mp4", "Size": 200, "LastModified": datetime(2026, 1, 2, tzinfo=UTC)},
                    ]
                },
            ]
        )

    def delete_object(self, Bucket, Key):
        self.deleted.append((Bucket, Key))

    def generate_presigned_url(self, _op, Params, ExpiresIn):
        return f"https://fake/{Params['Key']}?exp={ExpiresIn}"

    def head_bucket(self, Bucket):
        return {"ok": True, "bucket": Bucket}


def _configured_service() -> S3Service:
    return S3Service(
        S3Config(
            endpoint="https://s3.example.com",
            access_key="ak",
            secret_key="sk",
            bucket="bucket-a",
            prefix="tester",
        )
    )


def test_is_configured_false_without_config():
    svc = S3Service()
    assert svc.is_configured() is False


def test_upload_video_success_with_fake_client(tmp_path, monkeypatch):
    video = tmp_path / "v.mp4"
    video.write_bytes(b"abc")
    svc = _configured_service()
    fake = _FakeClient()
    monkeypatch.setattr(svc, "_get_client", lambda: fake)

    ok, key = svc.upload_video(str(video), "ORDER-1")
    assert ok is True
    assert "ORDER-1" in key
    assert key.endswith(".mp4")
    assert len(fake.uploaded) == 1


def test_upload_video_returns_false_when_file_missing(monkeypatch):
    svc = _configured_service()
    monkeypatch.setattr(svc, "_get_client", lambda: _FakeClient())

    ok, msg = svc.upload_video("missing-file.mp4", "ORDER-1")
    assert ok is False
    assert "không tồn tại" in msg


def test_list_videos_only_mp4_sorted_desc(monkeypatch):
    svc = _configured_service()
    monkeypatch.setattr(svc, "_get_client", lambda: _FakeClient())

    videos = svc.list_videos()
    assert [v.key for v in videos] == ["b.mp4", "a.mp4"]


def test_get_total_size_counts_only_mp4(monkeypatch):
    svc = _configured_service()
    monkeypatch.setattr(svc, "_get_client", lambda: _FakeClient())

    assert svc.get_total_size() == 300


def test_delete_video_success(monkeypatch):
    svc = _configured_service()
    fake = _FakeClient()
    monkeypatch.setattr(svc, "_get_client", lambda: fake)

    ok, msg = svc.delete_video("a.mp4")
    assert ok is True
    assert "deleted" in msg.lower()
    assert fake.deleted == [("bucket-a", "a.mp4")]


def test_generate_presigned_url_success(monkeypatch):
    svc = _configured_service()
    monkeypatch.setattr(svc, "_get_client", lambda: _FakeClient())

    url = svc.generate_presigned_url("x.mp4", expiration=120)
    assert url == "https://fake/x.mp4?exp=120"


def test_test_connection_success(monkeypatch):
    svc = _configured_service()
    monkeypatch.setattr(svc, "_get_client", lambda: _FakeClient())

    ok, msg = svc.test_connection()
    assert ok is True
    assert "thành công" in msg


def test_bytes_to_human():
    assert bytes_to_human(100) == "100 B"
    assert bytes_to_human(1024) == "1.00 KB"


def test_upload_video_returns_error_when_client_throws(tmp_path, monkeypatch):
    video = tmp_path / "v.mp4"
    video.write_bytes(b"abc")
    svc = _configured_service()

    class _ErrClient:
        def upload_file(self, *args, **kwargs):
            raise RuntimeError("upload failed")

    monkeypatch.setattr(svc, "_get_client", lambda: _ErrClient())
    ok, msg = svc.upload_video(str(video), "ORD-1")
    assert ok is False
    assert "upload failed" in msg


def test_list_videos_returns_empty_on_error(monkeypatch):
    svc = _configured_service()

    class _ErrClient:
        def get_paginator(self, _name):
            raise RuntimeError("list failed")

    monkeypatch.setattr(svc, "_get_client", lambda: _ErrClient())
    assert svc.list_videos() == []


def test_get_total_size_returns_zero_on_error(monkeypatch):
    svc = _configured_service()

    class _ErrClient:
        def get_paginator(self, _name):
            raise RuntimeError("size failed")

    monkeypatch.setattr(svc, "_get_client", lambda: _ErrClient())
    assert svc.get_total_size() == 0


def test_delete_video_returns_false_on_error(monkeypatch):
    svc = _configured_service()

    class _ErrClient:
        def delete_object(self, **kwargs):
            raise RuntimeError("delete failed")

    monkeypatch.setattr(svc, "_get_client", lambda: _ErrClient())
    ok, msg = svc.delete_video("a.mp4")
    assert ok is False
    assert "delete failed" in msg


def test_generate_presigned_url_returns_none_on_error(monkeypatch):
    svc = _configured_service()

    class _ErrClient:
        def generate_presigned_url(self, *args, **kwargs):
            raise RuntimeError("url failed")

    monkeypatch.setattr(svc, "_get_client", lambda: _ErrClient())
    assert svc.generate_presigned_url("a.mp4") is None


def test_test_connection_returns_false_on_error(monkeypatch):
    svc = _configured_service()

    class _ErrClient:
        def head_bucket(self, **kwargs):
            raise RuntimeError("conn failed")

    monkeypatch.setattr(svc, "_get_client", lambda: _ErrClient())
    ok, msg = svc.test_connection()
    assert ok is False
    assert "conn failed" in msg
