import { generateGrid } from "../track-creator/domain/track/authoring.js";
import { buildTrackGeometry } from "../track-creator/domain/track/geometry.js";
import type { PathSample, TrackDocument } from "../track-creator/domain/track/types.js";
import type { CompiledTrack, CompiledTrackSample, Vector2 } from "./track-compiler.js";

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function normalize(vector: Vector2): Vector2 {
  const magnitude = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

function distanceSquared(left: Vector2, right: Vector2) {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function sourceSurface(value: unknown): CompiledTrackSample["surface"] {
  if (value === "asphalt" || value === "concrete" || value === "grass" || value === "gravel" || value === "curb") return value;
  // The authoring model intentionally distinguishes sand; the current physical model treats it as gravel.
  return value === "sand" ? "gravel" : "asphalt";
}

function distanceInZone(distance: number, start: number, end: number, length: number) {
  const wrapped = ((distance % length) + length) % length;
  const from = ((start % length) + length) % length;
  const to = ((end % length) + length) % length;
  return from <= to ? wrapped >= from && wrapped <= to : wrapped >= from || wrapped <= to;
}

function materialFor(document: TrackDocument, sample: PathSample, length: number, primaryPathId: string | undefined) {
  const module = document.modules.find((item) => item.id === sample.moduleId);
  const override = document.overrides.find((item) => item.targetId === sample.moduleId)?.values;
  let surface = sourceSurface(override?.surface ?? module?.properties?.surface);
  let grip = clamp(override?.grip ?? module?.properties?.grip ?? 1, 0.2, 1.5);
  for (const zone of document.zones) {
    if (primaryPathId && zone.pathId !== primaryPathId) continue;
    if (!distanceInZone(sample.s, zone.startMeters, zone.endMeters, length)) continue;
    surface = sourceSurface(zone.properties.surface ?? surface);
    const zonedGrip = zone.properties.grip;
    if (typeof zonedGrip === "number") grip = clamp(zonedGrip, 0.2, 1.5);
  }
  return { surface, grip };
}

function signedCurvature(samples: PathSample[], index: number, spacing: number) {
  const previous = samples[(index - 1 + samples.length) % samples.length];
  const next = samples[(index + 1) % samples.length];
  const before = normalize({ x: previous.tangent.x, y: previous.tangent.y });
  const after = normalize({ x: next.tangent.x, y: next.tangent.y });
  const angle = Math.atan2(before.x * after.y - before.y * after.x, before.x * after.x + before.y * after.y);
  return angle / Math.max(0.01, spacing * 2);
}

function nearestSampleIndex(samples: CompiledTrackSample[], position: Vector2) {
  let index = 0;
  let nearest = Number.POSITIVE_INFINITY;
  samples.forEach((sample, candidate) => {
    const distance = distanceSquared(sample.position, position);
    if (distance < nearest) {
      nearest = distance;
      index = candidate;
    }
  });
  return index;
}

/** Converts the Track Creator's canonical modular document into the race engine's physical contract. */
export function compileAuthoringTrack(document: TrackDocument): CompiledTrack {
  const geometry = buildTrackGeometry(document);
  if (!geometry?.path.closed || geometry.path.samples.length < 8) {
    throw new Error("A closed primary route with at least eight samples is required for racing.");
  }
  const lengthMeters = geometry.path.totalLengthMeters;
  const primaryPathId = document.paths.find((path) => path.kind === "primary-loop")?.id;
  const source = geometry.path.samples;
  // A closed authoring path includes its terminal seam sample. The physical contract is cyclic and must not repeat it.
  const raw = (source.length > 8 ? source.slice(0, -1) : source).filter((sample, index, values) => {
    if (index === 0) return true;
    const previous = values[index - 1].position;
    return Math.hypot(sample.position.x - previous.x, sample.position.y - previous.y) > 0.001;
  });
  const spacing = lengthMeters / raw.length;
  const samples: CompiledTrackSample[] = raw.map((sample, index) => {
    const tangent = normalize({ x: sample.tangent.x, y: sample.tangent.y });
    const normal = { x: -tangent.y, y: tangent.x };
    const widthLeft = Math.max(3, sample.leftWidth ?? sample.width / 2);
    const widthRight = Math.max(3, sample.rightWidth ?? sample.width / 2);
    const material = materialFor(document, sample, lengthMeters, primaryPathId);
    const position = { x: sample.position.x, y: sample.position.y };
    return {
      progress: sample.s / lengthMeters,
      distance: sample.s,
      position,
      tangent,
      normal,
      curvature: signedCurvature(raw, index, spacing),
      widthLeft,
      widthRight,
      leftBoundary: { x: position.x + normal.x * widthLeft, y: position.y + normal.y * widthLeft },
      rightBoundary: { x: position.x - normal.x * widthRight, y: position.y - normal.y * widthRight },
      ...material,
    };
  });
  const gridSlots = generateGrid(document, geometry.path).map((slot) => {
    const sampleIndex = nearestSampleIndex(samples, slot.position);
    const sample = samples[sampleIndex];
    const lateralOffset = (slot.position.x - sample.position.x) * sample.normal.x + (slot.position.y - sample.position.y) * sample.normal.y;
    return {
      id: `${document.id}-grid-${slot.slot}`,
      position: { x: slot.position.x, y: slot.position.y },
      heading: Math.atan2(slot.tangent.y, slot.tangent.x),
      row: Math.ceil(slot.slot / 2),
      progress: sample.progress,
      lateralOffset,
      sampleIndex,
    };
  });
  const sampleAtDistance = (distance: number) => {
    const wrapped = ((distance % lengthMeters) + lengthMeters) % lengthMeters;
    return samples.reduce((nearest, candidate) => Math.abs(candidate.distance - wrapped) < Math.abs(nearest.distance - wrapped) ? candidate : nearest, samples[0]);
  };
  const sensors: CompiledTrack["sensors"] = [];
  for (const marker of document.markers) {
    if (marker.location.pathId !== document.grid.pathId) continue;
    const kind = marker.type === "start-finish" || marker.type === "sector" || marker.type === "pit-entry" || marker.type === "pit-exit"
      ? marker.type
      : null;
    if (!kind) continue;
    const sample = sampleAtDistance(marker.location.distanceMeters);
    sensors.push({ id: marker.id, kind, position: sample.position, normal: sample.normal });
  }
  if (!sensors.some((sensor) => sensor.kind === "start-finish")) {
    sensors.unshift({ id: `${document.id}-finish`, kind: "start-finish", position: samples[0].position, normal: samples[0].normal });
  }
  const leftBoundary = samples.map((sample) => sample.leftBoundary);
  const rightBoundary = samples.map((sample) => sample.rightBoundary);
  return {
    id: document.id,
    lengthMeters,
    sampleSpacingMeters: spacing,
    samples,
    leftBoundary,
    rightBoundary,
    surfaceRibbon: samples.map((sample, index) => {
      const next = samples[(index + 1) % samples.length];
      return { leftStart: sample.leftBoundary, rightStart: sample.rightBoundary, leftEnd: next.leftBoundary, rightEnd: next.rightBoundary, surface: sample.surface, grip: sample.grip };
    }),
    gridSlots,
    sensors,
    colliders: [
      { id: `${document.id}-barrier-left`, side: "left", points: leftBoundary },
      { id: `${document.id}-barrier-right`, side: "right", points: rightBoundary },
    ],
  };
}

export type { TrackDocument as AuthoringTrackDocument } from "../track-creator/domain/track/types.js";
