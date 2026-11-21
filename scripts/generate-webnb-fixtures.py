"""Общие контрольные входы и независимые ожидаемые результаты; stdlib only.

Большие входы описаны рецептами, чтобы не хранить мегабайты повторяющегося текста.
Не импортирует notebook_engine и не использует результаты его работы.
"""

import base64
import copy
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 5_242_880


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def normalized(document):
    return {
        "format": document["format"], "version": document["version"],
        "metadata": {"title": document["metadata"]["title"], "description": document["metadata"].get("description", "")},
        "cells": [dict(
            {"id": cell["id"], "type": cell["type"], "title": cell.get("title", ""), "source": cell["source"]},
            **({"enabled": cell["enabled"]} if cell["type"] != "markdown" else {}),
            metadata={"comment": cell["metadata"].get("comment", ""), "collapsed": cell["metadata"].get("collapsed", False)},
        ) for cell in document["cells"]],
    }


def materialize(case):
    if "base64" in case:
        return base64.b64decode(case["base64"])
    if "raw" in case:
        data = case["raw"].encode("utf-8")
    else:
        document = copy.deepcopy(case["document"])
        recipe = case.get("cells_recipe")
        if recipe:
            document["cells"] = [
                {"id": f"cell-{i}", "type": "html", "source": recipe.get("source", "") * recipe.get("length", 0), "enabled": True, "metadata": {}}
                for i in range(recipe["count"])
            ]
        for patch in case.get("patches", []):
            target = document
            for key in patch["path"][:-1]:
                target = target[key]
            key = patch["path"][-1]
            if patch.get("delete"):
                del target[key]
            else:
                target[key] = patch["repeat"] * patch["count"] if "repeat" in patch else patch["value"]
        data = compact(document).encode("utf-8")
    if "pad_to" in case:
        data += b" " * (case["pad_to"] - len(data))
    return data


def main():
    empty = {"format": "web-notebook", "version": "1.0", "metadata": {"title": "Без названия"}, "cells": []}
    full = copy.deepcopy(empty)
    full["metadata"] = {"title": " Юникод 😀 ", "description": "Описание\r\nбез изменений"}
    full["cells"] = [
        {"id": "cell-1", "type": "markdown", "source": "# Заголовок 😀\r\n\t`код`\n", "metadata": {}},
        {"id": "cell-2", "type": "html", "title": "Кнопка", "source": '<button onclick="alert(\'Привет\')">Привет</button>', "enabled": True, "metadata": {}},
        {"id": "cell-3", "type": "css", "source": "body { color: red; }\n", "enabled": False, "metadata": {"comment": "Выключено", "collapsed": True}},
        {"id": "cell-4", "type": "javascript", "source": "throw new Error('НЕ ВЫПОЛНЯТЬ');\nconsole.log('😀');", "enabled": True, "metadata": {}},
    ]
    cases = []

    def add(name, document=empty, code=None, path="", **kwargs):
        case = {"name": name, "document": copy.deepcopy(document), **kwargs,
                "expected": {"valid": code is None}}
        if code:
            case["expected"].update(code=code, path=path)
        cases.append(case)
        return case

    def patch(name, path, value=None, code=None, error_path=None, document=full, **kwargs):
        segments = [str(key).replace("~", "~0").replace("/", "~1") for key in path]
        return add(name, document, code, error_path if error_path is not None else "/" + "/".join(segments),
                   patches=[{"path": path, **({"value": value} if not kwargs else kwargs)}])

    add("empty")
    add("all-types-and-unicode", full)
    patch("optional-defaults", ["cells", 1, "title"], delete=True)
    patch("ascii-whitespace-preserved", ["metadata", "title"], " \tA\r\n ")
    patch("non-ascii-space-is-title", ["metadata", "title"], "\u00a0")
    patch("emoji-title-limit", ["metadata", "title"], repeat="😀", count=200)
    patch("emoji-title-over", ["metadata", "title"], code="limit_exceeded", repeat="😀", count=201)
    for name, path, maximum in [
        ("description", ["metadata", "description"], 2000),
        ("cell-title", ["cells", 1, "title"], 200),
        ("comment", ["cells", 1, "metadata", "comment"], 2000),
        ("source", ["cells", 1, "source"], 100000),
        ("id", ["cells", 1, "id"], 64),
    ]:
        patch(name + "-limit", path, repeat="A" if name == "id" else "😀", count=maximum)
        patch(name + "-over", path, code="limit_exceeded", repeat="A" if name == "id" else "😀", count=maximum + 1)
    add("cells-limit", cells_recipe={"count": 200})
    add("cells-over", code="limit_exceeded", path="/cells", cells_recipe={"count": 201})
    add("total-source-limit", cells_recipe={"count": 10, "source": "😀", "length": 100000})
    add("total-source-over", code="limit_exceeded", path="/cells", cells_recipe={"count": 11, "source": "A", "length": 100000})
    add("input-byte-limit", pad_to=MAX_BYTES)
    add("input-byte-over", code="limit_exceeded", pad_to=MAX_BYTES + 1)
    for extra in (0, 1):
        target = MAX_BYTES + extra
        case = add("canonical-byte-" + ("over" if extra else "limit"), code="limit_exceeded" if extra else None,
                   cells_recipe={"count": 9})
        data = json.loads(materialize(case))
        overhead = len((compact(normalized(data)) + "\n").encode("utf-8"))
        count, remainder = divmod(target - overhead, 6)
        patches = []
        for i in range(9):
            size = min(count, 100000)
            patches.append({"path": ["cells", i, "source"], "repeat": "\x01", "count": size})
            count -= size
        # Последняя ячейка короче 100000: остаток добавляет точное число байт.
        patches[-1] = {"path": ["cells", 8, "source"], "value": "\x01" * patches[-1]["count"] + "a" * remainder}
        # Сохранить компактный рецепт, без большой строки последней ячейки.
        case["patches"] = patches[:-1] + [{"path": ["cells", 8, "source"], "repeat": "\x01", "count": len(patches[-1]["value"]) - remainder}]
        # Остаток помещается в название, увеличивая overhead ровно на remainder.
        case["patches"].append({"path": ["cells", 0, "title"], "value": "a" * remainder})
    for name, path, value, code in [
        ("wrong-format", ["format"], "other", "invalid_format"),
        ("future-version", ["version"], "2.0", "unsupported_version"),
        ("numeric-version", ["version"], 1.0, "unsupported_version"),
        ("empty-title", ["metadata", "title"], "", "invalid_field"),
        ("blank-title", ["metadata", "title"], " \t\r\n\f\v", "invalid_field"),
        ("description-null", ["metadata", "description"], None, "invalid_field"),
        ("unknown-root", ["owner_id"], "private", "unknown_field"),
        ("unknown-metadata", ["metadata", "revision"], 1, "unknown_field"),
        ("unknown-cell", ["cells", 0, "result"], "private", "unknown_field"),
        ("unknown-cell-metadata", ["cells", 0, "metadata", "other"], 1, "unknown_field"),
        ("pointer-escape", ["cells", 0, "metadata", "a~/b"], True, "unknown_field"),
        ("prototype-key", ["__proto__"], {}, "unknown_field"),
        ("markdown-enabled", ["cells", 0, "enabled"], False, "unknown_field"),
        ("string-enabled", ["cells", 1, "enabled"], "true", "invalid_field"),
        ("numeric-enabled", ["cells", 1, "enabled"], 1, "invalid_field"),
        ("null-enabled", ["cells", 1, "enabled"], None, "invalid_field"),
        ("string-collapsed", ["cells", 1, "metadata", "collapsed"], "false", "invalid_field"),
        ("null-cell-metadata", ["cells", 1, "metadata"], None, "invalid_field"),
        ("unknown-type", ["cells", 0, "type"], "python", "invalid_field"),
        ("duplicate-id", ["cells", 1, "id"], "cell-1", "duplicate_cell_id"),
        ("id-newline", ["cells", 1, "id"], "valid\n", "invalid_field"),
        ("id-leading-dash", ["cells", 1, "id"], "-invalid", "invalid_field"),
        ("id-unicode", ["cells", 1, "id"], "ячейка", "invalid_field"),
        ("id-empty", ["cells", 1, "id"], "", "invalid_field"),
        ("source-number", ["cells", 1, "source"], 12, "invalid_field"),
        ("null-byte", ["cells", 1, "source"], "\x00", "invalid_json"),
        ("null-cell", ["cells", 0], None, "invalid_field"),
        ("array-cell", ["cells", 0], [], "invalid_field"),
        ("null-cells", ["cells"], None, "invalid_field"),
    ]:
        patch(name, path, value, code)
    for name, path, code in [
        ("missing-format", ["format"], "invalid_format"),
        ("missing-version", ["version"], "unsupported_version"),
        ("missing-metadata", ["metadata"], "invalid_field"),
        ("missing-cells", ["cells"], "invalid_field"),
        ("missing-source", ["cells", 1, "source"], "invalid_field"),
        ("missing-cell-type", ["cells", 1, "type"], "invalid_field"),
        ("missing-enabled", ["cells", 1, "enabled"], "invalid_field"),
    ]:
        patch(name, path, code=code, delete=True)
    for name, raw, code, path in [
        ("root-array", "[]", "invalid_field", ""),
        ("root-null", "null", "invalid_field", ""),
        ("root-number", "1", "invalid_field", ""),
        ("empty-input", "", "invalid_json", ""),
        ("trailing-comma", '{"format":"web-notebook",}', "invalid_json", ""),
        ("trailing-array-comma", '[1,]', "invalid_json", ""),
        ("comment", '/* comment */{}', "invalid_json", ""),
        ("trailing-document", '{}{}', "invalid_json", ""),
        ("nan", 'NaN', "invalid_json", ""),
        ("infinity", 'Infinity', "invalid_json", ""),
        ("number-overflow", '1e400', "invalid_json", ""),
        ("leading-zero", '01', "invalid_json", ""),
        ("bad-escape", '"\\q"', "invalid_json", ""),
        ("bom", '\ufeff' + compact(empty), "invalid_json", ""),
        ("duplicate-key", '{"format":"web-notebook","format":"web-notebook"}', "invalid_json", "/format"),
        ("escaped-duplicate-key", '{"metadata":{"title":"a","\\u0074itle":"b"}}', "invalid_json", "/metadata/title"),
        ("unpaired-high-surrogate", '{"x":"\\ud800"}', "invalid_json", "/x"),
        ("unpaired-low-surrogate", '{"x":"\\udfff"}', "invalid_json", "/x"),
        ("nul-key", '{"\\u0000":1}', "invalid_json", "/\x00"),
        ("depth-limit", '[' * 16 + '0' + ']' * 16, "invalid_field", ""),
        ("depth-over", '[' * 17 + '0' + ']' * 17, "limit_exceeded", ""),
        ("extreme-depth", '[' * 10000 + '0' + ']' * 10000, "limit_exceeded", ""),
    ]:
        add(name, code=code, path=path, raw=raw)
    for name, data in [("broken-utf8", b'"\xff"'), ("overlong-utf8", b'"\xc0\x80"'), ("utf8-surrogate", b'"\xed\xa0\x80"')]:
        add(name, code="invalid_json", base64=base64.b64encode(data).decode("ascii"))
    add("escaped-surrogate-pair", raw=compact(empty).replace("Без названия", r"\ud83d\ude00"))
    for case in cases:
        if case["expected"]["valid"]:
            data = normalized(json.loads(materialize(case)))
            canonical = (compact(data) + "\n").encode("utf-8")
            case["expected"]["sha256"] = hashlib.sha256(canonical).hexdigest()
            case["expected"]["canonical_bytes"] = len(canonical)
    destination = ROOT / "contracts/webnb/cases.json"
    destination.write_text(json.dumps(cases, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Подготовлено {len(cases)} общих сценариев.")


if __name__ == "__main__":
    main()
