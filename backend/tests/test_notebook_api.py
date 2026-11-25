from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app

URL = "/api/notebook"


def test_draft_survives_restart_and_rejected_update(tmp_path):
    settings = Settings(notebook_path=tmp_path / "data" / "notebook.json")
    draft = {"cells": [{"id": "draft", "type": "html", "source": "<div>Черновик"}]}
    with TestClient(create_app(settings)) as client:
        assert client.get(URL).json() == {"version": 1, "cells": []}
        response = client.put(URL, json=draft)
        assert response.status_code == 200
        saved = response.json()
        original = settings.notebook_path.read_bytes()
        assert client.put(URL, json={"cells": draft["cells"] * 2}).status_code == 422
        assert settings.notebook_path.read_bytes() == original
    with TestClient(create_app(settings)) as client:
        assert client.get(URL).json() == saved


def test_failed_replace_preserves_old_file(tmp_path, monkeypatch):
    settings = Settings(notebook_path=tmp_path / "notebook.json")
    with TestClient(create_app(settings)) as client:
        assert client.put(URL, json={"cells": []}).status_code == 200
        original = settings.notebook_path.read_bytes()

        def fail_replace(source, destination):
            raise PermissionError("Ошибка записи")

        monkeypatch.setattr("app.storage.os.replace", fail_replace)
        response = client.put(URL, json={"cells": [{"type": "group", "tag": "main", "id": "g"}]})
        assert response.status_code == 503
        assert list(tmp_path.iterdir()) == [settings.notebook_path]
        assert settings.notebook_path.read_bytes() == original


def test_damaged_file_is_reported_and_preserved(tmp_path):
    path = tmp_path / "notebook.json"
    path.write_bytes(b"{")
    with TestClient(create_app(Settings(notebook_path=path))) as client:
        assert client.get(URL).status_code == 503
        assert client.get("/health/ready").status_code == 503
        assert path.read_bytes() == b"{"
