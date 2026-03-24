from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def temp_db_path(tmp_path: Path) -> str:
    return str(tmp_path / "video_metadata.db")


@pytest.fixture
def app_module():
    import app as app_module_ref

    app_module_ref.app.config.update(TESTING=True)
    return app_module_ref


@pytest.fixture
def client(app_module):
    return app_module.app.test_client()


@pytest.fixture
def logged_in_client(client):
    with client.session_transaction() as sess:
        sess["user"] = "tester"
    return client
