import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Build do aplicativo do AgroSmart. Quem serve o resultado e o repassa de /api
 * para o backend e `scripts/servir-interface.mjs`, dentro do Docker.
 */
export default defineConfig(() => {
  return {
    plugins: [react()],
    build: {
      outDir: "dist",
      sourcemap: true,
      rollupOptions: {
        output: {
          // O ethers responde por quase todo o peso do pacote e quase nunca muda.
          // Separa-lo faz o navegador reaproveitar o arquivo entre versoes do app.
          // No Vite 8 (Rolldown) a opcao so aceita a forma de funcao.
          manualChunks: (id) =>
            /node_modules[\\/](ethers|@noble|@adraffy)[\\/]/.test(id) ? "ethers" : undefined,
        },
      },
    },
  };
});
