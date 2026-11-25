import { activeStyles } from "../../components/editor/cssDeclarations";
import { siblings, type Cell, type Tag } from "./tree";
import { openingTag } from "./wrapper";

type Source = {id:string; source:string};
type Html = Source | {id:string; tag:Tag; classes:string; children:Html[]};

export function compilePreview(cells:Cell[]) {
  function html(parent:string|null):Html[] {
    const result:Html[]=[];
    for (const cell of siblings(cells,parent)) {
      if (!cell.enabled) continue;
      if (cell.type==="group") result.push({id:cell.id,tag:cell.tag,classes:cell.classes,children:html(cell.id)});
      if (cell.type==="html") result.push({id:cell.id,source:cell.source});
    }
    return result;
  }
  function markup(nodes:Html[]):string {
    return nodes.map(node=>"source" in node ? node.source : openingTag(node)+"\n"+markup(node.children)+"\n</"+node.tag+">").join("\n");
  }
  const nodes=html(null);
  const styles:Source[]=[], scripts:Source[]=[];
  for (const cell of cells) {
    if (!cell.enabled) continue;
    if (cell.type==="css") styles.push({id:cell.id,source:activeStyles(cell.source)});
    if (cell.type==="javascript") scripts.push({id:cell.id,source:cell.source});
  }
  return {plan:{html:nodes,styles,scripts},body:markup(nodes)};
}
export type PreviewRun = ReturnType<typeof compilePreview> & {id:string; number:number};
