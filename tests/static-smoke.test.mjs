import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { createStaticServer, staticRoot } from "./static-server.mjs";

test("IIS artifact serves the application shell and runtime assets", async () => {
  await access(join(staticRoot, "index.html"));
  const server = createStaticServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const shell = await fetch(`${base}/`);
    const shellText = await shell.text();
    assert.equal(shell.status, 200);
    assert.match(shell.headers.get("content-type") ?? "", /text\/html/);
    assert.match(shellText, /GRID|root/i);

    for (const asset of [
      "/assets/track-materials.svg",
      "/assets/scenery-atlas.svg",
      "/assets/sprites/formula-default-top.svg",
      "/assets/sprites/formula-solaris-lateral.svg",
      "/assets/gridwatch-asset-manifest.json",
    ]) {
      const response = await fetch(`${base}${asset}`);
      assert.equal(response.status, 200, asset);
      assert.notEqual((response.headers.get("content-type") ?? "").length, 0, asset);
    }

    const traversal = await fetch(`${base}/../package.json`);
    assert.equal(traversal.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
