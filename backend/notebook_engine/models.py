"""Строгие модели .webnb 1.0; только Pydantic и стандартная библиотека."""

import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_BYTES = 5_242_880
MAX_DEPTH = 16
MAX_TOTAL_SOURCE = 1_000_000


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class DocumentMetadata(StrictModel):
    title: str = Field(min_length=1, max_length=200, pattern=r"[^ \t\n\r\f\v]")
    description: str = Field(default="", max_length=2000)


class CellMetadata(StrictModel):
    comment: str = Field(default="", max_length=2000)
    collapsed: bool = False


class CellBase(StrictModel):
    id: str = Field(
        min_length=1, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$",
        json_schema_extra={"not": {"pattern": r"[^A-Za-z0-9_-]"}},
    )
    title: str = Field(default="", max_length=200)
    source: str = Field(max_length=100_000)
    metadata: CellMetadata

    @field_validator("id")
    @classmethod
    def full_id(cls, value: str) -> str:
        if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", value) is None:
            raise ValueError("Недопустимый идентификатор")
        return value


class MarkdownCell(CellBase):
    type: Literal["markdown"]


class HtmlCell(CellBase):
    type: Literal["html"]
    enabled: bool


class CssCell(CellBase):
    type: Literal["css"]
    enabled: bool


class JavascriptCell(CellBase):
    type: Literal["javascript"]
    enabled: bool


Cell = Annotated[MarkdownCell | HtmlCell | CssCell | JavascriptCell, Field(discriminator="type")]


class Document(StrictModel):
    format: Literal["web-notebook"]
    version: Literal["1.0"]
    metadata: DocumentMetadata
    cells: list[Cell] = Field(max_length=200)


def document_schema() -> dict:
    """Машиночитаемый контракт; сверяется с файлом schemas в тестах."""
    schema = Document.model_json_schema()
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    # discriminator — расширение OpenAPI, не часть JSON Schema 2020-12.
    schema["properties"]["cells"]["items"].pop("discriminator", None)
    return schema
