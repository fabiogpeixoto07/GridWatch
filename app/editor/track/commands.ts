import type { TrackControlPoint, TrackDocumentV2, TrackMarker, TrackSurfaceZone } from "../../domain/track-document.js";

export type TrackPoint = readonly [number, number];

export type TrackCommand =
  | { type: "movePoint"; index: number; point: TrackPoint }
  | { type: "insertPoint"; index: number; point: TrackPoint }
  | { type: "removePoint"; index: number }
  | { type: "setStart"; index: number }
  | { type: "setTrackWidth"; width: number };

type TrackCommandDocument = {
  points: ReadonlyArray<TrackPoint>;
  startIndex: number;
  width: number;
};

export function applyTrackCommand<T extends TrackCommandDocument>(document: T, command: TrackCommand): T {
  if (command.type === "movePoint") return { ...document, points: document.points.map((point, index) => index === command.index ? command.point : point) };
  if (command.type === "insertPoint") return { ...document, points: [...document.points.slice(0, command.index), command.point, ...document.points.slice(command.index)] };
  if (command.type === "removePoint") {
    const points = document.points.filter((_, index) => index !== command.index);
    return { ...document, points, startIndex: Math.min(document.startIndex, Math.max(0, points.length - 1)) };
  }
  if (command.type === "setStart") return { ...document, startIndex: Math.max(0, Math.min(document.points.length - 1, command.index)) };
  return { ...document, width: command.width };
}

export type TrackDocumentCommand =
  | { type: "moveControlPoints"; ids: string[]; dx: number; dy: number }
  | { type: "insertControlPoint"; afterId: string; point: TrackControlPoint }
  | { type: "removeControlPoints"; ids: string[] }
  | { type: "setPointMode"; ids: string[]; mode: TrackControlPoint["mode"] }
  | { type: "setSegmentWidth"; ids: string[]; widthLeft: number; widthRight: number }
  | { type: "transformSelection"; ids: string[]; origin: { x: number; y: number }; rotateRadians?: number; scaleX?: number; scaleY?: number }
  | { type: "setStartIndex"; index: number }
  | { type: "setTimingSectors"; sectors: TrackMarker[] }
  | { type: "setSurfaceZones"; zones: TrackSurfaceZone[] }
  | { type: "setPitLane"; pitLane: TrackDocumentV2["pitLane"] }
  | { type: "setRunOff"; runOff: TrackDocumentV2["runOff"] }
  | { type: "setBarriers"; barriers: TrackDocumentV2["barriers"] };

export function applyTrackDocumentCommand(document: TrackDocumentV2, command: TrackDocumentCommand): TrackDocumentV2 {
  const selected = "ids" in command ? new Set(command.ids) : null;
  let controlPoints = document.controlPoints;
  if (command.type === "moveControlPoints") controlPoints = controlPoints.map((point) => selected!.has(point.id) ? { ...point, x: point.x + command.dx, y: point.y + command.dy } : point);
  if (command.type === "insertControlPoint") {
    const index = Math.max(0, controlPoints.findIndex((point) => point.id === command.afterId) + 1);
    controlPoints = [...controlPoints.slice(0, index), command.point, ...controlPoints.slice(index)];
  }
  if (command.type === "removeControlPoints") controlPoints = controlPoints.filter((point) => !selected!.has(point.id));
  if (command.type === "setPointMode") controlPoints = controlPoints.map((point) => selected!.has(point.id) ? { ...point, mode: command.mode } : point);
  if (command.type === "setSegmentWidth") controlPoints = controlPoints.map((point) => selected!.has(point.id) ? { ...point, widthLeft: Math.max(3, command.widthLeft), widthRight: Math.max(3, command.widthRight) } : point);
  if (command.type === "transformSelection") {
    const angle = command.rotateRadians ?? 0, cos = Math.cos(angle), sin = Math.sin(angle), sx = command.scaleX ?? 1, sy = command.scaleY ?? 1;
    controlPoints = controlPoints.map((point) => {
      if (!selected!.has(point.id)) return point;
      const x = (point.x - command.origin.x) * sx, y = (point.y - command.origin.y) * sy;
      return { ...point, x: command.origin.x + x * cos - y * sin, y: command.origin.y + x * sin + y * cos };
    });
  }
  const next = { ...document, controlPoints, revision: document.revision + 1 };
  if (command.type === "setStartIndex") return { ...next, startIndex: Math.max(0, Math.min(controlPoints.length - 1, command.index)) };
  if (command.type === "setTimingSectors") return { ...next, timingSectors: command.sectors, sectors: command.sectors.map((sector) => sector.progress) };
  if (command.type === "setSurfaceZones") return { ...next, surfaceZones: command.zones };
  if (command.type === "setPitLane") return { ...next, pitLane: command.pitLane };
  if (command.type === "setRunOff") return { ...next, runOff: command.runOff };
  if (command.type === "setBarriers") return { ...next, barriers: command.barriers };
  return next;
}
