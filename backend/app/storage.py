import os
from pathlib import Path
from tempfile import NamedTemporaryFile

from app.notebook import Notebook


class NotebookStore:
    def __init__(self, path: Path):
        self.path = path

    def read(self) -> Notebook:
        try:
            content = self.path.read_bytes()
        except FileNotFoundError:
            return Notebook(cells=[])
        return Notebook.model_validate_json(content)

    def write(self, document: Notebook) -> None:
        content = document.model_dump_json().encode("utf-8")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        pending = NamedTemporaryFile(dir=self.path.parent, delete=False)
        temporary = Path(pending.name)
        try:
            with pending:
                pending.write(content)
                pending.flush()
                os.fsync(pending.fileno())
            os.replace(temporary, self.path)
        finally:
            temporary.unlink(missing_ok=True)

    def check_ready(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(dir=self.path.parent):
            self.read()
