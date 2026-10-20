import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig, mergeConfig } from "vite";
import aplicativo from "../../app/vite.config.js";
const aqui = path.dirname(fileURLToPath(import.meta.url));
const requireApp = createRequire(path.resolve(aqui, "../../app/package.json"));
process.env.VITE_REDE = "localhost";
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
        { find: /^leaflet$/, replacement: requireApp.resolve("leaflet") },
        { find: /^qrcode$/, replacement: requireApp.resolve("qrcode") },
      ],
    },
    test: {
      environment: "jsdom",
      include: ["testes/app/**/*.test.{js,mjs,jsx}"],
      setupFiles: [path.join(aqui, "preparar.js")],
      coverage: {
        provider: "v8",
        reportsDirectory: path.resolve(aqui, "../gerados/app/cobertura"),
        include: ["app/src/**/*.{js,jsx}"],
        exclude: ["app/src/main.jsx", "app/src/cadeia/implantacoes.json"],
        reporter: ["text-summary", "text"],
      },
    },
  }),
);
