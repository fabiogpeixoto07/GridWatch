import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), "gridwatch-simulation-"));
await symlink(fileURLToPath(new URL("../node_modules", import.meta.url)), join(temporary, "node_modules"), "junction");
const compiler = new URL("../node_modules/typescript/bin/tsc", import.meta.url);
const sources = [
  "app/domain/vehicle-spec.ts",
  "app/simulation/compiled-track.ts",
  "app/simulation/authoring-track-compiler.ts",
  "app/simulation/speed-profile.ts",
  "app/simulation/engine/rapier-vehicle-world.ts",
  "app/simulation/world-race-engine.ts",
  "app/track-creator/domain/track/document.ts",
  "app/track-creator/domain/track/geometry.ts",
  "app/track-creator/domain/track/modules.ts",
  "app/track-creator/domain/track/advancedModules.ts",
  "app/track-creator/domain/track/authoring.ts",
];
const compile = spawnSync(process.execPath, [fileURLToPath(compiler), ...sources, "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext", "--outDir", temporary, "--skipLibCheck"], { cwd: fileURLToPath(root), encoding: "utf8" });
if (compile.status !== 0) throw new Error(compile.stderr || compile.stdout);
const importBuilt = (path) => import(pathToFileURL(join(temporary, path)).href);
const vehicles = await importBuilt("domain/vehicle-spec.js");
const authoringCompiler = await importBuilt("simulation/authoring-track-compiler.js");
const authoringDocuments = await importBuilt("track-creator/domain/track/document.js");
const speedProfiles = await importBuilt("simulation/speed-profile.js");
const physics = await importBuilt("simulation/engine/rapier-vehicle-world.js");
const worldRacing = await importBuilt("simulation/world-race-engine.js");
const rapierCompat = await import("@dimforge/rapier2d-deterministic-compat");
physics.configureRapierLoader(async () => ({ api: rapierCompat.default, initialize: () => rapierCompat.default.init() }));
test.after(() => rm(temporary, { recursive: true, force: true }));

test("Track Editor documents compile their closed primary route, grid, surfaces, edges, and sensors", () => {
  const document = authoringDocuments.createSampleDocument();
  document.modules[0].properties = {
    surface: "concrete",
    grip: 0.92,
    edges: {
      left: { runoff: "sand", barrier: "none", kerb: "yellow-black" },
      right: { runoff: "asphalt", barrier: "wall", kerb: "blue-white" },
    },
  };
  const compiled = authoringCompiler.compileAuthoringTrack(document);
  assert.ok(compiled.lengthMeters > 300);
  assert.equal(compiled.gridSlots.length, document.grid.slotCount);
  assert.ok(compiled.sensors.some((sensor) => sensor.kind === "start-finish"));
  assert.ok(compiled.samples.some((sample) => sample.surface === "concrete" && sample.grip === 0.92));
  assert.ok(compiled.samples.filter((sample) => sample.moduleId === document.modules[0].id).every((sample) => sample.edges.left.runoff === "sand" && sample.edges.right.barrier === "wall"));
  assert.ok(compiled.colliders.some((collider) => collider.side === "right"));
});

test("Start/Finish direction reverses the compiled travel, grid heading, and racing progression", () => {
  const clockwise = authoringDocuments.createSampleDocument();
  clockwise.grid.racingDirection = "clockwise";
  const counterClockwise = structuredClone(clockwise);
  counterClockwise.grid.racingDirection = "counter-clockwise";
  const forward = authoringCompiler.compileAuthoringTrack(clockwise);
  const reverse = authoringCompiler.compileAuthoringTrack(counterClockwise);
  assert.ok(forward.samples[0].tangent.x * reverse.samples[0].tangent.x + forward.samples[0].tangent.y * reverse.samples[0].tangent.y < -0.9);
  assert.ok(forward.gridSlots[0].heading !== reverse.gridSlots[0].heading);
  assert.ok(forward.sensors.some((sensor) => sensor.kind === "start-finish"));
});

test("a native authored track drives deterministically in the physical race engine", async () => {
  const compiled = authoringCompiler.compileAuthoringTrack(authoringDocuments.createSampleDocument());
  const trajectory = speedProfiles.buildRacingTrajectory(compiled, vehicles.DEFAULT_FORMULA_VEHICLE_SPEC);
  assert.ok(trajectory.samples.length > 0);
  const drivers = [
    { id: "one", skill: 92, aggression: 90, consistency: 80, cornering: 90, overtaking: 92, defense: 82, risk: 78 },
    { id: "two", skill: 86, aggression: 82, consistency: 88, cornering: 84, overtaking: 80, defense: 88, risk: 70 },
  ];
  const run = async () => {
    const engine = await worldRacing.WorldRaceEngine.create(compiled, vehicles.DEFAULT_FORMULA_VEHICLE_SPEC, drivers);
    engine.setPerformanceModifier("one", 0.02);
    engine.step(600);
    const snapshot = engine.snapshot();
    engine.free();
    return snapshot;
  };
  const first = await run();
  assert.deepEqual(first, await run());
  assert.ok(first.every((car) => Number.isFinite(car.position.x) && Number.isFinite(car.heading)));
});
