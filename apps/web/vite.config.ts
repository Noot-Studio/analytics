import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      tailwindcss(),
      tanstackRouter({
        autoCodeSplitting: true,
        target: "react",
      }),
      react(),
    ],
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      port: Number(env.WEB_PORT ?? 3001),
    },
  };
});
