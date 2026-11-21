import { fail, pointer } from "./errors";

export const MAX_BYTES = 5_242_880;
export const MAX_DEPTH = 16;

export function checkString(value: string, path: string): void {
  // for...of объединяет корректную surrogate pair в один Unicode scalar value.
  for (const char of value) {
    const point = char.codePointAt(0)!;
    if (point === 0 || (point >= 0xd800 && point <= 0xdfff)) fail("invalid_json", path);
  }
}

export function checkValue(value: unknown, path = "", depth = 0): void {
  if (typeof value === "string") { checkString(value, path); return; }
  if (typeof value === "number") { if (!Number.isFinite(value)) fail("invalid_json", path); return; }
  if (value === null || typeof value === "boolean") return;
  if (typeof value !== "object") fail("invalid_field", path);
  if (++depth > MAX_DEPTH) fail("limit_exceeded", path);
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) checkValue(value[i], pointer(path, i), depth);
  } else {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== null && prototype !== Object.prototype) fail("invalid_field", path);
    for (const [key, child] of Object.entries(value)) {
      const childPath = pointer(path, key);
      checkString(key, childPath);
      checkValue(child, childPath, depth);
    }
  }
}

function checkDepth(text: string): void {
  let depth = 0, quoted = false, escaped = false;
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "[" || char === "{") { if (++depth > MAX_DEPTH) fail("limit_exceeded"); }
    else if (char === "]" || char === "}") depth--;
  }
}

/** Ограниченный JSON parser: дубли ключей обнаруживаются до построения объекта. */
export function parseJson(data: Uint8Array): unknown {
  if (!(data instanceof Uint8Array)) fail("invalid_field");
  if (data.byteLength > MAX_BYTES) fail("limit_exceeded");
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data); }
  catch { fail("invalid_json"); }
  checkDepth(text);
  let cursor = 0;
  const whitespace = () => { while (cursor < text.length && /[ \t\n\r]/.test(text[cursor]!)) cursor++; };
  const string = (): string => {
    const start = cursor++;
    while (cursor < text.length) {
      const char = text[cursor++];
      if (char === "\\") cursor++;
      else if (char === '"') {
        try { return JSON.parse(text.slice(start, cursor)) as string; }
        catch { fail("invalid_json"); }
      }
    }
    fail("invalid_json");
  };
  const value = (path: string): unknown => {
    whitespace();
    const char = text[cursor];
    if (char === '"') {
      const result = string(); checkString(result, path); return result;
    }
    if (char === "{" || char === "[") {
      const object = char === "{";
      cursor++; whitespace();
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      const array: unknown[] = [];
      const closing = object ? "}" : "]";
      if (text[cursor] === closing) { cursor++; return object ? result : array; }
      while (cursor < text.length) {
        whitespace();
        if (object) {
          if (text[cursor] !== '"') fail("invalid_json");
          const key = string(), childPath = pointer(path, key);
          checkString(key, childPath);
          if (Object.hasOwn(result, key)) fail("invalid_json", childPath);
          whitespace();
          if (text[cursor++] !== ":") fail("invalid_json");
          result[key] = value(childPath);
        } else array.push(value(pointer(path, array.length)));
        whitespace();
        const separator = text[cursor++];
        if (separator === closing) return object ? result : array;
        if (separator !== ",") fail("invalid_json");
      }
      fail("invalid_json");
    }
    for (const [literal, parsed] of [["true", true], ["false", false], ["null", null]] as const) {
      if (text.startsWith(literal, cursor)) { cursor += literal.length; return parsed; }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(cursor));
    if (!number) fail("invalid_json");
    cursor += number[0].length;
    const parsed = Number(number[0]);
    if (!Number.isFinite(parsed)) fail("invalid_json", path);
    return parsed;
  };
  const result = value("");
  whitespace();
  if (cursor !== text.length) fail("invalid_json");
  return result;
}
