from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_liveness_and_errors_do_not_require_database(tmp_path):
    settings = Settings(notebook_path=tmp_path / "notebook.json")
    with TestClient(create_app(settings)) as client:
        response = client.get("/health/live")
        assert response.status_code == 200
        assert response.json() == {"status": "alive"}
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-request-id"]
        missing = client.get("/api/notebooks")
        assert missing.status_code == 404
        assert missing.json()["error"]["code"] == "not_found"


def test_unavailable_storage_returns_safe_503(tmp_path):
    settings = Settings(notebook_path=tmp_path / "invalid" / "notebook.json")
    settings.notebook_path.parent.write_text("do-not-leak")
    with TestClient(create_app(settings)) as client:
        response = client.get("/health/ready")
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "service_unavailable"
        assert "do-not-leak" not in response.text
        assert "127.0.0.1" not in response.text
        assert client.get("/health/live").status_code == 200


def test_readiness_uses_real_directory(tmp_path):
    application = create_app(Settings(notebook_path=tmp_path / "notebook.json"))
    with TestClient(application) as client:
        assert client.get("/health/ready").json() == {"status": "ready"}
        assert not list(tmp_path.iterdir())


def test_swagger_uses_public_paths_and_current_origin(tmp_path):
    settings = Settings(notebook_path=tmp_path / "notebook.json")
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/openapi.json")
        assert response.status_code == 200
        schema = response.json()
        assert set(schema["paths"]) == {"/api/health/live", "/api/health/ready", "/api/notebook"}
        assert schema["servers"][0]["url"] == "/"
        assert "backend:8000" not in response.text
        docs = client.get("/api/docs")
        assert docs.status_code == 200
        assert "/api/openapi.json" in docs.text
        assert docs.headers["cache-control"] == "no-store"
        assert client.get("/api/health/live").json() == {"status": "alive"}
