import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicAssets = resolve(root, "public/assets");
const iisAssets = resolve(root, "iis/public/assets");
const manifestPath = resolve(publicAssets, "gridwatch-asset-manifest.json");
const checkOnly = process.argv.includes("--check");

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.version !== 2 || !Array.isArray(manifest.assets)) {
  throw new Error("Asset manifest must use schema version 2 and contain an assets array.");
}

const digest = (buffer) => createHash("sha256").update(buffer).digest("hex").slice(0, 16);
const expectedManifest = structuredClone(manifest);
const ids = new Set();

for (const asset of expectedManifest.assets) {
  if (!asset.id || ids.has(asset.id)) throw new Error(`Duplicate or missing asset ID: ${asset.id ?? "unknown"}`);
  ids.add(asset.id);
  if (typeof asset.path !== "string" || !asset.path.startsWith("/assets/")) throw new Error(`Invalid runtime path for ${asset.id}.`);
  const source = resolve(publicAssets, asset.path.slice("/assets/".length));
  if (relative(publicAssets, source).startsWith("..")) throw new Error(`Asset ${asset.id} resolves outside public/assets.`);
  const buffer = await readFile(source);
  asset.bytes = buffer.byteLength;
  asset.contentHash = digest(buffer);
  if (source.endsWith(".svg")) {
    const svg = buffer.toString("utf8");
    if (!/<svg[\s>]/i.test(svg) || /<script|<foreignObject|(?:href|src)\s*=\s*["']https?:/i.test(svg)) throw new Error(`Unsafe SVG asset: ${asset.id}`);
    const viewBox = svg.match(/viewBox=["']([^"']+)["']/i)?.[1];
    if (!viewBox) throw new Error(`SVG asset ${asset.id} has no viewBox.`);
    asset.viewBox = viewBox;
    const dimensions = viewBox.split(/\s+/).map(Number);
    asset.dimensions = { width: dimensions[2], height: dimensions[3] };
    if (asset.tintable && !/#0066ff/i.test(svg)) throw new Error(`Tintable asset ${asset.id} does not contain the Blue primary mask.`);
  }
  asset.variant ??= "default";
  asset.defaultScale ??= asset.recommendedScale ?? 1;
  asset.viewDirection ??= asset.view;
  asset.themeVariants ??= { dark: asset.path, light: asset.path };
  asset.paletteMaskSupport ??= Boolean(asset.tintable);
  asset.preloadPriority ??= asset.preload ? "critical" : "on-demand";
  asset.lodVariants ??= [];
  asset.fallbackAsset ??= asset.id === "formula.default.top" ? null : "formula.default.top";
  asset.attribution ??= { author: "GridWatch Studio", license: "Project asset" };
}

const serialized = `${JSON.stringify(expectedManifest, null, 2)}\n`;
if (checkOnly) {
  if ((await readFile(manifestPath, "utf8")) !== serialized) throw new Error("Asset manifest metadata is stale. Run npm run assets:sync.");
  for (const asset of expectedManifest.assets) {
    const relativePath = asset.path.slice("/assets/".length);
    const source = resolve(publicAssets, relativePath);
    const deployed = resolve(iisAssets, relativePath);
    await access(deployed);
    if (digest(await readFile(source)) !== digest(await readFile(deployed))) throw new Error(`IIS asset is stale: ${asset.id}`);
  }
  if (digest(await readFile(manifestPath)) !== digest(await readFile(resolve(iisAssets, "gridwatch-asset-manifest.json")))) throw new Error("IIS asset manifest is stale.");
  console.log(`Validated ${expectedManifest.assets.length} versioned runtime assets.`);
} else {
  await writeFile(manifestPath, serialized);
  await mkdir(iisAssets, { recursive: true });
  await cp(publicAssets, iisAssets, { recursive: true, force: true });
  console.log(`Synchronized ${expectedManifest.assets.length} versioned runtime assets to IIS.`);
}

await stat(manifestPath);
