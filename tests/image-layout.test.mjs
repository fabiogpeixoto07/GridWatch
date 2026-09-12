import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const output = mkdtempSync(join(tmpdir(), "gridwatch-image-layout-"));
try {
  execFileSync(process.execPath, [
    "node_modules/typescript/bin/tsc",
    "--outDir", output,
    "--module", "NodeNext",
    "--moduleResolution", "NodeNext",
    "--target", "ES2022",
    "app/track-creator/domain/track/types.ts",
    "app/track-creator/domain/track/math.ts",
    "app/track-creator/domain/track/advancedModules.ts",
    "app/track-creator/domain/track/modules.ts",
    "app/track-creator/domain/track/geometry.ts",
    "app/track-creator/domain/track/document.ts",
    "app/track-creator/domain/track/image-layout.ts",
  ], { stdio: "pipe" });
} catch (error) {
  rmSync(output, { recursive: true, force: true });
  throw error;
}

const { convertRasterToTrack } = await import(pathToFileURL(join(output, "image-layout.js")).href);
const { buildTrackGeometry } = await import(pathToFileURL(join(output, "geometry.js")).href);
test.after(() => rmSync(output, { recursive: true, force: true }));

test("black image layouts become a connected track and discard unrelated pixels", () => {
  const width = 96;
  const height = 96;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const paint = (x, y, color = 0) => {
    const index = (y * width + x) * 4;
    data[index] = color;
    data[index + 1] = color;
    data[index + 2] = color;
    data[index + 3] = 255;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const radius = Math.hypot(x - 48, y - 48);
      if (radius > 24 && radius < 32) paint(x, y);
    }
  }
  paint(4, 4);
  const result = convertRasterToTrack({ width, height, data });
  const path = result.document.paths.find((item) => item.id === "primary");
  const geometry = buildTrackGeometry(result.document);

  assert.ok(result.stats.blackPixels > 1000);
  assert.ok(result.stats.routePoints >= 12);
  assert.equal(result.stats.modules, result.document.modules.length);
  assert.equal(result.document.connections.length, result.document.modules.length);
  assert.equal(path?.closed, true);
  assert.equal(result.document.grid.startMarkerId, "");
  assert.deepEqual(result.document.grid.slots, []);
  assert.ok(geometry);
  assert.equal(geometry.path.closed, true);
  assert.ok(geometry.path.samples.length > 12);
  assert.ok(geometry.path.totalLengthMeters > 0);
});
