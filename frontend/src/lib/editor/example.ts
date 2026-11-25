import type { Notebook } from "./tree";

export const example: Notebook = {
  version: 1,
  cells: [
    {id:"note",type:"markdown",title:"Палитра мастерской",enabled:true,source:"## Палитра мастерской\nТри природных оттенка. Выберите карточки, чтобы объединить их в HTML-контейнер."},
    {id:"heading",type:"html",title:"Заголовок",enabled:true,parent:null,source:"<h1>Природные оттенки</h1>"},
    {id:"palette",type:"group",title:"Палитра",enabled:true,parent:null,tag:"section",classes:"palette",collapsed:false},
    ...[["sage","Шалфей","#9cad98"],["clay","Глина","#c4866b"],["linen","Лён","#d9cbaf"]].map(([id,title,color])=>({
      id:id!,type:"html" as const,title:title!,enabled:true,parent:"palette",
      source:'<article style="--paint: '+color+'">\n  <h2>'+title+'</h2>\n</article>',
    })),
    {id:"styles",type:"css",title:"Стили палитры",enabled:true,source:".palette { display: grid; gap: 12px; }\narticle { background: var(--paint); }"},
    {id:"script",type:"javascript",title:"Сценарий палитры",enabled:false,source:"console.log('Палитра готова');"},
  ],
};

