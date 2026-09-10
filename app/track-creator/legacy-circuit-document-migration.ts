import type { CircuitDocumentV3 } from "../domain/circuit-document.js";
import {
  deleteCircuitDocument,
  listSavedCircuits,
} from "../domain/circuit-repository.js";
import { fitSpectatorFrame } from "./domain/track/authoring.js";
import { createEmptyDocument } from "./domain/track/document.js";
import { buildTrackGeometry } from "./domain/track/geometry.js";
import type { TrackDocument, Vec3 } from "./domain/track/types.js";
import { loadDocument, saveDocument } from "./persistence.js";

const samePoint = (left: Vec3, right: Vec3) =>
  Math.hypot(left.x - right.x, left.y - right.y) < 0.001;

function primaryLoop(document: CircuitDocumentV3): Vec3[] {
  const route = document.routes.find((item) => item.routeId === "main");
  if (!route || route.points.length < 3)
    throw new Error("The legacy circuit has no usable main route.");
  const points = route.points.map((point) => ({ x: point.x, y: point.y, z: 0 }));
  return points.length > 3 && samePoint(points[0], points.at(-1)!)
    ? points.slice(0, -1)
    : points;
}

function roadWidth(document: CircuitDocumentV3) {
  const templates = new Map((document.embeddedTemplates ?? []).map((template) => [template.id, template]));
  const widths = document.chunks
    .map((chunk) => templates.get(chunk.templateId)?.widthMeters)
    .filter((width): width is number => typeof width === "number" && Number.isFinite(width) && width > 0);
  return widths.length
    ? Math.max(3, Math.min(30, widths.reduce((sum, width) => sum + width, 0) / widths.length))
    : 14;
}

/** Converts a retired chunk-editor main route into selectable native Track Editor road modules. */
export function migrateLegacyCircuitDocument(document: CircuitDocumentV3): TrackDocument {
  const source = primaryLoop(document);
  const count = source.length;
  const width = roadWidth(document);
  const migrated = createEmptyDocument();
  const now = new Date().toISOString();
  migrated.id = document.id;
  migrated.metadata = {
    name: document.name || "Migrated Circuit",
    description: `Migrated from the retired GridWatch Circuit Editor${document.country ? ` · ${document.country}` : ""}`,
    createdAt: now,
    updatedAt: now,
  };
  migrated.modules = source.map((start, index) => {
    const previous = source[(index - 1 + count) % count];
    const end = source[(index + 1) % count];
    const next = source[(index + 2) % count];
    const id = `${document.id}-road-${index + 1}`;
    return {
      id,
      definitionId: "freeform-curve",
      transform: { position: start, rotation: 0 },
      parameters: { width, length: Math.hypot(end.x - start.x, end.y - start.y), offset: 0, elevationDelta: 0 },
      controlPoints: [
        {
          id: `${id}-start`,
          position: { x: 0, y: 0, z: 0 },
          inHandle: { x: (previous.x - end.x) / 6, y: (previous.y - end.y) / 6 },
          outHandle: { x: (end.x - previous.x) / 6, y: (end.y - previous.y) / 6 },
        },
        {
          id: `${id}-end`,
          position: { x: end.x - start.x, y: end.y - start.y, z: 0 },
          inHandle: { x: (start.x - next.x) / 6, y: (start.y - next.y) / 6 },
          outHandle: { x: (next.x - start.x) / 6, y: (next.y - start.y) / 6 },
        },
      ],
    };
  });
  migrated.connections = migrated.modules.map((module, index) => ({
    id: `${document.id}-connection-${index + 1}`,
    a: { moduleId: module.id, connectorId: "end" },
    b: { moduleId: migrated.modules[(index + 1) % count].id, connectorId: "start" },
  }));
  migrated.paths[0] = {
    id: "primary",
    kind: "primary-loop",
    closed: true,
    sourceModuleIds: migrated.modules.map((module) => module.id),
    traversals: migrated.modules.map((module) => ({ moduleId: module.id, traversalId: "main", reversed: false })),
  };
  const geometry = buildTrackGeometry(migrated);
  if (!geometry) throw new Error("The migrated circuit could not be compiled.");
  const startChunk = document.startFinish
    ? document.chunks.find((chunk) => chunk.id === document.startFinish?.chunkId)
    : undefined;
  const start = geometry.path.nearestPoint(startChunk ? { x: startChunk.x, y: startChunk.y } : source[0]).distanceMeters;
  migrated.markers = [{
    id: `${document.id}-start-finish`,
    type: "start-finish",
    location: { pathId: "primary", distanceMeters: start },
    configuration: {},
  }];
  migrated.grid = {
    ...migrated.grid,
    pathId: "primary",
    startMarkerId: `${document.id}-start-finish`,
    slotCount: Math.max(2, Math.min(22, document.startingGrid?.slots ?? 22)),
  };
  migrated.spectatorFrame = fitSpectatorFrame(migrated.spectatorFrame, [
    ...geometry.path.leftBoundary,
    ...geometry.path.rightBoundary,
  ]);
  return migrated;
}

/** Migrates Northstar once and removes its retired chunk-editor document only after a native save succeeds. */
export async function migrateNorthstarCircuitDocument(): Promise<string | undefined> {
  const legacy = (await listSavedCircuits()).find((document) => /northstar/i.test(document.name));
  if (!legacy) return;
  if (!await loadDocument(legacy.id)) await saveDocument(migrateLegacyCircuitDocument(legacy));
  await deleteCircuitDocument(legacy.id);
  return legacy.id;
}
