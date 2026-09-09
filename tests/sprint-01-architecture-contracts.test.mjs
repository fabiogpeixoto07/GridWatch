import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), "gridwatch-sprint-01-contracts-"));
const compiler = new URL("../node_modules/typescript/bin/tsc", import.meta.url);
const compile = spawnSync(process.execPath, [
  fileURLToPath(compiler),
  "app/domain/race-protocol.ts",
  "app/domain/replay-document.ts",
  "app/simulation/seeded-random.ts",
  "--target", "es2022",
  "--module", "nodenext",
  "--moduleResolution", "nodenext",
  "--outDir", temporary,
  "--skipLibCheck",
], { cwd: fileURLToPath(root), encoding: "utf8" });
assert.equal(compile.status, 0, compile.stderr || compile.stdout);

const protocol = await import(pathToFileURL(join(temporary, "domain", "race-protocol.js")).href);
const replays = await import(pathToFileURL(join(temporary, "domain", "replay-document.js")).href);
const randoms = await import(pathToFileURL(join(temporary, "simulation", "seeded-random.js")).href);
test.after(() => rm(temporary, { recursive: true, force: true }));

const revisionIdentity = {
  protocolVersion: protocol.RACE_PROTOCOL_VERSION,
  sessionId: "session-001",
  engineVersion: "engine-3.0.0",
  contentRevision: "sha256:content-001",
};

const commandBase = {
  ...revisionIdentity,
  commandId: "command-001",
  expectedTick: 0,
};

const classification = [{
  position: 1,
  driverId: "driver-1",
  completedLaps: 3,
  finishTick: 240,
  status: "finished",
}];

const wheel = (id) => ({
  id,
  position: { x: 0, y: 0.3, z: 0 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  suspensionCompressionMeters: 0.08,
  steeringRadians: 0,
  spinRadians: 1.2,
  grounded: true,
});

const car = (status = "finished") => ({
  driverId: "driver-1",
  position: { x: 12, y: 0.4, z: 41 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  linearVelocity: { x: 1, y: 0, z: 45 },
  angularVelocity: { x: 0, y: 0.03, z: 0 },
  wheels: [wheel("front-left"), wheel("front-right"), wheel("rear-left"), wheel("rear-right")],
  timing: {
    completedLaps: status === "finished" ? 3 : 0,
    currentLap: status === "finished" ? 3 : 1,
    sectorIndex: 0,
    currentLapTicks: 0,
    lastLapTicks: status === "finished" ? 80 : null,
    bestLapTicks: status === "finished" ? 79 : null,
    gapToLeaderTicks: 0,
    status,
  },
});

const snapshot = {
  version: protocol.RACE_SNAPSHOT_VERSION,
  ...revisionIdentity,
  authoritativeTick: 240,
  lifecycle: "finished",
  cars: [car()],
  classification,
};

const raceStartedEvent = {
  version: protocol.RACE_EVENT_VERSION,
  ...revisionIdentity,
  eventId: "event-started",
  authoritativeTick: 0,
  type: "race-started",
};

const raceCompletedEvent = {
  version: protocol.RACE_EVENT_VERSION,
  ...revisionIdentity,
  eventId: "event-completed",
  authoritativeTick: 240,
  type: "race-completed",
  classification,
};

const replayCar = (status, completedLaps, currentLap) => ({
  driverId: "driver-1",
  position: { x: 12, y: 0.4, z: 41 },
  rotation: { x: 0, y: 0, z: 0, w: 1 },
  wheels: [wheel("front-left"), wheel("front-right"), wheel("rear-left"), wheel("rear-right")],
  timing: {
    completedLaps,
    currentLap,
    sectorIndex: 0,
    currentLapTicks: status === "finished" ? 0 : 12,
    lastLapTicks: status === "finished" ? 80 : null,
    bestLapTicks: status === "finished" ? 79 : null,
    gapToLeaderTicks: 0,
    status,
  },
});

const validReplay = {
  version: replays.REPLAY_DOCUMENT_VERSION,
  protocolVersion: protocol.RACE_PROTOCOL_VERSION,
  id: "replay-001",
  sessionId: revisionIdentity.sessionId,
  createdAt: "2026-09-04T12:00:00.000Z",
  tickRateHz: protocol.AUTHORITATIVE_TICK_RATE_HZ,
  durationTicks: 240,
  metadata: {
    engineVersion: revisionIdentity.engineVersion,
    contentRevision: revisionIdentity.contentRevision,
    trackId: "parkland",
    trackRevision: "track-001",
    competitionId: "formula",
    competitionRevision: "competition-001",
    vehicleSpecId: "formula-v2",
    vehicleSpecRevision: "vehicle-001",
    seed: 42,
  },
  roster: [{ driverId: "driver-1", teamId: "team-1", displayName: "Maya Solari", raceNumber: 7 }],
  frames: [
    { authoritativeTick: 0, cars: [replayCar("running", 0, 1)] },
    { authoritativeTick: 240, cars: [replayCar("finished", 3, 3)] },
  ],
  events: [raceStartedEvent, raceCompletedEvent],
  finalClassification: classification,
};

test("race command guards accept versioned control commands and reject malformed input", () => {
  const initialize = {
    ...commandBase,
    type: "initialize",
    seed: 42,
    trackId: "parkland",
    competitionId: "formula",
    vehicleSpecId: "formula-v2",
    totalLaps: 6,
    gridDriverIds: ["driver-1", "driver-2"],
  };
  assert.equal(protocol.isRaceCommand(initialize), true);
  assert.equal(protocol.isRaceCommand({ ...initialize, protocolVersion: 99 }), false);
  assert.equal(protocol.isRaceCommand({ ...initialize, expectedTick: 0.5 }), false);
  assert.equal(protocol.isRaceCommand({ ...initialize, gridDriverIds: ["driver-1", "driver-1"] }), false);
  assert.equal(protocol.isRaceCommand({ ...commandBase, type: "pause", expectedTick: 120 }), true);
  assert.equal(protocol.isRaceCommand({ ...commandBase, type: "abort", expectedTick: 120 }), true);
  assert.equal(protocol.isRaceCommand({ ...commandBase, type: "set-playback-rate", rate: 3 }), false);
});

test("worker messages enforce version, identity, ticks, and lifecycle acknowledgements", () => {
  const ready = {
    ...revisionIdentity,
    type: "ready",
    commandId: "command-initialize",
    authoritativeTick: 0,
    tickRateHz: 120,
  };
  assert.equal(protocol.isRaceWorkerMessage(ready), true);
  assert.equal(protocol.isRaceWorkerMessage({ ...ready, protocolVersion: 2 }), false);

  const acknowledgements = [
    ["start", "countdown", 0],
    ["pause", "paused", 61],
    ["resume", "racing", 61],
    ["restart", "ready", 0],
    ["abort", "disposed", 61],
    ["dispose", "disposed", 61],
  ];
  for (const [commandType, lifecycle, authoritativeTick] of acknowledgements) {
    assert.equal(protocol.isRaceWorkerMessage({
      ...revisionIdentity,
      type: "ack",
      commandId: `command-${commandType}`,
      commandType,
      lifecycle,
      authoritativeTick,
    }), true, `${commandType} acknowledgement should be valid`);
  }
  assert.equal(protocol.isRaceWorkerMessage({
    ...revisionIdentity,
    type: "ack",
    commandId: "command-pause",
    commandType: "pause",
    lifecycle: "racing",
    authoritativeTick: 61,
  }), false);
  assert.equal(protocol.isRaceWorkerMessage({
    ...revisionIdentity,
    type: "snapshot",
    authoritativeTick: 241,
    snapshot,
  }), false);
  assert.equal(protocol.isRaceWorkerMessage({
    ...revisionIdentity,
    type: "fault",
    commandId: "command-pause",
    authoritativeTick: 61,
    code: "stale-command",
    message: "The command expected an older worker tick.",
    recoverable: true,
  }), true);
  assert.equal(protocol.isRaceWorkerMessage({
    ...revisionIdentity,
    type: "fault",
    commandId: "command-pause",
    authoritativeTick: 61,
    code: "stale-command",
    message: "",
    recoverable: true,
  }), false);
});

test("snapshot and event validators reject corrupt physical and timing data", () => {
  assert.equal(protocol.isRaceSnapshot(snapshot), true);
  const badQuaternion = structuredClone(snapshot);
  badQuaternion.cars[0].rotation.w = 0.2;
  assert.equal(protocol.isRaceSnapshot(badQuaternion), false);
  const duplicateClassification = structuredClone(snapshot);
  duplicateClassification.classification.push({ ...classification[0], position: 2 });
  assert.equal(protocol.isRaceSnapshot(duplicateClassification), false);

  assert.equal(protocol.isRaceEvent(raceStartedEvent), true);
  assert.equal(protocol.isRaceEvent({ ...raceStartedEvent, version: 2 }), false);
  assert.equal(protocol.isRaceEvent({
    ...raceStartedEvent,
    type: "driver-finished",
    driverId: "driver-1",
    position: 1,
    finishTick: 239,
  }), false);
});

test("replay validator accepts camera-independent recordings and rejects corrupt documents", () => {
  assert.deepEqual(replays.validateReplayDocument(validReplay), { valid: true, issues: [] });

  const wrongVersion = structuredClone(validReplay);
  wrongVersion.version = 2;
  assert.match(replays.validateReplayDocument(wrongVersion).issues.join(" "), /Unsupported replay version/);

  const wrongProtocol = structuredClone(validReplay);
  wrongProtocol.events[0].protocolVersion = 2;
  assert.match(replays.validateReplayDocument(wrongProtocol).issues.join(" "), /event 0 is invalid/);

  const reversedFrames = structuredClone(validReplay);
  reversedFrames.frames.reverse();
  assert.match(replays.validateReplayDocument(reversedFrames).issues.join(" "), /strictly increasing tick order/);

  const unknownDriver = structuredClone(validReplay);
  unknownDriver.frames[1].cars[0].driverId = "unknown-driver";
  assert.match(replays.validateReplayDocument(unknownDriver).issues.join(" "), /unknown or duplicate drivers/);

  const cameraBound = { ...structuredClone(validReplay), activeCameraId: "chase-driver-1" };
  assert.match(replays.validateReplayDocument(cameraBound).issues.join(" "), /cannot store a playback camera/);
});

test("seeded random sequences are integer-defined, stable, and restorable", () => {
  const first = new randoms.SeededRandom(42);
  const second = new randoms.SeededRandom(42);
  const expected = [1962818870, 1222316584, 3741832822, 3850430075, 671138601, 3813080348, 11182178, 282816594];
  assert.deepEqual(expected.map(() => first.nextUint32()), expected);
  assert.deepEqual(expected.map(() => second.nextUint32()), expected);
  const different = new randoms.SeededRandom(43);
  assert.notDeepEqual(Array.from({ length: 4 }, () => different.nextUint32()), expected.slice(0, 4));

  const source = new randoms.SeededRandom(2026);
  Array.from({ length: 7 }, () => source.nextUint32());
  const saved = source.snapshot();
  assert.equal(Object.isFrozen(saved), true);
  assert.equal(Object.isFrozen(saved.state), true);
  const continuation = Array.from({ length: 12 }, () => source.nextUint32());
  const restored = randoms.SeededRandom.fromSnapshot(saved);
  assert.deepEqual(Array.from({ length: 12 }, () => restored.nextUint32()), continuation);
  assert.throws(() => restored.restore({ algorithm: randoms.SEEDED_RANDOM_ALGORITHM, state: [0, 0, 0, 0] }), /Invalid seeded random snapshot/);
  assert.throws(() => source.nextInt(5, 5), /maximumExclusive greater than minimum/);
  assert.ok(Array.from({ length: 100 }, () => source.nextInt(-3, 8)).every((value) => value >= -3 && value < 8));
});
