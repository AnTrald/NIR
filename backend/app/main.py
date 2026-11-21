from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from app.api.health import router as health_router
from app.core.config import Settings
from app.db.session import create_database_engine


def error_response(request: Request, status: int, code: str, message: str) -> JSONResponse:
    request_id = getattr(request.state, "request_id", str(uuid4()))
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": [], "request_id": request_id}},
        headers={"Cache-Control": "no-store", "X-Request-ID": request_id},
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        configured = settings or Settings()
        application.state.engine = create_database_engine(configured)
        application.state.settings = configured
        try:
            yield
        finally:
            application.state.engine.dispose()

    application = FastAPI(
        title="Web Notebook API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        swagger_ui_oauth2_redirect_url=None,
        swagger_ui_parameters={"validatorUrl": None},
        servers=[{"url": "/", "description": "Текущий адрес приложения"}],
    )

    @application.middleware("http")
    async def identify_request(request: Request, call_next):
        request.state.request_id = str(uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["Cache-Control"] = "no-store"
        return response

    @application.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        codes = {404: "not_found", 405: "method_not_allowed", 503: "service_unavailable"}
        messages = {404: "Ресурс не найден", 405: "Метод не поддерживается", 503: "Сервис временно недоступен"}
        return error_response(request, exc.status_code, codes.get(exc.status_code, "request_error"), messages.get(exc.status_code, "Запрос отклонён"))

    @application.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        return error_response(request, 422, "invalid_request", "Запрос не прошёл проверку")

    @application.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        return error_response(request, 500, "internal_error", "Внутренняя ошибка сервиса")

    # В OpenAPI публикуются внешние пути, одинаковые у FastAPI и proxy Next.js.
    application.include_router(health_router, prefix="/api")
    # Короткие внутренние адреса сохраняются для Docker healthcheck.
    application.include_router(health_router, include_in_schema=False)
    return application


app = create_app()
