import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { imagetools } from "vite-imagetools";

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
      imagetools(),
    ],
    preview: {
      port: Number(env.LANDING_PORT ?? 3003),
    },
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      port: Number(env.LANDING_PORT ?? 3003),
    },
  };
});
