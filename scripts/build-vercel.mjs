// Generates .vercel/output/ (Vercel Build Output API v3) from the
// TanStack Start build artifacts in ./dist. Vercel auto-detects this
// directory and serves it as-is, bypassing its framework presets.
//
// Strategy: copy dist/client -> .vercel/output/static (CDN assets),
// wrap dist/server/assets/worker-entry-*.js as an Edge Function at
// .vercel/output/functions/_render.func, route filesystem-miss -> _render.
import { cp, mkdir, writeFile, readdir, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dist = join(root, "dist");
const out = join(root, ".vercel", "output");

if (!existsSync(dist)) {
  throw new Error(`dist/ missing — run \`vite build\` first.`);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

// 1. Static assets -> .vercel/output/static
const staticOut = join(out, "static");
await mkdir(staticOut, { recursive: true });
const clientDir = join(dist, "client");
if (existsSync(clientDir)) {
  await cp(clientDir, staticOut, { recursive: true });
} else {
  console.warn("⚠ dist/client missing — no static assets copied.");
}

// 2. Find the built server entry (worker-entry-[hash].js)
const serverDir = join(dist, "server");
const assetsDir = join(serverDir, "assets");
if (!existsSync(assetsDir)) {
  throw new Error(`dist/server/assets missing — server build failed.`);
}
const entries = await readdir(assetsDir);
const workerEntry = entries.find(
  (f) => f.startsWith("worker-entry") && f.endsWith(".js"),
);
if (!workerEntry) {
  throw new Error(
    `worker-entry-*.js not found in ${assetsDir}. Entries: ${entries.join(", ")}`,
  );
}

// 3. Build the Edge Function at .vercel/output/functions/_render.func
const funcDir = join(out, "functions", "_render.func");
await mkdir(funcDir, { recursive: true });
// Copy entire server dir so the bundle's relative imports still resolve
await cp(serverDir, funcDir, { recursive: true });

// Edge-runtime shim: re-export the fetch handler as default
await writeFile(
  join(funcDir, "index.js"),
  `import handler from "./assets/${workerEntry}";
export default handler;
`,
);

await writeFile(
  join(funcDir, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "edge",
      entrypoint: "index.js",
    },
    null,
    2,
  ),
);

// 4. Routing: try filesystem first, otherwise SSR via _render
await writeFile(
  join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [{ handle: "filesystem" }, { src: "/.*", dest: "/_render" }],
    },
    null,
    2,
  ),
);

console.log("✓ .vercel/output generated (edge function: _render)");
