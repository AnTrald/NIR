import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const path = relative => fileURLToPath(new URL(relative, import.meta.url));
const root = path("../../demo/");
const modules = path("../node_modules/");
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  cacheDir: path("../node_modules/.vite-notebook-demo/"),
  resolve: {
    alias: {
      "react-dom": path("../node_modules/react-dom"),
      react: path("../node_modules/react"),
    },
  },
  oxc: { jsx: { runtime: "automatic" } },
  server: { host: "127.0.0.1", port: 5173, fs: { allow: [root, modules] } },
});
await server.listen();
server.printUrls();
