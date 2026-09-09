import type { CircuitDocumentV3 } from "./domain/circuit-document.js";

export type CircuitStyle = "balanced" | "fast" | "flowing" | "technical" | "street";

/** Runtime compatibility projection for the new chunk-authored circuit document. */
export type Circuit = {
  id: string;
  name: string;
  country: string;
  style: CircuitStyle;
  points: ReadonlyArray<readonly [number, number]>;
  width?: number;
  startIndex?: number;
  document?: CircuitDocumentV3;
};

/** The shipped catalog is intentionally empty after the chunk-editor migration. */
export const TRACKS: Circuit[] = [];
