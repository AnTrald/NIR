import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings
from app.main import create_app


def test_liveness_and_errors_do_not_require_database():
    settings = Settings(database_url="postgresql+psycopg://probe:secret@127.0.0.1:1/probe")
    with TestClient(create_app(settings)) as client:
        response = client.get("/health/live")
        assert response.status_code == 200
        assert response.json() == {"status": "alive"}
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["x-request-id"]
        missing = client.get("/api/notebooks")
        assert missing.status_code == 404
        assert missing.json()["error"]["code"] == "not_found"


def test_unreachable_database_returns_safe_503():
    settings = Settings(database_url="postgresql+psycopg://probe:do-not-leak@127.0.0.1:1/probe")
    with TestClient(create_app(settings)) as client:
        response = client.get("/health/ready")
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "service_unavailable"
        assert "do-not-leak" not in response.text
        assert "127.0.0.1" not in response.text
        assert client.get("/health/live").status_code == 200


@pytest.mark.integration
def test_readiness_uses_real_postgresql():
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL требуется для проверки PostgreSQL")
    application = create_app(Settings(database_url=database_url))
    with TestClient(application) as client:
        with application.state.engine.connect() as connection:
            assert connection.execute(text("SHOW server_version")).scalar_one()
        assert client.get("/health/ready").json() == {"status": "ready"}


def test_swagger_uses_public_paths_and_current_origin():
    settings = Settings(database_url="postgresql+psycopg://probe:secret@127.0.0.1:1/probe")
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/openapi.json")
        assert response.status_code == 200
        schema = response.json()
        assert set(schema["paths"]) == {"/api/health/live", "/api/health/ready"}
        assert schema["servers"][0]["url"] == "/"
        assert "backend:8000" not in response.text
        docs = client.get("/api/docs")
        assert docs.status_code == 200
        assert "/api/openapi.json" in docs.text
        assert docs.headers["cache-control"] == "no-store"
        assert client.get("/api/health/live").json() == {"status": "alive"}
