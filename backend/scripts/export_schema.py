"""Обновление согласованной JSON Schema из строгих Pydantic-моделей."""

import json
import sys
from pathlib import Path

from notebook_engine.models import document_schema

destination = Path(sys.argv[1])
destination.write_text(json.dumps(document_schema(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"JSON Schema записана: {destination.name}")
