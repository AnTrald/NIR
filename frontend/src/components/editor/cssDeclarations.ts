import { cssLanguage } from "@codemirror/lang-css";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";

// Храним отметку рядом с объявлением: она перемещается вместе с исходным кодом.
const marker = "/* webnb:off */";

function declarations(source: string) {
  const result: { start: number; end: number; markerStart: number; name: string }[] = [];
  cssLanguage.parser.parse(source).iterate({ enter(ref) {
    if (ref.name !== "Declaration") return;
    const node = ref.node;
    const property = node.firstChild;
    if (!property || !node.getChild(":")) return;
    const prev = node.prevSibling;
    const marked = prev?.name === "Comment" && source.slice(prev.from, prev.to) === marker;
    result.push({ start: node.from, end: node.to, markerStart: marked ? prev!.from : -1,
      name: source.slice(property.from, property.to) });
  } });
  return result;
}

export function activeStyles(source: string) {
  if (!source.includes(marker)) return source;
  for (const d of declarations(source).reverse()) {
    if (d.markerStart >= 0) source = source.slice(0, d.markerStart) +
      source.slice(d.markerStart, d.end).replace(/[^\r\n]/g, " ") + source.slice(d.end);
  }
  return source;
}

class PropertyToggle extends WidgetType {
  constructor(readonly name: string, readonly enabled: boolean) { super(); }
  eq(other: PropertyToggle) { return other.name === this.name && other.enabled === this.enabled; }
  toDOM(view: EditorView) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "property-toggle";
    input.checked = this.enabled;
    input.setAttribute("aria-label", "Свойство " + this.name);
    input.title = (this.enabled ? "Выключить " : "Включить ") + this.name;
    input.onchange = () => {
      const pos = view.posAtDOM(input);
      view.dispatch({ userEvent: "input.toggleStyle", changes: this.enabled ? { from: pos, insert: marker } : { from: pos, to: pos + marker.length } });
    };
    return input;
  }
}

function controls(view: EditorView) {
  const ranges = declarations(view.state.doc.toString()).flatMap(d => {
    const enabled = d.markerStart < 0;
    const widget = new PropertyToggle(d.name, enabled);
    return enabled ? [Decoration.widget({ widget, side: -1 }).range(d.start)] : [
      Decoration.replace({ widget }).range(d.markerStart, d.markerStart + marker.length),
      Decoration.mark({ class: "property-off" }).range(d.start, d.end),
    ];
  });
  return Decoration.set(ranges, true);
}

export const propertyControls = ViewPlugin.define(view => ({
  decorations: controls(view),
  update(update) {
    if (update.docChanged) this.decorations = controls(update.view);
  },
}), { decorations: plugin => plugin.decorations });
