import { readFileSync } from "node:fs";

export interface Case {
  name: string;
  document: Record<string, unknown>;
  raw?: string;
  base64?: string;
  cells_recipe?: { count: number; source?: string; length?: number };
  patches?: { path: (string | number)[]; value?: unknown; repeat?: string; count?: number; delete?: boolean }[];
  pad_to?: number;
  expected: { valid: boolean; code?: string; path?: string; sha256?: string; canonical_bytes?: number };
}

export const cases: Case[] = JSON.parse(readFileSync(new URL("../../../contracts/webnb/cases.json", import.meta.url), "utf8")) as Case[];

export function materialize(test: Case): Uint8Array {
  if (test.base64 !== undefined) return new Uint8Array(Buffer.from(test.base64, "base64"));
  let text: string;
  if (test.raw !== undefined) text = test.raw;
  else {
    const document = structuredClone(test.document);
    if (test.cells_recipe) {
      const recipe = test.cells_recipe;
      document.cells = Array.from({ length: recipe.count }, (_, i) => ({
        id: `cell-${i}`, type: "html", source: (recipe.source ?? "").repeat(recipe.length ?? 0), enabled: true, metadata: {},
      }));
    }
    for (const patch of test.patches ?? []) {
      let target = document;
      for (const key of patch.path.slice(0, -1)) target = target[key] as Record<string, unknown>;
      const key = patch.path.at(-1)!;
      if (patch.delete) delete target[key];
      else Object.defineProperty(target, key, {
        value: patch.repeat !== undefined ? patch.repeat.repeat(patch.count!) : patch.value,
        enumerable: true, configurable: true, writable: true,
      });
    }
    text = JSON.stringify(document);
  }
  const bytes = new TextEncoder().encode(text);
  if (test.pad_to !== undefined) {
    const padded = new Uint8Array(test.pad_to).fill(32);
    padded.set(bytes);
    return padded;
  }
  return bytes;
}
