import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(import.meta.dirname, "../.."), "");
  return {
    plugins: [
      mdx(),
      tailwindcss(),
      tanstackStart({
        pages: [
          {
            path: "/docs",
          },
          {
            path: "/api/search",
          },
          {
            path: "llms-full.txt",
          },
          {
            path: "llms.txt",
          },
        ],

        spa: {
          enabled: true,
          prerender: {
            crawlLinks: true,
            enabled: true,
          },
        },
      }),
      react(),
      // please see https://tanstack.com/start/latest/docs/framework/react/guide/hosting#nitro for guides on hosting
      nitro(),
    ],
    resolve: {
      alias: {
        tslib: "tslib/tslib.es6.js",
      },
      tsconfigPaths: true,
    },
    server: {
      port: Number(env.FUMADOCS_PORT ?? 3002),
    },
  };
});
