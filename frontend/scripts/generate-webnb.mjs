import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

const schema = JSON.parse(await readFile(new URL("../../schemas/webnb-1.0.schema.json", import.meta.url), "utf8"));
const directory = new URL("../src/lib/notebook/generated/", import.meta.url);
const check = process.argv.includes("--check");
const types = await compile(schema, "Document", {
  bannerComment: "/* Сгенерировано из schemas/webnb-1.0.schema.json. Не редактировать вручную. */",
  maxItems: -1,
  additionalProperties: false,
});
// Компиляция происходит только при генерации: в браузере не нужны eval/new Function.
const ajv = new Ajv2020({ allErrors: true, strict: true, code: { source: true }, ownProperties: true });
ajv.addSchema(schema, "webnb");
const root = structuredClone(schema);
delete root.properties.cells.items;
ajv.addSchema(root, "root");
const exports = { validateRoot: "root" };
for (const name of ["MarkdownCell", "HtmlCell", "CssCell", "JavascriptCell"]) {
  ajv.addSchema({ $ref: `webnb#/$defs/${name}` }, name);
  exports[`validate${name}`] = name;
}
const validators = standaloneCode(ajv, exports);
const declarations = `import type { ValidateFunction } from "ajv";\ndeclare const validators: {\n${Object.keys(exports).map(name => `  ${name}: ValidateFunction;`).join("\n")}\n};\nexport = validators;\n`;
await mkdir(directory, { recursive: true });
for (const [name, content] of [["types.ts", types], ["validators.cjs", validators + "\n"], ["validators.d.cts", declarations]]) {
  const target = new URL(name, directory);
  if (check) {
    if (await readFile(target, "utf8") !== content) throw new Error(`Нужно обновить ${fileURLToPath(target)}`);
  } else {
    await writeFile(target, content, "utf8");
  }
}
console.log(check ? "Типы и валидаторы соответствуют JSON Schema." : "Типы и валидаторы .webnb сгенерированы.");
