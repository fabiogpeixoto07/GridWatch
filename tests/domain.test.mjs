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
const compile = spawnSync(process.execPath, [fileURLToPath(compiler), "app/lib/sprite-service.ts", "app/race/lifecycle.ts", "app/game/game-reducer.ts", "app/game/session-controller.ts", "app/domain/championship-session.ts", "app/storage.ts", "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext", "--outDir", temporary, "--skipLibCheck"], { cwd: fileURLToPath(root), encoding: "utf8" });
assert.equal(compile.status, 0, compile.stderr || compile.stdout);
const sprites = await import(pathToFileURL(join(temporary, "lib", "sprite-service.js")).href);
const storage = await import(pathToFileURL(join(temporary, "storage.js")).href);
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
