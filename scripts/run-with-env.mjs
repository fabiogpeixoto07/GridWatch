import { spawn } from "node:child_process";

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Usage: node scripts/run-with-env.mjs <vite|vinext> [args...]");

const entries = {
  vite: "node_modules/vite/bin/vite.js",
  vinext: "node_modules/vinext/dist/cli.js",
  "drizzle-kit": "node_modules/drizzle-kit/bin.cjs",
};
const entry = entries[command];
if (!entry) throw new Error(`Unsupported command: ${command}`);

const child = spawn(process.execPath, [entry, ...args], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: {
    ...process.env,
    WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH ?? ".wrangler/wrangler.log",
    WRANGLER_WRITE_LOGS: process.env.WRANGLER_WRITE_LOGS ?? "false",
  },
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
