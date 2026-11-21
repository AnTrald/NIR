import copy
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import pytest

from notebook_engine import (
    DocumentError, normalize_document, parse_document,
    prepare_for_storage, serialize_document, validate_document,
)
from notebook_engine.models import document_schema
from webnb_cases import CASES, ROOT, materialize


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_shared_contract(case):
    raw = materialize(case)
    expected = case["expected"]
    if not expected["valid"]:
        with pytest.raises(DocumentError) as caught:
            parse_document(raw)
        assert (caught.value.issues[0].code, caught.value.issues[0].path) == (expected["code"], expected["path"])
        assert caught.value.truncated is False
        return
    document = parse_document(raw)
    encoded = serialize_document(document)
    assert len(encoded) == expected["canonical_bytes"]
    assert hashlib.sha256(encoded).hexdigest() == expected["sha256"]
    assert parse_document(encoded) == document
    assert normalize_document(normalize_document(document)) == document
    original = json.loads(raw)
    assert [cell.source for cell in document.cells] == [cell["source"] for cell in original["cells"]]
    assert [cell.id for cell in document.cells] == [cell["id"] for cell in original["cells"]]
    prepared = prepare_for_storage(document)
    assert prepared.document == json.loads(encoded)
    assert prepared.title == document.metadata.title
    assert prepared.description == document.metadata.description


def test_pydantic_schema_matches_contract_exactly():
    assert document_schema() == json.loads((ROOT / "schemas/webnb-1.0.schema.json").read_text(encoding="utf-8"))


def test_errors_are_bounded_and_do_not_include_source():
    data = copy.deepcopy(CASES[0]["document"])
    data.update({f"unknown_{index}": "private source text" for index in range(60)})
    with pytest.raises(DocumentError) as caught:
        validate_document(data)
    assert len(caught.value.issues) == 50
    assert caught.value.truncated is True
    assert "private source text" not in str(caught.value)
    assert all("private source text" not in item.message for item in caught.value.issues)


def test_normalization_does_not_mutate_input_or_share_metadata():
    data = copy.deepcopy(CASES[1]["document"])
    original = copy.deepcopy(data)
    document = validate_document(data)
    assert data == original
    document.cells[0].metadata.comment = "изменено"
    assert data == original


def test_serialization_and_storage_revalidate_mutated_models():
    document = parse_document(materialize(CASES[1]))
    document.cells[1].enabled = "true"
    for operation in (serialize_document, prepare_for_storage, normalize_document):
        with pytest.raises(DocumentError) as caught:
            operation(document)
        assert caught.value.issues[0].path == "/cells/1/enabled"


def test_cyclic_input_is_rejected_without_stack_overflow():
    data = {}
    data["cycle"] = data
    with pytest.raises(DocumentError) as caught:
        validate_document(data)
    assert caught.value.issues[0].code == "limit_exceeded"


def test_engine_import_and_roundtrip_without_app_database_or_network():
    code = r'''
import builtins
import socket
import sys
sys.path.insert(0, sys.argv[1])
original_import = builtins.__import__
def guarded_import(name, *args, **kwargs):
    if name.split('.')[0] in {'app', 'fastapi', 'sqlalchemy', 'psycopg', 'httpx'}:
        raise AssertionError('Запрещённая зависимость: ' + name)
    return original_import(name, *args, **kwargs)
builtins.__import__ = guarded_import
def deny_network(*args, **kwargs):
    raise AssertionError('Обращение к сети')
socket.socket.connect = deny_network
socket.create_connection = deny_network
from notebook_engine import parse_document, serialize_document
raw = b'{"format":"web-notebook","version":"1.0","metadata":{"title":"isolated"},"cells":[]}'
assert parse_document(serialize_document(parse_document(raw))).metadata.title == 'isolated'
assert not any(name in sys.modules for name in ('app', 'fastapi', 'sqlalchemy', 'psycopg', 'httpx'))
'''
    result = subprocess.run(
        [sys.executable, "-I", "-c", code, str(Path(__file__).resolve().parents[1])],
        env={}, capture_output=True, text=True, timeout=20,
    )
    assert result.returncode == 0, result.stderr
