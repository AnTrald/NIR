from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ValidationError

router = APIRouter(prefix="/health", tags=["Состояние сервиса"])


class HealthResponse(BaseModel):
    status: Literal["alive", "ready"]


@router.get("/live", response_model=HealthResponse)
def live() -> HealthResponse:
    return HealthResponse(status="alive")


@router.get("/ready", response_model=HealthResponse, responses={503: {"description": "Файловое хранилище недоступно"}})
def ready(request: Request) -> HealthResponse:
    try:
        request.app.state.store.check_ready()
    except (OSError, ValidationError):
        raise HTTPException(status_code=503, detail="Сервис временно недоступен") from None
    return HealthResponse(status="ready")
