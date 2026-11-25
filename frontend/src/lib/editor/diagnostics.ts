import { parse as parseScript } from "acorn";
import { find, generate, lexer, parse as parseCss, tokenize, tokenTypes as T, walk } from "css-tree";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { htmlLanguage } from "@codemirror/lang-html";
import { activeStyles } from "../../components/editor/cssDeclarations";
import type { Kind } from "./tree";

export type Issue = { line: number; message: string };
function lineAt(source: string, offset: number) {
  return source.slice(0,offset).split(/\r\n?|\n/).length;
}

function javascript(source: string, handler = false): Issue[] {
  try {
    parseScript(source, { ecmaVersion:"latest", sourceType:"script", locations:true, allowReturnOutsideFunction:handler });
    return [];
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    const line = (error as SyntaxError & {loc:{line:number}}).loc.line;
    return [{line,message:"Ошибка JavaScript: "+error.message.replace(/ \(\d+:\d+\)$/,"")}];
  }
}

function css(source: string, inline = false): Issue[] {
  const issues: Issue[] = [];
  const report = (offset:number,message:string) => issues.push({line:lineAt(source,offset),message});
  const stack: { close:number; start:number }[] = [];
  const pairs = new Map([[T.LeftCurlyBracket,T.RightCurlyBracket],[T.LeftParenthesis,T.RightParenthesis],
    [T.Function,T.RightParenthesis],[T.LeftSquareBracket,T.RightSquareBracket]]);
  tokenize(source,(token,start,end)=>{
    const close = pairs.get(token);
    if (close !== undefined) stack.push({close,start});
    else if ([T.RightCurlyBracket,T.RightParenthesis,T.RightSquareBracket].includes(token)) {
      if (stack.pop()?.close!==token) report(start,"Лишняя или несовпадающая закрывающая скобка.");
    } else if (token===T.Comment && !source.slice(start+2,end).endsWith("*/")) report(start,"Не закрыт комментарий CSS.");
    else if (token===T.BadString || (token===T.String && (end-start===1 || source[end-1]!==source[start]))) report(start,"Не закрыта строка CSS.");
    else if (token===T.BadUrl) report(start,"Некорректный url().");
  });
  for (const item of stack) report(item.start,"Не закрыта скобка CSS.");
  const ast = parseCss(source, { context:inline?"declarationList":"stylesheet", positions:true,
    onParseError(error){ issues.push({line:error.line,message:"Синтаксис CSS: "+error.message}); } });
  walk(ast,function(node){
    if (node.type!=="Declaration" || node.property.startsWith("--")) return;
    const descriptor = this.atrule && this.atrule.block===this.block && !this.rule;
    const result = descriptor && this.atrule
      ? lexer.matchAtruleDescriptor(this.atrule.name,node.property,node.value)
      : lexer.matchDeclaration(node);
    if (!result.error) return;
    const value = generate(node.value);
    const malformedVar = find(node.value, child=>{
      if (child.type!=="Function" || child.name.toLowerCase()!=="var") return false;
      const [name,comma]=child.children.toArray();
      return name?.type!=="Identifier" || !name.name.startsWith("--") || name.name.length===2
        || (comma!==undefined && (comma.type!=="Operator" || comma.value!==","));
    });
    if (malformedVar) {
      issues.push({line:malformedVar.loc?.start.line ?? 1,message:"В var() укажите имя CSS-переменной с --. Запасное значение отделяется запятой."});
      return;
    }
    // Браузер знает экспериментальные свойства. var()/env()/attr() вычисляются позднее.
    if (!descriptor && globalThis.CSS?.supports(node.property,value)) return;
    if (!descriptor && lexer.getProperty(node.property) && /\b(?:var|env|attr)\(/i.test(value) && value.trim()) return;
    const unknown = !descriptor && !lexer.getProperty(node.property);
    issues.push({line:node.loc?.start.line ?? 1, message:unknown
      ? "Неизвестное CSS-свойство «"+node.property+"»."
      : "Проверьте значение «"+node.property+"»: "+(value || "значение отсутствует")+"."});
  });
  return issues;
}

const optionalEnd = new Set("html head body li dt dd p rt rp optgroup option colgroup thead tbody tfoot tr td th".split(" "));
const voidTags = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
function html(source: string): Issue[] {
  const issues: Issue[] = [];
  const fragment = parseFragment(source,{sourceCodeLocationInfo:true,onParseError(error){
    issues.push({line:error.startLine,message:error.code==="duplicate-attribute" ? "Атрибут указан повторно." : "Некорректная разметка HTML ("+error.code+")."});
  }});
  function visit(node: DefaultTreeAdapterTypes.ChildNode) {
    if (!("tagName" in node)) return;
    const loc = node.sourceCodeLocation;
    if (loc) {
      const tag = node.tagName;
      if (tag==="script") issues.push({line:loc.startLine,message:"Поместите скрипт в ячейку JavaScript."});
      if (node.namespaceURI==="http://www.w3.org/1999/xhtml" && !loc.endTag && !optionalEnd.has(tag) && !voidTags.has(tag))
        issues.push({line:loc.startLine,message:"Отсутствует закрывающий тег </"+tag+">."});
      for (const attr of node.attrs) {
        if (attr.name!=="style" && !attr.name.startsWith("on")) continue;
        const position = loc.attrs?.[attr.name];
        if (!position) continue;
        const prefix = /^[^=]*=\s*["']?/.exec(source.slice(position.startOffset,position.endOffset))?.[0] ?? "";
        const base = lineAt(source,position.startOffset+prefix.length);
        const embedded = attr.name==="style" ? css(attr.value,true) : javascript(attr.value,true);
        for (const issue of embedded) issues.push({line:base+issue.line-1,message:attr.name+": "+issue.message});
      }
      if (tag==="style") {
        const content = node.childNodes[0];
        if (content && "value" in content) for (const issue of css(content.value))
          issues.push({line:(loc.startTag?.endLine ?? loc.startLine)+issue.line-1,message:issue.message});
      }
    }
    for (const child of ("content" in node ? node.content : node).childNodes) visit(child);
  }
  fragment.childNodes.forEach(visit);
  htmlLanguage.parser.parse(source).iterate({enter(ref){
    if (ref.name==="MismatchedCloseTag" || ref.name==="UnmatchedCloseTag")
      issues.push({line:lineAt(source,ref.from),message:"Закрывающий тег не соответствует открытому."});
  }});
  return issues;
}
export function validateCode(kind: Kind, source: string): Issue[] {
  const issues = kind==="css" ? css(activeStyles(source)) : kind==="html" ? html(source) : kind==="javascript" ? javascript(source) : [];
  return issues.filter((item,i)=>issues.findIndex(other=>other.line===item.line && other.message===item.message)===i)
    .sort((a,b)=>a.line-b.line);
}

