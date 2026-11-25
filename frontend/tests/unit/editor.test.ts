import { describe, expect, it } from "vitest";
import { validateCode } from "../../src/lib/editor/diagnostics";
import { add, canMove, group, groupingError, move, parentOf, remove, siblings, ungroup, type Group, type Kind } from "../../src/lib/editor/tree";
import { example } from "../../src/lib/editor/example";

describe("Диагностика внутри ячейки", () => {
  const valid: [Kind,string][] = [
    ["html","<ul><li>Один<li>Два</ul><br>"],
    ["html",`<button onclick="return false">Привет</button>`],
    ["html",`<style>p { color:red }</style><div style="--tone: red; color: var(--tone)"></div>`],
    ["css","@media (min-width: 600px) { div { display:grid; width:calc(100% - 2px) } }"],
    ["css","@font-face { font-family: Test; src:url(font.woff2) }"],
    ["css","div { --tone:red; color:var(--tone); /* webnb:off */ width:red; }"],
    ["javascript","const n = [1, 2].map(x => x * 2);"],
    ["markdown","Пример: <div> и console.log("],
  ];
  it.each(valid)("принимает %s · %s",(kind,source)=>expect(validateCode(kind,source)).toEqual([]));
  const invalid: [Kind,string,number][] = [
    ["css","p {\ncolor:17px;\n}",2], ["css","p {\nwrong-property:blue;\n}",2],
    ["css","p {\nwidth:;\n}",2], ["css","p {\ncolor:red",1],
    ["css","p {}\n/* незакрытый комментарий",2], ["css","p {\ncolor:var(tone) }",2],
    ["html","<section>\n<div>",2], ["html","<span></span>\n<script>1</script>",2],
    ["html",'<div\n class="a" class="b"></div>',2],
    ["html",'<button\n onclick="const = ;">OK</button>',2],
    ["html",'<style>\np { color:17px }\n</style>',2],
    ["html",'<p\n style="color:17px">OK</p>',2],
    ["javascript","// пример\nconst = ;",2], ["javascript","return 1",1],
  ];
  it.each(invalid)("находит %s · %s",(kind,source,line)=>{
    expect(validateCode(kind,source).map(issue=>issue.line)).toContain(line);
  });
  it("показывает обе независимые ошибки CSS",()=>{
    expect(validateCode("css","a {\ncolor:17px;\nunknown-property:red;\n}").map(i=>i.line)).toEqual([2,3]);
  });
});

describe("Дерево редактора",()=>{
  const cells=example.cells;
  const get=(id:string)=>cells.find(c=>c.id===id)!;
  it("группирует соседей и восстанавливает порядок при разгруппировке",()=>{
    const grouped=group(cells,["clay","sage"],"new","div","pair");
    expect(siblings(grouped,"new").map(c=>c.id)).toEqual(["sage","clay"]);
    expect(ungroup(grouped,grouped.find(c=>c.id==="new") as Group)).toEqual(cells);
  });
  it("отклоняет разрозненный выбор, разных родителей и одну ячейку",()=>{
    for(const ids of [["sage"],["sage","linen"],["sage","heading"],["styles","script"]]) expect(groupingError(cells,ids)).toBeTruthy();
  });
  it("перемещает детей, блокирует цикл и вложенный CSS",()=>{
    expect(canMove(cells,get("palette"),get("sage"),"before")).toBe(false);
    expect(canMove(cells,get("styles"),get("palette"),"inside")).toBe(false);
    const next=move(cells,get("heading"),get("palette"),"inside");
    expect(siblings(next,"palette").at(-1)?.id).toBe("heading");
    expect(remove(next,get("palette")).map(c=>c.id)).toEqual(["note","styles","script"]);
  });
  it("вставляет HTML рядом с активным блоком, а JS после внешней группы",()=>{
    const html=add(cells,get("sage"),"html","new");
    expect(siblings(html,"palette")[1]?.id).toBe("new");
    const js=add(cells,get("sage"),"javascript","new");
    expect(siblings(js,null)[3]?.id).toBe("new");
    expect(parentOf(js.find(c=>c.id==="new")!)).toBeNull();
  });
  it("считает глубину всего переносимого поддерева",()=>{
    const chain: Group[]=Array.from({length:8},(_,i)=>({id:"g"+i,title:"",enabled:true,type:"group",tag:"div",classes:"",collapsed:false,parent:i?"g"+(i-1):null}));
    expect(canMove([...cells,...chain],get("palette"),chain[7]!,"inside")).toBe(false);
    expect(canMove([...cells,...chain],get("heading"),chain[7]!,"inside")).toBe(true);
  });
});
