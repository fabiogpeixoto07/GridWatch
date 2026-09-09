"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Circuit, CircuitStyle } from "./tracks";
import { Brand } from "./ui/brand";
import { chunkTemplatesByCategory, TRACK_CHUNK_TEMPLATE_MAP } from "./track-chunks";
import { createStorageRepository, isRecord } from "./storage";
import { UI_COPY } from "./ui-copy";
import { compileCircuitDocument, validateCompiledCircuit } from "./simulation/circuit-compiler";
import {
  cloneCircuitDocument,
  compatibleConnection,
  createEmptyCircuitDocument,
  touchCircuit,
  validateCircuitDocument,
  type CircuitChunkInstance,
  type CircuitConnector,
  type CircuitDocumentV3,
  type CircuitGuidePoint,
  type CircuitRouteLine,
  type ConnectorRole,
  type CurbMode,
  type TrackChunkTemplateV1,
} from "./domain/circuit-document";
import { clearLegacyCircuitStorage, listImportedChunks, listSavedCircuits, saveCircuitDocument, saveImportedChunk, type StoredCircuitChunk } from "./domain/circuit-repository";

export type EditableCircuit = Circuit & { sourceId: string; custom: true; document: CircuitDocumentV3 };

const VIEWBOX_WIDTH = 1_000;
const VIEWBOX_HEIGHT = 620;
const categoryLabels: Record<string, string> = { straight: "STRAIGHTS", curve: "CURVES", chicane: "CHICANES", pit: "PIT LANE", escape: "ESCAPE", custom: "IMPORTED" };

// Kept as a read-only compatibility boundary while old localStorage data is migrated
// into the clean IndexedDB circuit store. No editor path reads or writes this repository.
const STORAGE_KEY = "gridwatch.custom-circuits";
const isCircuitArray = (value: unknown): value is EditableCircuit[] => Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.id === "string");
const retiredCircuitRepository = createStorageRepository(STORAGE_KEY, [], isCircuitArray);
void retiredCircuitRepository;

function normalizePoint(point: { x: number; y: number }): readonly [number, number] {
  return [Math.max(0.02, Math.min(0.98, point.x / VIEWBOX_WIDTH)), Math.max(0.03, Math.min(0.97, point.y / VIEWBOX_HEIGHT))];
}

function projection(document: CircuitDocumentV3): ReadonlyArray<readonly [number, number]> {
  const main = document.routes.find((route) => route.routeId === "main")?.points ?? [];
  if (main.length >= 4) return main.map(normalizePoint);
  return document.chunks.map((chunk) => [chunk.x / VIEWBOX_WIDTH, chunk.y / VIEWBOX_HEIGHT] as const);
}

function editableFromDocument(document: CircuitDocumentV3): EditableCircuit {
  return { id: document.id, sourceId: document.id, custom: true, name: document.name, country: document.country, style: document.style, points: projection(document), document };
}

export function createEditableCircuit(track?: Circuit): EditableCircuit {
  if (track?.document) return editableFromDocument(cloneCircuitDocument(track.document));
  const document = createEmptyCircuitDocument(track?.id ? `custom-${track.id}` : undefined);
  if (track) {
    document.name = track.name;
    document.country = track.country;
    document.style = track.style;
  }
  return editableFromDocument(document);
}

export function loadCustomCircuits(): EditableCircuit[] {
  // The old synchronous localStorage catalog is deliberately retired. The game
  // hydrates IndexedDB circuits asynchronously through loadSavedCircuits().
  return [];
}

export async function loadSavedCircuits(): Promise<EditableCircuit[]> {
  return (await listSavedCircuits()).map(editableFromDocument);
}

function safeSvg(source: string) {
  return /<svg[\s>]/i.test(source)
    && !/<script|<foreignObject|\son\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:|javascript:)|url\(|@import/i.test(source);
}

function pathFor(points: ReadonlyArray<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  const commands = points.slice(1).map((point, index) => {
    const previous = points[index];
    const control = { x: previous.x + (point.x - previous.x) * 0.45, y: previous.y + (point.y - previous.y) * 0.45 };
    return cubicCommand(control.x, control.y, point.x, point.y);
  });
  return `M ${points[0].x},${points[0].y} ${commands.join(" ")}`;
}

function cubicCommand(controlX: number, controlY: number, pointX: number, pointY: number) {
  return `C ${controlX},${controlY} ${controlX},${controlY} ${pointX},${pointY}`;
}

function transformConnector(chunk: CircuitChunkInstance, connector: CircuitConnector) {
  const cos = Math.cos(chunk.rotation);
  const sin = Math.sin(chunk.rotation);
  return { x: chunk.x + connector.x * cos - connector.y * sin, y: chunk.y + connector.x * sin + connector.y * cos, tangent: connector.tangent + chunk.rotation };
}

function transformedGuide(chunk: CircuitChunkInstance, guide: CircuitGuidePoint[]) {
  const cos = Math.cos(chunk.rotation);
  const sin = Math.sin(chunk.rotation);
  return guide.map((point) => ({ x: chunk.x + point.x * cos - point.y * sin, y: chunk.y + point.x * sin + point.y * cos }));
}

function routeFromMain(document: CircuitDocumentV3, templates: ReadonlyMap<string, TrackChunkTemplateV1>): CircuitGuidePoint[] {
  if (!document.chunks.length) return [];
  const start = document.startFinish?.chunkId ?? document.chunks[0].id;
  const ordered: CircuitChunkInstance[] = [];
  let current = start;
  const visited = new Set<string>();
  while (!visited.has(current) && ordered.length <= document.chunks.length) {
    const chunk = document.chunks.find((item) => item.id === current);
    if (!chunk) break;
    visited.add(current);
    ordered.push(chunk);
    const next = document.connections.find((connection) => connection.from.chunkId === current && connection.from.role === "output");
    if (!next) break;
    current = next.to.chunkId;
  }
  const points: CircuitGuidePoint[] = [];
  ordered.forEach((chunk) => {
    const template = templates.get(chunk.templateId);
    if (!template) return;
    points.push(...transformedGuide(chunk, template.guide));
  });
  return points;
}

function routeFromKind(document: CircuitDocumentV3, templates: ReadonlyMap<string, TrackChunkTemplateV1>, kind: "pit" | "escape") {
  const points: CircuitGuidePoint[] = [];
  const candidates = document.chunks.filter((chunk) => templates.get(chunk.templateId)?.kind === kind);
  const starts = candidates.filter((chunk) => document.connections.some((connection) => connection.from.chunkId === chunk.id && connection.from.role === "secondaryOutput"));
  const ordered: CircuitChunkInstance[] = [];
  let current: CircuitChunkInstance | undefined = starts[0] ?? candidates[0];
  const visited = new Set<string>();
  while (current && !visited.has(current.id) && ordered.length <= candidates.length) {
    const active = current;
    visited.add(active.id);
    ordered.push(active);
    const next = document.connections.find((connection) => {
      if (connection.from.chunkId !== active.id) return false;
      if (connection.from.role !== "secondaryOutput" && connection.from.role !== "output") return false;
      return candidates.some((candidate) => candidate.id === connection.to.chunkId);
    });
    current = next ? candidates.find((candidate) => candidate.id === next.to.chunkId) : undefined;
  }
  (ordered.length ? ordered : candidates).forEach((chunk) => {
    const template = templates.get(chunk.templateId);
    if (template) points.push(...transformedGuide(chunk, template.guide));
  });
  return points;
}

function updated(document: CircuitDocumentV3, mutate: (next: CircuitDocumentV3) => CircuitDocumentV3) {
  return touchCircuit(mutate(cloneCircuitDocument(document)));
}

export function TrackEditor({ tracks: _tracks = [], onSave, onBack }: { tracks?: Circuit[]; onSave: (circuit: EditableCircuit) => void; onBack: () => void }) {
  void _tracks;
  const [document, setDocument] = useState<CircuitDocumentV3>(() => createEmptyCircuitDocument());
  const [savedCircuits, setSavedCircuits] = useState<EditableCircuit[]>([]);
  const [customTemplates, setCustomTemplates] = useState<TrackChunkTemplateV1[]>([]);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState("straight-medium");
  const [selectedPort, setSelectedPort] = useState<{ chunkId: string; role: ConnectorRole } | null>(null);
  const [mode, setMode] = useState<"layout" | "line" | "facilities" | "preview">("layout");
  const [zoom, setZoom] = useState(1);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [drag, setDrag] = useState<{ chunkId: string; originX: number; originY: number } | null>(null);
  const [selectedLinePoint, setSelectedLinePoint] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragOriginRef = useRef<CircuitDocumentV3 | null>(null);
  const selectedPortRef = useRef<{ chunkId: string; role: ConnectorRole } | null>(null);
  const connectPortsRef = useRef<(target: { chunkId: string; role: ConnectorRole }) => void>(() => undefined);
  const templates = useMemo(() => new Map([...TRACK_CHUNK_TEMPLATE_MAP.entries(), ...customTemplates.map((template) => [template.id, template] as const)]), [customTemplates]);
  const grouped = useMemo(() => {
    const groups = chunkTemplatesByCategory();
    customTemplates.forEach((template) => { (groups.custom ??= []).push(template); });
    return groups;
  }, [customTemplates]);
  const issues = useMemo(() => validateCircuitDocument(document, templates), [document, templates]);
  const compiledCircuit = useMemo(() => compileCircuitDocument(document, templates), [document, templates]);
  const compiledIssues = useMemo(() => validateCompiledCircuit(compiledCircuit), [compiledCircuit]);
  const trackMetrics = useMemo(() => {
    const nonZeroCurvature = compiledCircuit.main.samples.map((sample, index) => {
      const previous = compiledCircuit.main.samples[(index - 1 + compiledCircuit.main.samples.length) % compiledCircuit.main.samples.length];
      return Math.abs(Math.atan2(sample.tangent.x * previous.tangent.y - sample.tangent.y * previous.tangent.x, sample.tangent.x * previous.tangent.x + sample.tangent.y * previous.tangent.y));
    });
    return { lengthMeters: compiledCircuit.main.lengthMeters, sharpestCornerDegrees: Math.max(0, ...nonZeroCurvature) * 180 / Math.PI, compiledIssues };
  }, [compiledCircuit, compiledIssues]);
  const selectedChunk = document.chunks.find((chunk) => chunk.id === selectedChunkId) ?? null;

  useEffect(() => {
    clearLegacyCircuitStorage();
    void Promise.all([loadSavedCircuits(), listImportedChunks()]).then(([circuits, imported]) => {
      setSavedCircuits(circuits);
      setCustomTemplates(imported.map((template) => ({ ...template, assetPath: template.svgText ? `data:image/svg+xml,${encodeURIComponent(template.svgText)}` : template.assetPath })));
      const embedded = circuits.flatMap((circuit) => circuit.document.embeddedTemplates ?? []);
      setCustomTemplates((current) => [...current, ...embedded.filter((template) => !current.some((item) => item.id === template.id))]);
    });
  }, []);

  const worldPoint = useCallback((event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    let raw = { x: VIEWBOX_WIDTH / 2, y: VIEWBOX_HEIGHT / 2 };
    if (svg) {
      const screenMatrix = svg.getScreenCTM();
      if (screenMatrix) {
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const transformed = point.matrixTransform(screenMatrix.inverse());
        raw = { x: transformed.x, y: transformed.y };
      } else {
        const rect = svg.getBoundingClientRect();
        raw = { x: ((event.clientX - rect.left) / rect.width) * VIEWBOX_WIDTH, y: ((event.clientY - rect.top) / rect.height) * VIEWBOX_HEIGHT };
      }
    }
    if (!snapToGrid) return raw;
    const grid = 10;
    return { x: Math.round(raw.x / grid) * grid, y: Math.round(raw.y / grid) * grid };
  }, [snapToGrid]);

  const addChunk = (templateId: string, position = { x: 500, y: 310 }) => {
    const template = templates.get(templateId);
    if (!template) return;
    const chunk: CircuitChunkInstance = { id: `${templateId}-${Date.now()}-${Math.round(Math.random() * 1000)}`, templateId, x: position.x, y: position.y, rotation: 0, curbMode: template.curbEdges.left && template.curbEdges.right ? "both" : "none" };
    setDocument((current) => updated(current, (next) => ({ ...next, chunks: [...next.chunks, chunk] })));
    setSelectedChunkId(chunk.id);
    setSelectedTemplateId(templateId);
    setDirty(true);
  };

  const connectPorts = useCallback((target: { chunkId: string; role: ConnectorRole }) => {
    if (!selectedPort || selectedPort.chunkId === target.chunkId || !compatibleConnection(selectedPort.role, target.role)) {
      setMessage("Select an output and a compatible input connector.");
      return;
    }
    const connection = { id: `connection-${document.revision}-${document.connections.length}-${selectedPort.chunkId}-${target.chunkId}`, from: selectedPort, to: target } as CircuitDocumentV3["connections"][number];
    setDocument((current) => updated(current, (next) => {
      const fromChunk = next.chunks.find((chunk) => chunk.id === connection.from.chunkId);
      const toChunk = next.chunks.find((chunk) => chunk.id === connection.to.chunkId);
      const fromTemplate = fromChunk ? templates.get(fromChunk.templateId) : undefined;
      const toTemplate = toChunk ? templates.get(toChunk.templateId) : undefined;
      if (!fromChunk || !toChunk || !fromTemplate || !toTemplate) return next;
      const fromConnector = fromTemplate.connectors.find((item) => item.role === connection.from.role);
      const toConnector = toTemplate.connectors.find((item) => item.role === connection.to.role);
      if (!fromConnector || !toConnector) return next;
      const fromWorld = transformConnector(fromChunk, fromConnector);
      const rotation = fromWorld.tangent + Math.PI - toConnector.tangent;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      const targetOffset = { x: toConnector.x * cos - toConnector.y * sin, y: toConnector.x * sin + toConnector.y * cos };
      const snappedTarget = { ...toChunk, rotation, x: fromWorld.x - targetOffset.x, y: fromWorld.y - targetOffset.y };
      return { ...next, chunks: next.chunks.map((chunk) => chunk.id === toChunk.id ? snappedTarget : chunk), connections: [...next.connections.filter((item) => item.from.chunkId !== connection.from.chunkId || item.from.role !== connection.from.role).filter((item) => item.to.chunkId !== connection.to.chunkId || item.to.role !== connection.to.role), connection] };
    }));
    setSelectedPort(null);
    setDirty(true);
    setMessage("Track pieces connected.");
  }, [document, selectedPort, templates]);

  useEffect(() => {
    selectedPortRef.current = selectedPort;
    connectPortsRef.current = connectPorts;
  }, [connectPorts, selectedPort]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onPointerUp = (event: PointerEvent) => {
      const source = selectedPortRef.current;
      if (!source) return;
      const point = worldPoint(event);
      let nearest: { chunkId: string; role: ConnectorRole } | null = null;
      let nearestDistance = 28;
      for (const chunk of document.chunks) {
        const template = templates.get(chunk.templateId);
        if (!template) continue;
        for (const connector of template.connectors) {
          const world = transformConnector(chunk, connector);
          const distance = Math.hypot(world.x - point.x, world.y - point.y);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = { chunkId: chunk.id, role: connector.role };
          }
        }
      }
      if (nearest) connectPortsRef.current(nearest);
    };
    svg.addEventListener("pointerup", onPointerUp);
    return () => svg.removeEventListener("pointerup", onPointerUp);
  }, [document.chunks, templates, worldPoint]);

  const moveSelected = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const point = worldPoint(event);
    setDocument((current) => ({ ...current, chunks: current.chunks.map((chunk) => chunk.id === drag.chunkId ? { ...chunk, x: drag.originX + point.x, y: drag.originY + point.y } : chunk) }));
    setDirty(true);
  };

  const duplicateSelectedPoint = () => {
    if (selectedLinePoint === null) return;
    setDocument((current) => updated(current, (next) => ({ ...next, routes: next.routes.map((route) => {
      if (route.routeId !== "main" || !route.points[selectedLinePoint]) return route;
      const source = route.points[selectedLinePoint];
      const nextPoint = route.points[selectedLinePoint + 1] ?? route.points[selectedLinePoint];
      const copy = { x: source.x + (nextPoint.x - source.x) * .08, y: source.y + (nextPoint.y - source.y) * .08 };
      return { ...route, points: [...route.points.slice(0, selectedLinePoint + 1), copy, ...route.points.slice(selectedLinePoint + 1)], confirmedRevision: null };
    }) })));
    setSelectedLinePoint((value) => value === null ? null : value + 1);
    setDirty(true);
  };

  const generateLine = () => {
    const points = routeFromMain(document, templates);
    const pitPoints = routeFromKind(document, templates, "pit");
    const escapePoints = routeFromKind(document, templates, "escape");
    setDocument((current) => updated(current, (next) => ({ ...next, routes: [
      { routeId: "main", points, confirmedRevision: null },
      ...(pitPoints.length ? [{ routeId: "pit:main", points: pitPoints, confirmedRevision: null } as CircuitRouteLine] : []),
      ...(escapePoints.length ? [{ routeId: "escape:main", points: escapePoints, confirmedRevision: null } as CircuitRouteLine] : []),
    ] })));
    setMode("line");
    setDirty(true);
    setMessage(points.length >= 4 ? "Draft racing line generated. Edit it, then confirm it." : "Connect the main loop before generating a racing line.");
  };

  const confirmLine = () => {
    setDocument((current) => ({ ...current, routes: current.routes.map((route) => route.points.length >= 2 ? { ...route, confirmedRevision: current.revision } : route) }));
    setDirty(true);
    setMessage("Main racing line confirmed.");
  };

  const configureFacilities = () => {
    const first = document.chunks[0];
    const pit = document.chunks.find((chunk) => templates.get(chunk.templateId)?.kind === "pit");
    if (!first) return;
    setDocument((current) => updated(current, (next) => ({ ...next, startFinish: { chunkId: first.id, progress: 0 }, startingGrid: { anchorChunkId: first.id, anchorProgress: 0, slots: 22, rowSpacingMeters: 8.5, lateralSpacingMeters: 2.2, stagger: true }, pitBoxes: pit ? { anchorChunkId: pit.id, anchorProgress: 0, count: 12, side: "right", spacingMeters: 8, speedLimitKph: 80 } : next.pitBoxes })));
    setDirty(true);
    setMessage(pit ? "Starting grid and pit boxes placed. Adjust them in the inspector." : "Starting grid placed. Add a pit-entry chunk before defining pit boxes.");
  };

  const save = async () => {
    if (issues.length) { setMessage("Resolve the validation issues before saving."); return; }
    try {
      const persistedDocument = { ...document, embeddedTemplates: customTemplates.filter((template) => template.category === "custom") };
      await saveCircuitDocument(persistedDocument);
      const saved = editableFromDocument(persistedDocument);
      setSavedCircuits((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      onSave(saved);
      setDirty(false);
      setMessage("Circuit saved locally.");
    } catch {
      setMessage("Could not save this circuit in browser storage.");
    }
  };

  const leaveEditor = () => {
    if (dirty && typeof window !== "undefined" && !window.confirm(UI_COPY.editor.discardChanges)) return;
    onBack();
  };

  const importSvg = async (file: File) => {
    if (file.size > 2_000_000) { setMessage("SVG files must be 2 MB or smaller."); return; }
    const source = await file.text();
    if (!safeSvg(source)) { setMessage("This SVG contains unsupported or unsafe content."); return; }
    const id = `custom-${Date.now()}`;
    const symbolSource = source
      .replace(/<svg\b([^>]*)>/i, `<svg$1><symbol id="${id}">`)
      .replace(/<\/svg>\s*$/i, "</symbol></svg>");
    const imported: StoredCircuitChunk = {
      version: 1, id, name: file.name.replace(/\.svg$/i, "") || "Imported chunk", category: "custom", kind: "road", assetPath: `data:image/svg+xml,${encodeURIComponent(symbolSource)}`, assetSymbol: id, viewBox: { width: 100, height: 14 }, widthMeters: 14, lengthMeters: 100,
      connectors: [{ role: "input", x: 0, y: 0, tangent: 0, widthMeters: 14 }, { role: "output", x: 100, y: 0, tangent: 0, widthMeters: 14 }], guide: [{ x: 0, y: 0 }, { x: 100, y: 0 }], curbEdges: { left: false, right: false }, supportsReverse: true, svgText: symbolSource, updatedAt: new Date().toISOString(),
    };
    await saveImportedChunk(imported);
    setCustomTemplates((current) => [...current, imported]);
    setSelectedTemplateId(imported.id);
    setMessage("SVG imported as a reusable straight chunk. Connector calibration can be refined from the inspector.");
  };

  const removeSelected = () => {
    if (!selectedChunkId) return;
    setDocument((current) => updated(current, (next) => ({ ...next, chunks: next.chunks.filter((chunk) => chunk.id !== selectedChunkId), connections: next.connections.filter((connection) => connection.from.chunkId !== selectedChunkId && connection.to.chunkId !== selectedChunkId) })));
    setSelectedChunkId(null);
    setDirty(true);
  };

  const updateCustomConnector = (role: ConnectorRole, field: "x" | "y" | "tangent", value: number) => {
    if (!selectedChunk || templates.get(selectedChunk.templateId)?.category !== "custom") return;
    setCustomTemplates((current) => current.map((template) => template.id === selectedChunk.templateId ? { ...template, connectors: template.connectors.map((connector) => connector.role === role ? { ...connector, [field]: value } : connector) } : template));
    setDocument((current) => touchCircuit(current));
    setDirty(true);
  };

  return <main className="track-editor-shell chunk-editor-shell">
    <header className="editor-topbar"><Brand className="brand" /><div><span className="editor-kicker">CIRCUIT CREATOR</span><strong>CIRCUIT EDITOR</strong></div><div className="editor-top-actions"><button onClick={leaveEditor}>← BACK</button><button className="editor-save" onClick={() => void save()} disabled={Boolean(issues.length)}>SAVE</button></div></header>
    <div className="editor-layout">
      <aside className="editor-sidebar circuit-library"><span className="editor-label">CIRCUITS</span><button className="chunk-new-button" onClick={() => { setDocument(createEmptyCircuitDocument()); setDirty(true); setSelectedChunkId(null); }}>＋ NEW CIRCUIT</button><div className="circuit-list">{savedCircuits.map((circuit) => <button key={circuit.id} className={document.id === circuit.id ? "active" : ""} onClick={() => { setDocument(cloneCircuitDocument(circuit.document)); setDirty(false); }}>{circuit.name}<small>{circuit.country}</small></button>)}</div><span className="editor-label chunk-palette-label">TRACK CHUNKS</span>{Object.entries(grouped).map(([category, items]) => <div className="chunk-group" key={category}><strong>{categoryLabels[category] ?? category.toUpperCase()}</strong>{items.map((template) => <button key={template.id} draggable onDragStart={(event) => event.dataTransfer.setData("application/x-gridwatch-chunk", template.id)} onClick={() => { setSelectedTemplateId(template.id); setMessage("Drag this chunk onto the canvas, or click the canvas to place it."); }} className={selectedTemplateId === template.id ? "active" : ""}>{template.name}<small>{template.lengthMeters} m · {template.widthMeters} m</small></button>)}</div>)}<label className="chunk-import"><span>IMPORT SVG CHUNK</span><input type="file" accept="image/svg+xml,.svg" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSvg(file); event.currentTarget.value = ""; }} /></label></aside>
      <section className="editor-workspace"><div className="editor-toolbar" role="toolbar" aria-label="Circuit editor modes"><button className={mode === "layout" ? "active" : ""} onClick={() => setMode("layout")}>LAYOUT</button><button className={mode === "line" ? "active" : ""} onClick={() => setMode("line")}>RACING LINE</button><button className={mode === "facilities" ? "active" : ""} onClick={() => setMode("facilities")}>FACILITIES</button><button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>PREVIEW</button><span className="toolbar-spacer" /><button onClick={generateLine}>GENERATE LINE</button><button onClick={confirmLine} disabled={mode !== "line"}>CONFIRM LINE</button><button onClick={() => { const first = document.chunks[0]; setDocument((current) => updated(current, (next) => ({ ...next, startFinish: first ? { chunkId: first.id, progress: 0 } : null }))); setDirty(true); }}>SET START / FINISH</button><button onClick={configureFacilities}>PLACE GRID + BOXES</button><button className={snapToGrid ? "active" : ""} onClick={() => setSnapToGrid((value) => !value)}>SNAP TO GRID</button><button onClick={duplicateSelectedPoint} disabled={selectedLinePoint === null}>DUPLICATE POINT</button><button onClick={() => setZoom((value) => Math.min(2, value + .1))}>＋</button><button onClick={() => setZoom((value) => Math.max(.6, value - .1))}>−</button><button onClick={() => setZoom(1)}>FIT</button></div><div className="editor-shortcuts">Drag chunks onto the map · Connect matching ports · Layout is stored in world coordinates · Ctrl/Cmd+S saves</div><div className="editor-canvas-wrap" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData("application/x-gridwatch-chunk") || selectedTemplateId; addChunk(id, worldPoint(event)); }}><svg ref={svgRef} className="editor-canvas" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }} onPointerMove={moveSelected} onPointerUp={() => { if (drag) { setDocument((current) => touchCircuit(current)); setDrag(null); } }} onPointerCancel={() => setDrag(null)} onPointerDown={(event) => { if (mode === "layout" && event.target === event.currentTarget) addChunk(selectedTemplateId, worldPoint(event)); if (mode === "line") { const point = worldPoint(event); setDocument((current) => updated(current, (next) => ({ ...next, routes: next.routes.map((route) => route.routeId === "main" ? { ...route, points: [...route.points, point], confirmedRevision: null } : route) }))); setDirty(true); } }} role="application" aria-label="Circuit layout editor"><rect width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT} fill="#cbdcbf" />{document.routes.find((route) => route.routeId === "main")?.points.length ? <path d={pathFor(document.routes.find((route) => route.routeId === "main")!.points)} fill="none" stroke="#1769ff" strokeWidth="4" strokeDasharray="10 8" /> : null}{document.connections.map((connection) => { const fromChunk = document.chunks.find((chunk) => chunk.id === connection.from.chunkId); const toChunk = document.chunks.find((chunk) => chunk.id === connection.to.chunkId); const fromTemplate = fromChunk ? templates.get(fromChunk.templateId) : undefined; const toTemplate = toChunk ? templates.get(toChunk.templateId) : undefined; const fromConnector = fromTemplate?.connectors.find((connector) => connector.role === connection.from.role); const toConnector = toTemplate?.connectors.find((connector) => connector.role === connection.to.role); if (!fromChunk || !toChunk || !fromConnector || !toConnector) return null; const fromWorld = transformConnector(fromChunk, fromConnector); const toWorld = transformConnector(toChunk, toConnector); return <line key={connection.id} x1={fromWorld.x} y1={fromWorld.y} x2={toWorld.x} y2={toWorld.y} stroke="#f59e0b" strokeWidth="3" strokeDasharray="6 5" opacity=".85" />; })}{document.chunks.map((chunk) => { const template = templates.get(chunk.templateId); if (!template) return null; return <g key={chunk.id} transform={`translate(${chunk.x} ${chunk.y}) rotate(${chunk.rotation * 180 / Math.PI})`} className={selectedChunkId === chunk.id ? "chunk-instance selected" : "chunk-instance"} onPointerDown={(event) => { event.stopPropagation(); setSelectedChunkId(chunk.id); if (mode === "layout") { const point = worldPoint(event); dragOriginRef.current = cloneCircuitDocument(document); setDrag({ chunkId: chunk.id, originX: chunk.x - point.x, originY: chunk.y - point.y }); svgRef.current?.setPointerCapture(event.pointerId); } }}><rect x={0} y={-template.viewBox.height / 2} width={template.viewBox.width} height={template.viewBox.height} fill="transparent" pointerEvents="all" /><svg x={template.assetViewBox?.x ?? 0} y={template.assetViewBox?.y ?? -template.viewBox.height / 2} width={template.assetViewBox?.width ?? template.viewBox.width} height={template.assetViewBox?.height ?? template.viewBox.height} viewBox={`${template.assetViewBox?.x ?? Math.min(...template.guide.map((point) => point.x), 0)} ${template.assetViewBox?.y ?? Math.min(...template.guide.map((point) => point.y), -template.viewBox.height / 2)} ${template.assetViewBox?.width ?? template.viewBox.width} ${template.assetViewBox?.height ?? template.viewBox.height}`} preserveAspectRatio="none"><use href={`${template.assetPath}#${template.assetSymbol ?? template.id}`} x={template.assetViewBox?.x ?? 0} y={template.assetViewBox?.y ?? 0} width={template.assetViewBox?.width ?? template.viewBox.width} height={template.assetViewBox?.height ?? template.viewBox.height} /></svg>{template.connectors.map((connector) => { const point = connector; return <g key={connector.role} onPointerDown={(event) => { event.stopPropagation(); if (selectedPort) connectPorts({ chunkId: chunk.id, role: connector.role }); else setSelectedPort({ chunkId: chunk.id, role: connector.role }); }}><circle cx={point.x} cy={point.y} r={selectedPort?.chunkId === chunk.id && selectedPort.role === connector.role ? 9 : 6} fill={connector.role.includes("secondary") ? "#f59e0b" : "#1769ff"} stroke="#fff" strokeWidth="2" /><text x={point.x + 8} y={point.y - 8} fontSize="11" fill="#17201c">{connector.role}</text></g>; })}<text x={0} y={-18} textAnchor="middle" fontSize="13" fontWeight="800" fill="#17201c">{template.name}</text></g>; })}{mode === "line" && document.routes.find((route) => route.routeId === "main")?.points.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="7" fill="#1769ff" stroke="#fff" strokeWidth="2" onPointerDown={(event) => { event.stopPropagation(); setSelectedLinePoint(index); }} />)}</svg><div className="editor-canvas-hint">{mode === "layout" ? "Drop a chunk, then connect its ports." : mode === "line" ? "Click to add racing-line points, then confirm." : mode === "facilities" ? "Use the inspector to place and tune race facilities." : "Preview the authored circuit before saving."}</div></div></section>
      <aside className="editor-sidebar editor-inspector"><span className="editor-label">CIRCUIT PROPERTIES</span><label className="editor-field"><span>CIRCUIT NAME</span><input value={document.name} onChange={(event) => { setDocument((current) => ({ ...current, name: event.target.value })); setDirty(true); }} /></label><label className="editor-field"><span>COUNTRY / REGION</span><input value={document.country} onChange={(event) => { setDocument((current) => ({ ...current, country: event.target.value })); setDirty(true); }} /></label><label className="editor-field"><span>STYLE</span><select value={document.style} onChange={(event) => { setDocument((current) => ({ ...current, style: event.target.value as CircuitStyle })); setDirty(true); }}><option value="balanced">Balanced</option><option value="fast">Fast</option><option value="flowing">Flowing</option><option value="technical">Technical</option><option value="street">Street</option></select></label><div className="editor-diagnostics"><strong>DOCUMENT</strong><span><small>CHUNKS</small><b>{document.chunks.length}</b></span><span><small>CONNECTIONS</small><b>{document.connections.length}</b></span><span><small>REVISION</small><b>{document.revision}</b></span><span><small>WORLD</small><b>{document.world.widthMeters}×{document.world.heightMeters} m</b></span><span><small>LENGTH</small><b>{Math.round(trackMetrics.lengthMeters)} M</b></span><span><small>SHARPEST</small><b>{trackMetrics.sharpestCornerDegrees.toFixed(0)}°</b></span></div><div className="editor-diagnostics-compiled">{trackMetrics.compiledIssues.length ? <small>{trackMetrics.compiledIssues[0]}</small> : <small>COMPILED GEOMETRY READY</small>}</div>{selectedChunk && <div className="selection-card"><strong>SELECTED CHUNK</strong><span className="selected-chunk-name">{templates.get(selectedChunk.templateId)?.name ?? selectedChunk.templateId}</span><label className="editor-field"><span>ROTATION · {Math.round(selectedChunk.rotation * 180 / Math.PI)}°</span><input type="range" min={-180} max={180} value={Math.round(selectedChunk.rotation * 180 / Math.PI)} onChange={(event) => { const rotation = Number(event.target.value) * Math.PI / 180; setDocument((current) => updated(current, (next) => ({ ...next, chunks: next.chunks.map((chunk) => chunk.id === selectedChunk.id ? { ...chunk, rotation } : chunk) }))); setDirty(true); }} /></label><label className="editor-field"><span>CURBS</span><select value={selectedChunk.curbMode} onChange={(event) => { const curbMode = event.target.value as CurbMode; setDocument((current) => updated(current, (next) => ({ ...next, chunks: next.chunks.map((chunk) => chunk.id === selectedChunk.id ? { ...chunk, curbMode } : chunk) }))); setDirty(true); }}><option value="none">NONE</option><option value="left">ONLY LEFT</option><option value="right">ONLY RIGHT</option><option value="both">BOTH SIDES</option></select></label><button onClick={removeSelected}>REMOVE CHUNK</button></div>}{selectedChunk && templates.get(selectedChunk.templateId)?.category === "custom" && <div className="selection-card connector-calibration"><strong>CONNECTOR CALIBRATION</strong>{(templates.get(selectedChunk.templateId)?.connectors ?? []).map((connector) => <div key={connector.role}><small>{connector.role.toUpperCase()}</small><label className="editor-field"><span>X · {connector.x.toFixed(1)}</span><input type="number" value={connector.x} onChange={(event) => updateCustomConnector(connector.role, "x", Number(event.target.value))} /></label><label className="editor-field"><span>Y · {connector.y.toFixed(1)}</span><input type="number" value={connector.y} onChange={(event) => updateCustomConnector(connector.role, "y", Number(event.target.value))} /></label></div>)}</div>}{document.startingGrid && <div className="selection-card"><strong>STARTING GRID</strong><label className="editor-field"><span>ANCHOR CHUNK</span><select value={document.startingGrid.anchorChunkId} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, startingGrid: next.startingGrid ? { ...next.startingGrid, anchorChunkId: event.target.value } : null }))); setDirty(true); }}>{document.chunks.filter((chunk) => templates.get(chunk.templateId)?.kind === "road").map((chunk) => <option key={chunk.id} value={chunk.id}>{templates.get(chunk.templateId)?.name ?? chunk.id}</option>)}</select></label><label className="editor-field"><span>ANCHOR PROGRESS · {Math.round(document.startingGrid.anchorProgress * 100)}%</span><input type="range" min="0" max="1" step=".01" value={document.startingGrid.anchorProgress} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, startingGrid: next.startingGrid ? { ...next.startingGrid, anchorProgress: Number(event.target.value) } : null }))); setDirty(true); }} /></label><label className="editor-field"><span>SLOTS</span><input type="number" min="2" max="22" value={document.startingGrid.slots} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, startingGrid: next.startingGrid ? { ...next.startingGrid, slots: Math.max(2, Math.min(22, Number(event.target.value) || 2)) } : null }))); setDirty(true); }} /></label><label className="editor-field"><span>ROW SPACING · {document.startingGrid.rowSpacingMeters} M</span><input type="number" min="5" max="15" step=".5" value={document.startingGrid.rowSpacingMeters} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, startingGrid: next.startingGrid ? { ...next.startingGrid, rowSpacingMeters: Math.max(5, Math.min(15, Number(event.target.value) || 5)) } : null }))); setDirty(true); }} /></label><label className="editor-field"><span>LATERAL SPACING · {document.startingGrid.lateralSpacingMeters} M</span><input type="number" min="1" max="5" step=".1" value={document.startingGrid.lateralSpacingMeters} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, startingGrid: next.startingGrid ? { ...next.startingGrid, lateralSpacingMeters: Math.max(1, Math.min(5, Number(event.target.value) || 1)) } : null }))); setDirty(true); }} /></label><label className="editor-field"><span>STAGGER GRID</span><input type="checkbox" checked={document.startingGrid.stagger} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, startingGrid: next.startingGrid ? { ...next.startingGrid, stagger: event.target.checked } : null }))); setDirty(true); }} /></label></div>}{document.pitBoxes && <div className="selection-card"><strong>PIT BOXES</strong><label className="editor-field"><span>ANCHOR CHUNK</span><select value={document.pitBoxes.anchorChunkId} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, pitBoxes: next.pitBoxes ? { ...next.pitBoxes, anchorChunkId: event.target.value } : null }))); setDirty(true); }}>{document.chunks.filter((chunk) => templates.get(chunk.templateId)?.kind === "pit").map((chunk) => <option key={chunk.id} value={chunk.id}>{templates.get(chunk.templateId)?.name ?? chunk.id}</option>)}</select></label><label className="editor-field"><span>BOXES</span><input type="number" min="1" max="22" value={document.pitBoxes.count} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, pitBoxes: next.pitBoxes ? { ...next.pitBoxes, count: Math.max(1, Math.min(22, Number(event.target.value) || 1)) } : null }))); setDirty(true); }} /></label><label className="editor-field"><span>SIDE</span><select value={document.pitBoxes.side} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, pitBoxes: next.pitBoxes ? { ...next.pitBoxes, side: event.target.value as "left" | "right" } : null }))); setDirty(true); }}><option value="left">LEFT</option><option value="right">RIGHT</option></select></label><label className="editor-field"><span>SPACING · {document.pitBoxes.spacingMeters} M</span><input type="number" min="4" max="20" step=".5" value={document.pitBoxes.spacingMeters} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, pitBoxes: next.pitBoxes ? { ...next.pitBoxes, spacingMeters: Math.max(4, Math.min(20, Number(event.target.value) || 4)) } : null }))); setDirty(true); }} /></label><label className="editor-field"><span>ANCHOR PROGRESS · {Math.round(document.pitBoxes.anchorProgress * 100)}%</span><input type="range" min="0" max="1" step=".01" value={document.pitBoxes.anchorProgress} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, pitBoxes: next.pitBoxes ? { ...next.pitBoxes, anchorProgress: Number(event.target.value) } : null }))); setDirty(true); }} /></label><label className="editor-field"><span>SPEED LIMIT · {document.pitBoxes.speedLimitKph} KPH</span><input type="range" min="40" max="120" value={document.pitBoxes.speedLimitKph} onChange={(event) => { setDocument((current) => updated(current, (next) => ({ ...next, pitBoxes: next.pitBoxes ? { ...next.pitBoxes, speedLimitKph: Number(event.target.value) } : null }))); setDirty(true); }} /></label></div>}<div className={`editor-validation ${issues.length ? "invalid" : "valid"}`}><strong>{issues.length ? "VALIDATION" : "READY TO SAVE"}</strong>{issues.length ? issues.slice(0, 8).map((issue) => <span key={`${issue.code}-${issue.chunkId ?? issue.connectionId ?? ""}`}>{issue.message}</span>) : <span>Closed routes, racing lines, grid, and pit boxes are ready.</span>}</div>{message && <p className="editor-message" role="status">{message}</p>}{dirty && <small className="editor-dirty">● Unsaved changes</small>}</aside>
    </div>
  </main>;
}

/** Public name for the chunk-based editor; TrackEditor remains as the compatibility export. */
export const CircuitEditor = TrackEditor;
