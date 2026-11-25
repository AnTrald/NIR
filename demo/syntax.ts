import { parse } from "acorn";
import { cssLanguage } from "@codemirror/lang-css";
import { htmlLanguage } from "@codemirror/lang-html";

const optionalEnd = new Set("html head body li dt dd p rt rp optgroup option colgroup thead tbody tfoot tr td th".split(" "));
const voidTags = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));

export function syntaxIssue(kind: "HTML" | "CSS" | "JavaScript", source: string) {
  function at(pos: number, message: string) {
    const lines = source.slice(0, pos).split(/\r\n?|\n/);
    return { line: lines.length, column: lines[lines.length - 1].length + 1, message };
  }
  if (kind === "JavaScript") {
    try { parse(source, { ecmaVersion: "latest", sourceType: "script" }); }
    catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return at((error as SyntaxError & { pos: number }).pos, "Ошибка JavaScript: " + error.message.replace(/ \(\d+:\d+\)$/, ""));
    }
    return;
  }
  let issue: ReturnType<typeof at> | undefined;
  const parser = kind === "HTML" ? htmlLanguage.parser : cssLanguage.parser;
  parser.parse(source).iterate({ enter(ref) {
    if (issue) return false;
    const node = ref.node;
    if (node.type.isError || node.name === "MismatchedCloseTag") {
      issue = at(node.from, node.name === "MismatchedCloseTag" ? "Закрывающий тег не соответствует открытому." :
        kind === "CSS" ? "Проверьте синтаксис правила CSS." : "Проверьте синтаксис HTML-разметки.");
    } else if (node.name === "Declaration" && node.lastChild?.name === ":" && !source.startsWith("--", node.from)) {
      issue = at(node.to, "После двоеточия требуется значение свойства.");
    } else if (node.name === "OpenTag" || node.name === "SelfClosingTag") {
      const seen = new Set<string>();
      for (const attribute of node.getChildren("Attribute")) {
        const name = attribute.getChild("AttributeName");
        if (!name) continue;
        const key = source.slice(name.from, name.to).toLowerCase();
        if (seen.has(key)) { issue = at(name.from, "Атрибут " + key + " указан повторно."); break; }
        seen.add(key);
      }
    } else if (node.name === "Element") {
      const name = node.getChild("OpenTag")?.getChild("TagName");
      if (!name || node.getChild("CloseTag") || node.getChild("MismatchedCloseTag")) return;
      const tag = source.slice(name.from, name.to).toLowerCase();
      if (!voidTags.has(tag) && !optionalEnd.has(tag)) issue = at(name.from, "Отсутствует закрывающий тег </" + tag + ">.");
    }
  } });
  return issue;
}
