import type { Circuit } from "../tracks.js";
import { createStorageRepository, isRecord } from "../storage.js";

export type LegacyTrackElement = {
  id: string;
  type: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
};

export type LegacyCustomCircuit = Circuit & {
  sourceId: string;
  custom: true;
  width: number;
  startIndex: number;
  scenery: LegacyTrackElement[];
};

const STORAGE_KEY = "gridwatch.custom-circuits";
const circuitRepository = createStorageRepository(STORAGE_KEY, [], isLegacyCircuitArray);

function isLegacyCircuitArray(value: unknown): value is LegacyCustomCircuit[] {
  return Array.isArray(value) && value.every((item) => isRecord(item)
    && item.custom === true
    && Array.isArray(item.points)
    && item.points.length >= 8
    && item.points.every((point) => Array.isArray(point) && point.length === 2 && point.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)))
    && typeof item.width === "number"
    && Number.isFinite(item.width)
    && Array.isArray(item.scenery)
    && item.scenery.every((element) => isRecord(element) && typeof element.id === "string" && typeof element.type === "string" && typeof element.x === "number" && typeof element.y === "number"));
}

/** Read-only compatibility access for one-time migration from the retired Circuit Editor. */
export function loadLegacyCustomCircuits(): LegacyCustomCircuit[] {
  return circuitRepository.load();
}
