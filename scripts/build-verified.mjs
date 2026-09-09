import { access, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const executable = "node_modules/vinext/dist/cli.js";

await access(executable);
console.log("Running bounded vinext build...");
const result = spawnSync(process.execPath, [executable, "build"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
  timeout: Number(process.env.SITES_BUILD_TIMEOUT_MS ?? 180_000),
  killSignal: "SIGTERM",
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const workerPath = `${root}/dist/server/index.js`;
const hostingPath = `${root}/dist/.openai/hosting.json`;
await access(workerPath);
await access(hostingPath);
JSON.parse(await readFile(hostingPath, "utf8"));

const workerUrl = pathToFileURL(workerPath);
workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
const worker = await import(workerUrl.href);
if (!worker.default || typeof worker.default.fetch !== "function") {
  throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
}
console.log("Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present.");
