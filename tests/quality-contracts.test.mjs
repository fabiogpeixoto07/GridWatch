import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("browser-only libraries restore after hydration", async () => {
  const page = await read("app/game/GameShell.tsx");
  const editor = await read("app/competition-editor.tsx");
  assert.match(page, /useState<EditableCircuit\[\]>\(\[\]\)/);
  assert.match(page, /setCustomTracks\(loadCustomCircuits\(\)\)/);
  assert.match(editor, /const stored = loadCategories\(\)/);
  assert.match(editor, /setCategories\(\[official, \.\.\.stored/);
  assert.match(editor, /draftRepository\.load\(\)/);
});

test("custom documents use guarded, versioned storage", async () => {
  const storage = await read("app/storage.ts");
  const tracks = await read("app/track-editor.tsx");
  const categories = await read("app/competition-editor.tsx");
  assert.match(storage, /schemaVersion/);
  assert.match(storage, /try \{/);
  assert.match(tracks, /createStorageRepository\(STORAGE_KEY, \[\], isCircuitArray\)/);
  assert.match(categories, /createStorageRepository\(STORAGE_KEY, \[\], isCategoryArray\)/);
});

test("editors expose destructive-action and asset safeguards", async () => {
  const track = await read("app/track-editor.tsx");
  const category = await read("app/competition-editor.tsx");
  assert.match(category, /UI_COPY\.editor\.competition\.removeTeam/);
  assert.match(track, /dragOriginRef/);
  assert.match(category, /file\.size > 2_000_000/);
  assert.match(category, /isCategoryDocument/);
  assert.match(category, /useId\(\)/);
  assert.match(category, /if \(draft\.official\)/);
  assert.match(category, /UI_COPY\.editor\.competition\.protectedSave/);
  assert.match(category, /teamCodes/);
  assert.match(category, /moveTeam/);
  assert.match(category, /moveDriver/);
  assert.match(category, /duplicateDriver/);
  assert.match(category, /TOP VIEW/);
  assert.match(category, /LIVE TIMING/);
  assert.match(track, /UI_COPY\.editor\.discardChanges/);
});

test("documented developer commands are cross-platform Node entrypoints", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  assert.match(packageJson.scripts.build, /node scripts\/build-verified\.mjs/);
  assert.match(packageJson.scripts["validate:artifact"], /node scripts\/validate-artifact\.mjs/);
  assert.match(packageJson.scripts["assets:sync"], /node scripts\/sync-assets\.mjs/);
  assert.match(packageJson.scripts["assets:validate"], /sync-assets\.mjs --check/);
  assert.match(packageJson.scripts["build:iis"], /sync-assets\.mjs --check/);
  assert.match(packageJson.scripts.dev, /run-with-env\.mjs/);
  assert.match(packageJson.scripts.start, /run-with-env\.mjs/);
});

test("runtime asset manifest contains versioned, deployment-ready asset families", async () => {
  const manifest = JSON.parse(await read("public/assets/gridwatch-asset-manifest.json"));
  assert.equal(manifest.version, 2);
  assert.equal(manifest.coordinateSystem, "top-down");
  assert.equal(manifest.paletteMasks.yellow, "transparent");
  assert.ok(manifest.assets.length >= 12);
  assert.equal(new Set(manifest.assets.map((asset) => asset.id)).size, manifest.assets.length);
  for (const asset of manifest.assets) {
    assert.match(asset.contentHash, /^[a-f0-9]{16}$/);
    assert.ok(asset.bytes > 0);
    assert.match(asset.viewBox, /^\d/);
    assert.ok(asset.dimensions.width > 0 && asset.dimensions.height > 0);
    assert.ok(asset.themeVariants.dark && asset.themeVariants.light);
    assert.ok(asset.attribution.author);
  }
  assert.equal(manifest.assets.find((asset) => asset.id === "formula.default.top")?.view, "top");
  assert.equal(manifest.assets.find((asset) => asset.id === "formula.default.lateral")?.view, "lateral");
  assert.ok(manifest.materials.asphalt);
  assert.ok(manifest.materials.curb);
  assert.equal(manifest.sceneryAtlas, "/assets/scenery-atlas.svg");
  assert.ok(manifest.carSprites.top.path);
  assert.ok(manifest.carSprites.lateral.path);
  assert.equal(manifest.carSprites.liveries.length, 3);
  assert.match(await read("public/assets/sprites/formula-default-top.svg"), /viewBox="0 0 120 160"/);
  assert.match(await read("public/assets/sprites/formula-default-lateral.svg"), /viewBox="0 0 260 96"/);
  assert.match(await read("public/assets/sprites/formula-default-top.svg"), /#0066ff.*#00cc44.*#ffffff.*#ff0000/s);
  assert.match(await read("public/assets/sprites/formula-default-lateral.svg"), /#0066ff.*#00cc44.*#ff0000.*#ffffff/s);
  assert.match(await read("public/assets/sprites/formula-solaris-lateral.svg"), /#ffb703/);
  assert.match(await read("public/assets/sprites/formula-velox-lateral.svg"), /#ed263a/);
  assert.match(await read("public/assets/sprites/formula-apex-lateral.svg"), /#209cff/);
  assert.match(await read("public/assets/sprites/formula-solaris-top.svg"), /#ffb703/);
  assert.match(await read("public/assets/sprites/formula-velox-top.svg"), /#ed263a/);
  assert.match(await read("public/assets/sprites/formula-apex-top.svg"), /#209cff/);
  assert.match(await read("public/assets/scenery-atlas.svg"), /id="grandstand"/);
});

test("team livery colors map all sprite template channels", async () => {
  const page = await read("app/game/GameShell.tsx");
  const category = await read("app/competition-editor.tsx");
  const sprites = await read("app/lib/sprite-service.ts");
  assert.match(category, /thirdColor: string/);
  assert.match(category, /thirdColor: team\.thirdColor \?\? "#ffffff"/);
  assert.match(category, /thirdColor: teams\.get\(driver\.teamId\)\?\.thirdColor/);
  assert.match(page, /driver\.thirdColor \?\? "#ffffff"/);
  assert.match(page, /driver\.helmetColor \?\? "#ff0000"/);
  assert.match(sprites, /yellowMask/);
  assert.match(sprites, /pixels\[index \+ 3\] = 0/);
  assert.match(sprites, /tintedCache/);
  assert.match(page, /tintSprite/);
});

test("competition documents migrate to stable driver identities without destructive team cascades", async () => {
  const category = await read("app/competition-editor.tsx");
  const copy = await read("app/ui-copy.ts");
  const page = await read("app/game/GameShell.tsx");
  assert.match(category, /id: string/);
  assert.match(category, /version: 2/);
  assert.match(category, /value\.version === 1 \|\| value\.version === 2/);
  assert.match(category, /drivers: draft\.drivers\.map\(\(driver\) => driver\.teamId === team\.id/);
  assert.doesNotMatch(category, /drivers: draft\.drivers\.filter\(\(item\) => item\.teamId !== team\.id\)/);
  assert.doesNotMatch(category, /category\.drivers\.map\(\(driver, index\) => \(\{ \.\.\.driver, id: index/);
  assert.match(page, /stableSeedKey/);
  assert.match(copy, /driversReassigned/);
  assert.match(copy, /duplicateDriver/);
});

test("reliability foundation exposes repositories, cached assets, and editor safeguards", async () => {
  const storage = await read("app/storage.ts");
  const sprites = await read("app/lib/sprite-service.ts");
  const track = await read("app/track-editor.tsx");
  const category = await read("app/competition-editor.tsx");
  assert.match(storage, /StorageRepository/);
  assert.match(storage, /createStorageRepository/);
  assert.match(storage, /subscribe:/);
  assert.match(sprites, /loadImage/);
  assert.match(sprites, /AbortSignal/);
  assert.match(track, /SET START \/ FINISH/);
  assert.match(track, /snapToGrid/);
  assert.match(track, /trackMetrics/);
  assert.match(track, /duplicateSelectedPoint/);
  assert.match(track, /editor-shortcuts/);
  assert.match(track, /return `C /);
  assert.match(track, /commands\.join/);
  assert.match(category, /isSafeSvg/);
  assert.match(category, /2–4 character code/);
});

test("creation tools are presented as available workflows", async () => {
  const page = await read("app/game/GameShell.tsx");
  const settings = await read("app/menu/SettingsScreens.tsx");
  assert.doesNotMatch(page, /Ferramenta de criação de circuitos em preparação/);
  assert.doesNotMatch(page, /Ferramenta de criação de competições em preparação/);
  assert.match(settings, /UI_COPY\.navigation\.openEditor/);
});

test("shipped UI copy is English-only and centralized", async () => {
  const copy = await read("app/ui-copy.ts");
  const page = await read("app/game/GameShell.tsx");
  const brand = await read("app/ui/brand.tsx");
  const loading = await read("app/ui/loading-screen.tsx");
  const mainMenu = await read("app/menu/MainMenu.tsx");
  const settings = await read("app/menu/SettingsScreens.tsx");
  const setup = await read("app/menu/RaceSetupScreens.tsx");
  const championshipResults = await read("app/championship/ChampionshipResults.tsx");
  assert.doesNotMatch(copy, /Corrida|Campeonato|Configurações|Ajustes|Voltar|Categoria|Selecione|Oficial|Personalizada|carro|carros/iu);
  assert.match(setup, /UI_COPY\.setup\.requiredCategory/);
  assert.match(setup, /UI_COPY\.setup\.selectCategory/);
  assert.match(setup, /UI_COPY\.setup\.carCount/);
  assert.match(page, /UI_COPY\.race\.status\[status\]/);
  assert.match(page, /LoadingScreen title=\{UI_COPY\.editor\.loadingLibrary\}/);
  assert.ok((page.match(/<Brand className=/g) ?? []).length + (mainMenu.match(/<Brand className=/g) ?? []).length + (settings.match(/<Brand className=/g) ?? []).length + (setup.match(/<Brand className=/g) ?? []).length + (championshipResults.match(/<Brand className=/g) ?? []).length >= 7);
  assert.match(brand, /aria-label="GridWatch"/);
  assert.match(loading, /aria-live="polite"/);
  assert.doesNotMatch(page, /<strong>LOADING LIBRARY<\/strong>/);
});

test("the visual system exposes semantic interaction and accessibility tokens", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /--space-1:/);
  assert.match(css, /--radius-lg:/);
  assert.match(css, /--shadow-panel:/);
  assert.match(css, /--motion-standard:/);
  assert.match(css, /--focus-ring:/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /color-scheme: light/);
});

test("appearance settings persist the selected color theme", async () => {
  const page = await read("app/game/GameShell.tsx");
  const css = await read("app/globals.css");
  assert.match(page, /type GameTheme = "dark" \| "light"/);
  assert.match(page, /THEME_STORAGE_KEY = "gridwatch\.theme"/);
  assert.match(page, /document\.documentElement\.dataset\.theme = theme/);
  assert.match(page, /appearance-settings/);
  assert.match(css, /:root\[data-theme="light"\]/);
  assert.match(css, /theme-choice-card/);
});

test("production artifacts package the runtime asset library", async () => {
  assert.match(await read("dist/client/assets/track-materials.svg"), /pattern id="asphalt"/);
  assert.match(await read("dist/client/assets/sprites/formula-solaris-lateral.svg"), /#ffb703/);
  assert.match(await read("iis-dist/assets/sprites/formula-velox-lateral.svg"), /#ed263a/);
});

test("race driving uses fixed simulation, analyzed geometry, and stateful traffic control", async () => {
  const page = await read("app/game/GameShell.tsx");
  const racing = await read("app/racing.ts");
  assert.match(page, /simulationAccumulatorRef/);
  assert.match(page, /stepDriving\(carsRef\.current, drivingGeometry/);
  assert.match(page, /event\.key !== "F3"/);
  assert.match(racing, /analyzeTrack/);
  assert.match(racing, /racingLineOffset/);
  assert.match(racing, /overtakeState/);
  assert.match(racing, /slipstream/);
  assert.match(racing, /lapPerformanceModifier/);
  assert.match(page, /performanceLap = lapNumber/);
});

test("studio simulation foundation provides physical documents, shared geometry, and deterministic contacts", async () => {
  const vehicle = await read("app/domain/vehicle-spec.ts");
  const track = await read("app/domain/track-document.ts");
  const compiler = await read("app/simulation/track-compiler.ts");
  const physics = await read("app/simulation/engine/rapier-vehicle-world.ts");
  const director = await read("app/championship/autoplay-director.ts");
  const page = await read("app/game/GameShell.tsx");
  const hud = await read("app/race/RaceHud.tsx");
  assert.match(vehicle, /massKg/);
  assert.match(vehicle, /wheelbaseMeters/);
  assert.match(track, /TRACK_DOCUMENT_VERSION = 2/);
  assert.match(track, /startingGrid/);
  assert.match(track, /timingSectors/);
  assert.match(track, /pitLane/);
  assert.match(compiler, /arc-length geometry/);
  assert.match(compiler, /leftBoundary/);
  assert.match(compiler, /surfaceRibbon/);
  assert.match(compiler, /colliders/);
  assert.match(physics, /RapierVehicleWorld/);
  assert.match(physics, /1 \/ 120/);
  assert.match(physics, /corneringStiffness/);
  assert.match(await read("app/simulation/world-race-engine.ts"), /attackReadiness/);
  assert.match(await read("app/simulation/world-race-engine.ts"), /attackCooldownUntil/);
  assert.match(await read("app/simulation/world-race-engine.ts"), /commandedOffset/);
  assert.match(await read("app/simulation/world-race-engine.ts"), /targetPerformanceModifier/);
  assert.match(page, /data-physics-engine/);
  assert.match(hud, /data-physical-cars/);
  assert.match(director, /race-results.*8_000/s);
  assert.match(director, /standings: 6_000/);
});

test("championship setup exposes unattended Auto Broadcast playback", async () => {
  const page = await read("app/game/GameShell.tsx");
  const copy = await read("app/ui-copy.ts");
  const session = await read("app/domain/championship-session.ts");
  assert.match(page, /championshipPlaybackMode/);
  assert.match(page, /queueRaceCountdown\(120\)/);
  assert.match(page, /standingsDurationSeconds \* 1_000/);
  assert.match(page, /visibilitychange/);
  assert.match(page, /championshipSessionRepository\.save/);
  assert.match(session, /completedRounds/);
  assert.match(session, /categoryRevision/);
  assert.match(copy, /AUTO BROADCAST/);
  assert.match(copy, /PAUSE AUTO ADVANCE/);
});

test("fullscreen race UI provides an action menu and dense 22-car timing layout", async () => {
  const page = await read("app/game/GameShell.tsx");
  const actions = await read("app/race/RaceActionsMenu.tsx");
  const timing = await read("app/race/LiveTiming.tsx");
  const css = await read("app/globals.css");
  assert.match(page, /data-race-layout="fullscreen"/);
  assert.match(actions, /race-actions-trigger/);
  assert.match(actions, /aria-controls="race-actions-menu"/);
  assert.match(timing, /leaderboard-scroll/);
  assert.match(page, /event\.key !== "Escape"/);
  assert.match(css, /min-width: 1100px\) and \(min-height: 720px/);
  assert.match(css, /height: 100dvh/);
  assert.match(css, /grid-template-rows: 54px minmax\(0, 1fr\)/);
  assert.match(css, /min-height: 29px/);
  assert.match(css, /overflow-y: hidden/);
  assert.match(css, /\.control-deck \{\s*display: none/);
});

test("finish classification and post-race summaries use immutable result data", async () => {
  const page = await read("app/game/GameShell.tsx");
  const overlays = await read("app/race/RaceResultsOverlay.tsx");
  const championshipResults = await read("app/championship/ChampionshipResults.tsx");
  const results = await read("app/race-results.ts");
  const copy = await read("app/ui-copy.ts");
  const director = await read("app/championship/autoplay-director.ts");
  assert.match(page, /finishedAt: number \| null/);
  assert.match(page, /finishGapSeconds: number \| null/);
  assert.match(page, /car\.finishedAt = currentRaceTime/);
  assert.doesNotMatch(page, /car\.distance = lapsRef\.current/);
  assert.match(overlays, /race-results-overlay/);
  assert.match(overlays, /race-results-card/);
  assert.match(page, /WINNER_PRESENTATION_DURATION_MS = 2_000/);
  assert.match(director, /"race-results": 8_000/);
  assert.match(page, /setShowRaceResults\(true\)/);
  assert.match(overlays, /championship-standings-card/);
  assert.match(championshipResults, /results-screen/);
  assert.match(page, /setShowRoundStandings\(true\)/);
  assert.match(page, /continueFromRaceResults/);
  assert.match(results, /buildRaceResultSnapshot/);
  assert.match(results, /calculateFinishGap/);
  assert.match(copy, /UI_COPY/);
  assert.match(page, /UI_COPY\.race\.start/);
});
