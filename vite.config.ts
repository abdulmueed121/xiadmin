import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tanstackStart({
      server: { 
        // @ts-ignore: Bypassing strict types to pass the preset to the underlying Nitro engine
        preset: "vercel",
        entry: "server"
      }
    }),
    viteReact(),
    tailwindcss(),
    tsConfigPaths(),
  ],
});