// Generates .vercel/output/ (Vercel Build Output API v3) from the
// TanStack Start build artifacts in ./dist. Vercel auto-detects this
// directory and serves it as-is, bypassing its framework presets.
//
// Strategy: copy dist/client -> .vercel/output/static (CDN assets),
// wrap dist/server/assets/worker-entry-*.js as a Node.js Function at
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

// 2. Locate the built server entry. Current TanStack Start emits
// dist/server/server.js; older Cloudflare builds emitted
// dist/server/assets/worker-entry-[hash].js — support both.
const serverDir = join(dist, "server");
if (!existsSync(serverDir)) {
  throw new Error(`dist/server missing — server build failed.`);
}
let entryRel;
if (existsSync(join(serverDir, "server.js"))) {
  entryRel = "server.js";
} else {
  const assetsDir = join(serverDir, "assets");
  const list = existsSync(assetsDir) ? await readdir(assetsDir) : [];
  const worker = list.find(
    (f) => f.startsWith("worker-entry") && f.endsWith(".js"),
  );
  if (!worker) {
    throw new Error(
      `No server entry found (server.js or assets/worker-entry-*.js).`,
    );
  }
  entryRel = `assets/${worker}`;
}

// 3. Build the Node.js Function at .vercel/output/functions/_render.func
const funcDir = join(out, "functions", "_render.func");
await mkdir(funcDir, { recursive: true });
await cp(serverDir, funcDir, { recursive: true });

await writeFile(
  join(funcDir, "index.js"),
  `import handler from "./${entryRel}";
export default handler;
`,
);

// CHANGED: Swapped "edge" for "nodejs20.x" and updated required Vercel keys.
await writeFile(
  join(funcDir, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs20.x",
      handler: "index.js",
      launcherType: "Nodejs",
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

console.log("✓ .vercel/output generated (Node.js function: _render)");