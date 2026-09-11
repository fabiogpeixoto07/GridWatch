import type { TrackEdgeEnvironment } from "../track-creator/domain/track/types.js";

/** The canonical geometry contract produced by the Track Editor for racing. */
export type Vector2 = { x: number; y: number };

export type RaceSurface = "asphalt" | "concrete" | "grass" | "gravel" | "curb";

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
  surface: RaceSurface;
  grip: number;
  elevation?: number;
  grade?: number;
  moduleId?: string;
  edges?: { left: TrackEdgeEnvironment; right: TrackEdgeEnvironment };
};

export type CompiledTrack = {
  id: string;
  lengthMeters: number;
  sampleSpacingMeters: number;
  samples: CompiledTrackSample[];
  leftBoundary: Vector2[];
  rightBoundary: Vector2[];
  surfaceRibbon: Array<{ leftStart: Vector2; rightStart: Vector2; leftEnd: Vector2; rightEnd: Vector2; surface: RaceSurface; grip: number }>;
  gridSlots: Array<{ id: string; position: Vector2; heading: number; row: number; progress: number; lateralOffset: number; sampleIndex: number }>;
  sensors: Array<{ id: string; kind: "start-finish" | "sector" | "pit-entry" | "pit-exit"; position: Vector2; normal: Vector2 }>;
  colliders: Array<{ id: string; side: "left" | "right"; points: Vector2[] }>;
};
