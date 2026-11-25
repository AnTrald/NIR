import { useEffect, useMemo, useState } from "react";
import { EditorView } from "@codemirror/view";
import { syntaxIssue } from "../syntax";
import { createRoot } from "react-dom/client";
import MarkdownIt from "markdown-it";
import { ArrowDown, ArrowUp, BookOpen, Braces, Check, ChevronDown, Code2, FileText, Group, Monitor, Moon, NotebookPen, Plus, RotateCw, SquareFunction, Sun, Trash2 } from "lucide-react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { CellEditor, type Kind } from "../CellEditor";
import { activeStyles } from "../cssDeclarations";
import { PreviewFrame, previewPage } from "../PreviewFrame";
import "./style.css";
import { openingTag, tags, validateWrapper } from "../wrapper";

const languages = { Markdown: BookOpen, HTML: Code2, CSS: Braces, JavaScript: SquareFunction };
type Wrapper = { tag: string; classes: string };
type Cell = { id: string; kind: Kind; title: string; source: string; enabled: boolean; parent?: string; wrapper?: Wrapper };
const cell = (kind: Kind, source: string, title: string = kind): Cell => ({ id: crypto.randomUUID(), kind, title, source, enabled: true });
const markdown = new MarkdownIt({ html: false });
const swatches = [
  ["Шалфей", "#9CAD98"], ["Глина", "#C4866B"], ["Лён", "#D9CBAF"],
];
const pageStyles = `body { margin: 0; padding: 26px; color: #322e29; background: #fcfaf6; font: 14px system-ui; }
h1 { margin: 0 0 20px; font: 34px Georgia, serif; }
.palette { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 10px; }
article { min-width: 0; }
.paint { height: 106px; border-radius: 44% 43% 4px 4px; background: var(--paint); }
h2 { font: 18px Georgia, serif; margin: 10px 0 3px; }
small { font: 11px monospace; color: #645e55; }
@media(max-width:300px){.palette{grid-template-columns:1fr}.paint{height:45px}}`;
function initial() {
  const palette = {...cell("HTML",""), wrapper:{tag:"section", classes:"palette"}};
  return [
    cell("Markdown", "## Палитра мастерской\nТри природных оттенка. Измените цвет в HTML и сравните результат в предпросмотре."),
    cell("HTML", "<h1>Природные оттенки</h1>", "Заголовок"),
    palette,
    ...swatches.map(([name, color]) => ({...cell("HTML",
      `<article style="--paint: ${color}">\n  <div class="paint"></div>\n  <h2>${name}</h2><small>${color}</small>\n</article>`, name), parent:palette.id})),
    cell("CSS", pageStyles, "Стили палитры"),
    {...cell("JavaScript", "console.log('Палитра готова');", "Сценарий палитры"), enabled:false},
  ];
}
function compile(cells: Cell[]) {
  const sources = (kind: Kind) => cells.filter(c => c.enabled && c.kind === kind).map(c => c.source);
  function render(parent?: string): string {
    return cells.filter(c => c.kind === "HTML" && c.enabled && c.parent === parent).map(c =>
      c.wrapper ? openingTag(c.wrapper) + "\n" + render(c.id) + "\n</" + c.wrapper.tag + ">" : c.source).join("\n");
  }
  const body = render();
  return { body, page: previewPage({body, styles: sources("CSS").map(activeStyles), scripts: sources("JavaScript")}) };
}
function diagnostics(cells: Cell[], editing: string, draft: string) {
  const issues: {cell: Cell; line: number; message: string}[] = [];
  function visit(parent?: string) {
    for (const cell of cells.filter(item=>item.parent===parent && item.enabled)) {
      if (cell.wrapper) {
        if (cell.id === editing) {
          const result = validateWrapper(draft);
          if (result.error) issues.push({cell,line:result.line!,message:result.error});
        }
        visit(cell.id);
      } else if (cell.kind !== "Markdown") {
        const issue = syntaxIssue(cell.kind, cell.kind === "CSS" ? activeStyles(cell.source) : cell.source);
        if (issue) issues.push({cell, ...issue});
      }
    }
  }
  visit();
  return issues;
}
function Prototype() {
  const [cells, setCells] = useState(initial);
  const [preview, setPreview] = useState(() => ({ ...compile(cells), run: 1, cells }));
  const [current, setCurrent] = useState(cells[1].id);
  const [editing, setEditing] = useState("");
  const [selection, select] = useState<string[]>([]);
  const [anchor, setAnchor] = useState("");
  const [folded, fold] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [tag, setTag] = useState("div");
  const [classes, setClasses] = useState("");
  const parsed = validateWrapper(draft);
  const issues = useMemo(()=>diagnostics(cells,editing,draft),[cells,editing,draft]);
  function reveal(cell: Cell, line: number) {
    const parents = ancestors(cell);
    fold(ids=>ids.filter(id=>!parents.includes(id)));
    setCurrent(cell.id);
    requestAnimationFrame(()=>{
      const block = document.getElementById(cell.id);
      const content = block?.querySelector(":scope > .source-editor .cm-content, :scope > .wrapper-edit .cm-content");
      const view = content && EditorView.findFromDOM(content);
      if (!view) return;
      const pos = view.state.doc.line(line).from;
      view.dispatch({selection:{anchor:pos}});
      view.focus();
      const dom = view.domAtPos(pos).node;
      (dom instanceof Element ? dom : dom.parentElement)?.closest(".cm-line")?.scrollIntoView({block:"center"});
    });
  }
  const chosen = cells.filter(c => selection.includes(c.id));
  const siblings = cells.filter(c => c.parent === chosen[0]?.parent);
  function ancestors(c: Cell) {
    const path: string[] = [];
    while (c.parent) {
      path.push(c.parent);
      c = cells.find(item => item.id === c.parent)!;
    }
    return path;
  }
  function height(c: Cell): number {
    return c.wrapper ? 1 + Math.max(0,...cells.filter(item=>item.parent===c.id).map(height)) : 0;
  }
  const contiguous = chosen.length >= 2 && chosen.every((c,i) => siblings[siblings.indexOf(chosen[0]) + i] === c);
  const canGroup = contiguous && ancestors(chosen[0]).length + 1 + Math.max(...chosen.map(height)) <= 8;
  function mark(c: Cell, shift: boolean) {
    if (c.kind !== "HTML") return;
    const peers = cells.filter(item => item.parent === c.parent);
    const start = peers.findIndex(item => item.id === anchor);
    const end = peers.indexOf(c);
    if (shift && start >= 0) {
      select(peers.slice(Math.min(start,end),Math.max(start,end)+1).filter(item=>item.kind==="HTML").map(item=>item.id));
    } else {
      select(selection.includes(c.id) ? selection.filter(id=>id!==c.id) : [...selection,c.id]);
      setAnchor(c.id);
    }
  }
  function commit(next:Cell[], id:string) {
    setCells(next); setCurrent(id); select([]); setAnchor(""); run(next);
  }
  function group() {
    if (!canGroup) return;
    const wrapper = {...cell("HTML",""),parent:chosen[0].parent, wrapper:{tag, classes:classes.trim()}};
    const next = cells.map(c=>selection.includes(c.id)?{...c,parent:wrapper.id}:c);
    next.splice(cells.indexOf(chosen[0]),0,wrapper);
    commit(next,wrapper.id);
  }
  function ungroup(c:Cell) {
    const children = cells.filter(child=>child.parent===c.id);
    const next = cells.filter(child=>child.parent!==c.id);
    next.splice(next.indexOf(c),1,...children.map(child=>({...child,parent:c.parent})));
    commit(next,children[0]?.id ?? c.parent ?? "");
  }
  const [zoom, setZoom] = useState(100);
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("webnb-design-theme");
    return saved ? saved === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("webnb-design-theme", dark ? "dark" : "light");
  }, [dark]);
  const [armed, arm] = useState("");
  const [dragged, drag] = useState("");
  const [drop, setDrop] = useState<{id: string; after: boolean} | null>(null);
  function run(next = cells) {
    if ((next===cells ? issues : diagnostics(next,editing,draft)).length) return;
    setPreview(last => ({...compile(next), run: last.run + 1, cells: next}));
  }
  function finishNote(focusId: string) {
    setEditing("");
    document.getElementById(focusId)?.focus();
  }
  function update(id: string, change: Partial<Cell>, restart = false) {
    const next = cells.map(c => c.id === id ? {...c, ...change} : c);
    setCells(next);
    if (restart) run(next);
  }
  function add(kind: Kind) {
    const fresh = cell(kind, {HTML:"<p>Новый текст</p>",CSS:"p { color: teal; }",JavaScript:"console.log('Привет');",Markdown:"## Заметка"}[kind]);
    let number = 1;
    while (cells.some(c=>c.title===kind+" "+number)) number++;
    fresh.title = kind+" "+number;
    let active = cells.find(c=>c.id===current);
    while (active?.parent && kind!=="HTML") active=cells.find(c=>c.id===active!.parent);
    fresh.parent = active?.parent;
    const index = active ? cells.indexOf(active)+1 : cells.length;
    const next = [...cells.slice(0,index), fresh, ...cells.slice(index)];
    commit(next,fresh.id);
    if (kind === "Markdown") setEditing(fresh.id);
    requestAnimationFrame(() => document.getElementById(fresh.id)?.scrollIntoView({block:"nearest"}));
  }
  function move(id: string, target: string, after: boolean) {
    const moving = cells.find(c => c.id === id);
    const dest = cells.find(c=>c.id===target);
    if (!moving || !dest || !canMove(moving,dest)) return;
    const next = cells.filter(c => c !== moving);
    const at = next.findIndex(c => c.id === target);
    if (at < 0) return;
    next.splice(at + Number(after), 0, {...moving,parent:dest.parent});
    commit(next,id);
  }
  function canMove(c: Cell, dest: Cell) {
    const path = ancestors(dest);
    return c.id!==dest.id && !path.includes(c.id) && (!dest.parent || c.kind==="HTML") && path.length+height(c)<=8;
  }
  function remove(c: Cell) {
    if (!window.confirm(c.wrapper ? "Удалить группу вместе с содержимым?" : "Удалить ячейку " + c.kind + "?")) return;
    const index = cells.indexOf(c);
    const next = cells.filter(item => item.id !== c.id && !ancestors(item).includes(c.id));
    commit(next,next[index]?.id ?? next[index-1]?.id ?? "");
    if (editing === c.id) setEditing("");
  }
  function rows(parent?:string): React.ReactNode {
    const peers = cells.filter(c=>c.parent===parent);
    return peers.map((c,index)=>{
          const Icon = languages[c.kind];
          const reading = c.kind === "Markdown" && editing !== c.id;
          return <ContextMenu.Root key={c.id}><ContextMenu.Trigger asChild><Card id={c.id} tabIndex={0} className="cell" data-kind={c.kind} data-current={current === c.id} data-muted={!c.enabled}
            data-selected={selection.includes(c.id) || undefined} data-wrapper={!!c.wrapper || undefined}
            data-error={issues.some(issue=>issue.cell.id===c.id) || undefined}
            data-reading={reading || undefined} aria-label={reading ? "Заметка Markdown" : undefined}
            draggable={armed===c.id} data-drop={drop?.id===c.id?(drop.after?"after":"before"):undefined}
            onContextMenuCapture={e=>{if ((e.target as Element).closest(".source-editor")) e.stopPropagation();}}
            onKeyDown={e=>{if(c.kind==="HTML" && e.target===e.currentTarget && e.key===" "){ e.preventDefault(); mark(c,e.shiftKey); } else if(reading && e.target===e.currentTarget && e.key==="Enter"){
              e.preventDefault(); setEditing(c.id);
            } else if(e.target===e.currentTarget && e.shiftKey && e.key==="F10"){
              e.preventDefault(); const r=e.currentTarget.getBoundingClientRect();
              e.currentTarget.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:r.left+24,clientY:r.top+20}));
            }}}
            onPointerDownCapture={e=>arm(e.button===0 && !(e.target as Element).closest(".source-editor,button,a,input")?c.id:"")}
            onDragStart={e=>{if(e.target!==e.currentTarget || armed!==c.id)return;
              e.dataTransfer.setData("application/x-notebook-cell",c.id); e.dataTransfer.effectAllowed="move"; drag(c.id);}}
            onDragOver={e=>{e.stopPropagation();const moving=cells.find(item=>item.id===dragged);if(!moving || !canMove(moving,c)){setDrop(null);return;} e.preventDefault();e.dataTransfer.dropEffect="move";
              const r=e.currentTarget.getBoundingClientRect();setDrop({id:c.id,after:e.clientY>r.top+r.height/2});}}
            onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDrop(null);}}
            onDrop={e=>{e.stopPropagation();if(!dragged)return;e.preventDefault(); const r=e.currentTarget.getBoundingClientRect();
              move(dragged,c.id,e.clientY>r.top+r.height/2);drag("");arm("");setDrop(null);}}
            onDragEnd={()=>{drag("");arm("");setDrop(null);}}
            onFocus={e=>{e.stopPropagation();setCurrent(c.id);}}
            onClick={e=>{
              e.stopPropagation();
              setCurrent(c.id);
              if (anchor && e.shiftKey && e.detail === 1 && !(e.target as Element).closest("button,input,a,.source-editor")) mark(c,true);
            }}
            onDoubleClick={e=>{
              e.stopPropagation();
              if (!e.shiftKey && !(e.target as Element).closest("button,input,a,.source-editor")) mark(c,false);
            }}>
            <div className="cell-head">{c.wrapper ? <div className="group-tag"><Button variant="ghost" size="xs" aria-label={folded.includes(c.id)?"Развернуть группу":"Свернуть группу"} aria-expanded={!folded.includes(c.id)} onClick={()=>fold(folded.includes(c.id)?folded.filter(id=>id!==c.id):[...folded,c.id])}><ChevronDown size={14}/></Button><code>{openingTag(c.wrapper)}{folded.includes(c.id) && " … </"+c.wrapper.tag+">"}</code></div> : <div className="cell-caption"><span className="language"><Icon size={14}/>{c.kind}</span>{c.title!==c.kind && <span>{c.title}</span>}</div>}
              <div className="cell-actions">{c.wrapper && <Button variant="ghost" size="xs" onClick={()=>{setEditing(editing===c.id?"":c.id);setDraft(openingTag(c.wrapper!)+"\n</"+c.wrapper!.tag+">");}}>{editing===c.id?"Отмена":"Изменить"}</Button>}{c.kind==="Markdown" && <Button variant="ghost" size="xs" onClick={()=>reading?setEditing(c.id):finishNote(c.id)}>{reading?"Изменить":"Готово"}</Button>}
              <Button className="delete-cell" variant="ghost" size="xs" title="Удалить ячейку" aria-label={"Удалить ячейку "+c.kind}
                onClick={e=>{e.stopPropagation();remove(c);}}><Trash2 size={15}/></Button>
              {c.kind!=="Markdown" && <button className="activity" role="checkbox" aria-checked={c.enabled} aria-label={"Активность ячейки "+c.kind} onClick={()=>update(c.id,{enabled:!c.enabled},true)}>{c.enabled&&<Check size={12}/>}</button>}</div></div>
            {c.wrapper ? <>
              {editing===c.id && <div className="wrapper-edit"><CellEditor kind="HTML" dark={dark} label="Код обёртки" autoFocus value={draft} onChange={setDraft}/>
                {parsed.error && <small role="alert">{parsed.error}</small>}
                <Button size="xs" disabled={!parsed.value} onClick={()=>{if(parsed.value){update(c.id,{wrapper:parsed.value},true);setEditing("");}}}>Применить</Button></div>}
              {!folded.includes(c.id) && <><div className="group-children">{rows(c.id)}</div>
                <code className="group-end">{`</${c.wrapper.tag}>`}</code></>}
            </> : reading ? <div className="note" data-empty={!c.source.trim() || undefined} onDoubleClick={e=>{if (!(e.target as Element).closest("a")) setEditing(c.id);}} dangerouslySetInnerHTML={{__html:markdown.render(c.source)}}/>
              : <CellEditor kind={c.kind} dark={dark} label={c.kind+" · исходный код"} value={c.source} autoFocus={editing===c.id}
                  onChange={(source,refresh)=>update(c.id,{source},refresh && c.kind !== "Markdown")} onFinish={c.kind==="Markdown"?()=>finishNote(peers[index+1]?.id ?? c.id):undefined}/>}
          </Card></ContextMenu.Trigger><ContextMenu.Portal><ContextMenu.Content data-slot="dropdown-menu-content" aria-label="Действия с ячейкой">
            {selection.includes(c.id) && <ContextMenu.Item data-slot="dropdown-menu-item" disabled={!canGroup} onSelect={group}><Group size={15}/>Сгруппировать выбранные ({chosen.length})</ContextMenu.Item>}
            <ContextMenu.Item data-slot="dropdown-menu-item" disabled={!index} onSelect={()=>move(c.id,peers[index-1].id,false)}><ArrowUp size={15}/>Выше</ContextMenu.Item>
            <ContextMenu.Item data-slot="dropdown-menu-item" disabled={index===peers.length-1} onSelect={()=>move(c.id,peers[index+1].id,true)}><ArrowDown size={15}/>Ниже</ContextMenu.Item>
            {c.wrapper && <ContextMenu.Item data-slot="dropdown-menu-item" onSelect={()=>ungroup(c)}>Разгруппировать</ContextMenu.Item>}
            <ContextMenu.Item data-slot="dropdown-menu-item" className="destructive" onSelect={()=>remove(c)}><Trash2 size={15}/>Удалить ячейку</ContextMenu.Item>
          </ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>;
    });
  }
  return <main>
    <header className="appbar"><div className="brand"><span className="brand-icon"><NotebookPen size={19}/></span>Web Notebook</div>
      <div className="app-actions"><Button variant="outline" aria-label="Тёмная тема" aria-pressed={dark}
        title={dark?"Включить светлую тему":"Включить тёмную тему"} onClick={()=>setDark(!dark)}>
        {dark?<Sun size={16}/>:<Moon size={16}/>}</Button>
      <Button variant="outline" onClick={() => run()}><RotateCw size={15}/>Перезапустить</Button></div></header>
    <div className="workspace-design">
      <section className="edit-pane">
        <div className="editor-toolbar"><header className="pane-heading"><div><h1>Ячейки</h1><span className="count">{cells.length}</span></div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button><Plus size={16}/>Добавить ячейку<ChevronDown size={14}/></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">{(Object.keys(languages) as Kind[]).map(k => {const Icon=languages[k];return <DropdownMenuItem key={k} onSelect={()=>add(k)}><Icon size={16}/>{k}</DropdownMenuItem>;})}</DropdownMenuContent>
          </DropdownMenu></header>
        <div className="group-tools">
          <label>Тег <select value={tag} onChange={e=>setTag(e.target.value)}>{tags.map(t=><option key={t}>{t}</option>)}</select></label>
          <input aria-label="Классы контейнера" placeholder="Классы CSS" value={classes} onChange={e=>setClasses(e.target.value)}/>
          <Button size="xs" variant="outline" disabled={!canGroup} onClick={group}><Group size={15}/>Сгруппировать</Button>
          <span className="selection-count" aria-live="polite">Выбрано блоков: {chosen.length}</span>
          <small>{canGroup ? "Правый щелчок по контуру — сгруппировать." : contiguous ? "Допускается до восьми уровней групп." : chosen.length>=2 ? "Для группировки нужны соседние блоки одного родителя." : "Двойной щелчок по контуру отмечает HTML-блок. Shift + щелчок выбирает диапазон соседних блоков."}</small>
        </div></div>
        <div className="cell-list">{rows()}</div>
      </section>
      <aside><header className="pane-heading"><div><Monitor size={17}/><h2>Предпросмотр</h2></div></header>
        <Card className="preview-card"><div className="preview-tools"><span role="status"><i/>{issues.length?"Запуск заблокирован":preview.cells===cells?"Запуск №"+preview.run:"Есть правки"}</span>
          <div className="zoom-control">
            <label htmlFor="preview-zoom">Масштаб</label>
            <input id="preview-zoom" type="range" min={25} max={300} step={5} value={zoom}
              aria-valuetext={zoom + "%"} onChange={e => setZoom(e.target.valueAsNumber)}/>
            <output htmlFor="preview-zoom">{zoom}%</output>
            <Button variant="ghost" size="xs" aria-label="Сбросить масштаб" title="Сбросить масштаб" onClick={() => setZoom(100)}>1:1</Button>
          </div></div>
          {issues.length>0 && <section className="diagnostics" aria-label="Ошибки синтаксиса">
            <strong>Показан последний успешный запуск</strong>
            <ul>{issues.map(({cell,line,message})=><li key={cell.id}>
              <button onClick={()=>reveal(cell,line)}>Блок «{cell.wrapper ? openingTag(cell.wrapper) : cell.title}» ({cell.wrapper?"обёртка":cell.kind}), строка {line}</button> — {message}
            </li>)}</ul>
          </section>}
          <div className="viewport"><PreviewFrame key={preview.run} page={preview.page} zoom={zoom}/></div>
          <details><summary><FileText size={15}/>Собранный HTML<ChevronDown size={14}/></summary><pre>{preview.body}</pre></details>
        </Card>
      </aside>
    </div>
  </main>;
}
createRoot(document.getElementById("root")!).render(<Prototype/>);
