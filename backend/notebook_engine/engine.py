"""Разбор, проверка и каноническая запись .webnb. Код ячеек — обычный текст."""

import json
import math
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from .errors import DocumentError, fail, issue, pointer
from .models import Document, MAX_BYTES, MAX_DEPTH, MAX_TOTAL_SOURCE


class _Pairs(list):
    """Сохраняет ключи до проверки повторов, в том числе escaped-эквивалентов."""


def _check_text(value: str, path: str) -> None:
    if any(ord(char) == 0 or 0xD800 <= ord(char) <= 0xDFFF for char in value):
        fail("invalid_json", path)


def _walk(value: Any, path: str = "", depth: int = 0) -> Any:
    if isinstance(value, (_Pairs, dict, list)):
        depth += 1
        if depth > MAX_DEPTH:
            fail("limit_exceeded", path)
    if isinstance(value, _Pairs):
        result = {}
        for key, child in value:
            child_path = pointer(path, key)
            _check_text(key, child_path)
            if key in result:
                fail("invalid_json", child_path)
            result[key] = _walk(child, child_path, depth)
        return result
    if type(value) is dict:
        result = {}
        for key, child in value.items():
            if type(key) is not str:
                fail("invalid_field", path)
            child_path = pointer(path, key)
            _check_text(key, child_path)
            result[key] = _walk(child, child_path, depth)
        return result
    if type(value) is list:
        return [_walk(child, pointer(path, index), depth) for index, child in enumerate(value)]
    if type(value) is str:
        _check_text(value, path)
    elif type(value) is float and not math.isfinite(value):
        fail("invalid_json", path)
    elif value is not None and type(value) not in (bool, int, float):
        fail("invalid_field", path)
    return value


def _check_depth(text: str) -> None:
    # До json.loads: защита от переполнения стека даже на повреждённом JSON.
    depth = 0
    quoted = escaped = False
    for char in text:
        if quoted:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quoted = False
        elif char == '"':
            quoted = True
        elif char in "[{":
            depth += 1
            if depth > MAX_DEPTH:
                fail("limit_exceeded")
        elif char in "]}":
            depth -= 1


def parse_document(data: bytes) -> Document:
    if type(data) is not bytes:
        fail("invalid_field")
    if len(data) > MAX_BYTES:
        fail("limit_exceeded")
    try:
        text = data.decode("utf-8", errors="strict")
        _check_depth(text)
        parsed = json.loads(text, object_pairs_hook=_Pairs, parse_constant=lambda _: fail("invalid_json"))
    except (UnicodeError, json.JSONDecodeError, ValueError) as error:
        if isinstance(error, DocumentError):
            raise
        fail("invalid_json")
    return validate_document(_walk(parsed))


def _canonical_data(document: Document) -> dict:
    cells = []
    for cell in document.cells:
        item = {"id": cell.id, "type": cell.type, "title": cell.title, "source": cell.source}
        if cell.type != "markdown":
            item["enabled"] = cell.enabled
        item["metadata"] = {"comment": cell.metadata.comment, "collapsed": cell.metadata.collapsed}
        cells.append(item)
    return {
        "format": document.format,
        "version": document.version,
        "metadata": {"title": document.metadata.title, "description": document.metadata.description},
        "cells": cells,
    }


def _encode(document: Document) -> bytes:
    return (json.dumps(_canonical_data(document), ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")


def validate_document(data: Any) -> Document:
    data = _walk(data)
    if type(data) is not dict:
        fail("invalid_field")
    if data.get("format") != "web-notebook":
        fail("invalid_format", "/format")
    if data.get("version") != "1.0":
        fail("unsupported_version", "/version")
    try:
        document = Document.model_validate(data)
    except ValidationError as error:
        issues = []
        for item in error.errors(include_url=False, include_input=False):
            loc = list(item["loc"])
            # Discriminated union добавляет имя варианта, не являющееся JSON-ключом.
            if len(loc) > 2 and loc[0] == "cells" and type(loc[1]) is int and loc[2] in ("markdown", "html", "css", "javascript"):
                loc.pop(2)
            if item["type"] in ("union_tag_invalid", "union_tag_not_found"):
                loc.append("type")
            path = ""
            for key in loc:
                path = pointer(path, key)
            code = "invalid_field"
            if item["type"] == "extra_forbidden":
                code = "unknown_field"
            elif item["type"] in ("string_too_long", "too_long"):
                code = "limit_exceeded"
            issues.append(issue(code, path))
        raise DocumentError(issues) from None
    seen = set()
    total = 0
    issues = []
    for index, cell in enumerate(document.cells):
        if cell.id in seen:
            issues.append(issue("duplicate_cell_id", f"/cells/{index}/id"))
        seen.add(cell.id)
        total += len(cell.source)
    if total > MAX_TOTAL_SOURCE:
        issues.append(issue("limit_exceeded", "/cells"))
    if issues:
        raise DocumentError(issues)
    if len(_encode(document)) > MAX_BYTES:
        fail("limit_exceeded")
    return document


def normalize_document(document: Document) -> Document:
    return validate_document(document.model_dump(warnings=False))


def serialize_document(document: Document) -> bytes:
    return _encode(normalize_document(document))


@dataclass(frozen=True)
class PreparedDocument:
    document: dict
    title: str
    description: str


def prepare_for_storage(document: Document) -> PreparedDocument:
    checked = normalize_document(document)
    return PreparedDocument(_canonical_data(checked), checked.metadata.title, checked.metadata.description)
