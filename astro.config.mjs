// @ts-check
import { defineConfig } from "astro/config";

import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

import vercel from "@astrojs/vercel";
import node from "@astrojs/node";

// On Vercel, deploy as a serverless Node function. Locally (and anywhere
// else), default to the standalone Node adapter so `npm run build && node
// ./dist/server/entry.mjs` just works.
const adapter = process.env.VERCEL
  ? vercel({ maxDuration: 60 })
  : node({ mode: "standalone" });

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react()],
  adapter,
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      external: ["better-sqlite3"],
      noExternal: [],
    },
    optimizeDeps: {
      exclude: ["better-sqlite3"],
    },
  },
});
