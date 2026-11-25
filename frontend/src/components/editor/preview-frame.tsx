"use client";

import { useEffect, useRef, useState } from "react";
import type { PreviewRun } from "@/lib/editor/preview";

type Entry = {type:"warning"|"error"|"console"; id:string; line:number; message:string};
type Props = { run:PreviewRun; zoom:number; onIssue:(id:string,line:number)=>void; titleOf:(id:string)=>string };
export function PreviewFrame({run,zoom,onIssue,titleOf}:Props) {
  const host=useRef<HTMLDivElement>(null);
  const [status,setStatus]=useState("Подготовка предпросмотра…");
  const [entries,setEntries]=useState<Entry[]>([]);
  useEffect(()=>{
    const frame=document.createElement("iframe");
    frame.title="Предпросмотр блокнота";
    frame.sandbox.add("allow-scripts","allow-modals");
    frame.referrerPolicy="no-referrer";
    let port:MessagePort|undefined, loads=0, seq=0, closed=false;
    function stop(message:string) {
      closed=true;
      port?.close();
      window.clearTimeout(timer);
      setStatus(message);
    }
    const timer=window.setTimeout(()=>stop("Не удалось запустить предпросмотр. Проверьте подключение к сервису и адрес APP_ORIGIN."),8000);
    function ready(event:MessageEvent) {
      if (closed || event.source!==frame.contentWindow || event.origin!=="null" || event.data?.type!=="webnb-ready" || event.data.run!==run.id) return;
      if (port || event.ports.length!==1) {stop("Сеанс предпросмотра прерван.");return;}
      port=event.ports[0]!;
      port.onmessage=({data})=>{
        if (closed || !data || data.run!==run.id || !Number.isSafeInteger(data.seq) || data.seq<=seq) return;
        seq=data.seq;
        if (data.type==="settled") {
          window.clearTimeout(timer); setStatus("Запуск №"+run.number);return;
        }
        if (!["warning","error","console"].includes(data.type) || typeof data.message!=="string" || data.message.length>2000 ||
          typeof data.id!=="string" || data.id.length>64 || !Number.isSafeInteger(data.line) || data.line<1) return;
        setEntries(old=>old.length>=200?old:[...old,{type:data.type,id:data.id,line:data.line,message:data.message}]);
      };
      port.postMessage({type:"init",run:run.id,plan:run.plan});
    }
    frame.onload=()=>{if (++loads>1) stop("Страница предпросмотра сменилась. Перезапустите проект.");};
    window.addEventListener("message",ready);
    frame.src="/preview/runner#"+run.id;
    host.current!.append(frame);
    return ()=>{closed=true;clearTimeout(timer);window.removeEventListener("message",ready);port?.close();frame.onload=null;frame.remove();};
  },[run]);
  return <><div className="viewport" ref={host} style={{"--preview-size":10000/zoom+"%","--preview-scale":zoom/100} as React.CSSProperties}/>
    <p className="run-status" aria-live="polite">{status}</p>
    {entries.length>0 && <details className="run-output" open><summary>Сообщения запуска ({entries.length})</summary><ul>{entries.map((e,i)=>
      <li key={i}>{e.id && titleOf(e.id) && <button onClick={()=>onIssue(e.id,e.line)}>{titleOf(e.id)} · строка {e.line}</button>} {e.message}</li>)}</ul></details>}
    </>;
}
