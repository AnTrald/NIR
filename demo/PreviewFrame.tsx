type Project = { body: string; styles: string[]; scripts: string[] };

export function previewPage({ body, styles, scripts }: Project) {
  const policy = scripts.length ? "" : '<meta http-equiv="Content-Security-Policy" content="script-src &apos;none&apos;">';
  const css = styles.map(source => "<style>" + source.replace(/<\/style/gi, "<\\/style") + "</style>").join("\n");
  const js = scripts.map(source => "<script>" + source.replace(/<\/script/gi, "<\\/script") + "</script>").join("\n");
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8">' + policy + css + "</head><body>" + body + js + "</body></html>";
}

export function PreviewFrame({ page, zoom }: { page: string; zoom: number }) {
  return <iframe sandbox="allow-scripts" title="Web Notebook Preview" srcDoc={page}
    style={{ width: 10000 / zoom + "%", height: 10000 / zoom + "%", transform: "scale(" + zoom / 100 + ")" }} />;
}
