import { useLayoutEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap, drawSelection, lineNumbers, tooltips } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap, completeFromList, ifIn } from "@codemirror/autocomplete";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { propertyControls } from "./cssDeclarations";
import { javascript } from "@codemirror/lang-javascript";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

const markdownCompletions = markdownLanguage.data.of({
  autocomplete: completeFromList([
    { label: "#", detail: "Заголовок", apply: "# " },
    { label: "-", detail: "Список", apply: "- " },
    { label: "[]()", detail: "Ссылка" },
  ]),
});
const languages = {
  HTML: html(), CSS: [css(), propertyControls], JavaScript: javascript(),
  Markdown: [markdown(), markdownCompletions],
};
export type Kind = keyof typeof languages;

type Props = {
  kind: Kind; value: string; label: string; autoFocus?: boolean; dark?: boolean;
  onChange: (source: string, restart: boolean) => void; onFinish?: () => void;
};

export function CellEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const theme = useRef(new Compartment());
  const latest = useRef(props);
  latest.current = props;
  useLayoutEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: latest.current.value,
        extensions: [
          languages[props.kind], lineNumbers(), history(), drawSelection(), closeBrackets(),
          theme.current.of(latest.current.dark ? oneDark : syntaxHighlighting(defaultHighlightStyle)), autocompletion(), EditorView.lineWrapping,
          tooltips({ parent: document.getElementById("editor-tooltips")! }),
          EditorView.contentAttributes.of({ "aria-label": props.label, spellcheck: "false" }),
          keymap.of([
            { key: "Shift-Enter", run: () => {
              if (!latest.current.onFinish) return false;
              latest.current.onFinish();
              return true;
            } },
            ...completionKeymap, ...closeBracketsKeymap, ...historyKeymap, ...defaultKeymap,
          ]),
          EditorView.updateListener.of(update => {
            if (update.docChanged) latest.current.onChange(update.state.doc.toString(), update.transactions.some(tr => tr.isUserEvent("input.toggleStyle")));
          }),
        ],
      }),
    });
    view.current = editor;
    if (latest.current.autoFocus) editor.focus();
    return () => { editor.destroy(); view.current = null; };
  }, [props.kind, props.label]);
  useLayoutEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure(props.dark ? oneDark : syntaxHighlighting(defaultHighlightStyle)) });
  }, [props.dark]);
  useLayoutEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== props.value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: props.value } });
    }
  }, [props.value]);
  return <div ref={host} className="source-editor" onClick={event => {
    const editor = view.current;
    if (event.target !== host.current || !editor) return;
    const position = editor.posAtCoords({ x: event.clientX, y: event.clientY });
    editor.focus();
    if (position !== null) editor.dispatch({ selection: { anchor: position } });
  }} />;
}
