import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("connector bridge closes route ends and inherits the selected Start width", async () => {
  const output = mkdtempSync(join(tmpdir(), "gridwatch-track-bridge-"));
  try {
    execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--outDir", output, "--module", "NodeNext", "--moduleResolution", "NodeNext", "--target", "ES2022", "app/track-creator/domain/track/types.ts", "app/track-creator/domain/track/math.ts", "app/track-creator/domain/track/advancedModules.ts", "app/track-creator/domain/track/modules.ts", "app/track-creator/domain/track/geometry.ts", "app/track-creator/domain/track/document.ts", "app/track-creator/domain/track/routes.ts"], { stdio: "pipe" });
    const compiled = output;
    const { createConnectorBridge } = await import(pathToFileURL(join(compiled, "routes.js")).href);
    const { connectorsCompatible, connectionCompatible, getWorldConnector } = await import(pathToFileURL(join(compiled, "geometry.js")).href);
    const now = new Date().toISOString();
    const document = {
      schemaVersion: 2, id: "track-test", metadata: { name: "Bridge test", description: "", createdAt: now, updatedAt: now }, world: { units: "meters", upAxis: "z" },
      modules: [
        { id: "end-piece", definitionId: "straight", transform: { position: { x: 0, y: 0, z: 0 }, rotation: 0 }, parameters: { length: 40, width: 10, elevationDelta: 0 } },
        { id: "start-piece", definitionId: "straight", transform: { position: { x: -40, y: 0, z: 0 }, rotation: 0 }, parameters: { length: 40, width: 12, elevationDelta: 0 } },
      ],
      connections: [{ id: "existing", a: { moduleId: "start-piece", connectorId: "end" }, b: { moduleId: "end-piece", connectorId: "start" } }],
      paths: [{ id: "primary", kind: "primary-loop", closed: false, sourceModuleIds: ["end-piece", "start-piece"] }],
      markers: [], zones: [], grid: { pathId: "primary", startMarkerId: "", slotCount: 1, longitudinalSpacingMeters: 8, lateralSpacingMeters: 3, staggerPattern: "alternating", slots: [] }, spectatorFrame: { aspectRatio: { x: 16, y: 9 }, center: { x: 0, y: 0 }, size: { x: 200, y: 112 }, rotation: 0, margins: { top: 0, right: 0, bottom: 0, left: 0 }, required: true }, theme: { id: "base", name: "Base" }, overrides: [], props: [], environment: { runoff: "grass", barrier: "guardrail", kerb: "red-white" }, terrain: { width: 1, height: 1, cellSizeMeters: 1, origin: { x: 0, y: 0 }, elevations: [0] }, pitBoxes: [],
    };
    const next = createConnectorBridge(document, "primary", { moduleId: "end-piece", connectorId: "end" }, { moduleId: "start-piece", connectorId: "start" });
    const bridge = next.modules.at(-1);
    assert.equal(bridge.definitionId, "freeform-curve");
    assert.equal(bridge.parameters.width, 12);
    assert.equal(bridge.generatedBridge.inheritedFromModuleId, "start-piece");
    assert.equal(next.paths[0].closed, true);
    const source = getWorldConnector(next.modules[0], "end");
    const bridgeStart = getWorldConnector(bridge, "start");
    assert.equal(connectorsCompatible(source, bridgeStart), false);
    assert.equal(connectionCompatible(next, { moduleId: "end-piece", connectorId: "end" }, { moduleId: bridge.id, connectorId: "start" }, source, bridgeStart), true);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test("moving a road evaluates every connector for a nearby compatible snap", () => {
  const source = readFileSync("app/track-creator/domain/track/geometry.ts", "utf8");
  assert.match(source, /const movingConnectors = connectorId/);
  assert.match(source, /: localConnectors;/);
  assert.match(source, /movingConnectors\.flatMap/);
  assert.match(source, /connectorId: best\.local\.id/);
});
