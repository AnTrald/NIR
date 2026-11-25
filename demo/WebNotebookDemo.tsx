import { useEffect, useMemo, useState, type DragEvent } from "react";

import MarkdownIt from "markdown-it";
import { EditorView } from "@codemirror/view";
import { CellEditor, type Kind } from "./CellEditor";
import { activeStyles } from "./cssDeclarations";
import { PreviewFrame, previewPage } from "./PreviewFrame";
import { syntaxIssue } from "./syntax";

const markdownRenderer = new MarkdownIt({ html: false });
type Item = { id: string; parent: string | null; kind: Kind | "Группа"; title: string; source: string; enabled: boolean; tag: string; classes: string };
type Position = "before" | "after" | "inside";
const kinds: Kind[] = ["HTML", "CSS", "JavaScript", "Markdown"];
import { openingTag, tags, validateWrapper } from "./wrapper";
const samples: Record<Kind,string> = {
  HTML: "<article>Новая карточка</article>",
  CSS: "body { font: 16px system-ui; padding: 16px; }\nh1 { color: royalblue; }\n.catalog { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }\n.catalog > article { padding: 16px; border: 2px solid royalblue; border-radius: 8px; }",
  JavaScript: "const heading = document.querySelector('h1');\nif (heading) heading.textContent = 'JavaScript работает!';",
  Markdown: "# Заметка\nОписание эксперимента",
};
function make(kind: Item["kind"], title: string, source = ""): Item {
  return {id: crypto.randomUUID(), parent:null, kind, title, source, enabled:true, tag:"div", classes:""};
}
const saveKey = "web-notebook-demo:cells:v1";
function initial(): Item[] {
  try {
    const saved = JSON.parse(localStorage.getItem(saveKey) ?? "null");
    if (Array.isArray(saved) && saved.every(n => n && typeof n.id === "string" && typeof n.source === "string"
      && (kinds.includes(n.kind) || n.kind === "Группа"))) return saved.map((n: Item) => n.kind === "Markdown" ? { ...n, enabled: true } : n);
  } catch { /* Хранилище может быть недоступно в приватном режиме. */ }
  const catalog = { ...make("Группа", "Каталог"), tag: "section", classes: "catalog" };
  return [
    make("Markdown", "Заметка", "## Каталог посуды\nПроверим, как класс `.catalog` размещает **две карточки** рядом."),
    make("HTML", "Заголовок", "<h1>Каталог посуды</h1>"), catalog,
    { ...make("HTML", "Кружка", "<article>Кружка</article>"), parent: catalog.id },
    { ...make("HTML", "Тарелка", "<article>Тарелка</article>"), parent: catalog.id },
    make("CSS", "Стили", samples.CSS),
    { ...make("JavaScript", "Поведение", samples.JavaScript), enabled: false },
  ];
}
const nestable = (n: Item) => n.kind === "HTML" || n.kind === "Группа";
const children = (items: Item[], parent: string|null) => items.filter(n=>n.parent===parent);
function ancestors(items: Item[], n: Item): string[] {
  return n.parent ? [n.parent,...ancestors(items,items.find(x=>x.id===n.parent)!)] : [];
}
function compile(items:Item[]) {
  function html(parent:string|null):string {
    return children(items,parent).filter(n=>n.enabled && nestable(n)).map(n=>{
      if(n.kind==="HTML") return n.source;
      return openingTag(n)+"\n"+html(n.id)+"\n</"+n.tag+">";
    }).join("\n");
  }
  const styles = items.filter(n => n.kind === "CSS" && n.enabled).map(n => activeStyles(n.source));
  const js = items.filter(n => n.kind === "JavaScript" && n.enabled);
  const body = html(null);
  return { body, styles, scripts: js.map(n => n.source) };
}
function projectErrors(items: Item[]) {
  return items.flatMap(n => {
    if (!n.enabled || n.kind === "Markdown" || ancestors(items, n).some(id => !items.find(x => x.id === id)?.enabled)) return [];
    const issue = n.kind === "Группа"
      ? (!tags.includes(n.tag) ? { line: 1, column: 1, message: "Недопустимый тег обёртки." } : undefined)
      : syntaxIssue(n.kind, n.kind === "CSS" ? activeStyles(n.source) : n.source);
    return issue ? [{ id: n.id, title: n.title, kind: n.kind, ...issue }] : [];
  });
}
export default function WebNotebookDemo(){
  const [items,setItems]=useState(initial);
  const [current,focus]=useState(items[0]?.id ?? "");
  const [selected,select]=useState<string[]>([]);
  const [anchor,setAnchor]=useState("");
  const [tag,setTag]=useState("section"),[classes,setClasses]=useState("catalog");
  const [closed,fold]=useState<string[]>([]);
  const [previous,remember]=useState<Item[]|null>(null);
  const [drag,setDrag]=useState("");
  const [dragSource, setDragSource] = useState("");
  const [dropTarget, setDropTarget] = useState<{id: string; pos: Position; closing: boolean} | null>(null);
  function build(project: Item[]) {
    const compiled = compile(project);
    return { body: compiled.body, page: previewPage(compiled), project };
  }
  const errors = useMemo(() => projectErrors(items), [items]);
  const [preview, setPreview] = useState(() => errors.length ? null : ({ ...build(items), run: 1 }));
  const [saveStatus, setSaveStatus] = useState("");
  function restart(project: Item[]) {
    if ((project === items ? errors : projectErrors(project)).length) return false;
    if (wrapperResult?.error && project.some(n => n.id === editingWrapper && n.enabled && !ancestors(project, n).some(id => !project.find(x => x.id === id)?.enabled))) return false;
    const next = build(project);
    setPreview(last => ({ ...next, run: (last?.run ?? 0) + 1 }));
    setSaveStatus("");
    return true;
  }
  const [zoom, setZoom] = useState(100);
  const [editingMarkdown, setEditingMarkdown] = useState("");
  const [editingWrapper, setEditingWrapper] = useState("");
  const [wrapperDraft, setWrapperDraft] = useState("");
  const wrapperResult = editingWrapper ? validateWrapper(wrapperDraft) : undefined;
  const wrapper = items.find(n => n.id === editingWrapper);
  const visibleErrors = wrapper && wrapperResult?.error
    ? [...errors.filter(e => e.id !== wrapper.id), { id: wrapper.id, title: wrapper.title, kind: wrapper.kind, line: wrapperResult.line, message: wrapperResult.error }]
    : errors;
  function showError(id: string, line: number) {
    const cell = items.find(n => n.id === id);
    if (!cell) return;
    const parents = ancestors(items, cell);
    fold(ids => ids.filter(parent => !parents.includes(parent)));
    focus(id);
    requestAnimationFrame(() => {
      const block = document.getElementById("cell-" + id);
      const content = block?.querySelector(":scope > .line .cm-content");
      const editor = content && EditorView.findFromDOM(content);
      if (editor) {
        const pos = editor.state.doc.line(line).from;
        editor.focus();
        editor.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: "center" }) });
        return;
      }
      block?.focus({ preventScroll: true });
      block?.scrollIntoView({ block: "center" });
    });
  }
  useEffect(() => {
    function save(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.code !== "KeyS" || event.altKey || event.shiftKey) return;
      event.preventDefault();
      if (event.repeat) return;
      let project = items;
      if (editingWrapper && items.some(n => n.id === editingWrapper)) {
        const result = validateWrapper(wrapperDraft);
        if (!result.value) { setSaveStatus("Исправьте код обёртки перед сохранением"); return; }
        project = items.map(n => n.id === editingWrapper ? { ...n, ...result.value } : n);
        setItems(project); setEditingWrapper(""); remember(null);
      }
      const started = restart(project);
      try { localStorage.setItem(saveKey, JSON.stringify(project)); setSaveStatus(started ? "Сохранено в браузере" : "Черновик сохранён · запуск заблокирован"); }
      catch { setSaveStatus("Сохранить в браузере не удалось"); }
    }
    window.addEventListener("keydown", save, true);
    return () => window.removeEventListener("keydown", save, true);
  }, [items, editingWrapper, wrapperDraft]);
  const [actionsOpen, setActionsOpen] = useState(false);
  const active=items.find(n=>n.id===current);
  const chosen=items.filter(n=>selected.includes(n.id));
  const siblings=chosen.length?children(items,chosen[0].parent):[];
  const positions=chosen.map(n=>siblings.indexOf(n));
  const valid=chosen.length>=2 && chosen.every(n=>nestable(n)&&n.parent===chosen[0].parent)
    && Math.max(...positions)-Math.min(...positions)+1===chosen.length;
  function height(n:Item):number {
    return n.kind==="Группа"?1+Math.max(0,...children(items,n.id).map(height)):0;
  }
  const depthOK=valid && ancestors(items,chosen[0]).length+1+Math.max(...chosen.map(height))<=8;
  function commit(next:Item[], id:string){
    restart(next);
    setActionsOpen(false);remember(items);setItems(next);focus(id);select([]);setAnchor("");
  }
  function edit(id:string, change:Partial<Item>, refresh = true){
    const next = items.map(n=>n.id===id?{...n,...change}:n);
    remember(null);setItems(next);setSaveStatus("");
    if (refresh) restart(next);
  }
  function add(kind: Kind){
    let target=active;
    while(target?.parent && kind!=="HTML") target=items.find(n=>n.id===target!.parent);
    const cell={...make(kind,"Новая ячейка",samples[kind]),parent:target?.parent??null};
    const next=items.slice();next.splice(target?items.indexOf(target)+1:next.length,0,cell);commit(next,cell.id);
    requestAnimationFrame(() => {
      const block = document.getElementById("cell-" + cell.id);
      block?.focus({ preventScroll: true });
      block?.scrollIntoView({ block: "center" });
    });
  }
  function group(){
    if(!depthOK)return;
    const g={...make("Группа","Контейнер"),parent:chosen[0].parent,tag,classes};
    const next=items.map(n=>selected.includes(n.id)?{...n,parent:g.id}:n);
    next.splice(items.indexOf(chosen[0]),0,g);commit(next,g.id);
  }
  function ungroup(g:Item){
    const kids=children(items,g.id);
    const next=items.flatMap(n=>n.id===g.id?kids.map(k=>({...k,parent:g.parent})):n.parent===g.id?[]:[n]);
    commit(next,kids[0]?.id??g.parent??next[0]?.id??"");
  }
  function remove(n:Item){
    if((n.kind==="Группа" || n.source.trim()) && !window.confirm("Удалить «"+n.title+"»"+(n.kind==="Группа"?" вместе с содержимым":"")+"?"))return;
    const next=items.filter(x=>x.id!==n.id&&!ancestors(items,x).includes(n.id));commit(next,n.parent??next[0]?.id??"");
  }
  function permitted(n:Item,target:Item,pos:Position){
    const parent=pos==="inside"?target.id:target.parent;
    return n.id!==target.id && !ancestors(items,target).includes(n.id) && (!parent||nestable(n))
      && (pos!=="inside"||target.kind==="Группа") && ancestors(items,target).length+(pos==="inside"?1:0)+height(n)<=8;
  }
  function move(n:Item,target:Item,pos:Position){
    if(!permitted(n,target,pos))return;
    const next=items.filter(x=>x!==n);
    const index=pos==="inside"?next.length:next.indexOf(target)+(pos==="after"?1:0);
    next.splice(index,0,{...n,parent:pos==="inside"?target.id:target.parent});commit(next,n.id);
    if(pos==="inside")fold(closed.filter(id=>id!==target.id));
  }
  function mark(n:Item,shift:boolean){
    if (!nestable(n)) return;
    const list=children(items,n.parent), start=list.findIndex(x=>x.id===anchor);
    if(shift&&start>=0){const end=list.indexOf(n);select(list.slice(Math.min(start,end),Math.max(start,end)+1).filter(nestable).map(x=>x.id));}
    else{select(selected.includes(n.id)?selected.filter(id=>id!==n.id):[...selected,n.id]);setAnchor(n.id);}
  }
  function trackDrop(e: DragEvent<HTMLDivElement>, release = false) {
    const from = items.find(x => x.id === drag);
    if (!from) return;
    e.preventDefault();
    let nearest: HTMLElement | undefined;
    let distance = Infinity;
    for (const surface of e.currentTarget.querySelectorAll<HTMLElement>("[data-drop-id]")) {
      const rect = surface.getBoundingClientRect();
      const dx = Math.max(rect.left - e.clientX, e.clientX - rect.right, 0);
      const dy = Math.max(rect.top - e.clientY, e.clientY - rect.bottom, 0);
      if (dx * dx + dy * dy < distance) {
        nearest = surface;
        distance = dx * dx + dy * dy;
      }
    }
    const target = items.find(n => n.id === nearest?.dataset.dropId);
    let hint = null;
    if (nearest && target && distance <= 12 * 12) {
      const rect = nearest.getBoundingClientRect();
      const fraction = (e.clientY - rect.top) / rect.height;
      const closing = nearest.classList.contains("closing-line");
      let pos: Position = fraction < 0.5 ? "before" : "after";
      if (closing) pos = fraction < 0.5 ? "inside" : "after";
      else if (target.kind === "Группа" && fraction >= 0.3) {
        pos = closed.includes(target.id) && fraction > 0.7 ? "after" : "inside";
      }
      if (permitted(from, target, pos)) hint = {id: target.id, pos, closing};
    }
    e.dataTransfer.dropEffect = hint ? "move" : "none";
    if (release) {
      e.stopPropagation();
      if (hint && target) move(from, target, hint.pos);
      setDrag(""); setDropTarget(null);
    } else {
      setDropTarget(old => old?.id === hint?.id && old?.pos === hint?.pos && old?.closing === hint?.closing ? old : hint);
    }
  }
  function dropHint(n: Item, closing = false) {
    if (dropTarget?.id !== n.id || dropTarget.closing !== closing) return null;
    const pos = dropTarget.pos;
    const targetName = n.kind === "Группа" ? "<" + n.tag + "> · " + n.title : n.title;
    const destination = pos === "inside" ? "В конец " + targetName
      : (pos === "before" ? "Перед" : "После") + " · " + targetName;
    return <div className="drop-hint" data-position={pos}><span>{destination}</span></div>;
  }
  function activate(n: Item) {
    if (current !== n.id) setActionsOpen(false);
    focus(n.id);
  }

  function finishMarkdown(n: Item) {
    setEditingMarkdown("");
    requestAnimationFrame(() => document.getElementById("markdown-" + n.id)?.focus());
  }

  function row(n: Item) {
    const group = n.kind === "Группа";
    const collapsed = closed.includes(n.id);
    const toggleFold = () => fold(ids => ids.includes(n.id) ? ids.filter(id => id !== n.id) : [...ids, n.id]);
    const muted = !n.enabled || ancestors(items, n).some(id => !items.find(x => x.id === id)!.enabled);
    const toggleSelection = (shift: boolean) => { activate(n); mark(n, shift); };
    const selectable = nestable(n);
    const selectionButton = <button className="selection-border" aria-label={(selectable ? "Выбрать · " : "Текущая ячейка · ") + n.title}
      title={selectable ? "Выбрать ячейку · Shift для диапазона" : "Сделать текущей или перетащить"}
      aria-pressed={selectable ? selected.includes(n.id) : undefined}
      onFocus={() => activate(n)} onClick={e => toggleSelection(e.shiftKey)} />;
    const hasError = visibleErrors.some(error => error.id === n.id);
    return <div key={n.id} id={"cell-" + n.id} className={group ? "entry wrapper-entry" : "entry"}
      tabIndex={-1} data-error={hasError} aria-describedby={hasError ? "error-" + n.id : undefined}
      draggable={dragSource === n.id} onPointerDownCapture={e => {
        const target = e.target as Element;
        if (target.closest(".entry") === e.currentTarget) {
          setDragSource(e.button === 0 && !target.closest(".source-editor") ? n.id : "");
        }
      }} onDragStart={e => {
      if (e.target !== e.currentTarget || dragSource !== n.id) return;
      e.stopPropagation();
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("application/x-notebook-cell", n.id);
      setDropTarget(null); setDrag(n.id);
    }} onDragEnd={e => { e.stopPropagation(); setDragSource(""); setDropTarget(null); setDrag(""); }}>
      {group && selectionButton}
      <div className={"line " + (nestable(n) ? "html-line" : "block-line")}
        data-drop-id={n.id} data-kind={group ? "HTML" : n.kind} data-current={current === n.id} data-muted={muted} data-selected={selected.includes(n.id)}
        onClick={() => activate(n)} onFocus={() => activate(n)}>
        {!group && selectionButton}
        <div className="gutter">
          {group && <button className="fold" aria-expanded={!collapsed}
            aria-label={(collapsed ? "Развернуть" : "Свернуть") + " · " + n.title}
            title={collapsed ? "Развернуть группу" : "Свернуть группу"} onClick={toggleFold}>
            {collapsed ? "▸" : "▾"}
          </button>}
        </div>
        <div className="line-body">
          {group ? <div className="wrapper-line"><button className="tag-line" aria-expanded={!collapsed} title="Свернуть или развернуть группу"
            onClick={toggleFold}>
            &lt;{n.tag}
            {n.classes.trim() && <><span className="attribute"> class</span>=<span className="literal">"{n.classes.trim()}"</span></>}&gt;
            {collapsed && <> … &lt;/{n.tag}&gt;</>}
          </button><button className="wrapper-edit" aria-label={"Изменить обёртку · " + n.title}
            aria-expanded={editingWrapper === n.id} onClick={() => {
              setEditingWrapper(editingWrapper === n.id ? "" : n.id);
              setWrapperDraft(openingTag(n) + "</" + n.tag + ">");
            }}>{editingWrapper === n.id ? "Отмена" : "Изменить"}</button>
            {editingWrapper === n.id && <div className="wrapper-fields">
              <CellEditor kind="HTML" label="Код обёртки" autoFocus value={wrapperDraft} onChange={setWrapperDraft} />
              {wrapperResult?.error && <small id="wrapper-error" role="status">{wrapperResult.error}</small>}
              <button disabled={!wrapperResult?.value} onClick={() => {
                if (wrapperResult?.value) { edit(n.id, wrapperResult.value); setEditingWrapper(""); }
              }}>Применить</button>
            </div>}
          </div> : <>
            {n.kind !== "HTML" && <div className="cell-type">{n.kind}
              {n.kind === "Markdown" && <button onClick={() => editingMarkdown === n.id ? finishMarkdown(n) : setEditingMarkdown(n.id)}>
                {editingMarkdown === n.id ? "Готово" : "Изменить"}</button>}
            </div>}
            {n.kind === "Markdown" && editingMarkdown !== n.id
              ? <div className="markdown" id={"markdown-" + n.id} tabIndex={0} aria-label="Текст Markdown"
                  onDoubleClick={() => setEditingMarkdown(n.id)}
                  onKeyDown={e => { if (e.key === "Enter" && e.target === e.currentTarget) setEditingMarkdown(n.id); }}
                  dangerouslySetInnerHTML={{ __html: markdownRenderer.render(n.source || "*Пустая ячейка*") }} />
              : <CellEditor kind={n.kind as Kind} value={n.source} label={n.kind + " · " + n.title}
                  autoFocus={n.kind === "Markdown"} onChange={(source, refresh) => edit(n.id, { source }, refresh)}
                  onFinish={n.kind === "Markdown" ? () => finishMarkdown(n) : undefined} />}
          </>}
        </div>
        {n.kind !== "Markdown" && <input className="enabled-toggle" type="checkbox" aria-label={"Включена · " + n.title}
          title={n.enabled ? "Выключить ячейку" : "Включить ячейку"}
          checked={n.enabled} onChange={e => edit(n.id, { enabled: e.target.checked })} />}
        {dropHint(n)}
      </div>
      {group && <div className="children">
        {!collapsed && children(items, n.id).map(row)}
      </div>}
      {group && !collapsed && <div className="closing-line" data-drop-id={n.id}>
        <button className="end-tag" data-muted={muted} aria-pressed={selected.includes(n.id)}
          title="Выбрать обёртку · Shift для диапазона" onClick={e => toggleSelection(e.shiftKey)}>&lt;/{n.tag}&gt;</button>
        {dropHint(n, true)}
      </div>}
    </div>;
  }

  const peers = active ? children(items, active.parent) : [];
  const index = active ? peers.indexOf(active) : -1;
  return <main className="notebook">
    <header className="bar">
      <h1>Web Notebook</h1>
      <div className="tools">
        <button className="run" onClick={() => restart(items)}>↻ Перезапустить проект</button>
      </div>
    </header>
    <div className="workspace">
      <section className="editor-panel">
        <div className="editor-heading"><div className="section-heading"><div className="tools"><h2>Ячейки</h2>
          <details className="insert-cell" onBlur={e => {
            if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false;
          }} onKeyDown={e => {
            if (e.key === "Escape") {
              e.currentTarget.open = false;
              e.currentTarget.querySelector("summary")?.focus();
            }
          }}>
            <summary>+ Добавить ячейку</summary>
            <div className="cell-types">
              {kinds.map(k => <button key={k} onClick={e => {
                e.currentTarget.closest("details")!.open = false;
                add(k);
              }}>{k}</button>)}
            </div>
          </details></div><div className="tools">
          <button disabled={!previous} onClick={() => {
            if (previous) { commit(previous, previous[0]?.id ?? ""); remember(null); }
          }}>Отменить операцию</button>
          <button aria-expanded={actionsOpen} disabled={!active} onClick={() => setActionsOpen(!actionsOpen)}>Действия ▾</button>
        </div></div>
        {active && actionsOpen && <div className="actions"><strong>{active.kind === "Группа" ? "<" + active.tag + ">" : active.kind} · {active.title}</strong>
          <button disabled={index <= 0} onClick={() => move(active, peers[index - 1], "before")}>↑ Выше</button>
          <button disabled={index === peers.length - 1} onClick={() => move(active, peers[index + 1], "after")}>↓ Ниже</button>
          {active.parent && <button onClick={() => move(active, items.find(x => x.id === active.parent)!, "after")}>Вынести из группы</button>}
          {nestable(active) && <select aria-label="Переместить в группу" value="" onChange={e => move(active, items.find(x => x.id === e.target.value)!, "inside")}>
            <option value="">В группу…</option>{items.filter(x => x.kind === "Группа" && x.id !== active.parent && permitted(active, x, "inside")).map(x =>
              <option value={x.id} key={x.id}>{x.tag}.{x.classes} · {items.indexOf(x) + 1}</option>)}
          </select>}
          {active.kind === "Группа" && <button onClick={() => ungroup(active)}>Разгруппировать</button>}
          <button onClick={() => remove(active)}>Удалить</button>
        </div>}</div>
        <div className="actions grouping">
          <select aria-label="Тег нового контейнера" value={tag} onChange={e => setTag(e.target.value)}>{tags.map(t => <option key={t}>{t}</option>)}</select>
          <input aria-label="Классы нового контейнера" value={classes} onChange={e => setClasses(e.target.value)} placeholder="Классы CSS" />
          <button disabled={!depthOK} onClick={group}>Обернуть в тег</button>
          <small className="warning" role="status">{chosen.length > 0 && !depthOK && (!valid ? "Выберите минимум две соседние HTML-ячейки или группы одного родителя." : "Допускается до восьми уровней групп.")}</small>
        </div>
        <div className="sheet" onDragOverCapture={e => trackDrop(e)} onDropCapture={e => trackDrop(e, true)}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null); }}>
          {children(items, null).map(row)}
        </div>
      </section>
      <aside className="preview-panel"><div className="section-heading"><h2>Предпросмотр</h2>
        <span role="status">{saveStatus || (errors.length ? "Запуск заблокирован" : preview?.project !== items ? "Есть правки · Ctrl+S для сохранения и запуска" : "Запуск №" + preview.run)}</span>
      </div>
      {visibleErrors.length > 0 && <div className="syntax-errors" aria-live="polite">
        <strong>{preview ? "Показан последний успешный запуск" : "Предпросмотр ожидает исправления"}</strong>
        <ul>{visibleErrors.map(e => <li key={e.id} id={"error-" + e.id}>
          <button type="button" onClick={() => showError(e.id, e.line)}>Блок «{e.title}» ({e.kind}), строка {e.line}</button> — {e.message}
        </li>)}</ul>
      </div>}
      <div className="scale"><label htmlFor="zoom">Масштаб</label>
        <input id="zoom" type="range" min="25" max="300" step="5" value={zoom} onChange={e => setZoom(Number(e.target.value))} />
        <output htmlFor="zoom">{zoom}%</output><button title="Сбросить масштаб" onClick={() => setZoom(100)}>1:1</button>
      </div><div className="viewport">
        {preview && <PreviewFrame key={preview.run} page={preview.page} zoom={zoom} />}
      </div><details><summary>Собранный HTML</summary><pre>{preview?.body}</pre></details></aside>
    </div>
  </main>;
}
