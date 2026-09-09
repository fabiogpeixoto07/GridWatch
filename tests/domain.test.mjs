import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const temporary = await mkdtemp(join(tmpdir(), "gridwatch-domain-"));
const compiler = new URL("../node_modules/typescript/bin/tsc", import.meta.url);
const compile = spawnSync(process.execPath, [fileURLToPath(compiler), "app/lib/sprite-service.ts", "app/editor/track/commands.ts", "app/race/lifecycle.ts", "app/game/game-reducer.ts", "app/game/session-controller.ts", "app/domain/championship-session.ts", "app/storage.ts", "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext", "--outDir", temporary, "--skipLibCheck"], { cwd: fileURLToPath(root), encoding: "utf8" });
assert.equal(compile.status, 0, compile.stderr || compile.stdout);
const sprites = await import(pathToFileURL(join(temporary, "lib", "sprite-service.js")).href);
const storage = await import(pathToFileURL(join(temporary, "storage.js")).href);
const commands = await import(pathToFileURL(join(temporary, "editor", "track", "commands.js")).href);
const lifecycle = await import(pathToFileURL(join(temporary, "race", "lifecycle.js")).href);
const game = await import(pathToFileURL(join(temporary, "game", "game-reducer.js")).href);
const sessions = await import(pathToFileURL(join(temporary, "game", "session-controller.js")).href);
const championshipSessions = await import(pathToFileURL(join(temporary, "domain", "championship-session.js")).href);
test.after(() => rm(temporary, { recursive: true, force: true }));

test("sprite palette replaces four masks and removes yellow", () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 255, 255,
    0, 255, 0, 255,
    255, 255, 255, 255,
    255, 0, 0, 255,
    255, 210, 0, 255,
  ]);
  sprites.applySpritePalette(pixels, { blue: "#112233", green: "#445566", white: "#778899", red: "#aabbcc" });
  assert.deepEqual([...pixels.slice(0, 4)], [17, 34, 51, 255]);
  assert.deepEqual([...pixels.slice(4, 8)], [68, 85, 102, 255]);
  assert.deepEqual([...pixels.slice(8, 12)], [119, 136, 153, 255]);
  assert.deepEqual([...pixels.slice(12, 16)], [170, 187, 204, 255]);
  assert.equal(pixels[19], 0);
});

test("storage repository reads legacy data and writes versioned envelopes", () => {
  const values = new Map([["sample", JSON.stringify(["legacy"])]]);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const repository = storage.createStorageRepository("sample", [], (value) => Array.isArray(value) && value.every((item) => typeof item === "string"));
  assert.deepEqual(repository.load(), ["legacy"]);
  assert.equal(repository.save(["current"]), true);
  assert.deepEqual(JSON.parse(values.get("sample")).data, ["current"]);
  assert.equal(repository.reset(), true);
  assert.deepEqual(repository.load(), []);
  delete globalThis.window;
});

test("track commands are immutable and keep start positions valid", () => {
  const original = { points: [[0, 0], [1, 0], [1, 1]], startIndex: 2, width: 1 };
  const inserted = commands.applyTrackCommand(original, { type: "insertPoint", index: 1, point: [0.5, 0] });
  assert.equal(inserted.points.length, 4);
  assert.equal(original.points.length, 3);
  const removed = commands.applyTrackCommand(inserted, { type: "removePoint", index: 3 });
  assert.equal(removed.startIndex, 2);
  const started = commands.applyTrackCommand(removed, { type: "setStart", index: 99 });
  assert.equal(started.startIndex, 2);
});

test("TrackDocumentV2 commands preserve identity and increment revisions", () => {
  const document = {
    version: 2, id: "test", name: "Test", country: "Test", style: "technical", closed: true,
    controlPoints: Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, x: index * 10, y: 0, widthLeft: 7, widthRight: 7, mode: "smooth" })),
    startIndex: 0, sectors: [1 / 3, 2 / 3], gridSlots: 2, startingGrid: [], timingSectors: [], pitLane: null,
    surfaceZones: [], curbZones: [], runOff: { left: { surface: "grass", width: 8 }, right: { surface: "grass", width: 8 } },
    barriers: { left: true, right: true, offsetMeters: 1.5 }, revision: 4, sourceRevision: "test",
  };
  const moved = commands.applyTrackDocumentCommand(document, { type: "moveControlPoints", ids: ["p2", "p3"], dx: 5, dy: -2 });
  assert.equal(moved.controlPoints[2].x, 25);
  assert.equal(moved.controlPoints[3].y, -2);
  assert.equal(document.controlPoints[2].x, 20);
  assert.equal(moved.revision, 5);
  const widened = commands.applyTrackDocumentCommand(moved, { type: "setSegmentWidth", ids: ["p2"], widthLeft: 1, widthRight: 10 });
  assert.equal(widened.controlPoints[2].widthLeft, 3);
  assert.equal(widened.controlPoints[2].widthRight, 10);
  assert.deepEqual(widened.controlPoints.map((point) => point.id), document.controlPoints.map((point) => point.id));
});

test("race lifecycle rejects invalid state combinations", () => {
  assert.equal(lifecycle.transitionRace("ready", "countdown"), "countdown");
  assert.equal(lifecycle.transitionRace("racing", "paused"), "paused");
  assert.throws(() => lifecycle.transitionRace("ready", "finished"), /Invalid race transition/);
});

test("game session state machine uses one championship progression path", () => {
  let state = game.reduceGameSession(game.INITIAL_GAME_SESSION, { type: "BOOT_COMPLETED" });
  state = game.reduceGameSession(state, { type: "OPEN_CHAMPIONSHIP_SETUP" });
  state = game.reduceGameSession(state, { type: "CHAMPIONSHIP_CREATED", totalRounds: 2, autoplay: true });
  state = game.reduceGameSession(state, { type: "RACE_STARTED" });
  state = game.reduceGameSession(state, { type: "COUNTDOWN_COMPLETED" });
  state = game.reduceGameSession(state, { type: "RACE_FINISHED" });
  state = game.reduceGameSession(state, { type: "WINNER_PRESENTATION_EXPIRED" });
  state = game.reduceGameSession(state, { type: "RESULTS_EXPIRED" });
  assert.equal(state.phase, "championshipStandings");
  state = game.reduceGameSession(state, { type: "NEXT_ROUND_REQUESTED" });
  assert.deepEqual({ phase: state.phase, round: state.round }, { phase: "preRace", round: 2 });
  assert.throws(() => game.reduceGameSession(state, { type: "RACE_FINISHED" }), /invalid during preRace/);
});

test("session controller invalidates obsolete phase timers", async () => {
  const controller = new sessions.SessionController();
  let calls = 0;
  controller.enterPhase();
  controller.schedule("presentation", 5, () => { calls += 1; });
  controller.enterPhase();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(calls, 0);
  controller.schedule("presentation", 0, () => { calls += 1; });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(calls, 1);
  controller.dispose();
});

test("championship recovery documents reject duplicate schedules and invalid boundaries", () => {
  const session = championshipSessions.createChampionshipSession({
    seed: 42,
    scheduleTrackIds: ["one", "two"],
    completedRounds: 1,
    categoryId: "formula",
    categoryRevision: "2026-08-07",
    totalLaps: 6,
    gridSize: 12,
    points: { driver: 25 },
    results: { driver: [1] },
    playback: { mode: "auto", simulationSpeed: 2, resultDurationMs: 8_000, standingsDurationMs: 6_000, audioEnabled: false, pauseWhenHidden: true },
  });
  assert.equal(championshipSessions.isChampionshipSession(session), true);
  assert.equal(championshipSessions.isChampionshipSession({ ...session, scheduleTrackIds: ["one", "one"] }), false);
  assert.equal(championshipSessions.isChampionshipSession({ ...session, completedRounds: 3 }), false);
});
