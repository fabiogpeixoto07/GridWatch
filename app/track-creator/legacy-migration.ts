import { fitSpectatorFrame } from "./domain/track/authoring.js";
import { createEmptyDocument } from "./domain/track/document.js";
import { buildTrackGeometry } from "./domain/track/geometry.js";
import type { TrackDocument, TrackProp } from "./domain/track/types.js";
import { saveDocument } from "./persistence.js";

const MIGRATION_KEY = "gridwatch.track-creator.legacy-migration-v1";

export type LegacyCircuitForMigration = {
  id: string;
  name: string;
  country: string;
  points: ReadonlyArray<readonly [number, number]>;
  width?: number;
  startIndex?: number;
  scenery?: Array<{ id: string; type: string; x: number; y: number; rotation: number; scale: number }>;
};

const pointFor = ([x, y]: readonly [number, number]) => ({ x: x * 1000, y: y * 620, z: 0 });

function propType(type: string): TrackProp["type"] {
  if (type === "tree" || type === "shrub") return "tree";
  if (type === "barrier") return "barrier";
  if (type === "grandstand" || type === "pits") return "grandstand";
  if (type === "lamp") return "light";
  return "sign";
}

/** Converts the prior normalized spline loops into editable, connected freeform modules. */
export function migrateLegacyCircuit(circuit: LegacyCircuitForMigration): TrackDocument {
  if (circuit.points.length < 8) throw new Error("A legacy circuit needs at least eight points.");
  const document = createEmptyDocument();
  const now = new Date().toISOString();
  document.id = circuit.id;
  document.metadata = {
    name: circuit.name || "Migrated Circuit",
    description: `Migrated from the GridWatch Circuit Editor${circuit.country ? ` · ${circuit.country}` : ""}`,
    createdAt: now,
    updatedAt: now,
  };
  const source = circuit.points.map(pointFor);
  const count = source.length;
  const width = Math.max(6, Math.min(24, (circuit.width ?? 1) * 14));
  document.modules = source.map((start, index) => {
    const previous = source[(index - 1 + count) % count];
    const end = source[(index + 1) % count];
    const next = source[(index + 2) % count];
    return {
      id: `${circuit.id}-segment-${index + 1}`,
      definitionId: "freeform-curve",
      transform: { position: start, rotation: 0 },
      parameters: { width, length: Math.hypot(end.x - start.x, end.y - start.y), offset: 0, elevationDelta: 0 },
      controlPoints: [
        {
          id: `${circuit.id}-segment-${index + 1}-start`,
          position: { x: 0, y: 0, z: 0 },
          inHandle: { x: (previous.x - end.x) / 6, y: (previous.y - end.y) / 6 },
          outHandle: { x: (end.x - previous.x) / 6, y: (end.y - previous.y) / 6 },
        },
        {
          id: `${circuit.id}-segment-${index + 1}-end`,
          position: { x: end.x - start.x, y: end.y - start.y, z: 0 },
          inHandle: { x: (start.x - next.x) / 6, y: (start.y - next.y) / 6 },
          outHandle: { x: (next.x - start.x) / 6, y: (next.y - start.y) / 6 },
        },
      ],
    };
  });
  document.connections = document.modules.map((module, index) => ({
    id: `${circuit.id}-connection-${index + 1}`,
    a: { moduleId: module.id, connectorId: "end" },
    b: { moduleId: document.modules[(index + 1) % count].id, connectorId: "start" },
  }));
  document.paths[0] = {
    id: "primary",
    kind: "primary-loop",
    closed: true,
    sourceModuleIds: document.modules.map((module) => module.id),
    traversals: document.modules.map((module) => ({ moduleId: module.id, traversalId: "main", reversed: false })),
  };
  const geometry = buildTrackGeometry(document);
  if (!geometry) throw new Error("The migrated circuit could not be compiled.");
  const startPoint = source[Math.max(0, Math.min(count - 1, circuit.startIndex ?? 0))];
  const start = geometry.path.nearestPoint(startPoint).distanceMeters;
  document.markers = [{
    id: `${circuit.id}-start-finish`,
    type: "start-finish",
    location: { pathId: "primary", distanceMeters: start },
    configuration: {},
  }];
  document.grid = { ...document.grid, pathId: "primary", startMarkerId: `${circuit.id}-start-finish`, slotCount: 22 };
  document.props = (circuit.scenery ?? []).map((item) => ({
    id: `${circuit.id}-prop-${item.id}`,
    type: propType(item.type),
    position: { x: item.x * 1000, y: item.y * 620, z: 0 },
    rotation: item.rotation,
    scale: Math.max(0.1, item.scale),
    properties: { migratedType: item.type },
  }));
  document.spectatorFrame = fitSpectatorFrame(document.spectatorFrame, [
    ...geometry.path.leftBoundary,
    ...geometry.path.rightBoundary,
  ]);
  return document;
}

export function legacyMigrationCompleted() {
  return typeof window !== "undefined" && window.localStorage.getItem(MIGRATION_KEY) === "complete";
}

export async function migrateLegacyCircuits(circuits: LegacyCircuitForMigration[]) {
  if (legacyMigrationCompleted()) return { migratedIds: new Set<string>(), complete: true };
  const migratedIds = new Set<string>();
  for (const circuit of circuits) {
    try {
      await saveDocument(migrateLegacyCircuit(circuit));
      migratedIds.add(circuit.id);
    } catch {
      // Leave failed circuits in their legacy storage and catalog for recovery/export.
    }
  }
  const complete = migratedIds.size === circuits.length;
  if (complete && typeof window !== "undefined") window.localStorage.setItem(MIGRATION_KEY, "complete");
  return { migratedIds, complete };
}
