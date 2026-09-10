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
  "app/championship/autoplay-director.ts",
  "app/domain/vehicle-spec.ts",
  "app/domain/track-document.ts",
  "app/simulation/track-compiler.ts",
  "app/simulation/authoring-track-compiler.ts",
  "app/simulation/speed-profile.ts",
  "app/simulation/engine/rapier-vehicle-world.ts",
  "app/simulation/world-race-engine.ts",
  "app/simulation/regression-fixtures.ts",
  "app/track-creator/domain/track/document.ts",
  "app/track-creator/domain/track/geometry.ts",
  "app/track-creator/domain/track/modules.ts",
  "app/track-creator/domain/track/advancedModules.ts",
  "app/track-creator/domain/track/authoring.ts",
  "app/track-creator/legacy-migration.ts",
  "app/track-creator/legacy-circuit-document-migration.ts",
];
const compile = spawnSync(process.execPath, [fileURLToPath(compiler), ...sources, "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext", "--outDir", temporary, "--skipLibCheck"], { cwd: fileURLToPath(root), encoding: "utf8" });
if (compile.status !== 0) throw new Error(compile.stderr || compile.stdout);
const importBuilt = (path) => import(pathToFileURL(join(temporary, path)).href);
const autoplay = await importBuilt("championship/autoplay-director.js");
const vehicles = await importBuilt("domain/vehicle-spec.js");
const tracks = await importBuilt("domain/track-document.js");
const compilerModule = await importBuilt("simulation/track-compiler.js");
const authoringCompiler = await importBuilt("simulation/authoring-track-compiler.js");
const authoringDocuments = await importBuilt("track-creator/domain/track/document.js");
const legacyMigration = await importBuilt("track-creator/legacy-migration.js");
const legacyCircuitDocumentMigration = await importBuilt("track-creator/legacy-circuit-document-migration.js");
const speedProfiles = await importBuilt("simulation/speed-profile.js");
const physics = await importBuilt("simulation/engine/rapier-vehicle-world.js");
const worldRacing = await importBuilt("simulation/world-race-engine.js");
const regression = await importBuilt("simulation/regression-fixtures.js");
const rapierCompat = await import("@dimforge/rapier2d-deterministic-compat");
physics.configureRapierLoader(async () => ({ api: rapierCompat.default, initialize: () => rapierCompat.default.init() }));
test.after(() => rm(temporary, { recursive: true, force: true }));

test("autoplay director pauses deadlines and executes a presentation exactly once", () => {
  let now = 100;
  let advances = 0;
  const director = new autoplay.ChampionshipAutoplayDirector(() => now);
  director.schedule(8_000, () => { advances += 1; });
  now = 2_100;
  director.pause();
  assert.equal(director.snapshot().remainingMs, 6_000);
  director.skip();
  director.skip();
  assert.equal(advances, 1);
  assert.equal(director.snapshot().pending, false);
  director.cancel();
});

test("legacy tracks migrate to physical units and compile to one arc-length geometry", () => {
  const points = Array.from({ length: 12 }, (_, index) => {
    const angle = index / 12 * Math.PI * 2;
    return [0.5 + Math.cos(angle) * 0.38, 0.5 + Math.sin(angle) * 0.32];
  });
  const document = tracks.migrateLegacyTrack({ id: "test", name: "Test Ring", country: "Test", style: "flowing", points });
  assert.deepEqual(tracks.validateTrackDocument(document), []);
  const compiled = compilerModule.compileTrack(document, 2);
  assert.ok(compiled.lengthMeters > 1_000);
  assert.ok(compiled.samples.length > 500);
  assert.ok(compiled.samples.every((sample) => Math.abs(Math.hypot(sample.tangent.x, sample.tangent.y) - 1) < 0.001));
  assert.equal(compiled.surfaceRibbon.length, compiled.samples.length);
  assert.equal(compiled.gridSlots.length, 22);
  assert.equal(compiled.sensors.filter((sensor) => sensor.kind === "sector").length, 2);
  assert.equal(compiled.colliders.length, 2);
  assert.deepEqual(compilerModule.validateCompiledTrack(compiled), []);
});

test("authoring documents compile their closed primary route, grid, surfaces, and sensors for the physical race engine", () => {
  const document = authoringDocuments.createSampleDocument();
  document.modules[0].properties = { surface: "concrete", grip: 0.92 };
  const compiled = authoringCompiler.compileAuthoringTrack(document);
  assert.ok(compiled.lengthMeters > 300);
  assert.equal(compiled.gridSlots.length, document.grid.slotCount);
  assert.ok(compiled.sensors.some((sensor) => sensor.kind === "start-finish"));
  assert.ok(compiled.samples.some((sample) => sample.surface === "concrete" && sample.grip === 0.92));
  assert.deepEqual(compilerModule.validateCompiledTrack(compiled), []);
});

test("legacy custom point loops migrate into an editable modular track that compiles for racing", () => {
  const points = Array.from({ length: 12 }, (_, index) => {
    const angle = index / 12 * Math.PI * 2;
    return [0.5 + Math.cos(angle) * 0.34, 0.5 + Math.sin(angle) * 0.27];
  });
  const migrated = legacyMigration.migrateLegacyCircuit({
    id: "custom-legacy-loop",
    name: "Legacy Loop",
    country: "Test",
    points,
    width: 1,
    startIndex: 3,
    scenery: [{ id: "tree", type: "tree", x: 0.22, y: 0.24, rotation: 0, scale: 1 }],
  });
  assert.equal(migrated.modules.length, points.length);
  assert.equal(migrated.connections.length, points.length);
  assert.equal(migrated.props.length, 1);
  const compiled = authoringCompiler.compileAuthoringTrack(migrated);
  assert.ok(compiled.lengthMeters > 300);
  assert.ok(compiled.gridSlots.length >= 12);
  assert.deepEqual(compilerModule.validateCompiledTrack(compiled), []);
});

test("Northstar's retired chunk document migrates into independently selectable Track Editor roads", () => {
  const northstar = {
    version: 3,
    id: "northstar",
    name: "Northstar Circuit",
    country: "Northstar",
    style: "flowing",
    world: { widthMeters: 1000, heightMeters: 620 },
    chunks: [{ id: "northstar-straight", templateId: "straight-medium", x: 0, y: 0, rotation: 0, curbMode: "both" }],
    embeddedTemplates: [{ id: "straight-medium", widthMeters: 16 }],
    connections: [],
    routes: [{ routeId: "main", points: Array.from({ length: 12 }, (_, index) => {
      const angle = index / 12 * Math.PI * 2;
      return { x: 300 + Math.cos(angle) * 180, y: 240 + Math.sin(angle) * 120 };
    }), confirmedRevision: 1 }],
    startFinish: { chunkId: "northstar-straight", progress: 0 },
    startingGrid: { anchorChunkId: "northstar-straight", anchorProgress: 0, slots: 18, rowSpacingMeters: 8, lateralSpacingMeters: 2, stagger: true },
    pitBoxes: null,
    escapes: [],
    revision: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const migrated = legacyCircuitDocumentMigration.migrateLegacyCircuitDocument(northstar);
  assert.equal(migrated.id, "northstar");
  assert.equal(migrated.modules.length, 12);
  assert.ok(migrated.modules.every((module) => module.definitionId === "freeform-curve"));
  assert.ok(migrated.modules.every((module) => module.parameters.width === 16));
  assert.equal(migrated.grid.slotCount, 18);
  assert.deepEqual(compilerModule.validateCompiledTrack(authoringCompiler.compileAuthoringTrack(migrated)), []);
});

test("vehicle specifications normalize imported values into physical safety limits", () => {
  const spec = vehicles.normalizeVehicleSpec({ massKg: 10, tireGrip: 9, downforceCoefficient: 101, reliability: -1 });
  assert.equal(spec.massKg, 300);
  assert.equal(spec.tireGrip, 2.5);
  assert.equal(spec.downforceCoefficient, 100);
  assert.equal(spec.reliability, 0.5);
  assert.deepEqual(vehicles.validateVehicleSpec(vehicles.DEFAULT_FORMULA_VEHICLE_SPEC), []);
});

test("Rapier vehicle worlds advance deterministically from identical controls", async () => {
  const run = async () => {
    const world = await physics.RapierVehicleWorld.create();
    world.addVehicle("car", vehicles.DEFAULT_FORMULA_VEHICLE_SPEC, { x: 0, y: 0 }, 0);
    world.setControls("car", { throttle: 1, brake: 0, steering: 0.18 });
    for (let step = 0; step < 360; step += 1) world.step();
    const state = world.state("car");
    const snapshot = world.snapshot();
    world.free();
    return { state, snapshot };
  };
  const first = await run();
  const second = await run();
  assert.deepEqual(first.state, second.state);
  assert.deepEqual(first.snapshot, second.snapshot);
  assert.ok(first.state.position.x > 1);
  assert.ok(Math.abs(first.state.heading) > 0.01);
  assert.ok(Number.isFinite(first.state.wheelSlipFront));
  assert.ok(Number.isFinite(first.state.wheelSlipRear));
  assert.equal(first.state.surfaceGrip, 1);
});

test("world race engine follows a reachable speed profile and advances a physical grid deterministically", async () => {
  const points = Array.from({ length: 16 }, (_, index) => {
    const angle = index / 16 * Math.PI * 2;
    const radius = index % 4 === 0 ? 0.29 : 0.36;
    return [0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * 0.3];
  });
  const document = tracks.migrateLegacyTrack({ id: "race-test", name: "Race Test", country: "Test", style: "technical", points, startIndex: 3 });
  const compiled = compilerModule.compileTrack(document, 2);
  const trajectory = speedProfiles.buildRacingTrajectory(compiled, vehicles.DEFAULT_FORMULA_VEHICLE_SPEC);
  assert.ok(Math.max(...trajectory.samples.map((sample) => sample.targetSpeed)) > Math.min(...trajectory.samples.map((sample) => sample.targetSpeed)) + 5);
  assert.ok(trajectory.samples.some((sample) => Math.abs(sample.lineOffset) > 0.2));

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
  const second = await run();
  assert.deepEqual(first, second);
  assert.ok(first.every((car) => car.completedDistance > -9));
  assert.ok(first.every((car) => Number.isFinite(car.position.x) && Number.isFinite(car.heading)));
});

test("physical racecraft approaches before committing to a smooth overtake", async () => {
  const points = Array.from({ length: 20 }, (_, index) => {
    const angle = index / 20 * Math.PI * 2;
    return [0.5 + Math.cos(angle) * 0.4, 0.5 + Math.sin(angle) * 0.31];
  });
  const compiled = compilerModule.compileTrack(tracks.migrateLegacyTrack({ id: "passing-test", name: "Passing Test", country: "Test", style: "fast", points }), 2);
  const drivers = [
    { id: "front-a", skill: 72, aggression: 55, consistency: 90, cornering: 72, overtaking: 55, defense: 60, risk: 45 },
    { id: "front-b", skill: 74, aggression: 58, consistency: 90, cornering: 74, overtaking: 58, defense: 62, risk: 48 },
    { id: "hunter", skill: 96, aggression: 94, consistency: 90, cornering: 94, overtaking: 98, defense: 80, risk: 88 },
    { id: "rear-b", skill: 82, aggression: 70, consistency: 86, cornering: 82, overtaking: 74, defense: 72, risk: 65 },
  ];
  const engine = await worldRacing.WorldRaceEngine.create(compiled, vehicles.DEFAULT_FORMULA_VEHICLE_SPEC, drivers);
  engine.setPerformanceModifier("front-a", -0.08);
  engine.setPerformanceModifier("front-b", -0.07);
  engine.setPerformanceModifier("hunter", 0.1);
  const phases = [];
  let maximumCommandStep = 0;
  let previousCommand = engine.snapshot().find((car) => car.id === "hunter").commandedLateralOffset;
  for (let step = 0; step < 4_800; step += 1) {
    engine.step();
    const hunter = engine.snapshot().find((car) => car.id === "hunter");
    phases.push(hunter.drivingPhase);
    maximumCommandStep = Math.max(maximumCommandStep, Math.abs(hunter.commandedLateralOffset - previousCommand));
    previousCommand = hunter.commandedLateralOffset;
  }
  engine.free();
  const closingIndex = phases.indexOf("closing");
  const attackIndex = phases.indexOf("attacking");
  assert.ok(closingIndex >= 0, "the faster car should close in the draft before attacking");
  assert.ok(attackIndex > closingIndex, "the lateral attack should follow the closing phase");
  assert.ok(maximumCommandStep <= 4.3 / 120, "lateral commands should remain rate-limited");
});

test("multi-car physical soak stays finite while lap pace targets blend gradually", async () => {
  const points = Array.from({ length: 24 }, (_, index) => {
    const angle = index / 24 * Math.PI * 2;
    const radius = 0.38 + Math.cos(angle * 3) * 0.018;
    return [0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * 0.32];
  });
  const compiled = compilerModule.compileTrack(tracks.migrateLegacyTrack({ id: "soak-test", name: "Soak Test", country: "Test", style: "balanced", points }), 2.5);
  const drivers = Array.from({ length: 12 }, (_, index) => ({
    id: `soak-${index}`,
    skill: 76 + index,
    aggression: 62 + index * 2,
    consistency: 84,
    cornering: 74 + index,
    overtaking: 64 + index * 2,
    defense: 70 + index,
    risk: 55 + index * 2,
  }));
  const engine = await worldRacing.WorldRaceEngine.create(compiled, vehicles.DEFAULT_FORMULA_VEHICLE_SPEC, drivers);
  drivers.forEach((driver, index) => engine.setPerformanceModifier(driver.id, (index - 5.5) * 0.012));
  engine.step();
  const initial = engine.snapshot();
  assert.ok(initial.every((car) => Math.abs(car.paceModifier) <= 0.025 / 120 + 1e-9));
  const observedRacecraft = new Set();
  for (let step = 0; step < 7_200; step += 1) {
    engine.step();
    if (step % 120 === 0) engine.snapshot().forEach((car) => observedRacecraft.add(car.drivingPhase));
  }
  const snapshot = engine.snapshot();
  engine.free();
  assert.equal(snapshot.length, 12);
  assert.ok(snapshot.every((car) => Number.isFinite(car.position.x) && Number.isFinite(car.position.y) && Number.isFinite(car.heading)));
  assert.ok(snapshot.every((car) => car.completedDistance > 50), JSON.stringify({ initial: initial[0], final: snapshot.map((car) => ({ id: car.id, distance: car.completedDistance, phase: car.drivingPhase, lateral: car.lateralOffset, speed: car.longitudinalVelocity, position: car.position })) }));
  assert.ok(snapshot.every((car) => Math.abs(car.paceModifier) <= 0.121));
  assert.ok(observedRacecraft.has("closing") || observedRacecraft.has("attacking"));
});

test("named circuit fixtures replay deterministically across 12, 16, and 22-car grids", async () => {
  assert.deepEqual(new Set(regression.REGRESSION_FIXTURES.map((fixture) => fixture.style)), new Set(["fast", "flowing", "technical", "street", "custom"]));
  assert.deepEqual(new Set(regression.REGRESSION_FIXTURES.map((fixture) => fixture.gridSize)), new Set([12, 16, 22]));
  for (const fixture of regression.REGRESSION_FIXTURES) {
    const first = await regression.runRegressionFixture(fixture);
    const second = await regression.runRegressionFixture(fixture);
    assert.deepEqual(first, second, fixture.id);
    assert.equal(first.order.length, fixture.gridSize);
    assert.ok(first.averageDistance > 20, JSON.stringify(first));
    assert.ok(first.leaderDistance > first.averageDistance, JSON.stringify(first));
    assert.ok(first.p90Speed >= first.medianSpeed, JSON.stringify(first));
  }
});

test("dense 22-car fields recover from low-speed hairpin compression", async () => {
  const base = regression.REGRESSION_FIXTURES.find((fixture) => fixture.style === "technical" && fixture.gridSize === 22);
  const metrics = await regression.runRegressionFixture({ ...base, id: "technical-hairpin-soak", steps: 36_000 });
  assert.ok(metrics.averageDistance > 500, JSON.stringify(metrics));
  assert.ok(metrics.leaderDistance > 800, JSON.stringify(metrics));
});

test("225-seed simulation matrix stays finite across every style and grid size", async () => {
  const styles = ["fast", "flowing", "technical", "street", "custom"];
  const grids = [12, 16, 22];
  let completed = 0;
  for (const style of styles) {
    for (const gridSize of grids) {
      for (let index = 0; index < 15; index += 1) {
        const seed = 300_007 + styles.indexOf(style) * 100_003 + gridSize * 997 + index * 7_919;
        const metrics = await regression.runRegressionFixture({ id: `matrix-${style}-${gridSize}-${seed}`, style, seed, gridSize, steps: 120 });
        assert.equal(new Set(metrics.order).size, gridSize);
        assert.ok(Number.isFinite(metrics.averageSpeed) && Number.isFinite(metrics.leaderDistance));
        assert.ok(metrics.offTrackCars >= 0 && metrics.offTrackCars <= gridSize);
        completed += 1;
      }
    }
  }
  assert.equal(completed, 225);
});
