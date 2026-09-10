import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), "gridwatch-circuit-editor-"));
const compiler = new URL("../node_modules/typescript/bin/tsc", import.meta.url);
const sources = [
  "app/tracks.ts",
  "app/domain/circuit-document.ts",
  "app/domain/race-strategy.ts",
  "app/track-chunks.ts",
  "app/simulation/circuit-compiler.ts",
  "app/simulation/route-controller.ts",
];
const compile = spawnSync(process.execPath, [fileURLToPath(compiler), ...sources, "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext", "--outDir", temporary, "--skipLibCheck"], { cwd: fileURLToPath(root), encoding: "utf8" });
assert.equal(compile.status, 0, compile.stderr || compile.stdout);
const importBuilt = (path) => import(pathToFileURL(join(temporary, path)).href);
const documents = await importBuilt("domain/circuit-document.js");
const strategy = await importBuilt("domain/race-strategy.js");
const chunks = await importBuilt("track-chunks.js");
const compilerModule = await importBuilt("simulation/circuit-compiler.js");
const routes = await importBuilt("simulation/route-controller.js");
test.after(() => rm(temporary, { recursive: true, force: true }));

test("circuit documents reject open main routes and accept compatible port roles", () => {
  assert.equal(documents.compatibleConnection("output", "input"), true);
  assert.equal(documents.compatibleConnection("secondaryOutput", "secondaryInput"), true);
  assert.equal(documents.compatibleConnection("input", "output"), false);
  const document = documents.createEmptyCircuitDocument("open");
  const template = chunks.TRACK_CHUNK_TEMPLATE_MAP.get("straight-short");
  document.chunks = ["a", "b"].map((id, index) => ({ id, templateId: template.id, x: index * 50, y: 0, rotation: 0, curbMode: "both" }));
  document.startFinish = { chunkId: "a", progress: 0 };
  document.startingGrid = { anchorChunkId: "a", anchorProgress: 0, slots: 2, rowSpacingMeters: 8, lateralSpacingMeters: 2, stagger: true };
  document.pitBoxes = null;
  document.connections = [{ id: "a-b", from: { chunkId: "a", role: "output" }, to: { chunkId: "b", role: "input" } }];
  const issues = documents.validateCircuitDocument(document, chunks.TRACK_CHUNK_TEMPLATE_MAP);
  assert.ok(issues.some((issue) => issue.code === "open-main-loop"));
});

test("compiled chunk documents preserve authored grid, pit-box, and curb geometry", () => {
  const document = documents.createEmptyCircuitDocument("compiled");
  document.routes = [{ routeId: "main", points: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }], confirmedRevision: document.revision }];
  document.startFinish = { chunkId: "none", progress: 0 };
  document.startingGrid = { anchorChunkId: "none", anchorProgress: .25, slots: 4, rowSpacingMeters: 8, lateralSpacingMeters: 2, stagger: false };
  document.pitBoxes = { anchorChunkId: "none", anchorProgress: .4, count: 3, side: "left", spacingMeters: 8, speedLimitKph: 80 };
  document.routes.push({ routeId: "pit:main", points: [{ x: 0, y: 0 }, { x: 120, y: 0 }], confirmedRevision: document.revision });
  const compiled = compilerModule.compileCircuitDocument(document, chunks.TRACK_CHUNK_TEMPLATE_MAP);
  assert.equal(compiled.gridSlots.length, 4);
  assert.equal(compiled.pitBoxes.length, 3);
  assert.equal(compiled.routes.some((route) => route.id === "pit:main"), true);
  assert.ok(compiled.main.lengthMeters > 0);
});

test("route controller queues shared pit boxes and supports reversible escape return", () => {
  const circuit = { routes: [{ id: "main", reversible: false }, { id: "pit:main", reversible: false }, { id: "escape:main", reversible: true }], pitBoxes: [{ id: "box-1" }] };
  let state = routes.createRouteController(circuit);
  state = routes.registerRouteCar(state, "car-1");
  state = routes.registerRouteCar(state, "car-2");
  state = routes.requestPitEntry(state, "car-1");
  state = routes.assignPitBox(state, "car-1");
  state = routes.requestPitEntry(state, "car-2");
  state = routes.assignPitBox(state, "car-2");
  assert.deepEqual(state.pitQueues["box-1"], ["car-1", "car-2"]);
  state = routes.beginPitService(state, "car-1", 10);
  assert.equal(state.cars["car-1"].pitState, "servicing");
  state = routes.completePitService(state, "car-1");
  assert.equal(state.cars["car-1"].pitState, "exiting");
  state = routes.enterEscapeRoute(state, "car-2");
  state = routes.reverseAtEscapeTerminal(state, "car-2");
  state = routes.rejoinMainRoute(state, "car-2", .5);
  assert.equal(state.cars["car-2"].routeId, "main");
  assert.equal(state.cars["car-2"].escapeState, "rejoining");
});

test("strategy rules request service for mandatory stops and worn tires", () => {
  const rules = strategy.normalizeStrategyRules({ mandatoryStops: 1, compounds: strategy.DEFAULT_FORMULA_STRATEGY.compounds });
  const state = strategy.createCarStrategyState(rules, 1);
  assert.equal(strategy.shouldRequestPitStop(state, rules, 0, 10), false);
  assert.equal(strategy.shouldRequestPitStop(state, rules, 1, 10), true);
  state.tireWear = .8;
  assert.equal(strategy.shouldRequestPitStop(state, rules, 0, 10), true);
});

test("Track Editor maps canvas pointer coordinates through the live viewport", async () => {
  const source = await readFile(new URL("../app/track-creator/editor/CanvasViewport.tsx", import.meta.url), "utf8");
  assert.match(source, /function screenToWorld\(event: React\.PointerEvent<HTMLCanvasElement>\)/);
  assert.match(source, /event\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(source, /props\.viewport\.zoom/);
  assert.match(source, /const point = screenToWorld\(event\)/);
});

test("Track Editor captures pointer interactions and releases them safely", async () => {
  const source = await readFile(new URL("../app/track-creator/editor/CanvasViewport.tsx", import.meta.url), "utf8");
  assert.match(source, /setPointerCapture\(event\.pointerId\)/);
  assert.match(source, /hasPointerCapture\(event\.pointerId\)/);
  assert.match(source, /releasePointerCapture\(event\.pointerId\)/);
});
