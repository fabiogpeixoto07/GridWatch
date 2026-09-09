import type { CircuitStyle } from "../tracks.js";

export const CIRCUIT_DOCUMENT_VERSION = 3 as const;
export const TRACK_CHUNK_TEMPLATE_VERSION = 1 as const;
export type ConnectorRole = "input" | "output" | "secondaryInput" | "secondaryOutput";
export type CurbMode = "none" | "left" | "right" | "both";
export type ChunkKind = "road" | "pit" | "escape" | "terminal";
export type CircuitRouteId = "main" | `pit:${string}` | `escape:${string}`;

export type CircuitConnector = {
  role: ConnectorRole;
  x: number;
  y: number;
  tangent: number;
  widthMeters: number;
};

export type CircuitGuidePoint = {
  x: number;
  y: number;
  handleIn?: { x: number; y: number };
  handleOut?: { x: number; y: number };
};

export type TrackChunkTemplateV1 = {
  version: typeof TRACK_CHUNK_TEMPLATE_VERSION;
  id: string;
  name: string;
  category: "straight" | "curve" | "chicane" | "pit" | "escape" | "custom";
  kind: ChunkKind;
  assetPath: string;
  assetSymbol?: string;
  viewBox: { width: number; height: number };
  /** Coordinate bounds used by the SVG symbol so artwork and connectors share one origin. */
  assetViewBox?: { x: number; y: number; width: number; height: number };
  widthMeters: number;
  lengthMeters: number;
  connectors: CircuitConnector[];
  guide: CircuitGuidePoint[];
  branchGuide?: CircuitGuidePoint[];
  curbEdges: { left: boolean; right: boolean };
  supportsReverse?: boolean;
  terminal?: boolean;
};

export type CircuitChunkInstance = {
  id: string;
  templateId: string;
  x: number;
  y: number;
  rotation: number;
  curbMode: CurbMode;
};

export type CircuitConnection = {
  id: string;
  from: { chunkId: string; role: "output" | "secondaryOutput" };
  to: { chunkId: string; role: "input" | "secondaryInput" };
};

export type CircuitRouteLine = {
  routeId: CircuitRouteId;
  points: CircuitGuidePoint[];
  confirmedRevision: number | null;
};

export type CircuitGridSettings = {
  anchorChunkId: string;
  anchorProgress: number;
  slots: number;
  rowSpacingMeters: number;
  lateralSpacingMeters: number;
  stagger: boolean;
};

export type CircuitPitBoxSettings = {
  anchorChunkId: string;
  anchorProgress: number;
  count: number;
  side: "left" | "right";
  spacingMeters: number;
  speedLimitKph: number;
};

export type CircuitEscapeSettings = {
  terminalChunkId: string;
  recoveryChunkId: string;
  recoveryProgress: number;
  timePenaltySeconds: number;
};

export type CircuitDocumentV3 = {
  version: typeof CIRCUIT_DOCUMENT_VERSION;
  id: string;
  name: string;
  country: string;
  style: CircuitStyle;
  world: { widthMeters: number; heightMeters: number };
  chunks: CircuitChunkInstance[];
  embeddedTemplates?: TrackChunkTemplateV1[];
  connections: CircuitConnection[];
  routes: CircuitRouteLine[];
  startFinish: { chunkId: string; progress: number } | null;
  startingGrid: CircuitGridSettings | null;
  pitBoxes: CircuitPitBoxSettings | null;
  escapes: CircuitEscapeSettings[];
  revision: number;
  updatedAt: string;
};

export type CircuitValidationIssue = {
  code: string;
  message: string;
  chunkId?: string;
  connectionId?: string;
};

export function isCircuitDocumentV3(value: unknown): value is CircuitDocumentV3 {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CircuitDocumentV3>;
  return candidate.version === CIRCUIT_DOCUMENT_VERSION
    && typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && typeof candidate.country === "string"
    && Array.isArray(candidate.chunks)
    && Array.isArray(candidate.connections)
    && Array.isArray(candidate.routes)
    && typeof candidate.revision === "number";
}

export function createEmptyCircuitDocument(id = `circuit-${Date.now()}`): CircuitDocumentV3 {
  return {
    version: CIRCUIT_DOCUMENT_VERSION,
    id,
    name: "New Circuit",
    country: "Custom",
    style: "balanced",
    world: { widthMeters: 1_000, heightMeters: 620 },
    chunks: [],
    embeddedTemplates: [],
    connections: [],
    routes: [{ routeId: "main", points: [], confirmedRevision: null }],
    startFinish: null,
    startingGrid: null,
    pitBoxes: null,
    escapes: [],
    revision: 1,
    updatedAt: new Date().toISOString(),
  };
}

export function cloneCircuitDocument(document: CircuitDocumentV3): CircuitDocumentV3 {
  return structuredClone(document);
}

export function compatibleConnection(from: ConnectorRole, to: ConnectorRole) {
  return (from === "output" || from === "secondaryOutput")
    && (to === "input" || to === "secondaryInput");
}

export function connectorKey(chunkId: string, role: ConnectorRole) {
  return `${chunkId}:${role}`;
}

export function touchCircuit(document: CircuitDocumentV3): CircuitDocumentV3 {
  return { ...document, revision: document.revision + 1, updatedAt: new Date().toISOString(), routes: document.routes.map((route) => ({ ...route, confirmedRevision: null })) };
}

export function validateCircuitDocument(document: CircuitDocumentV3, templates: ReadonlyMap<string, TrackChunkTemplateV1>): CircuitValidationIssue[] {
  const issues: CircuitValidationIssue[] = [];
  const chunkIds = new Set(document.chunks.map((chunk) => chunk.id));
  const connectionsByPort = new Map<string, CircuitConnection>();
  const templateFor = (chunk: CircuitChunkInstance) => templates.get(chunk.templateId);

  if (document.version !== CIRCUIT_DOCUMENT_VERSION) issues.push({ code: "version", message: "This circuit uses an unsupported document version." });
  if (!document.name.trim()) issues.push({ code: "name", message: "The circuit needs a name." });
  if (!document.chunks.length) issues.push({ code: "empty", message: "Add at least one track chunk." });

  for (const chunk of document.chunks) {
    const template = templateFor(chunk);
    if (!template) {
      issues.push({ code: "missing-template", message: `Chunk template ${chunk.templateId} is unavailable.`, chunkId: chunk.id });
      continue;
    }
    if (!template.connectors.some((connector) => connector.role === "input")) issues.push({ code: "missing-input", message: `${template.name} has no input connector.`, chunkId: chunk.id });
    if (!template.connectors.some((connector) => connector.role === "output")) issues.push({ code: "missing-output", message: `${template.name} has no output connector.`, chunkId: chunk.id });
    if (template.connectors.length > 4) issues.push({ code: "too-many-connectors", message: `${template.name} exposes more than four connectors.`, chunkId: chunk.id });
    if (new Set(template.connectors.map((connector) => connector.role)).size !== template.connectors.length) issues.push({ code: "duplicate-connectors", message: `${template.name} repeats a connector role.`, chunkId: chunk.id });
  }

  for (const connection of document.connections) {
    const fromKey = connectorKey(connection.from.chunkId, connection.from.role);
    const toKey = connectorKey(connection.to.chunkId, connection.to.role);
    if (!chunkIds.has(connection.from.chunkId) || !chunkIds.has(connection.to.chunkId)) issues.push({ code: "orphan-connection", message: "A connection refers to a deleted chunk.", connectionId: connection.id });
    const fromTemplate = document.chunks.find((chunk) => chunk.id === connection.from.chunkId);
    const toTemplate = document.chunks.find((chunk) => chunk.id === connection.to.chunkId);
    const fromDefinition = fromTemplate ? templateFor(fromTemplate)?.connectors.some((connector) => connector.role === connection.from.role) : false;
    const toDefinition = toTemplate ? templateFor(toTemplate)?.connectors.some((connector) => connector.role === connection.to.role) : false;
    if (!fromDefinition || !toDefinition) issues.push({ code: "missing-port", message: "A connection refers to a connector that the chunk does not provide.", connectionId: connection.id });
    if (!compatibleConnection(connection.from.role, connection.to.role)) issues.push({ code: "incompatible-ports", message: "Connections must join an output to an input.", connectionId: connection.id });
    if (connectionsByPort.has(fromKey) || connectionsByPort.has(toKey)) issues.push({ code: "duplicate-port", message: "A connector can only be used once.", connectionId: connection.id });
    connectionsByPort.set(fromKey, connection);
    connectionsByPort.set(toKey, connection);
  }

  const mainChunks = new Set<string>();
  if (document.startFinish) {
    let current = document.startFinish.chunkId;
    const visited = new Set<string>();
    let closes = false;
    for (let step = 0; step <= document.chunks.length; step += 1) {
      if (visited.has(current)) {
        closes = current === document.startFinish.chunkId;
        break;
      }
      visited.add(current);
      mainChunks.add(current);
      const connection = document.connections.find((candidate) => candidate.from.chunkId === current && candidate.from.role === "output");
      if (!connection) break;
      current = connection.to.chunkId;
    }
    if (!closes) issues.push({ code: "open-main-loop", message: "The primary racing route does not close back to the start/finish." });
  } else {
    issues.push({ code: "missing-start", message: "Place a start/finish anchor on the main route." });
  }

  for (const chunk of document.chunks) {
    const template = templateFor(chunk);
    if (!template || template.terminal) continue;
    if (!connectionsByPort.has(connectorKey(chunk.id, "input"))) issues.push({ code: "unconnected-input", message: `${template.name} has an unconnected input.`, chunkId: chunk.id });
    if (!connectionsByPort.has(connectorKey(chunk.id, "output"))) issues.push({ code: "unconnected-output", message: `${template.name} has an unconnected output.`, chunkId: chunk.id });
    const hasRouteIncoming = document.connections.some((connection) => connection.to.chunkId === chunk.id);
    if (!mainChunks.has(chunk.id) && !hasRouteIncoming) issues.push({ code: "disconnected-route", message: `${template.name} is not part of a reachable route.`, chunkId: chunk.id });
  }

  if (!document.startingGrid) issues.push({ code: "missing-grid", message: "Define the starting grid location." });
  else if (!chunkIds.has(document.startingGrid.anchorChunkId)) issues.push({ code: "invalid-grid-anchor", message: "The starting grid anchor refers to a deleted chunk." });
  if (!document.pitBoxes) issues.push({ code: "missing-pit-boxes", message: "Define the pit-box location." });
  else if (!chunkIds.has(document.pitBoxes.anchorChunkId)) issues.push({ code: "invalid-pit-anchor", message: "The pit-box anchor refers to a deleted chunk." });
  else if (templateFor(document.chunks.find((chunk) => chunk.id === document.pitBoxes?.anchorChunkId)!)?.kind !== "pit") issues.push({ code: "pit-anchor-kind", message: "Pit boxes must be anchored to a pit-lane chunk." });
  if (document.startFinish && !chunkIds.has(document.startFinish.chunkId)) issues.push({ code: "invalid-start-anchor", message: "The start/finish anchor refers to a deleted chunk." });
  else if (document.startFinish && templateFor(document.chunks.find((chunk) => chunk.id === document.startFinish?.chunkId)!)?.kind !== "road") issues.push({ code: "start-anchor-kind", message: "Start/finish must be anchored to a main-road chunk." });
  if (!document.routes.some((route) => route.routeId === "main" && route.confirmedRevision === document.revision)) issues.push({ code: "racing-line", message: "Review and confirm the main racing line." });
  if (document.pitBoxes && !document.routes.some((route) => route.routeId.startsWith("pit:") && route.confirmedRevision === document.revision)) issues.push({ code: "pit-line", message: "Review and confirm the pit racing line." });
  return [...new Map(issues.map((issue) => [`${issue.code}:${issue.chunkId ?? issue.connectionId ?? ""}`, issue])).values()];
}

export function documentToLegacyCircuit(document: CircuitDocumentV3): { id: string; name: string; country: string; style: string; points: ReadonlyArray<readonly [number, number]>; width: number; startIndex: number } {
  const points = document.routes.find((route) => route.routeId === "main")?.points ?? [];
  const normalized = points.map((point) => [point.x / document.world.widthMeters, point.y / document.world.heightMeters] as const);
  return { id: document.id, name: document.name, country: document.country, style: document.style, points: normalized, width: 1, startIndex: 0 };
}
