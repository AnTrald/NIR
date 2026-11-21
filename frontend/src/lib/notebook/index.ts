import type { ErrorObject } from "ajv";
import validators from "./generated/validators.cjs";
import type { Document, CellMetadata, DocumentMetadata } from "./generated/types";
import { DocumentError, fail, issue, pointer, type Issue } from "./errors";
import { checkValue, MAX_BYTES, parseJson } from "./json";

export { DocumentError } from "./errors";
export type { ErrorCode, Issue } from "./errors";
export type { Document } from "./generated/types";
type Cell = Document["cells"][number];
type NormalizeCell<T extends Cell> = T extends Cell ? Omit<T, "title" | "metadata"> & { title: string; metadata: Required<CellMetadata> } : never;
export type NormalizedDocument = Omit<Document, "metadata" | "cells"> & {
  metadata: Required<DocumentMetadata>;
  cells: NormalizeCell<Cell>[];
};
const encoder = new TextEncoder();
const cellValidators = {
  markdown: validators.validateMarkdownCell,
  html: validators.validateHtmlCell,
  css: validators.validateCssCell,
  javascript: validators.validateJavascriptCell,
};

function mapErrors(errors: ErrorObject[] | null | undefined, prefix = ""): Issue[] {
  return (errors ?? []).map(error => {
    let path = prefix + error.instancePath;
    if (error.keyword === "required") path = pointer(path, String(error.params.missingProperty));
    if (error.keyword === "additionalProperties") path = pointer(path, String(error.params.additionalProperty));
    return issue(error.keyword === "additionalProperties" ? "unknown_field" :
      ["maxLength", "maxItems"].includes(error.keyword) ? "limit_exceeded" : "invalid_field", path);
  });
}

function canonical(document: Document): NormalizedDocument {
  return {
    format: document.format,
    version: document.version,
    metadata: { title: document.metadata.title, description: document.metadata.description ?? "" },
    cells: document.cells.map(cell => ({
      id: cell.id, type: cell.type, title: cell.title ?? "", source: cell.source,
      ...(cell.type === "markdown" ? {} : { enabled: cell.enabled }),
      metadata: { comment: cell.metadata.comment ?? "", collapsed: cell.metadata.collapsed ?? false },
    })) as NormalizedDocument["cells"],
  };
}
const encode = (document: NormalizedDocument) => encoder.encode(JSON.stringify(document) + "\n");

export function validateDocument(data: unknown): NormalizedDocument {
  checkValue(data);
  if (data === null || typeof data !== "object" || Array.isArray(data)) fail("invalid_field");
  const root = data as Record<string, unknown>;
  if (root.format !== "web-notebook") fail("invalid_format", "/format");
  if (root.version !== "1.0") fail("unsupported_version", "/version");
  const errors: Issue[] = [];
  if (!validators.validateRoot(data)) errors.push(...mapErrors(validators.validateRoot.errors));
  if (Array.isArray(root.cells) && root.cells.length <= 200) {
    root.cells.forEach((cell: unknown, index: number) => {
      const path = `/cells/${index}`;
      if (cell === null || typeof cell !== "object" || Array.isArray(cell)) {
        errors.push(issue("invalid_field", path)); return;
      }
      const type = (cell as Record<string, unknown>).type;
      if (typeof type !== "string" || !Object.hasOwn(cellValidators, type)) {
        errors.push(issue("invalid_field", pointer(path, "type"))); return;
      }
      const validator = cellValidators[type as keyof typeof cellValidators];
      if (!validator(cell)) errors.push(...mapErrors(validator.errors, path));
    });
  }
  if (errors.length) {
    // Например, pattern и not могут указать на одно и то же неверное поле.
    const seen = new Set<string>();
    const unique = errors.filter(item => {
      const key = JSON.stringify([item.code, item.path]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    throw new DocumentError(unique);
  }
  const document = canonical(data as Document);
  const ids = new Set<string>();
  let total = 0;
  document.cells.forEach((cell, index) => {
    if (ids.has(cell.id)) errors.push(issue("duplicate_cell_id", `/cells/${index}/id`));
    ids.add(cell.id);
    // .length считает UTF-16 units и непригоден для лимита символов .webnb.
    for (const _char of cell.source) total++;
  });
  if (total > 1_000_000) errors.push(issue("limit_exceeded", "/cells"));
  if (errors.length) throw new DocumentError(errors);
  if (encode(document).byteLength > MAX_BYTES) fail("limit_exceeded");
  return document;
}

export const parseDocument = (data: Uint8Array): NormalizedDocument => validateDocument(parseJson(data));
export const normalizeDocument = (document: Document): NormalizedDocument => validateDocument(document);
export const serializeDocument = (document: Document): Uint8Array => encode(validateDocument(document));
