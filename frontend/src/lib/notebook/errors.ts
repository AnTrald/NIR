export const messages = {
  invalid_json: "Некорректный JSON или недопустимое представление Unicode.",
  invalid_format: "Ожидается формат web-notebook.",
  unsupported_version: "Поддерживается только версия 1.0.",
  invalid_field: "Поле отсутствует или имеет недопустимое значение.",
  unknown_field: "Неизвестное поле запрещено.",
  duplicate_cell_id: "Идентификатор ячейки повторяется.",
  limit_exceeded: "Превышено ограничение формата документа.",
} as const;

export type ErrorCode = keyof typeof messages;
export interface Issue { code: ErrorCode; path: string; message: string }
export const issue = (code: ErrorCode, path = ""): Issue => ({ code, path, message: messages[code] });
export class DocumentError extends Error {
  readonly issues: Issue[];
  readonly truncated: boolean;
  constructor(issues: Issue[]) {
    super(issues[0]?.message ?? messages.invalid_field);
    this.name = "DocumentError";
    this.issues = issues.slice(0, 50);
    this.truncated = issues.length > 50;
  }
}
export function fail(code: ErrorCode, path = ""): never { throw new DocumentError([issue(code, path)]); }
export const pointer = (path: string, key: string | number) => `${path}/${String(key).replaceAll("~", "~0").replaceAll("/", "~1")}`;
