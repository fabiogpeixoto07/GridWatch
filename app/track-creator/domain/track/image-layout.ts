import { createEmptyDocument, id } from "./document.js";
import type { TrackDocument, TrackModule, Vec2 } from "./types.js";

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA pixels in row-major order. */
  data: Uint8ClampedArray | Uint8Array;
}

export interface ImageLayoutOptions {
  blackThreshold?: number;
  minimumComponentPixels?: number;
  targetExtentMeters?: number;
  trackWidthMeters?: number;
}

export interface ImageLayoutStats {
  sourceWidth: number;
  sourceHeight: number;
  blackPixels: number;
  routePoints: number;
  modules: number;
  scaleMetersPerPixel: number;
}

export interface ImageLayoutResult {
  document: TrackDocument;
  stats: ImageLayoutStats;
}

const DEFAULT_BLACK_THRESHOLD = 72;
const DEFAULT_MIN_COMPONENT_PIXELS = 24;
const DEFAULT_TARGET_EXTENT_METERS = 220;
const DEFAULT_TRACK_WIDTH_METERS = 10;

type Pixel = { x: number; y: number };

function rasterIndex(raster: RasterImage, x: number, y: number) {
  return (y * raster.width + x) * 4;
}

function validRaster(raster: RasterImage) {
  return raster.width > 8 && raster.height > 8 && raster.data.length >= raster.width * raster.height * 4;
}

/** Converts an image into a binary mask where only near-black opaque pixels survive. */
export function extractBlackMask(raster: RasterImage, threshold = DEFAULT_BLACK_THRESHOLD) {
  if (!validRaster(raster)) throw new Error("The selected image does not contain a usable pixel buffer.");
  const mask = new Uint8Array(raster.width * raster.height);
  const limit = Math.max(0, Math.min(255, Math.round(threshold)));
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const offset = rasterIndex(raster, x, y);
      const alpha = raster.data[offset + 3] ?? 255;
      const black = raster.data[offset] <= limit && raster.data[offset + 1] <= limit && raster.data[offset + 2] <= limit;
      mask[y * raster.width + x] = black && alpha >= 24 ? 1 : 0;
    }
  }
  return mask;
}

function neighbors(width: number, height: number, x: number, y: number) {
  const result: Pixel[] = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) result.push({ x: nx, y: ny });
    }
  }
  return result;
}

/** Keeps the largest connected black component and removes image speckle. */
export function keepLargestComponent(mask: Uint8Array, width: number, height: number, minimumPixels = DEFAULT_MIN_COMPONENT_PIXELS) {
  const visited = new Uint8Array(mask.length);
  let best: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start];
    const component: number[] = [];
    visited[start] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      for (const point of neighbors(width, height, x, y)) {
        const index = point.y * width + point.x;
        if (mask[index] && !visited[index]) {
          visited[index] = 1;
          queue.push(index);
        }
      }
    }
    if (component.length > best.length) best = component;
  }
  if (best.length < minimumPixels) throw new Error("The image does not contain a connected black circuit layout.");
  const result = new Uint8Array(mask.length);
  best.forEach((index) => { result[index] = 1; });
  return { mask: result, pixels: best.length };
}

function transitions(values: number[]) {
  let count = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === 0 && values[(index + 1) % values.length] === 1) count += 1;
  }
  return count;
}

/** Zhang–Suen thinning gives a one-pixel centerline for a filled black route. */
export function skeletonize(mask: Uint8Array, width: number, height: number, maxIterations = 64) {
  const result = new Uint8Array(mask);
  const at = (x: number, y: number) => (x < 0 || x >= width || y < 0 || y >= height ? 0 : result[y * width + x]);
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = false;
    for (let phase = 0; phase < 2; phase += 1) {
      const remove: number[] = [];
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          if (!at(x, y)) continue;
          const ring = [at(x, y - 1), at(x + 1, y - 1), at(x + 1, y), at(x + 1, y + 1), at(x, y + 1), at(x - 1, y + 1), at(x - 1, y), at(x - 1, y - 1)];
          const count = ring.reduce((sum, value) => sum + value, 0);
          const switchCount = transitions(ring);
          if (count < 2 || count > 6 || switchCount !== 1) continue;
          const first = phase === 0
            ? ring[0] * ring[2] * ring[4] === 0 && ring[2] * ring[4] * ring[6] === 0
            : ring[0] * ring[2] * ring[6] === 0 && ring[0] * ring[4] * ring[6] === 0;
          if (first) remove.push(y * width + x);
        }
      }
      remove.forEach((index) => { result[index] = 0; });
      changed ||= remove.length > 0;
    }
    if (!changed) break;
  }
  return result;
}

function polarRoute(mask: Uint8Array, width: number, height: number) {
  const points: Pixel[] = [];
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) points.push({ x: index % width, y: Math.floor(index / width) });
  }
  if (points.length < 12) throw new Error("The black layout is too small to trace into a circuit.");
  const center = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  center.x /= points.length;
  center.y /= points.length;
  const bins = Math.max(24, Math.min(128, Math.round(Math.sqrt(points.length) * 2)));
  const selected = new Map<number, { point: Pixel; radius: number }>();
  for (const point of points) {
    const angle = (Math.atan2(point.y - center.y, point.x - center.x) + Math.PI * 2) % (Math.PI * 2);
    const bin = Math.floor(angle / (Math.PI * 2) * bins) % bins;
    const radius = Math.hypot(point.x - center.x, point.y - center.y);
    const current = selected.get(bin);
    if (!current || radius > current.radius) selected.set(bin, { point, radius });
  }
  const route = Array.from({ length: bins }, (_, index) => selected.get(index)?.point).filter((point): point is Pixel => Boolean(point));
  if (route.length < 12) throw new Error("The black layout could not produce a closed circuit centerline.");
  return route;
}

function distance(a: Vec2, b: Vec2) { return Math.hypot(a.x - b.x, a.y - b.y); }
function cross(a: Vec2, b: Vec2) { return a.x * b.y - a.y * b.x; }
function dot(a: Vec2, b: Vec2) { return a.x * b.x + a.y * b.y; }

function simplifyClosed(points: Vec2[], tolerance: number) {
  if (points.length <= 24) return points;
  const kept = points.filter((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    return distance(previous, point) + distance(point, next) - distance(previous, next) > tolerance || index % 4 === 0;
  });
  return kept.length >= 12 ? kept : points;
}

function reduceSmallTurns(points: Pixel[], minimumAngle = Math.PI / 12) {
  const route = [...points];
  let changed = true;
  while (changed && route.length > 12) {
    changed = false;
    for (let index = 0; index < route.length; index += 1) {
      const previous = route[(index - 1 + route.length) % route.length];
      const point = route[index];
      const next = route[(index + 1) % route.length];
      const incoming = { x: point.x - previous.x, y: point.y - previous.y };
      const outgoing = { x: next.x - point.x, y: next.y - point.y };
      const turn = Math.abs(Math.atan2(cross(incoming, outgoing), dot(incoming, outgoing)));
      if (turn < minimumAngle) {
        route.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return route;
}

function normalizeRoute(points: Pixel[], targetExtent: number) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const extent = Math.max(1, maxX - minX, maxY - minY);
  const scale = targetExtent / extent;
  return {
    points: points.map((point) => ({ x: (point.x - center.x) * scale, y: (center.y - point.y) * scale })),
    scale,
  };
}

function unit(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function moduleForSegment(previous: Vec2, start: Vec2, end: Vec2, next: Vec2, width: number): TrackModule {
  const chord = { x: end.x - start.x, y: end.y - start.y };
  const chordLength = Math.max(2, Math.hypot(chord.x, chord.y));
  const incoming = unit({ x: start.x - previous.x, y: start.y - previous.y });
  const outgoing = unit(chord);
  const nextOutgoing = unit({ x: next.x - end.x, y: next.y - end.y });
  const startTangent = unit({ x: incoming.x + outgoing.x, y: incoming.y + outgoing.y });
  const endTangent = unit({ x: outgoing.x + nextOutgoing.x, y: outgoing.y + nextOutgoing.y });
  const handleLength = Math.max(1, chordLength / 3);
  return {
    id: id("module"),
    definitionId: "freeform-curve",
    transform: { position: { x: start.x, y: start.y, z: 0 }, rotation: 0 },
    parameters: { length: chordLength, offset: 0, width, elevationDelta: 0 },
    controlPoints: [
      {
        id: id("point"),
        position: { x: 0, y: 0, z: 0 },
        inHandle: { x: -startTangent.x * handleLength, y: -startTangent.y * handleLength },
        outHandle: { x: startTangent.x * handleLength, y: startTangent.y * handleLength },
      },
      {
        id: id("point"),
        position: { x: chord.x, y: chord.y, z: 0 },
        inHandle: { x: -endTangent.x * handleLength, y: -endTangent.y * handleLength },
        outHandle: { x: endTangent.x * handleLength, y: endTangent.y * handleLength },
      },
    ],
  };
}

/** Converts a cleaned black centerline into connected parametric road pieces. */
export function convertRasterToTrack(raster: RasterImage, options: ImageLayoutOptions = {}): ImageLayoutResult {
  const threshold = options.blackThreshold ?? DEFAULT_BLACK_THRESHOLD;
  const rawMask = extractBlackMask(raster, threshold);
  const component = keepLargestComponent(rawMask, raster.width, raster.height, options.minimumComponentPixels ?? DEFAULT_MIN_COMPONENT_PIXELS);
  const skeleton = skeletonize(component.mask, raster.width, raster.height);
  const routePixels = reduceSmallTurns(
    simplifyClosed(polarRoute(skeleton, raster.width, raster.height), 2.5),
  );
  const normalized = normalizeRoute(routePixels, options.targetExtentMeters ?? DEFAULT_TARGET_EXTENT_METERS);
  const width = options.trackWidthMeters ?? DEFAULT_TRACK_WIDTH_METERS;
  const modules = normalized.points.map((point, index) => moduleForSegment(
    normalized.points[(index - 1 + normalized.points.length) % normalized.points.length],
    point,
    normalized.points[(index + 1) % normalized.points.length],
    normalized.points[(index + 2) % normalized.points.length],
    width,
  ));
  const document = createEmptyDocument();
  document.metadata.name = "Image Converted Layout";
  document.metadata.description = "Generated from a black-pixel circuit layout. Add Start / Finish and configure the grid manually.";
  document.modules = modules;
  document.connections = modules.map((module, index) => ({ id: id("connection"), a: { moduleId: module.id, connectorId: "end" }, b: { moduleId: modules[(index + 1) % modules.length].id, connectorId: "start" } }));
  document.paths = [{ id: "primary", kind: "primary-loop", closed: true, sourceModuleIds: modules.map((module) => module.id) }];
  document.grid = { ...document.grid, pathId: "primary", startMarkerId: "", slots: [] };
  const halfExtent = (options.targetExtentMeters ?? DEFAULT_TARGET_EXTENT_METERS) / 2;
  document.spectatorFrame = { ...document.spectatorFrame, center: { x: 0, y: 0 }, size: { x: halfExtent * 2.2, y: halfExtent * 2.2 } };
  return {
    document,
    stats: { sourceWidth: raster.width, sourceHeight: raster.height, blackPixels: component.pixels, routePoints: normalized.points.length, modules: modules.length, scaleMetersPerPixel: normalized.scale },
  };
}
