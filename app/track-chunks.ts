import type { TrackChunkTemplateV1 } from "./domain/circuit-document.js";

const atlas = "/assets/track-chunks.svg";
const roadWidth = 14;
const auxWidth = 8;

function straight(id: string, name: string, lengthMeters: number, kind: TrackChunkTemplateV1["kind"] = "road", category: TrackChunkTemplateV1["category"] = "straight", widthMeters = roadWidth): TrackChunkTemplateV1 {
  return {
    version: 1, id, name, kind, category, assetPath: atlas, assetSymbol: id,
    viewBox: { width: lengthMeters, height: widthMeters }, assetViewBox: { x: 0, y: 0, width: lengthMeters, height: widthMeters }, widthMeters, lengthMeters,
    connectors: [
      { role: "input", x: 0, y: 0, tangent: 0, widthMeters },
      { role: "output", x: lengthMeters, y: 0, tangent: 0, widthMeters },
    ],
    guide: [{ x: 0, y: 0 }, { x: lengthMeters, y: 0 }],
    curbEdges: { left: true, right: true }, supportsReverse: true,
  };
}

function quarterCurve(id: string, name: string, direction: "left" | "right", radius: number, kind: TrackChunkTemplateV1["kind"] = "road", category: TrackChunkTemplateV1["category"] = "curve", widthMeters = roadWidth): TrackChunkTemplateV1 {
  const sign = direction === "right" ? 1 : -1;
  const y = sign * radius;
  return {
    version: 1, id, name, kind, category, assetPath: atlas, assetSymbol: id,
    viewBox: { width: radius, height: radius }, assetViewBox: { x: 0, y: sign < 0 ? -radius : 0, width: radius, height: radius }, widthMeters, lengthMeters: Math.round(Math.PI * radius / 2),
    connectors: [
      { role: "input", x: 0, y: 0, tangent: 0, widthMeters },
      { role: "output", x: radius, y, tangent: sign * Math.PI / 2, widthMeters },
    ],
    guide: [{ x: 0, y: 0 }, { x: radius * 0.3, y: sign * radius * 0.05 }, { x: radius * 0.7, y: sign * radius * 0.3 }, { x: radius, y }],
    curbEdges: { left: true, right: true }, supportsReverse: true,
  };
}

function hairpin(id: string, name: string, direction: "left" | "right", radius: number): TrackChunkTemplateV1 {
  const sign = direction === "right" ? 1 : -1;
  return {
    version: 1, id, name, kind: "road", category: "curve", assetPath: atlas, assetSymbol: id,
    viewBox: { width: radius * 2, height: radius * 2 }, assetViewBox: { x: 0, y: -radius, width: radius * 2, height: radius * 2 }, widthMeters: roadWidth, lengthMeters: Math.round(Math.PI * radius),
    connectors: [
      { role: "input", x: 0, y: 0, tangent: 0, widthMeters: roadWidth },
      { role: "output", x: radius * 2, y: 0, tangent: sign * Math.PI, widthMeters: roadWidth },
    ],
    guide: [{ x: 0, y: 0 }, { x: radius * 0.5, y: sign * radius * 0.72 }, { x: radius * 1.5, y: sign * radius * 0.72 }, { x: radius * 2, y: 0 }],
    curbEdges: { left: true, right: true }, supportsReverse: true,
  };
}

function chicane(id: string, name: string, direction: "left-right" | "right-left"): TrackChunkTemplateV1 {
  const sign = direction === "right-left" ? 1 : -1;
  return {
    version: 1, id, name, kind: "road", category: "chicane", assetPath: atlas, assetSymbol: id,
    viewBox: { width: 120, height: 60 }, assetViewBox: { x: 0, y: -30, width: 120, height: 60 }, widthMeters: roadWidth, lengthMeters: 120,
    connectors: [
      { role: "input", x: 0, y: 0, tangent: 0, widthMeters: roadWidth },
      { role: "output", x: 120, y: 0, tangent: 0, widthMeters: roadWidth },
    ],
    guide: [{ x: 0, y: 0 }, { x: 35, y: 0 }, { x: 28, y: sign * 30 }, { x: 60, y: sign * 30 }, { x: 85, y: 0 }, { x: 120, y: 0 }],
    curbEdges: { left: true, right: true }, supportsReverse: true,
  };
}

function branch(id: string, name: string, kind: "pit" | "escape", widthMeters = auxWidth): TrackChunkTemplateV1 {
  const terminal = kind === "escape" && id.includes("terminal");
  const connectors = terminal
    ? [{ role: "input" as const, x: 0, y: 0, tangent: 0, widthMeters }, { role: "output" as const, x: 70, y: 0, tangent: Math.PI, widthMeters }]
    : [
      { role: "input" as const, x: 0, y: 0, tangent: 0, widthMeters },
      { role: "output" as const, x: 70, y: 0, tangent: 0, widthMeters },
      ...(id.includes("entry") && id !== "escape-entry" ? [{ role: "secondaryOutput" as const, x: 28, y: 0, tangent: Math.PI / 2, widthMeters }] : []),
      ...(id.includes("exit") ? [{ role: "secondaryInput" as const, x: 28, y: 0, tangent: Math.PI / 2, widthMeters }] : []),
      ...(id === "escape-entry" ? [{ role: "secondaryOutput" as const, x: 28, y: 0, tangent: Math.PI / 2, widthMeters }, { role: "secondaryInput" as const, x: 28, y: 0, tangent: -Math.PI / 2, widthMeters }] : []),
    ];
  return {
    version: 1, id, name, kind, category: kind, assetPath: atlas, assetSymbol: id,
    viewBox: { width: 70, height: widthMeters }, assetViewBox: { x: 0, y: 0, width: 70, height: widthMeters }, widthMeters, lengthMeters: 70,
    connectors,
    guide: [{ x: 0, y: 0 }, { x: 70, y: 0 }],
    curbEdges: { left: false, right: false }, supportsReverse: kind === "escape", terminal,
  };
}

export const TRACK_CHUNK_TEMPLATES: TrackChunkTemplateV1[] = [
  straight("straight-short", "Short straight", 50),
  straight("straight-medium", "Medium straight", 100),
  straight("straight-long", "Long straight", 200),
  quarterCurve("curve-30-left", "30° left", "left", 80),
  quarterCurve("curve-30-right", "30° right", "right", 80),
  quarterCurve("curve-45-left", "45° left", "left", 70),
  quarterCurve("curve-45-right", "45° right", "right", 70),
  quarterCurve("curve-90-left", "90° left", "left", 60),
  quarterCurve("curve-90-right", "90° right", "right", 60),
  hairpin("curve-hairpin-left", "Hairpin left", "left", 30),
  hairpin("curve-hairpin-right", "Hairpin right", "right", 30),
  chicane("chicane-left-right", "Chicane left / right", "left-right"),
  chicane("chicane-right-left", "Chicane right / left", "right-left"),
  branch("pit-entry-left", "Pit entry left", "pit"),
  branch("pit-entry-right", "Pit entry right", "pit"),
  branch("pit-exit-left", "Pit exit left", "pit"),
  branch("pit-exit-right", "Pit exit right", "pit"),
  straight("pit-straight", "Pit lane straight", 80, "pit", "pit", auxWidth),
  straight("pit-box-lane", "Pit box lane", 70, "pit", "pit", auxWidth),
  branch("escape-entry", "Escape entry / return", "escape"),
  straight("escape-straight", "Escape straight", 60, "escape", "escape", auxWidth),
  quarterCurve("escape-curve-left", "Escape curve left", "left", 35, "escape", "escape", auxWidth),
  quarterCurve("escape-curve-right", "Escape curve right", "right", 35, "escape", "escape", auxWidth),
  branch("escape-terminal", "Escape turnaround", "escape"),
];

export const TRACK_CHUNK_TEMPLATE_MAP = new Map(TRACK_CHUNK_TEMPLATES.map((template) => [template.id, template]));

export function chunkTemplatesByCategory() {
  return TRACK_CHUNK_TEMPLATES.reduce<Record<string, TrackChunkTemplateV1[]>>((groups, template) => {
    (groups[template.category] ??= []).push(template);
    return groups;
  }, {});
}
