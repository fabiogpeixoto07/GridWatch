import assert from "node:assert/strict";
import { readdir, stat, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("source and deployment artifacts stay within interaction budgets", async () => {
  const page = await stat(new URL("app/page.tsx", root));
  const shell = await stat(new URL("app/game/GameShell.tsx", root));
  assert.ok(page.size < 2_000, `app/page.tsx is ${page.size} bytes; keep the route as composition only`);
  assert.ok(shell.size < 180_000, `app/game/GameShell.tsx is ${shell.size} bytes; extract another feature boundary before 180 KB`);
  const files = await readdir(new URL("iis-dist/assets/", root));
  const javascript = files.filter((file) => file.endsWith(".js"));
  const sizes = await Promise.all(javascript.map(async (file) => (await stat(new URL(`iis-dist/assets/${file}`, root))).size));
  assert.ok(sizes.every((size) => size < 400_000), `IIS JavaScript chunk exceeds 400 KB: ${Math.max(...sizes)}`);
});

test("accessibility fallbacks cover motion, focus, and live race status", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  const page = await readFile(new URL("app/game/GameShell.tsx", root), "utf8");
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /aria-atomic="true"/);
});
