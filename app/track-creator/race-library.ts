import type { Circuit, CircuitStyle } from "../tracks.js";
import { buildTrackGeometry } from "./domain/track/geometry.js";
import type { TrackDocument } from "./domain/track/types.js";
import { listDocuments, loadDocument } from "./persistence.js";

export type CreatorCircuit = Circuit & {
  custom: true;
  source: "track-creator";
  trackDocument: TrackDocument;
};

function styleFor(document: TrackDocument): CircuitStyle {
  const name = document.metadata.name.toLowerCase();
  if (name.includes("street")) return "street";
  if (name.includes("oval") || name.includes("speed")) return "fast";
  return "technical";
}

/** Produces the lightweight menu/legacy-rendering projection while retaining the full authored document. */
export function creatorCircuitFromDocument(document: TrackDocument): CreatorCircuit | null {
  const geometry = buildTrackGeometry(document);
  if (!geometry?.path.closed || geometry.path.samples.length < 8) return null;
  const samples = geometry.path.samples;
  const points = samples.length > 72
    ? Array.from({ length: 72 }, (_, index) => samples[Math.floor(index / 72 * samples.length)])
    : samples;
  const bounds = geometry.bounds;
  const width = Math.max(1, bounds.max.x - bounds.min.x);
  const height = Math.max(1, bounds.max.y - bounds.min.y);
  const padding = 0.08;
  const projected = points.map((sample) => [
    padding + (sample.position.x - bounds.min.x) / width * (1 - padding * 2),
    padding + (sample.position.y - bounds.min.y) / height * (1 - padding * 2),
  ] as const);
  const start = document.markers.find((marker) => marker.type === "start-finish" && marker.location.pathId === document.grid.pathId);
  const startIndex = start
    ? Math.round(((start.location.distanceMeters / geometry.path.totalLengthMeters) % 1) * projected.length) % projected.length
    : 0;
  return {
    id: document.id,
    name: document.metadata.name || "Untitled Circuit",
    country: "Custom",
    style: styleFor(document),
    points: projected,
    startIndex,
    custom: true,
    source: "track-creator",
    trackDocument: document,
  };
}

export function isCreatorCircuit(track: Circuit): track is CreatorCircuit {
  return "source" in track && track.source === "track-creator" && "trackDocument" in track;
}

export async function loadCreatorCircuits(): Promise<CreatorCircuit[]> {
  const summaries = await listDocuments();
  const documents = await Promise.all(summaries.map((summary) => loadDocument(summary.id)));
  return documents.flatMap((document) => {
    const circuit = document ? creatorCircuitFromDocument(document) : null;
    return circuit ? [circuit] : [];
  });
}
