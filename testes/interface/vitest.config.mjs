import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, mergeConfig } from "vite";
import aplicativo from "../../interface/vite.config.js";
const aqui = path.dirname(fileURLToPath(import.meta.url));
export default mergeConfig(
  aplicativo({ mode: "test", command: "serve" }),
  defineConfig({
    root: path.resolve(aqui, "../.."),
    resolve: {
      dedupe: ["react", "react-dom"],
      alias: [
        {
          find: "./implantacoes.json",
          replacement: path.join(aqui, "fixtures/implantacoes.json"),
        },
      ],
    },
    test: {
      environment: "jsdom",
      include: ["testes/interface/**/*.test.{js,mjs,jsx}"],
      setupFiles: [path.join(aqui, "fixtures/preparar.js")],
      coverage: {
        provider: "v8",
        reportsDirectory: path.resolve(aqui, "../gerados/interface/cobertura"),
        include: ["interface/src/**/*.{js,jsx}"],
        exclude: ["interface/src/main.jsx", "interface/src/cadeia/implantacoes.json"],
        reporter: ["text-summary", "text", "json-summary"],
      },
    },
  }),
);
