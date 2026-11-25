export const tags = ["div", "section", "article", "main", "header", "footer", "nav", "aside"] as const;
export type Tag = typeof tags[number];
export type Kind = "html" | "css" | "javascript" | "markdown";
type Base = { id: string; title: string; enabled: boolean };
type Html = Base & { type: "html"; parent: string | null; source: string };
export type Group = Base & { type: "group"; parent: string | null; tag: Tag; classes: string; collapsed: boolean };
export type Cell = Html | Group | (Base & { type: Exclude<Kind, "html">; source: string });
export type Notebook = { version: 1; cells: Cell[] };
export type Position = "before" | "after" | "inside";
export const labels = { html: "HTML", css: "CSS", javascript: "JavaScript", markdown: "Markdown", group: "Обёртка" } as const;

export function nestable(c: Cell): c is Html | Group { return c.type === "html" || c.type === "group"; }
export function parentOf(c: Cell) { return nestable(c) ? c.parent : null; }
export function siblings(cells: Cell[], parent: string | null) { return cells.filter(c => parentOf(c) === parent); }
export function ancestors(cells: Cell[], c: Cell): Group[] {
  const parents: Group[] = [];
  let id = parentOf(c);
  while (id !== null) {
    const group = cells.find(n => n.id === id);
    if (group?.type !== "group" || parents.includes(group)) throw Error("Некорректное дерево блокнота");
    parents.push(group);
    id = group.parent;
  }
  return parents;
}
function height(cells: Cell[], c: Cell): number {
  return c.type === "group" ? 1 + Math.max(0, ...siblings(cells,c.id).map(child => height(cells,child))) : 0;
}

export function add(cells: Cell[], active: Cell | undefined, type: Kind, id: string): Cell[] {
  if (cells.length >= 200) return cells;
  let target = active;
  if (active && type !== "html") target = ancestors(cells,active).at(-1) ?? active;
  const index = target ? cells.indexOf(target)+1 : cells.length;
  let number = 1;
  while (cells.some(c => c.title === labels[type]+" "+number)) number++;
  const base = { id, title: labels[type]+" "+number, enabled: true, source: "" };
  const item: Cell = type === "html" ? {...base,type,parent:target ? parentOf(target) : null} : {...base,type};
  return [...cells.slice(0,index), item, ...cells.slice(index)];
}

export function groupingError(cells: Cell[], selected: string[]) {
  if (cells.length >= 200) return "В блокноте уже 200 элементов.";
  const first = cells.find(c=>selected.includes(c.id));
  if (!first || selected.length < 2) return "Выберите минимум два соседних HTML-блока.";
  const peers = siblings(cells,parentOf(first));
  const start = peers.indexOf(first);
  const range = peers.slice(start,start+selected.length);
  if (range.length !== selected.length || !range.every(c=>nestable(c) && selected.includes(c.id)))
    return "Выберите соседние HTML-блоки одного родителя.";
  if (ancestors(cells,first).length + 1 + Math.max(...range.map(c=>height(cells,c))) > 8)
    return "Допускается до восьми уровней HTML-групп.";
  return "";
}
export function group(cells: Cell[], selected: string[], id: string, tag: Tag, classes: string) {
  if (groupingError(cells,selected)) return cells;
  const first = cells.findIndex(c=>selected.includes(c.id));
  const wrapper: Group = {id,type:"group",title:"Контейнер",enabled:true,collapsed:false,tag,classes,parent:parentOf(cells[first]!)};
  const next = cells.map(c=>nestable(c) && selected.includes(c.id) ? {...c,parent:id} : c);
  next.splice(first,0,wrapper);
  return next;
}
export function ungroup(cells: Cell[], wrapper: Group): Cell[] {
  const kids = siblings(cells,wrapper.id);
  return cells.flatMap(c=>c.id===wrapper.id ? kids.map(child=>({...child,parent:wrapper.parent})) : parentOf(c)===wrapper.id ? [] : [c]);
}
export function canMove(cells: Cell[], c: Cell, target: Cell, pos: Position) {
  const path = ancestors(cells,target);
  const parent = pos==="inside" ? target.id : parentOf(target);
  return c!==target && !path.some(p=>p.id===c.id) && (!parent || nestable(c))
    && (pos!=="inside" || target.type==="group") && path.length+Number(pos==="inside")+height(cells,c)<=8;
}
export function move(cells: Cell[], c: Cell, target: Cell, pos: Position): Cell[] {
  if (!canMove(cells,c,target,pos)) return cells;
  const next = cells.filter(item=>item.id!==c.id);
  const index = pos==="inside" ? next.length : next.indexOf(target)+Number(pos==="after");
  if (pos==="inside" && target.type==="group") next[next.indexOf(target)] = {...target,collapsed:false};
  next.splice(index,0,nestable(c) ? {...c,parent:pos==="inside"?target.id:parentOf(target)} : c);
  return next;
}
export function remove(cells: Cell[], item: Cell) {
  return cells.filter(c=>c.id!==item.id && !ancestors(cells,c).some(p=>p.id===item.id));
}

