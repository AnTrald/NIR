"""Ошибки переносимого документа без HTTP и исходного пользовательского кода."""

from dataclasses import dataclass

MESSAGES = {
    "invalid_json": "Некорректный JSON или недопустимое представление Unicode.",
    "invalid_format": "Ожидается формат web-notebook.",
    "unsupported_version": "Поддерживается только версия 1.0.",
    "invalid_field": "Поле отсутствует или имеет недопустимое значение.",
    "unknown_field": "Неизвестное поле запрещено.",
    "duplicate_cell_id": "Идентификатор ячейки повторяется.",
    "limit_exceeded": "Превышено ограничение формата документа.",
}
MAX_ERRORS = 50


@dataclass(frozen=True)
class Issue:
    code: str
    path: str
    message: str


class DocumentError(ValueError):
    def __init__(self, issues: list[Issue]):
        self.issues = issues[:MAX_ERRORS]
        self.truncated = len(issues) > MAX_ERRORS
        super().__init__(self.issues[0].message)


def issue(code: str, path: str = "") -> Issue:
    return Issue(code, path, MESSAGES[code])


def fail(code: str, path: str = "") -> None:
    raise DocumentError([issue(code, path)])


def pointer(path: str, key: str | int) -> str:
    return path + "/" + str(key).replace("~", "~0").replace("/", "~1")
