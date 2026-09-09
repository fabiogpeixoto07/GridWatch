import type { CircuitDocumentV3, CircuitGuidePoint, CircuitRouteId, TrackChunkTemplateV1 } from "../domain/circuit-document.js";

export type CircuitVector = { x: number; y: number };
export type CircuitRouteSample = CircuitVector & { progress: number; distanceMeters: number; tangent: CircuitVector; normal: CircuitVector; widthMeters: number; curbLeft: boolean; curbRight: boolean };
export type CompiledCircuitRoute = { id: CircuitRouteId; lengthMeters: number; samples: CircuitRouteSample[]; reversible: boolean };
export type CompiledCircuit = {
  id: string;
  revision: number;
  main: CompiledCircuitRoute;
  routes: CompiledCircuitRoute[];
  startFinish: CircuitVector | null;
  gridSlots: Array<{ id: string; position: CircuitVector; heading: number; row: number; progress: number }>;
  pitBoxes: Array<{ id: string; position: CircuitVector; heading: number; teamId: string | null }>;
  decisions: Array<{ routeId: CircuitRouteId; progress: number; targetRouteId: CircuitRouteId }>;
};

type CompiledGuidePoint = CircuitGuidePoint & { curbLeft?: boolean; curbRight?: boolean };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrap = (value: number, length: number) => ((value % length) + length) % length;

function transformGuide(document: CircuitDocumentV3, templates: ReadonlyMap<string, TrackChunkTemplateV1>, routeId: CircuitRouteId): CompiledGuidePoint[] {
  const route = document.routes.find((candidate) => candidate.routeId === routeId);
  if (route?.points.length) {
    const curbSources = document.chunks.flatMap((chunk) => {
      const template = templates.get(chunk.templateId);
      if (!template || (routeId === "main" ? template.kind !== "road" : !routeId.startsWith(`${template.kind}:`))) return [];
      const cos = Math.cos(chunk.rotation);
      const sin = Math.sin(chunk.rotation);
      const curbLeft = chunk.curbMode === "left" || chunk.curbMode === "both";
      const curbRight = chunk.curbMode === "right" || chunk.curbMode === "both";
      return template.guide.map((point) => ({ x: chunk.x + point.x * cos - point.y * sin, y: chunk.y + point.x * sin + point.y * cos, curbLeft, curbRight }));
    });
    return route.points.map((point) => {
      const nearest = curbSources.reduce<{ distance: number; curbLeft: boolean; curbRight: boolean } | null>((best, source) => {
        const distance = Math.hypot(source.x - point.x, source.y - point.y);
        return !best || distance < best.distance ? { distance, curbLeft: source.curbLeft, curbRight: source.curbRight } : best;
      }, null);
      return { ...point, curbLeft: nearest?.curbLeft ?? false, curbRight: nearest?.curbRight ?? false };
    });
  }
  const chunks = document.chunks.filter((chunk) => routeId === "main" || (routeId.startsWith("pit:") && templates.get(chunk.templateId)?.kind === "pit") || (routeId.startsWith("escape:") && templates.get(chunk.templateId)?.kind === "escape"));
  return chunks.flatMap((chunk) => {
    const template = templates.get(chunk.templateId);
    if (!template) return [];
    const cos = Math.cos(chunk.rotation);
    const sin = Math.sin(chunk.rotation);
    const curbLeft = chunk.curbMode === "left" || chunk.curbMode === "both";
    const curbRight = chunk.curbMode === "right" || chunk.curbMode === "both";
    return template.guide.map((point) => ({ x: chunk.x + point.x * cos - point.y * sin, y: chunk.y + point.x * sin + point.y * cos, curbLeft, curbRight }));
  });
}

function compileRoute(id: CircuitRouteId, points: CompiledGuidePoint[], widthMeters: number, reversible: boolean, closed: boolean): CompiledCircuitRoute {
  const source = points.length > 1 ? points : [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  const positions = [...source.map((point) => ({ ...point }))];
  if (closed && positions.length && (positions[0].x !== positions.at(-1)!.x || positions[0].y !== positions.at(-1)!.y)) positions.push({ ...positions[0] });
  const cumulative = [0];
  for (let index = 1; index < positions.length; index += 1) cumulative.push(cumulative[index - 1] + Math.hypot(positions[index].x - positions[index - 1].x, positions[index].y - positions[index - 1].y));
  const lengthMeters = cumulative.at(-1) ?? 0;
  const sampleCount = Math.max(32, Math.ceil(lengthMeters / 2));
  const samples: CircuitRouteSample[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const distance = lengthMeters * index / sampleCount;
    let segment = 0;
    while (segment < cumulative.length - 2 && cumulative[segment + 1] < distance) segment += 1;
    const segmentLength = Math.max(.001, cumulative[segment + 1] - cumulative[segment]);
    const mix = (distance - cumulative[segment]) / segmentLength;
    const from = positions[segment];
    const to = positions[segment + 1];
    const tangentLength = Math.max(.001, Math.hypot(to.x - from.x, to.y - from.y));
    const tangent = { x: (to.x - from.x) / tangentLength, y: (to.y - from.y) / tangentLength };
    samples.push({ x: from.x + (to.x - from.x) * mix, y: from.y + (to.y - from.y) * mix, progress: index / sampleCount, distanceMeters: distance, tangent, normal: { x: -tangent.y, y: tangent.x }, widthMeters, curbLeft: from.curbLeft ?? false, curbRight: from.curbRight ?? false });
  }
  return { id, lengthMeters, samples, reversible };
}

function sampleAt(route: CompiledCircuitRoute, progress: number) {
  return route.samples[wrap(Math.round(progress * route.samples.length), route.samples.length)] ?? route.samples[0];
}

export function compileCircuitDocument(document: CircuitDocumentV3, templates: ReadonlyMap<string, TrackChunkTemplateV1>): CompiledCircuit {
  const main = compileRoute("main", transformGuide(document, templates, "main"), 14, false, true);
  const routeIds = document.routes.map((route) => route.routeId).filter((id) => id !== "main");
  const routes = [main, ...routeIds.map((id) => compileRoute(id, transformGuide(document, templates, id), id.startsWith("pit:") ? 8 : 8, id.startsWith("escape:"), false))];
  const startFinish = document.startFinish ? sampleAt(main, document.startFinish.progress) : null;
  const gridSlots = document.startingGrid ? Array.from({ length: clamp(document.startingGrid.slots, 2, 22) }, (_, index) => {
    const progress = wrap(document.startingGrid!.anchorProgress - (index + 1) * document.startingGrid!.rowSpacingMeters / Math.max(1, main.lengthMeters), 1);
    const sample = sampleAt(main, progress);
    const side = document.startingGrid!.stagger ? (index % 2 === 0 ? -1 : 1) * document.startingGrid!.lateralSpacingMeters : 0;
    return { id: `${document.id}-grid-${index + 1}`, position: { x: sample.x + sample.normal.x * side, y: sample.y + sample.normal.y * side }, heading: Math.atan2(sample.tangent.y, sample.tangent.x), row: Math.floor(index / 2) + 1, progress };
  }) : [];
  const pitRoute = routes.find((route) => route.id.startsWith("pit:"));
  const pitBoxes = document.pitBoxes && pitRoute ? Array.from({ length: clamp(document.pitBoxes.count, 1, 22) }, (_, index) => {
    const progress = wrap(document.pitBoxes!.anchorProgress + (index + .5) * document.pitBoxes!.spacingMeters / Math.max(1, pitRoute.lengthMeters), 1);
    const sample = sampleAt(pitRoute, progress);
    const sideOffset = document.pitBoxes!.side === "left" ? 2.2 : -2.2;
    return { id: `${document.id}-box-${index + 1}`, position: { x: sample.x + sample.normal.x * sideOffset, y: sample.y + sample.normal.y * sideOffset }, heading: Math.atan2(sample.tangent.y, sample.tangent.x), teamId: null };
  }) : [];
  const decisions = routes.filter((route) => route.id !== "main").map((route) => ({ routeId: route.id, progress: 0, targetRouteId: "main" as const }));
  return { id: document.id, revision: document.revision, main, routes, startFinish, gridSlots, pitBoxes, decisions };
}

export function validateCompiledCircuit(circuit: CompiledCircuit) {
  const issues: string[] = [];
  if (circuit.main.lengthMeters < 300) issues.push("The main circuit is shorter than 300 meters.");
  if (circuit.main.samples.some((sample) => !Number.isFinite(sample.x) || !Number.isFinite(sample.y))) issues.push("A circuit route contains invalid coordinates.");
  if (!circuit.startFinish) issues.push("The compiled circuit has no start/finish anchor.");
  if (circuit.gridSlots.length < 2) issues.push("The compiled circuit has fewer than two grid slots.");
  return issues;
}
