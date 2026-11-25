from fastapi import APIRouter, HTTPException, Request
from pydantic import ValidationError

from app.notebook import Notebook

router = APIRouter(prefix="/notebook", tags=["Блокнот"])


@router.get("", summary="Прочитать локальный блокнот")
def read_notebook(request: Request) -> Notebook:
    try:
        return request.app.state.store.read()
    except (OSError, ValidationError):
        raise HTTPException(503) from None


@router.put("", summary="Сохранить локальный блокнот")
def save_notebook(document: Notebook, request: Request) -> Notebook:
    try:
        request.app.state.store.write(document)
    except OSError:
        raise HTTPException(503) from None
    return document
