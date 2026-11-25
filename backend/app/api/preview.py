from html import escape
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse


router = APIRouter()
template = (Path(__file__).parent / "runner.html").read_text(encoding="utf-8")
policy = (
    "default-src 'none'; script-src 'unsafe-inline'; script-src-attr 'unsafe-inline'; "
    "style-src 'unsafe-inline'; img-src data:; connect-src 'none'; font-src 'none'; "
    "media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; "
    "manifest-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'; "
    "sandbox allow-scripts allow-modals"
)


@router.get("/preview/runner", response_class=HTMLResponse, include_in_schema=False)
def preview_runner(request: Request) -> HTMLResponse:
    return HTMLResponse(
        template.replace("__APP_ORIGIN__", escape(request.app.state.app_origin, quote=True)),
        headers={
            "Content-Security-Policy": policy,
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        },
    )
