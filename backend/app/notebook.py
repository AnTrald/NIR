"""Документ локального редактора. Проверяет структуру независимо от синтаксиса кода."""

from typing import Annotated, Literal, Self

from pydantic import Field, model_validator

from notebook_engine.models import MAX_TOTAL_SOURCE, StrictModel


CellId = Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]*$")]


class Node(StrictModel):
    id: CellId
    title: str = Field(default="", max_length=200)
    enabled: bool = True


class CodeCell(Node):
    source: str = Field(max_length=100_000)


class RootCell(CodeCell):
    type: Literal["css", "javascript", "markdown"]


class HtmlCell(CodeCell):
    type: Literal["html"]
    parent: CellId | None = None


class HtmlGroup(Node):
    type: Literal["group"]
    parent: CellId | None = None
    tag: Literal["div", "section", "article", "main", "header", "footer", "nav", "aside"]
    classes: str = ""
    collapsed: bool = False


Cell = Annotated[RootCell | HtmlCell | HtmlGroup, Field(discriminator="type")]


class Notebook(StrictModel):
    version: int = Field(default=1, ge=1, le=1)
    cells: list[Cell] = Field(max_length=200)

    @model_validator(mode="after")
    def validate_tree(self) -> Self:
        by_id = {node.id: node for node in self.cells}
        if len(by_id) != len(self.cells):
            raise ValueError("Идентификаторы ячеек и групп должны быть уникальными")
        if sum(len(node.source) for node in self.cells if isinstance(node, CodeCell)) > MAX_TOTAL_SOURCE:
            raise ValueError("Превышен суммарный размер исходного кода")
        for node in self.cells:
            if isinstance(node, RootCell):
                continue
            parent = node.parent
            seen = {node.id}
            depth = int(isinstance(node, HtmlGroup))
            while parent is not None:
                if parent in seen:
                    raise ValueError(f"Циклическая вложенность у {node.id}")
                group = by_id.get(parent)
                if not isinstance(group, HtmlGroup):
                    raise ValueError(f"Для {node.id} не найдена родительская HTML-группа {parent}")
                seen.add(parent)
                depth += 1
                if depth > 8:
                    raise ValueError("Допускается не более восьми уровней HTML-групп")
                parent = group.parent
        return self
