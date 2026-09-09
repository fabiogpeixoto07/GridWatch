import { createStorageRepository, isRecord } from "../storage.js";

export const CHAMPIONSHIP_SESSION_VERSION = 1 as const;
export const CHAMPIONSHIP_SESSION_STORAGE_KEY = "gridwatch.championship-session";

export type ChampionshipSession = {
  version: typeof CHAMPIONSHIP_SESSION_VERSION;
  seed: number;
  scheduleTrackIds: string[];
  completedRounds: number;
  categoryId: string;
  categoryRevision: string;
  totalLaps: number;
  gridSize: number;
  points: Record<string, number>;
  results: Record<string, number[]>;
  playback: {
    mode: "manual" | "auto";
    simulationSpeed: 1 | 2 | 4;
    resultDurationMs: number;
    standingsDurationMs: number;
    audioEnabled: boolean;
    pauseWhenHidden: boolean;
  };
  savedAt: string;
};

const isNumberRecord = (value: unknown): value is Record<string, number> => isRecord(value)
  && Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item));
const isResultsRecord = (value: unknown): value is Record<string, number[]> => isRecord(value)
  && Object.values(value).every((item) => Array.isArray(item) && item.every((position) => Number.isInteger(position) && position > 0));

export function isChampionshipSession(value: unknown): value is ChampionshipSession {
  if (!isRecord(value) || value.version !== CHAMPIONSHIP_SESSION_VERSION || !isRecord(value.playback)) return false;
  return Number.isInteger(value.seed)
    && Array.isArray(value.scheduleTrackIds)
    && value.scheduleTrackIds.length >= 2
    && value.scheduleTrackIds.every((id) => typeof id === "string" && id.length > 0)
    && new Set(value.scheduleTrackIds).size === value.scheduleTrackIds.length
    && Number.isInteger(value.completedRounds)
    && (value.completedRounds as number) >= 0
    && (value.completedRounds as number) <= value.scheduleTrackIds.length
    && typeof value.categoryId === "string"
    && typeof value.categoryRevision === "string"
    && Number.isInteger(value.totalLaps)
    && (value.totalLaps as number) > 0
    && Number.isInteger(value.gridSize)
    && (value.gridSize as number) > 0
    && isNumberRecord(value.points)
    && isResultsRecord(value.results)
    && (value.playback.mode === "manual" || value.playback.mode === "auto")
    && (value.playback.simulationSpeed === 1 || value.playback.simulationSpeed === 2 || value.playback.simulationSpeed === 4)
    && typeof value.playback.resultDurationMs === "number"
    && typeof value.playback.standingsDurationMs === "number"
    && typeof value.playback.audioEnabled === "boolean"
    && typeof value.playback.pauseWhenHidden === "boolean"
    && typeof value.savedAt === "string";
}

export const championshipSessionRepository = createStorageRepository<ChampionshipSession | null>(
  CHAMPIONSHIP_SESSION_STORAGE_KEY,
  null,
  (value): value is ChampionshipSession | null => value === null || isChampionshipSession(value),
  CHAMPIONSHIP_SESSION_VERSION,
);

export function createChampionshipSession(input: Omit<ChampionshipSession, "version" | "savedAt">): ChampionshipSession {
  return { ...input, version: CHAMPIONSHIP_SESSION_VERSION, savedAt: new Date().toISOString() };
}
