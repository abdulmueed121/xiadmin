import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// NOTE: TanStack Start v1.167+ does not expose a Nitro preset selector.
// The Vite plugin always emits a Web fetch handler (worker-entry-*.js).
// For Vercel, `scripts/build-vercel.mjs` (run after `vite build`) wraps
// that handler as a Vercel Edge Function under `.vercel/output/`.
// For Cloudflare, `wrangler.jsonc` consumes the same handler directly.
export default defineConfig({
  plugins: [
    tanstackStart({
      server: { entry: "server" },
    }),
    viteReact(),
    tailwindcss(),
    tsConfigPaths(),
  ],
});