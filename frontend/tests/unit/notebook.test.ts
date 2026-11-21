import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DocumentError, normalizeDocument, parseDocument, serializeDocument, validateDocument } from "../../src/lib/notebook";
import { cases, materialize } from "./webnb-cases";

describe("Общий контракт .webnb", () => {
  for (const test of cases) it(test.name, () => {
    const raw = materialize(test);
    if (!test.expected.valid) {
      let error: unknown;
      try { parseDocument(raw); } catch (caught) { error = caught; }
      expect(error).toBeInstanceOf(DocumentError);
      const result = error as DocumentError;
      expect(result.issues[0]).toMatchObject({ code: test.expected.code, path: test.expected.path });
      expect(result.truncated).toBe(false);
      return;
    }
    const document = parseDocument(raw);
    const encoded = serializeDocument(document);
    expect(encoded.byteLength).toBe(test.expected.canonical_bytes);
    expect(createHash("sha256").update(encoded).digest("hex")).toBe(test.expected.sha256);
    expect(parseDocument(encoded)).toEqual(document);
    expect(normalizeDocument(normalizeDocument(document))).toEqual(document);
    const original = JSON.parse(new TextDecoder().decode(raw)) as { cells: { source: string; id: string }[] };
    expect(document.cells.map(cell => cell.source)).toEqual(original.cells.map(cell => cell.source));
    expect(document.cells.map(cell => cell.id)).toEqual(original.cells.map(cell => cell.id));
  });
});

it("ограничивает ошибки и не включает исходный текст", () => {
  const data = structuredClone(cases[0]!.document);
  for (let i = 0; i < 60; i++) data[`unknown_${i}`] = "private source text";
  let error: unknown;
  try { validateDocument(data); } catch (caught) { error = caught; }
  expect(error).toBeInstanceOf(DocumentError);
  expect((error as DocumentError).issues).toHaveLength(50);
  expect((error as DocumentError).truncated).toBe(true);
  expect(JSON.stringify((error as DocumentError).issues)).not.toContain("private source text");
});

it("не изменяет входные данные и не разделяет ссылки на metadata", () => {
  const data = structuredClone(cases[1]!.document);
  const original = structuredClone(data);
  const document = validateDocument(data);
  expect(data).toEqual(original);
  document.cells[0]!.metadata.comment = "изменено";
  expect(data).toEqual(original);
});

it("повторно проверяет изменённый документ перед записью", () => {
  const document = parseDocument(materialize(cases[1]!));
  Object.assign(document.cells[1]!, { enabled: "true" });
  expect(() => serializeDocument(document)).toThrow(DocumentError);
});

it("отклоняет циклы без переполнения стека", () => {
  const data: Record<string, unknown> = {};
  data.cycle = data;
  expect(() => validateDocument(data)).toThrow(DocumentError);
});

it("не загрязняет Object.prototype при разборе __proto__", () => {
  const bytes = new TextEncoder().encode('{"format":"web-notebook","version":"1.0","metadata":{"title":"x"},"cells":[],"__proto__":{"polluted":true}}');
  expect(() => parseDocument(bytes)).toThrow(DocumentError);
  expect(Object.hasOwn(Object.prototype, "polluted")).toBe(false);
});
