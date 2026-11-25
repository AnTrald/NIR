export const tags = ["div", "section", "article", "main", "header", "footer", "nav", "aside"];
export function openingTag(n: { tag: string; classes: string }) {
  const classes = n.classes.trim().replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  return "<" + n.tag + (classes ? ' class="' + classes + '"' : "") + ">";
}

export function validateWrapper(source: string) {
  let pos = 0;
  function consume(pattern: RegExp) {
    const match = pattern.exec(source.slice(pos));
    if (match) pos += match[0].length;
    return match;
  }
  function fail(error: string) { return { error, line: source.slice(0, pos).split(/\r\n?|\n/).length }; }
  consume(/^\s*/);
  const tag = consume(/^<([a-z][a-z0-9-]*)/i)?.[1].toLowerCase();
  if (!tag || !tags.includes(tag)) return fail("Допустимые теги: " + tags.join(", ") + ".");
  if (consume(/^\s+/) && consume(/^class\s*=\s*/i) && !consume(/^(?:"[^"]*"|'[^']*')/)) {
    return fail("Заключите значение class в кавычки.");
  }
  consume(/^\s*/);
  if (!consume(/^>/)) return fail("Ожидается >. У обёртки допустим только атрибут class.");
  consume(/^\s*/);
  const closing = /^<\/([a-z][a-z0-9-]*)\s*>/i;
  if (closing.exec(source.slice(pos))?.[1].toLowerCase() !== tag) return fail("Ожидается закрывающий тег </" + tag + ">.");
  consume(closing);
  consume(/^\s*/);
  if (pos !== source.length) return fail("После закрывающего тега обёртки есть лишний код.");
  const template = document.createElement("template");
  template.innerHTML = source.trim();
  return { value: { tag, classes: template.content.firstElementChild!.getAttribute("class") ?? "" } };
}
