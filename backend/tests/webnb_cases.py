"""Материализация общих fixtures без импорта движка."""

import base64
import copy
import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("WEBNB_CONTRACT_ROOT", Path(__file__).resolve().parents[2]))
CASES = json.loads((ROOT / "contracts/webnb/cases.json").read_text(encoding="utf-8"))


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
            if patch.get("delete"):
                del target[patch["path"][-1]]
            else:
                target[patch["path"][-1]] = patch["repeat"] * patch["count"] if "repeat" in patch else patch["value"]
        data = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if "pad_to" in case:
        data += b" " * (case["pad_to"] - len(data))
    return data
