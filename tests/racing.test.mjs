import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), "gridwatch-racing-"));
const compiler = new URL("../node_modules/typescript/bin/tsc", import.meta.url);
const compile = spawnSync(process.execPath, [fileURLToPath(compiler), "app/racing.ts", "app/race-results.ts", "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext", "--outDir", temporary, "--skipLibCheck"], { cwd: fileURLToPath(root), encoding: "utf8" });
if (compile.status !== 0) throw new Error(compile.stderr || compile.stdout);
const racing = await import(pathToFileURL(join(temporary, "racing.js")).href);
const results = await import(pathToFileURL(join(temporary, "race-results.js")).href);
test.after(() => rm(temporary, { recursive: true, force: true }));

const makeCar = (id, distance, speed) => ({
  id, raceSkill: 88, raceAggression: 92, raceConsistency: 82, raceCornering: 87, raceOvertaking: 94, raceDefense: 80, raceRisk: 86,
  distance, speed, lane: 0, targetLane: 0, mechanical: "running", finishPosition: null, performanceModifier: 0, lapPerformanceModifier: 0,
  lineErrorUntil: -1, mistakeUntil: -1, lineErrorSide: 1, lateralVelocity: 0, throttle: 0, brake: 0, steering: 0,
  targetSpeed: 0, drivingPhase: "straight", overtakeState: "idle", overtakeTargetId: null, overtakeSide: 1,
  overtakeUntil: 0, overtakeCooldownUntil: 0, slipstream: 0,
});

test("track analysis produces a continuous racing line and lower corner speed targets", () => {
  const samples = Array.from({ length: 120 }, (_, index) => {
    const angle = index < 35 ? 0 : index < 75 ? (index - 35) * 0.045 : 1.8;
    return { x: index, y: Math.sin(angle) * 30, angle, curve: 0 };
  });
  const analysis = racing.analyzeTrack(samples, 36);
  assert.equal(analysis.samples.length, samples.length);
  assert.ok(analysis.samples.some((sample) => Math.abs(sample.racingLineOffset) > 0.04));
  assert.ok(Math.min(...analysis.samples.map((sample) => sample.targetSpeedFactor)) < 0.9);
  assert.ok(Math.max(...analysis.samples.map((sample) => sample.passingOpportunity)) > 0.75);
});

test("fixed driving steps are deterministic and produce smooth following and pass commitment", () => {
  const geometry = { trackWidth: 36, samples: Array.from({ length: 120 }, (_, index) => ({ x: index, y: 0, angle: 0, curve: 0, progress: index / 120, curvature: 0, severity: 0, direction: 0, racingLineOffset: 0, targetSpeedFactor: 1, passingOpportunity: 1 })) };
  const first = [makeCar(1, 0.1, 0.045), makeCar(2, 0.112, 0.036)];
  const second = structuredClone(first);
  for (let step = 0; step < 300; step += 1) {
    racing.stepDriving(first, geometry, 1 / 60, step / 60);
    racing.stepDriving(second, geometry, 1 / 60, step / 60);
  }
  assert.deepEqual(first, second);
  assert.ok(first[0].targetSpeed >= 0.004);
  assert.ok(first[0].brake >= 0 && first[0].brake <= 1);
  assert.ok(Math.abs(first[0].lane) <= 0.76);
  assert.ok(first[0].distance > first[1].distance, "the faster attacker should complete the pass on an open straight");
  if (Math.abs(first[0].lane - first[1].lane) < 0.14) assert.ok(Math.abs(first[0].distance - first[1].distance) >= 0.0017);
});

test("final classification keeps immutable finish gaps and retires after classified cars", () => {
  const cars = [
    { id: 1, finishPosition: 1, finishedAt: 72.1, finishGapSeconds: 0, bestLap: 22.8, mechanical: "running" },
    { id: 2, finishPosition: 2, finishedAt: 74.45, finishGapSeconds: 2.35, bestLap: 23.1, mechanical: "running" },
    { id: 3, finishPosition: null, finishedAt: null, finishGapSeconds: null, bestLap: 23.4, mechanical: "retired" },
  ];
  const snapshot = results.buildRaceResultSnapshot(cars, [
    { id: 1, code: "ONE", name: "Winner", team: "Alpha", color: "#ffffff" },
    { id: 2, code: "TWO", name: "Runner", team: "Beta", color: "#eeeeee" },
    { id: 3, code: "OUT", name: "Retired", team: "Gamma", color: "#dddddd" },
  ], { trackName: "Test", categoryName: "Formula", mode: "single", round: 1, totalLaps: 3, completedAt: 75 });
  assert.equal(snapshot.winnerTime, 72.1);
  assert.equal(snapshot.entries[1].gapSeconds, 2.35);
  assert.equal(snapshot.entries[2].status, "retired");
  cars[1].finishGapSeconds = 0;
  assert.equal(snapshot.entries[1].gapSeconds, 2.35, "snapshot must not change after the simulation state mutates");
});
