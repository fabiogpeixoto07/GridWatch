import type { TrackControlPoint, TrackDocumentV2, TrackSurface } from "../domain/track-document.js";

export type Vector2 = { x: number; y: number };

export type CompiledTrackSample = {
  progress: number;
  distance: number;
  position: Vector2;
  tangent: Vector2;
  normal: Vector2;
  curvature: number;
  widthLeft: number;
  widthRight: number;
  leftBoundary: Vector2;
  rightBoundary: Vector2;
  surface: TrackSurface;
  grip: number;
};

export type CompiledTrack = {
  id: string;
  lengthMeters: number;
  sampleSpacingMeters: number;
  samples: CompiledTrackSample[];
  leftBoundary: Vector2[];
  rightBoundary: Vector2[];
  surfaceRibbon: Array<{ leftStart: Vector2; rightStart: Vector2; leftEnd: Vector2; rightEnd: Vector2; surface: TrackSurface; grip: number }>;
  gridSlots: Array<{ id: string; position: Vector2; heading: number; row: number; progress: number; lateralOffset: number; sampleIndex: number }>;
  sensors: Array<{ id: string; kind: "start-finish" | "sector" | "pit-entry" | "pit-exit"; position: Vector2; normal: Vector2 }>;
  colliders: Array<{ id: string; side: "left" | "right"; points: Vector2[] }>;
};

type RawPoint = Vector2 & { widthLeft: number; widthRight: number };

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const wrap = (index: number, length: number) => ((index % length) + length) % length;

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  const curved = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  const linear = p1 + (p2 - p1) * t;
  return clamp(linear + (curved - linear) * 0.12, Math.min(p0, p1, p2, p3), Math.max(p0, p1, p2, p3));
}

function interpolateControlPoints(points: TrackControlPoint[], stepsPerSegment: number) {
  const raw: RawPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const p0 = points[wrap(index - 1, points.length)];
    const p1 = points[index];
    const p2 = points[wrap(index + 1, points.length)];
    const p3 = points[wrap(index + 2, points.length)];
    for (let step = 0; step < stepsPerSegment; step += 1) {
      const t = step / stepsPerSegment;
      raw.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
        widthLeft: p1.widthLeft + (p2.widthLeft - p1.widthLeft) * t,
        widthRight: p1.widthRight + (p2.widthRight - p1.widthRight) * t,
      });
    }
  }
  return raw;
}

function surfaceAt(track: TrackDocumentV2, progress: number) {
  const zone = track.surfaceZones.find((candidate) => {
    if (candidate.startProgress <= candidate.endProgress) return progress >= candidate.startProgress && progress <= candidate.endProgress;
    return progress >= candidate.startProgress || progress <= candidate.endProgress;
  });
  return { surface: zone?.surface ?? "asphalt", grip: clamp(zone?.grip ?? 1, 0.2, 1.5) };
}

/** Compiles editor control points into one arc-length geometry used by rendering, AI, and physics. */
export function compileTrack(track: TrackDocumentV2, requestedSpacingMeters = 2): CompiledTrack {
  if (track.controlPoints.length < 4) throw new Error("A closed track needs at least four control points.");
  const startIndex = wrap(track.startIndex, track.controlPoints.length);
  const orderedPoints = track.controlPoints.map((_, index) => track.controlPoints[wrap(startIndex + index, track.controlPoints.length)]);
  const raw = interpolateControlPoints(orderedPoints, 24);
  const cumulative = [0];
  let total = 0;
  for (let index = 1; index <= raw.length; index += 1) {
    const previous = raw[index - 1];
    const current = raw[index % raw.length];
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
    cumulative.push(total);
  }

  const sampleCount = Math.max(96, Math.ceil(total / clamp(requestedSpacingMeters, 0.5, 8)));
  const positions: RawPoint[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const target = index / sampleCount * total;
    let low = 0;
    let high = cumulative.length - 1;
    while (low < high - 1) {
      const middle = Math.floor((low + high) / 2);
      if (cumulative[middle] <= target) low = middle;
      else high = middle;
    }
    const from = raw[low % raw.length];
    const to = raw[(low + 1) % raw.length];
    const segmentLength = cumulative[low + 1] - cumulative[low] || 1;
    const mix = (target - cumulative[low]) / segmentLength;
    positions.push({
      x: from.x + (to.x - from.x) * mix,
      y: from.y + (to.y - from.y) * mix,
      widthLeft: from.widthLeft + (to.widthLeft - from.widthLeft) * mix,
      widthRight: from.widthRight + (to.widthRight - from.widthRight) * mix,
    });
  }

  const sampleSpacingMeters = total / sampleCount;
  const samples = positions.map((position, index): CompiledTrackSample => {
    const before = positions[wrap(index - 2, sampleCount)];
    const after = positions[wrap(index + 2, sampleCount)];
    const length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
    const tangent = { x: (after.x - before.x) / length, y: (after.y - before.y) / length };
    const normal = { x: -tangent.y, y: tangent.x };
    const previousTangent = (() => {
      const a = positions[wrap(index - 3, sampleCount)];
      const b = positions[wrap(index - 1, sampleCount)];
      const span = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / span, y: (b.y - a.y) / span };
    })();
    const cross = previousTangent.x * tangent.y - previousTangent.y * tangent.x;
    const dot = clamp(previousTangent.x * tangent.x + previousTangent.y * tangent.y, -1, 1);
    const curvature = Math.atan2(cross, dot) / Math.max(sampleSpacingMeters * 2, 0.001);
    const progress = index / sampleCount;
    const material = surfaceAt(track, progress);
    return {
      progress,
      distance: progress * total,
      position: { x: position.x, y: position.y },
      tangent,
      normal,
      curvature,
      widthLeft: position.widthLeft,
      widthRight: position.widthRight,
      leftBoundary: { x: position.x + normal.x * position.widthLeft, y: position.y + normal.y * position.widthLeft },
      rightBoundary: { x: position.x - normal.x * position.widthRight, y: position.y - normal.y * position.widthRight },
      ...material,
    };
  });
  const smoothedCurvature = samples.map((_, index) => {
    let total = 0;
    let weight = 0;
    for (let offset = -4; offset <= 4; offset += 1) {
      const factor = 5 - Math.abs(offset);
      total += samples[wrap(index + offset, samples.length)].curvature * factor;
      weight += factor;
    }
    return total / weight;
  });
  samples.forEach((sample, index) => { sample.curvature = smoothedCurvature[index]; });
  const sampleAtProgress = (progress: number) => samples[wrap(Math.round(progress * samples.length), samples.length)];
  const leftBoundary = samples.map((sample) => sample.leftBoundary);
  const rightBoundary = samples.map((sample) => sample.rightBoundary);
  const surfaceRibbon = samples.map((sample, index) => {
    const next = samples[(index + 1) % samples.length];
    return { leftStart: sample.leftBoundary, rightStart: sample.rightBoundary, leftEnd: next.leftBoundary, rightEnd: next.rightBoundary, surface: sample.surface, grip: sample.grip };
  });
  const gridSlots = track.startingGrid.map((slot) => {
    const progress = slot.distanceBehindStartMeters === undefined
      ? slot.progress
      : ((1 - slot.distanceBehindStartMeters / total) % 1 + 1) % 1;
    const sampleIndex = wrap(Math.round(progress * samples.length), samples.length);
    const sample = samples[sampleIndex];
    const lateralOffset = Math.sign(slot.lateralOffset || 1) * Math.min(Math.abs(slot.lateralOffset), Math.min(sample.widthLeft, sample.widthRight) * 0.28);
    return {
      id: slot.id,
      position: { x: sample.position.x + sample.normal.x * lateralOffset, y: sample.position.y + sample.normal.y * lateralOffset },
      heading: Math.atan2(sample.tangent.y, sample.tangent.x),
      row: slot.row,
      progress,
      lateralOffset,
      sampleIndex,
    };
  });
  const markerSensor = (id: string, kind: "start-finish" | "sector" | "pit-entry" | "pit-exit", progress: number) => {
    const sample = sampleAtProgress(progress);
    return { id, kind, position: sample.position, normal: sample.normal };
  };
  const sensors: CompiledTrack["sensors"] = [markerSensor(`${track.id}-finish`, "start-finish", 0)];
  track.timingSectors.forEach((sector) => sensors.push(markerSensor(sector.id, "sector", sector.progress)));
  if (track.pitLane) {
    sensors.push(markerSensor(`${track.id}-pit-entry`, "pit-entry", track.pitLane.entryProgress));
    sensors.push(markerSensor(`${track.id}-pit-exit`, "pit-exit", track.pitLane.exitProgress));
  }
  const colliders: CompiledTrack["colliders"] = [
    { id: `${track.id}-barrier-left`, side: "left", points: leftBoundary },
    { id: `${track.id}-barrier-right`, side: "right", points: rightBoundary },
  ];
  return { id: track.id, lengthMeters: total, sampleSpacingMeters, samples, leftBoundary, rightBoundary, surfaceRibbon, gridSlots, sensors, colliders };
}

export function validateCompiledTrack(track: CompiledTrack) {
  const issues: string[] = [];
  if (track.lengthMeters < 300) issues.push("Compiled track length is below 300 meters.");
  if (track.samples.some((sample) => !Number.isFinite(sample.curvature))) issues.push("Track curvature contains invalid values.");
  if (track.samples.some((sample) => sample.widthLeft < 3 || sample.widthRight < 3)) issues.push("Compiled track is too narrow for safe vehicle placement.");
  const sharpestRadius = Math.min(...track.samples.filter((sample) => Math.abs(sample.curvature) > 0.0001).map((sample) => 1 / Math.abs(sample.curvature)));
  if (Number.isFinite(sharpestRadius) && sharpestRadius < 8) issues.push("Compiled track contains a turn radius below eight meters.");
  const peakCurvatureStep = track.samples.reduce((peak, sample, index) => Math.max(peak, Math.abs(sample.curvature - track.samples[(index - 1 + track.samples.length) % track.samples.length].curvature)), 0);
  if (peakCurvatureStep > 0.09) issues.push("Compiled track contains an excessive curvature discontinuity.");
  const intersects = (a: Vector2, b: Vector2, c: Vector2, d: Vector2) => {
    const orientation = (p: Vector2, q: Vector2, r: Vector2) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    const abC = orientation(a, b, c);
    const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a);
    const cdB = orientation(c, d, b);
    return abC * abD < -1e-6 && cdA * cdB < -1e-6;
  };
  const polylineIntersects = (points: Vector2[]) => {
    const count = points.length;
    const stride = Math.max(1, Math.floor(3 / Math.max(track.sampleSpacingMeters, 0.5)));
    for (let first = 0; first < count; first += stride) {
      const firstEnd = (first + stride) % count;
      for (let second = first + stride * 2; second < count; second += stride) {
        const secondEnd = (second + stride) % count;
        if (first === secondEnd || firstEnd === second || (first === 0 && secondEnd === 0)) continue;
        if (intersects(points[first], points[firstEnd], points[second], points[secondEnd])) return true;
      }
    }
    return false;
  };
  if (polylineIntersects(track.samples.map((sample) => sample.position))) issues.push("Compiled centerline intersects itself.");
  if (polylineIntersects(track.samples.map((sample) => sample.leftBoundary))) issues.push("Compiled left boundary intersects itself.");
  if (polylineIntersects(track.samples.map((sample) => sample.rightBoundary))) issues.push("Compiled right boundary intersects itself.");
  if (track.samples.some((sample) => Math.hypot(sample.leftBoundary.x - sample.rightBoundary.x, sample.leftBoundary.y - sample.rightBoundary.y) < 6)) issues.push("Compiled boundaries overlap the minimum vehicle safety corridor.");
  const occupiedGrid = new Set<string>();
  for (const [index, slot] of track.gridSlots.entries()) {
    const key = `${Math.round(slot.position.x * 2)}:${Math.round(slot.position.y * 2)}`;
    if (occupiedGrid.has(key)) issues.push("Starting-grid slots overlap.");
    occupiedGrid.add(key);
    if (track.gridSlots.some((other, otherIndex) => otherIndex !== index && Math.hypot(slot.position.x - other.position.x, slot.position.y - other.position.y) < 3.5)) issues.push("Starting-grid clearance is below 3.5 meters.");
  }
  if (!track.sensors.some((sensor) => sensor.kind === "start-finish")) issues.push("Compiled track has no start/finish sensor.");
  if (track.surfaceRibbon.length !== track.samples.length) issues.push("Surface ribbon is incomplete.");
  if (track.colliders.length !== 2 || track.colliders.some((collider) => collider.points.length !== track.samples.length)) issues.push("Physics collider generation is incomplete.");
  return issues;
}
