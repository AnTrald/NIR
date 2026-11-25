import pytest
from pydantic import ValidationError

from app.notebook import Notebook


def group(id, parent=None):
    return {"type": "group", "id": id, "parent": parent, "tag": "section"}


def test_editor_round_trip():
    cells = [
        {"type": "html", "id": "child", "parent": "g", "source": "<div>"},
        {**group("g"), "classes": "catalog wide", "enabled": False, "collapsed": True},
        {"type": "css", "id": "styles", "source": "a { /* webnb:off */ color:red; }"},
        {"type": "markdown", "id": "note", "enabled": False, "source": "# Текст"},
        {"type": "javascript", "id": "js", "source": "const unfinished ="},
    ]
    original = Notebook.model_validate({"cells": cells})
    restored = Notebook.model_validate_json(original.model_dump_json())
    assert restored == original
    assert [node.id for node in restored.cells] == [cell["id"] for cell in cells]
    for node, cell in zip(restored.cells, cells, strict=True):
        assert node.model_dump(include=set(cell)) == cell


def test_depth_boundary():
    chain = [group(f"g{i}", f"g{i-1}" if i else None) for i in range(8)]
    leaf = {"type": "html", "id": "h", "parent": "g7", "source": ""}
    assert len(Notebook.model_validate({"cells": chain + [leaf]}).cells) == 9
    with pytest.raises(ValidationError, match="восьми"):
        Notebook.model_validate({"cells": chain + [group("extra", "g7")]})


@pytest.mark.parametrize("cells", [
    [group("a"), group("a")],
    [group("a", "missing")],
    [group("a", "a")],
    [group("a", "b"), group("b", "a")],
    [{"type": "html", "id": "h", "source": ""}, group("g", "h")],
    [group("g"), {"type": "css", "id": "c", "source": "", "parent": "g"}],
    [{**group("a"), "tag": "button"}],
    [{**group("a"), "enabled": "false"}],
    [group("a b")],
    [group(f"g{i}") for i in range(201)],
    [{"type": "html", "id": str(i), "source": "x" * 100_000} for i in range(11)],
])
def test_reject_invalid_structure(cells):
    with pytest.raises(ValidationError):
        Notebook.model_validate({"cells": cells})


def test_empty_document_and_version():
    assert Notebook.model_validate({"cells": []}).model_dump() == {"version": 1, "cells": []}
    for version in (True, "1", 2):
        with pytest.raises(ValidationError):
            Notebook.model_validate({"version": version, "cells": []})
