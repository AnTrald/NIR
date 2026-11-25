"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import MarkdownIt from "markdown-it";
import { EditorView } from "@codemirror/view";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { ArrowDown, ArrowUp, BookOpen, Braces, Check, ChevronDown, Code2, Group as GroupIcon, Moon, NotebookPen, Plus, SquareFunction, Sun, Trash2, Undo2 } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../ui/dropdown-menu";
import { CellEditor } from "./cell-editor";
import { add, ancestors, canMove, group, groupingError, labels, move, nestable, parentOf, remove, siblings, tags, ungroup, type Cell, type Kind, type Position, type Tag } from "@/lib/editor/tree";
import { validateCode, type Issue } from "@/lib/editor/diagnostics";
import { example } from "@/lib/editor/example";
import { openingTag, validateWrapper } from "@/lib/editor/wrapper";
import { compilePreview, type PreviewRun } from "@/lib/editor/preview";
import { PreviewFrame } from "./preview-frame";
import "./editor.css";

const icons = {html:Code2,css:Braces,javascript:SquareFunction,markdown:BookOpen,group:GroupIcon};
const markdown = new MarkdownIt({ html:false });
const codeCache = new WeakMap<Cell,Issue[]>();
function issuesFor(cell: Cell): Issue[] {
  if (cell.type==="group") return [];
  const cached = codeCache.get(cell);
  if (cached) return cached;
  const issues = validateCode(cell.type,cell.source);
  codeCache.set(cell,issues);
  return issues;
}
type Destination = { id: string; position: Position };
const interactive = "button,input,select,a,.source-editor,[role=menuitem]";
const elementId = (id:string) => "cell-"+id;

export function NotebookEditor({ connection }: { connection: ReactNode }) {
  const [cells,setCells] = useState(example.cells);
  const [current,activate] = useState<string>("heading");
  const [selected,select] = useState<string[]>([]);
  const [anchor,setAnchor] = useState("");
  const [previous,remember] = useState<Cell[] | null>(null);
  const [editing,setEditing] = useState("");
  const [draft,setDraft] = useState("");
  const [tag,setTag] = useState<Tag>("div");
  const [classes,setClasses] = useState("");
  const [dark,setDark] = useState(false);
  const [armed,arm] = useState("");
  const [dragged,drag] = useState("");
  const [drop,setDrop] = useState<Destination|null>(null);
  const [zoom,setZoom] = useState(100);
  const [request,setRequest] = useState(1);
  const handled=useRef(0);
  const [run,setRun]=useState<PreviewRun|null>(null);
  function restart() { setRequest(n=>n+1); }
  useEffect(()=>{
    const stored = localStorage.getItem("webnb-theme");
    setDark(stored ? stored==="dark" : matchMedia("(prefers-color-scheme:dark)").matches);
  },[]);
  useEffect(()=>{ document.documentElement.dataset.theme=dark?"dark":"light"; },[dark]);

  const active = cells.find(c=>c.id===current);
  const wrapperDraft = useMemo(()=>cells.some(c=>c.id===editing && c.type==="group") ? validateWrapper(draft) : undefined,[cells,editing,draft]);
  const issues = useMemo(()=>cells.flatMap(c=>{
    if (!c.enabled || ancestors(cells,c).some(p=>!p.enabled)) return [];
    const list = c.type==="group" && editing===c.id && wrapperDraft?.error
      ? [{line:wrapperDraft.line,message:wrapperDraft.error}] : issuesFor(c);
    return list.map(issue=>({...issue,cell:c}));
  }),[cells,editing,wrapperDraft]);
  useEffect(()=>{
    if (handled.current===request) return;
    handled.current=request;
    if (issues.length) return;
    const snapshot=compilePreview(cells);
    const id=crypto.randomUUID();
    setRun(last=>({...snapshot,id,number:(last?.number ?? 0)+1}));
  },[request,cells,issues]);
  useEffect(()=>{
    function shortcut(e:KeyboardEvent) {
      if ((!e.ctrlKey && !e.metaKey) || e.code!=="KeyS" || e.altKey || e.shiftKey) return;
      e.preventDefault();
      if (e.repeat) return;
      if (wrapperDraft?.value) {
        const value=wrapperDraft.value;
        setCells(list=>list.map(c=>c.id===editing && c.type==="group"?{...c,...value}:c));
        setEditing("");remember(null);
      }
      restart();
    }
    window.addEventListener("keydown",shortcut,true);
    return ()=>window.removeEventListener("keydown",shortcut,true);
  },[editing,wrapperDraft]);
  const reason = groupingError(cells,selected);
  function focusCell(id:string) {
    requestAnimationFrame(()=>{
      const block=document.getElementById(elementId(id));
      block?.focus({preventScroll:true});
      block?.scrollIntoView({block:"nearest"});
    });
  }
  function commit(next:Cell[], id:string) {
    if (next===cells) return;
    remember(cells); setCells(next); activate(id); select([]); setAnchor("");
    restart();
    focusCell(id);
  }
  function edit(next:Cell,refresh=false) {
    remember(null);
    setCells(list=>list.map(c=>c.id===next.id?next:c));
    if (refresh) restart();
  }
  function insert(type:Kind) {
    const id=crypto.randomUUID();
    commit(add(cells,active,type,id),id);
    if (type==="markdown") setEditing(id);
  }
  function wrap() {
    const id=crypto.randomUUID();
    commit(group(cells,selected,id,tag,classes.trim()),id);
  }
  function erase(c:Cell) {
    if ((c.type==="group" || c.source.trim()) && !window.confirm("Удалить «"+c.title+"»"+(c.type==="group"?" вместе с содержимым":"")+"?")) return;
    const next=remove(cells,c);
    commit(next,parentOf(c) ?? next.at(Math.min(cells.indexOf(c),next.length-1))?.id ?? "");
  }
  function mark(c:Cell,range:boolean) {
    if (!nestable(c)) return;
    const peers=siblings(cells,c.parent);
    const start=peers.findIndex(p=>p.id===anchor);
    if (range && start>=0) {
      const end=peers.indexOf(c);
      select(peers.slice(Math.min(start,end),Math.max(start,end)+1).filter(nestable).map(p=>p.id));
    } else {
      select(selected.includes(c.id)?selected.filter(id=>id!==c.id):[...selected,c.id]);
      setAnchor(c.id);
    }
  }
  function reveal(c:Cell,line:number) {
    const path=ancestors(cells,c);
    setCells(list=>list.map(item=>item.type==="group" && item.collapsed && path.some(p=>p.id===item.id)?{...item,collapsed:false}:item));
    activate(c.id);
    requestAnimationFrame(()=>{
      const block=document.getElementById(elementId(c.id));
      const content=block?.querySelector<HTMLElement>(":scope > .source-editor .cm-content, :scope > .wrapper-edit .cm-content");
      const editor=content && EditorView.findFromDOM(content);
      if (!editor) return;
      const pos=editor.state.doc.line(Math.min(line,editor.state.doc.lines)).from;
      editor.focus();
      editor.dispatch({selection:{anchor:pos},effects:EditorView.scrollIntoView(pos,{y:"center"})});
      const node=editor.domAtPos(pos).node;
      (node instanceof Element?node:node.parentElement)?.closest(".cm-line")?.scrollIntoView({block:"center"});
    });
  }
  function destination(event:DragEvent<HTMLElement>, target:Cell):Position {
    const bounds=event.currentTarget.getBoundingClientRect();
    const ratio=(event.clientY-bounds.top)/bounds.height;
    if (target.type==="group" && ratio>=0.15 && ratio<=0.85) return "inside";
    return ratio<0.5?"before":"after";
  }
  function track(event:DragEvent<HTMLElement>,target:Cell,release:boolean) {
    event.stopPropagation();
    const c=cells.find(n=>n.id===dragged);
    const position=destination(event,target);
    if (!c || !canMove(cells,c,target,position)) {setDrop(null);return;}
    event.preventDefault();
    event.dataTransfer.dropEffect="move";
    if (release) {
      commit(move(cells,c,target,position),c.id); drag(""); arm(""); setDrop(null);
    } else setDrop({id:target.id,position});
  }
  function finishMarkdown(c:Cell,advance=false) {
    setEditing("");
    const visible=cellsInView(null);
    const target=advance?visible[visible.indexOf(c)+1] ?? c:c;
    focusCell(target.id);
  }
  function cellsInView(parent:string|null):Cell[] {
    return siblings(cells,parent).flatMap(c=>c.type==="group" && !c.collapsed?[c,...cellsInView(c.id)]:[c]);
  }
  function rows(parent:string|null):ReactNode {
    const peers=siblings(cells,parent);
    return peers.map((c,index)=>{
      const Icon=icons[c.type];
      const isGroup=c.type==="group";
      const reading=c.type==="markdown" && editing!==c.id;
      const marked=selected.includes(c.id);
      const owner=ancestors(cells,c)[0];
      const previousPeer=peers[index-1], nextPeer=peers[index+1];
      const placement=drop?.id===c.id ? drop.position : undefined;
      function to(target:Cell,position:Position){commit(move(cells,c,target,position),c.id);}
      return <ContextMenu.Root key={c.id}><ContextMenu.Trigger asChild>
        <Card className="cell" id={elementId(c.id)} tabIndex={0} aria-label={c.title} data-kind={isGroup?"HTML":labels[c.type]}
          data-wrapper={isGroup||undefined} data-reading={reading||undefined} data-selected={marked||undefined} data-current={current===c.id}
          data-muted={!c.enabled || ancestors(cells,c).some(p=>!p.enabled)} data-error={issues.some(i=>i.cell.id===c.id)||undefined}
          data-drop={placement} draggable={armed===c.id}
          onPointerDownCapture={e=>arm(e.button===0 && !(e.target as Element).closest(interactive)?c.id:"")}
          onDragStart={e=>{if (e.target!==e.currentTarget || armed!==c.id) return;
            e.stopPropagation(); e.dataTransfer.setData("application/x-notebook-cell",c.id); e.dataTransfer.effectAllowed="move"; drag(c.id);}}
          onDragOver={e=>track(e,c,false)} onDrop={e=>track(e,c,true)}
          onDragLeave={e=>{if (!e.currentTarget.contains(e.relatedTarget as Node|null)) setDrop(null);}}
          onDragEnd={()=>{arm("");drag("");setDrop(null);}}
          onFocus={e=>{e.stopPropagation();activate(c.id);}}
          onClick={e=>{e.stopPropagation();activate(c.id);if (anchor && e.shiftKey && !(e.target as Element).closest(interactive)) mark(c,true);}}
          onDoubleClick={e=>{e.stopPropagation();if (!e.shiftKey && !(e.target as Element).closest(interactive)) mark(c,false);}}
          onContextMenuCapture={e=>{if ((e.target as Element).closest(".source-editor")) e.stopPropagation();}}
          onKeyDown={e=>{
            if(e.target!==e.currentTarget)return;
            if(e.key===" " && nestable(c)){e.preventDefault();mark(c,e.shiftKey);}
            if(e.key==="Enter" && reading){e.preventDefault();setEditing(c.id);}
            if(e.key==="F10" && e.shiftKey){e.preventDefault();const r=e.currentTarget.getBoundingClientRect();
              e.currentTarget.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:r.left+16,clientY:r.top+16}));}
          }}>
          {placement && <span className="placement">{{before:"Перед блоком",after:"После блока",inside:"В конец группы"}[placement]}</span>}
          <div className="cell-head">
            {isGroup ? <div className="group-tag"><Button variant="ghost" size="xs" aria-expanded={!c.collapsed} aria-label={c.collapsed?"Развернуть группу":"Свернуть группу"}
              onClick={()=>edit({...c,collapsed:!c.collapsed})}><ChevronDown size={14}/></Button><code>{openingTag(c)}{c.collapsed && " … </"+c.tag+">"}</code></div>
              : <div className="cell-caption"><span className="language"><Icon size={14}/>{labels[c.type]}</span>{!reading && c.title}</div>}
            <div className="cell-actions">
              {(isGroup || c.type==="markdown") && <Button variant="ghost" size="xs" onClick={()=>{
                if(isGroup){setDraft(openingTag(c)+"\n</"+c.tag+">");setEditing(editing===c.id?"":c.id);}
                else if(reading)setEditing(c.id);else finishMarkdown(c);
              }}>{editing===c.id ? isGroup?"Отмена":"Готово":"Изменить"}</Button>}
              <Button variant="ghost" size="xs" className="delete-cell" aria-label={"Удалить "+c.title} onClick={e=>{e.stopPropagation();erase(c);}}><Trash2 size={15}/></Button>
              {c.type!=="markdown" && <button className="activity" role="checkbox" aria-checked={c.enabled} aria-label={"Активность · "+c.title}
                onClick={()=>edit({...c,enabled:!c.enabled},true)}>{c.enabled && <Check size={12}/>}</button>}
            </div>
          </div>
          {isGroup ? <>
            {editing===c.id && <div className="wrapper-edit"><CellEditor kind="HTML" label="Код обёртки" autoFocus dark={dark} value={draft} onChange={setDraft}/>
              {wrapperDraft?.error && <small role="alert">{wrapperDraft.error}</small>}
              <Button size="xs" disabled={!wrapperDraft?.value} onClick={()=>{if(wrapperDraft?.value){edit({...c,...wrapperDraft.value},true);setEditing("");}}}>Применить</Button></div>}
            {!c.collapsed && <><div className="group-children">{rows(c.id)}</div><code className="group-end">{"</"+c.tag+">"}</code></>}
          </> : reading ? <div className="note" data-empty={!c.source.trim()||undefined}
            onDoubleClick={e=>{if(!(e.target as Element).closest("a"))setEditing(c.id);}}
            dangerouslySetInnerHTML={{__html:markdown.render(c.source)}}/>
            : <CellEditor kind={labels[c.type]} value={c.source} dark={dark} label={labels[c.type]+" · "+c.title} autoFocus={editing===c.id}
                onChange={(source,refresh)=>edit({...c,source},refresh)} onFinish={c.type==="markdown"?()=>finishMarkdown(c,true):undefined}/>}
        </Card></ContextMenu.Trigger>
        <ContextMenu.Portal><ContextMenu.Content data-slot="dropdown-menu-content" aria-label="Действия с ячейкой">
          {marked && <ContextMenu.Item data-slot="dropdown-menu-item" disabled={!!reason} onSelect={wrap}><GroupIcon size={15}/>Сгруппировать выбранные ({selected.length})</ContextMenu.Item>}
          <ContextMenu.Item data-slot="dropdown-menu-item" disabled={!previousPeer} onSelect={()=>previousPeer && to(previousPeer,"before")}><ArrowUp size={15}/>Выше</ContextMenu.Item>
          <ContextMenu.Item data-slot="dropdown-menu-item" disabled={!nextPeer} onSelect={()=>nextPeer && to(nextPeer,"after")}><ArrowDown size={15}/>Ниже</ContextMenu.Item>
          {owner && <ContextMenu.Item data-slot="dropdown-menu-item" onSelect={()=>to(owner,"after")}>Вынести из группы</ContextMenu.Item>}
          {nestable(c) && cells.filter(t=>t.type==="group" && t!==owner && canMove(cells,c,t,"inside")).map(t=><ContextMenu.Item key={t.id}
            data-slot="dropdown-menu-item" onSelect={()=>to(t,"inside")}>В группу «{t.title}»</ContextMenu.Item>)}
          {isGroup && <ContextMenu.Item data-slot="dropdown-menu-item" onSelect={()=>commit(ungroup(cells,c),siblings(cells,c.id)[0]?.id ?? c.parent ?? "")}>Разгруппировать</ContextMenu.Item>}
          <ContextMenu.Item data-slot="dropdown-menu-item" onSelect={()=>{const title=window.prompt("Название блока",c.title);if(title!==null)edit({...c,title:title.slice(0,200)});}}>Переименовать</ContextMenu.Item>
          <ContextMenu.Item data-slot="dropdown-menu-item" className="destructive" onSelect={()=>erase(c)}><Trash2 size={15}/>Удалить</ContextMenu.Item>
        </ContextMenu.Content></ContextMenu.Portal></ContextMenu.Root>;
    });
  }
  return <main><header className="appbar"><h1 className="brand"><span className="brand-icon"><NotebookPen size={19}/></span>Web Notebook</h1>
    <div className="app-actions"><Button onClick={restart}>Перезапустить проект</Button><Button variant="outline" disabled={!previous} title="Отменить структурную операцию" aria-label="Отменить операцию"
      onClick={()=>{if(previous){setCells(previous);remember(null);select([]);setAnchor("");activate(previous[0]?.id ?? "");restart();}}}><Undo2 size={16}/></Button>
      <Button variant="outline" aria-label="Тёмная тема" aria-pressed={dark} onClick={()=>{localStorage.setItem("webnb-theme",dark?"light":"dark");setDark(!dark);}}>
        {dark?<Sun size={16}/>:<Moon size={16}/>}</Button></div></header>
    <div className="workspace-design"><section className="edit-pane">
      <div className="editor-toolbar"><header className="pane-heading"><div><h2>Ячейки</h2><span className="count">{cells.length}</span></div>
        <DropdownMenu><DropdownMenuTrigger asChild><Button disabled={cells.length>=200}><Plus size={16}/>Добавить ячейку<ChevronDown size={14}/></Button></DropdownMenuTrigger>
          <DropdownMenuContent>{(["html","css","javascript","markdown"] as const).map(type=>{const Icon=icons[type];return <DropdownMenuItem key={type} onSelect={()=>insert(type)}><Icon size={16}/>{labels[type]}</DropdownMenuItem>;})}</DropdownMenuContent>
        </DropdownMenu></header>
        <div className="group-tools"><label>Тег <select value={tag} onChange={e=>setTag(e.target.value as Tag)}>{tags.map(t=><option key={t}>{t}</option>)}</select></label>
          <input aria-label="Классы контейнера" placeholder="Классы CSS" value={classes} onChange={e=>setClasses(e.target.value)}/>
          <Button variant="outline" size="xs" disabled={!!reason} onClick={wrap}><GroupIcon size={15}/>Сгруппировать</Button>
          <span className="selection-count" aria-live="polite">Выбрано блоков: {selected.length}</span>
          <small>{selected.length ? reason || "Правый щелчок по контуру — сгруппировать." : "Двойной щелчок по контуру отмечает HTML-блок. Shift + щелчок выбирает диапазон."}</small></div>
      </div><div className="cell-list">{rows(null)}</div></section>
      <aside><header className="pane-heading"><h2>Предпросмотр</h2></header><Card className="preview-card">
        <div className="preview-tools"><div className="zoom-control"><label htmlFor="zoom">Масштаб</label>
          <input id="zoom" type="range" min={25} max={300} step={5} value={zoom} aria-valuetext={zoom+"%"} onChange={e=>setZoom(e.target.valueAsNumber)}/>
          <span>{zoom}%</span><Button variant="ghost" size="xs" aria-label="Сбросить масштаб" onClick={()=>setZoom(100)}>1:1</Button></div></div>
        {issues.length>0 && <section className="diagnostics" aria-label="Ошибки кода"><strong>Запуск заблокирован. {run?"Показан предыдущий запуск.":"Исправьте код для первого запуска."}</strong><ul>
          {issues.map((i,index)=><li key={i.cell.id+"-"+index}><button onClick={()=>reveal(i.cell,i.line)}>«{i.cell.title}» ({labels[i.cell.type]}), строка {i.line}</button> — {i.message}</li>)}
        </ul></section>}
        {run && <PreviewFrame key={run.id} run={run} zoom={zoom} titleOf={id=>cells.find(c=>c.id===id)?.title ?? ""}
          onIssue={(id,line)=>{const c=cells.find(c=>c.id===id);if(c)reveal(c,line);}}/>}
        <details><summary>Собранный HTML</summary><pre>{run?.body}</pre></details></Card>
        <details className="connection" open><summary>Подключение к сервису</summary>{connection}</details>
      </aside></div><div id="editor-tooltips"/></main>;
}

