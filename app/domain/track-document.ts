export const TRACK_DOCUMENT_VERSION = 2 as const;
export type TrackSurface = "asphalt" | "curb" | "concrete" | "grass" | "gravel";

export type TrackControlPoint = {
  id: string;
  x: number;
  y: number;
  widthLeft: number;
  widthRight: number;
  mode: "smooth" | "corner" | "symmetric";
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
};

export type TrackSurfaceZone = {
  id: string;
  startProgress: number;
  endProgress: number;
  surface: TrackSurface;
  grip: number;
};

export type TrackMarker = { id: string; progress: number };
export type TrackGridSlot = TrackMarker & { lateralOffset: number; row: number; distanceBehindStartMeters?: number };
export type TrackCurbZone = { id: string; startProgress: number; endProgress: number; side: "left" | "right" | "both"; width: number };
export type TrackEdgeConfiguration = { surface: TrackSurface; width: number };
export type TrackPitLane = {
  entryProgress: number;
  exitProgress: number;
  speedLimitKph: number;
  path: Array<{ id: string; x: number; y: number }>;
};

export type TrackDocumentV2 = {
  version: typeof TRACK_DOCUMENT_VERSION;
  id: string;
  name: string;
  country: string;
  style: string;
  closed: true;
  controlPoints: TrackControlPoint[];
  startIndex: number;
  sectors: number[];
  gridSlots: number;
  startingGrid: TrackGridSlot[];
  timingSectors: TrackMarker[];
  pitLane: TrackPitLane | null;
  surfaceZones: TrackSurfaceZone[];
  curbZones: TrackCurbZone[];
  runOff: { left: TrackEdgeConfiguration; right: TrackEdgeConfiguration };
  barriers: { left: boolean; right: boolean; offsetMeters: number };
  revision: number;
  sourceRevision: string;
};

export type LegacyTrackInput = {
  id: string;
  name: string;
  country: string;
  style: string;
  points: ReadonlyArray<readonly [number, number]>;
  width?: number;
  startIndex?: number;
};

const WORLD_WIDTH_METERS = 1_000;
const WORLD_HEIGHT_METERS = 620;
const BASE_HALF_WIDTH_METERS = 7;

export function migrateLegacyTrack(track: LegacyTrackInput): TrackDocumentV2 {
  const widthScale = Math.max(0.6, Math.min(1.5, track.width ?? 1));
  const controlPoints = track.points.map(([x, y], index) => ({
    id: `${track.id}-point-${index + 1}`,
    x: x * WORLD_WIDTH_METERS,
    y: y * WORLD_HEIGHT_METERS,
    widthLeft: BASE_HALF_WIDTH_METERS * widthScale,
    widthRight: BASE_HALF_WIDTH_METERS * widthScale,
    mode: "smooth" as const,
  }));
  return {
    version: TRACK_DOCUMENT_VERSION,
    id: track.id,
    name: track.name,
    country: track.country,
    style: track.style,
    closed: true,
    controlPoints,
    startIndex: Math.max(0, Math.min(controlPoints.length - 1, track.startIndex ?? 0)),
    sectors: [1 / 3, 2 / 3],
    gridSlots: 22,
    startingGrid: Array.from({ length: 22 }, (_, index) => ({
      id: `${track.id}-grid-${index + 1}`,
      progress: ((1 - (9 + Math.floor(index / 2) * 8.5) / Math.max(800, controlPoints.length * 75)) % 1 + 1) % 1,
      lateralOffset: (index % 2 === 0 ? -1 : 1) * 2.2,
      row: Math.floor(index / 2) + 1,
      distanceBehindStartMeters: 9 + Math.floor(index / 2) * 8.5,
    })),
    timingSectors: [1 / 3, 2 / 3].map((progress, index) => ({ id: `${track.id}-sector-${index + 1}`, progress })),
    pitLane: null,
    surfaceZones: [{ id: `${track.id}-asphalt`, startProgress: 0, endProgress: 1, surface: "asphalt", grip: 1 }],
    curbZones: [{ id: `${track.id}-curbs`, startProgress: 0, endProgress: 1, side: "both", width: 1.2 }],
    runOff: { left: { surface: "grass", width: 8 }, right: { surface: "grass", width: 8 } },
    barriers: { left: true, right: true, offsetMeters: 1.5 },
    revision: 1,
    sourceRevision: "legacy-v1",
  };
}

export function validateTrackDocument(track: TrackDocumentV2) {
  const issues: string[] = [];
  if (track.controlPoints.length < 8) issues.push("The track needs at least eight control points.");
  if (new Set(track.controlPoints.map((point) => point.id)).size !== track.controlPoints.length) issues.push("Track point IDs must be unique.");
  if (track.controlPoints.some((point) => point.widthLeft < 3 || point.widthRight < 3)) issues.push("Track half-width cannot be below three meters.");
  if (track.startIndex < 0 || track.startIndex >= track.controlPoints.length) issues.push("Start/finish position is outside the control-point list.");
  if (new Set(track.startingGrid.map((slot) => slot.id)).size !== track.startingGrid.length) issues.push("Starting-grid slot IDs must be unique.");
  if (track.startingGrid.some((slot) => slot.progress < 0 || slot.progress >= 1)) issues.push("Starting-grid progress must remain inside the closed lap.");
  if (track.timingSectors.some((sector) => sector.progress <= 0 || sector.progress >= 1)) issues.push("Timing sectors must be placed after the start and before the finish.");
  if (track.pitLane && (track.pitLane.path.length < 2 || track.pitLane.entryProgress === track.pitLane.exitProgress)) issues.push("Pit lane requires a path and distinct entry and exit points.");
  return issues;
}
