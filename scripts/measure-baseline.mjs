import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { cpus, arch, platform, release, tmpdir, type as osType } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const outputPath = join(root, "docs", "quality", "baseline-metrics.json");
const requiredFiles = [
  "app/game/GameShell.tsx",
  "dist/server/index.js",
  "dist/.openai/hosting.json",
  "iis-dist/index.html",
  "public/assets/gridwatch-asset-manifest.json",
];
const requiredDirectories = ["dist/client", "iis-dist", "public/assets"];

async function requirePath(path, kind) {
  try {
    const entry = await stat(join(root, path));
    if (kind === "file" && !entry.isFile()) throw new Error("not a file");
    if (kind === "directory" && !entry.isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`Baseline prerequisite missing: ${path} (${kind}). Run npm run build and npm run build:iis before npm run baseline:measure.`);
  }
}

for (const path of requiredFiles) await requirePath(path, "file");
for (const path of requiredDirectories) await requirePath(path, "directory");

async function filesUnder(directory) {
  const absoluteDirectory = join(root, directory);
  const found = [];
  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) found.push(path);
    }
  }
  await visit(absoluteDirectory);
  return found;
}

const portable = (path) => relative(root, path).replaceAll("\\", "/");
const roundedMilliseconds = (value) => Math.round(value * 100) / 100;

async function summarizeSource() {
  const gameShellPath = join(root, "app", "game", "GameShell.tsx");
  const gameShell = await readFile(gameShellPath);
  const sourceFiles = (await filesUnder("app")).filter((path) => [".ts", ".tsx", ".css"].includes(extname(path)));
  const sizes = await Promise.all(sourceFiles.map(async (path) => (await stat(path)).size));
  return {
    gameShell: {
      path: portable(gameShellPath),
      bytes: gameShell.byteLength,
      lines: gameShell.toString("utf8").split(/\r?\n/).length,
    },
    app: {
      fileCount: sourceFiles.length,
      bytes: sizes.reduce((sum, value) => sum + value, 0),
    },
  };
}

async function summarizeBuild(directory) {
  const extensions = [".js", ".wasm", ".css"];
  const relevant = (await filesUnder(directory)).filter((path) => extensions.includes(extname(path)));
  if (!relevant.some((path) => extname(path) === ".js")) {
    throw new Error(`Baseline prerequisite invalid: ${directory} contains no JavaScript bundle.`);
  }
  if (!relevant.some((path) => extname(path) === ".css")) {
    throw new Error(`Baseline prerequisite invalid: ${directory} contains no CSS bundle.`);
  }

  const records = await Promise.all(relevant.map(async (path) => {
    const contents = await readFile(path);
    return {
      path: portable(path),
      extension: extname(path).slice(1),
      rawBytes: contents.byteLength,
      gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
    };
  }));
  const summarize = (items) => {
    const maximum = [...items].sort((left, right) => right.rawBytes - left.rawBytes || left.path.localeCompare(right.path))[0] ?? null;
    return {
      fileCount: items.length,
      rawBytes: items.reduce((sum, item) => sum + item.rawBytes, 0),
      gzipBytes: items.reduce((sum, item) => sum + item.gzipBytes, 0),
      maxFile: maximum && { path: maximum.path, rawBytes: maximum.rawBytes, gzipBytes: maximum.gzipBytes },
    };
  };
  return {
    root: directory,
    total: summarize(records),
    javascript: summarize(records.filter((item) => item.extension === "js")),
    wasm: summarize(records.filter((item) => item.extension === "wasm")),
    css: summarize(records.filter((item) => item.extension === "css")),
  };
}

async function packageVersion(name) {
  const document = JSON.parse(await readFile(join(root, "node_modules", ...name.split("/"), "package.json"), "utf8"));
  return document.version;
}

function run(command, args, label) {
  const started = performance.now();
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", shell: false });
  const wallTimeMs = roundedMilliseconds(performance.now() - started);
  if (result.error || result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? "unknown"}.\n${result.stdout ?? ""}\n${result.stderr ?? result.error?.message ?? ""}`.trim());
  }
  return { result, wallTimeMs };
}

function memorySnapshot() {
  const memory = process.memoryUsage();
  return {
    rssBytes: memory.rss,
    heapTotalBytes: memory.heapTotal,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
  };
}

async function measureSimulationFixture() {
  const temporary = await mkdtemp(join(tmpdir(), "gridwatch-baseline-"));
  try {
    await symlink(join(root, "node_modules"), join(temporary, "node_modules"), platform() === "win32" ? "junction" : "dir");
    const compiler = join(root, "node_modules", "typescript", "bin", "tsc");
    const sources = [
      "app/domain/vehicle-spec.ts",
      "app/domain/track-document.ts",
      "app/simulation/track-compiler.ts",
      "app/simulation/speed-profile.ts",
      "app/simulation/engine/rapier-vehicle-world.ts",
      "app/simulation/world-race-engine.ts",
      "app/simulation/regression-fixtures.ts",
    ];
    run(process.execPath, [compiler, ...sources, "--target", "es2022", "--module", "nodenext", "--moduleResolution", "nodenext", "--outDir", temporary, "--skipLibCheck"], "Baseline fixture TypeScript compilation");

    const physics = await import(pathToFileURL(join(temporary, "simulation", "engine", "rapier-vehicle-world.js")).href);
    const regression = await import(pathToFileURL(join(temporary, "simulation", "regression-fixtures.js")).href);
    const rapierCompat = await import("@dimforge/rapier2d-deterministic-compat");
    physics.configureRapierLoader(async () => ({ api: rapierCompat.default, initialize: () => rapierCompat.default.init() }));
    const fixture = regression.REGRESSION_FIXTURES.find((candidate) => candidate.id === "custom-22-206369");
    if (!fixture) throw new Error("Required baseline regression fixture custom-22-206369 was not found.");

    const memoryBefore = memorySnapshot();
    const started = performance.now();
    const metrics = await regression.runRegressionFixture(fixture);
    const wallTimeMs = roundedMilliseconds(performance.now() - started);
    const memoryAfter = memorySnapshot();
    return {
      fixtureId: fixture.id,
      seed: fixture.seed,
      gridSize: fixture.gridSize,
      stepCount: fixture.steps,
      fixedStepHz: 120,
      simulatedSeconds: fixture.steps / 120,
      completionStatus: "progress-order-after-fixed-steps",
      completedRace: false,
      distanceOrderAfterSteps: metrics.order,
      averageDistanceMeters: metrics.averageDistance,
      leaderDistanceMeters: metrics.leaderDistance,
      averageSpeedMetersPerSecond: metrics.averageSpeed,
      medianSpeedMetersPerSecond: metrics.medianSpeed,
      p90SpeedMetersPerSecond: metrics.p90Speed,
      offTrackCarCount: metrics.offTrackCars,
      wallTimeMs,
      processMemoryBefore: memoryBefore,
      processMemoryAfter: memoryAfter,
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const npmVersionFromAgent = process.env.npm_config_user_agent?.match(/\bnpm\/([^\s]+)/)?.[1];
const npmVersion = npmVersionFromAgent
  ?? (process.env.npm_execpath
    ? run(process.execPath, [process.env.npm_execpath, "--version"], "npm version lookup").result.stdout.trim()
    : (() => { throw new Error("npm version is unavailable. Run the recorder through npm run baseline:measure."); })());
const gitCommit = run("git", ["rev-parse", "HEAD"], "Git revision lookup").result.stdout.trim();
const simulationSuite = run(process.execPath, ["--test", "tests/simulation.test.mjs"], "Simulation test suite");
const simulationOutput = simulationSuite.result.stdout;
const matchCount = (label) => Number(simulationOutput.match(new RegExp(`(?:#|ℹ)\\s+${label}\\s+(\\d+)`))?.[1] ?? 0);
const simulationCounts = {
  tests: matchCount("tests"),
  passed: matchCount("pass"),
  failed: matchCount("fail"),
};
if (simulationCounts.tests === 0 || simulationCounts.passed !== simulationCounts.tests || simulationCounts.failed !== 0) {
  throw new Error(`Simulation test summary is invalid: ${JSON.stringify(simulationCounts)}. Refusing to record an empty or incomplete successful suite.`);
}
const publicAssets = await filesUnder("public/assets");
const publicAssetSizes = await Promise.all(publicAssets.map(async (path) => (await stat(path)).size));

const report = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  gitCommit,
  platform: {
    os: osType(),
    release: release(),
    platform: platform(),
    architecture: arch(),
    logicalCpuCount: cpus().length,
  },
  tools: {
    node: process.version,
    npm: npmVersion,
    typescript: await packageVersion("typescript"),
    vite: await packageVersion("vite"),
    vinext: await packageVersion("vinext"),
    playwright: await packageVersion("@playwright/test"),
    rapier2dDeterministicCompat: await packageVersion("@dimforge/rapier2d-deterministic-compat"),
  },
  source: await summarizeSource(),
  buildArtifacts: {
    sites: await summarizeBuild("dist"),
    iis: await summarizeBuild("iis-dist"),
  },
  publicRuntimeAssets: {
    root: "public/assets",
    fileCount: publicAssets.length,
    rawBytes: publicAssetSizes.reduce((sum, value) => sum + value, 0),
  },
  simulationTestSuite: {
    command: "node --test tests/simulation.test.mjs",
    exitCode: simulationSuite.result.status,
    ...simulationCounts,
    wallTimeMs: simulationSuite.wallTimeMs,
  },
  simulationFixture: await measureSimulationFixture(),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote deterministic baseline metrics to ${portable(outputPath)}.`);
