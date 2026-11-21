from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

router = APIRouter(prefix="/health", tags=["Состояние сервиса"])


class HealthResponse(BaseModel):
    status: Literal["alive", "ready"]


@router.get("/live", response_model=HealthResponse)
def live() -> HealthResponse:
    return HealthResponse(status="alive")


@router.get("/ready", response_model=HealthResponse, responses={503: {"description": "База данных недоступна"}})
def ready(request: Request) -> HealthResponse:
    try:
        with request.app.state.engine.connect() as connection:
            connection.execute(text("SELECT 1")).scalar_one()
    except SQLAlchemyError:
        # Не передаём пользователю адрес БД, SQL или драйверную диагностику.
        raise HTTPException(status_code=503, detail="Сервис временно недоступен") from None
    return HealthResponse(status="ready")
