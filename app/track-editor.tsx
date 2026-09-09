"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Circuit, CircuitStyle } from "./tracks";
import { createStorageRepository, isRecord } from "./storage";
import { UI_COPY } from "./ui-copy";
import { applyTrackCommand, applyTrackDocumentCommand } from "./editor/track/commands";
import { migrateLegacyTrack, validateTrackDocument, type TrackDocumentV2 } from "./domain/track-document";
import { compileTrack, validateCompiledTrack } from "./simulation/track-compiler";
import { Brand } from "./ui/brand";

export type TrackElementType =
  | "tree"
  | "shrub"
  | "lake"
  | "grandstand"
  | "pits"
  | "tower"
  | "barrier"
  | "sign"
  | "lamp"
  | "building";

export type TrackElement = {
  id: string;
  type: TrackElementType;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  color?: string;
  layer: "terrain" | "decor" | "structures" | "safety";
  locked?: boolean;
  visible?: boolean;
};

export type EditableCircuit = Circuit & {
  sourceId: string;
  custom: true;
  width: number;
  startIndex: number;
  scenery: TrackElement[];
  trackDocument?: TrackDocumentV2;
};

type EditorTool = "select" | "add" | "delete" | "smooth" | "element";
type EditorSnapshot = Pick<EditableCircuit, "points" | "width" | "startIndex" | "scenery" | "trackDocument">;

const STORAGE_KEY = "gridwatch.custom-circuits";
const circuitRepository = createStorageRepository(STORAGE_KEY, [], isCircuitArray);
const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 620;

const ELEMENTS: Array<{ type: TrackElementType; label: string; category: string; layer: TrackElement["layer"] }> = [
  { type: "tree", label: "Tree", category: "Nature", layer: "terrain" },
  { type: "shrub", label: "Shrub", category: "Nature", layer: "terrain" },
  { type: "lake", label: "Lake", category: "Nature", layer: "terrain" },
  { type: "grandstand", label: "Grandstand", category: "Infrastructure", layer: "structures" },
  { type: "pits", label: "Pits", category: "Infrastructure", layer: "structures" },
  { type: "tower", label: "Tower", category: "Architecture", layer: "structures" },
  { type: "building", label: "Building", category: "Architecture", layer: "structures" },
  { type: "barrier", label: "Barrier", category: "Safety", layer: "safety" },
  { type: "sign", label: "Sign", category: "Decoration", layer: "decor" },
  { type: "lamp", label: "Lamp", category: "Decoration", layer: "decor" },
];

const ELEMENT_CATEGORIES = [...new Set(ELEMENTS.map((element) => element.category))];

function cloneSnapshot(circuit: EditableCircuit): EditorSnapshot {
  return {
    points: circuit.points.map(([x, y]) => [x, y] as const),
    width: circuit.width,
    startIndex: circuit.startIndex,
    scenery: circuit.scenery.map((element) => ({ ...element })),
    trackDocument: circuit.trackDocument ? structuredClone(circuit.trackDocument) : undefined,
  };
}

function fromSnapshot(circuit: EditableCircuit, snapshot: EditorSnapshot): EditableCircuit {
  return { ...circuit, points: snapshot.points, width: snapshot.width, startIndex: snapshot.startIndex, scenery: snapshot.scenery, trackDocument: snapshot.trackDocument };
}

function createScenery(): TrackElement[] {
  return [
    { id: "tree-1", type: "tree", x: 0.16, y: 0.16, scale: 1, rotation: 0, layer: "terrain" },
    { id: "tree-2", type: "tree", x: 0.82, y: 0.2, scale: 0.8, rotation: 0, layer: "terrain" },
    { id: "grandstand-1", type: "grandstand", x: 0.72, y: 0.78, scale: 1, rotation: 0, layer: "structures" },
  ];
}

function synchronizeTrackDocument(circuit: EditableCircuit): TrackDocumentV2 {
  const migrated = migrateLegacyTrack(circuit);
  const previous = circuit.trackDocument;
  if (!previous) return migrated;
  return {
    ...previous,
    id: circuit.id,
    name: circuit.name,
    country: circuit.country,
    style: circuit.style,
    startIndex: circuit.startIndex,
    controlPoints: migrated.controlPoints.map((point, index) => ({
      ...point,
      id: previous.controlPoints[index]?.id ?? point.id,
      mode: previous.controlPoints[index]?.mode ?? point.mode,
      handleIn: previous.controlPoints[index]?.handleIn,
      handleOut: previous.controlPoints[index]?.handleOut,
      widthLeft: previous.controlPoints[index]?.widthLeft ?? point.widthLeft,
      widthRight: previous.controlPoints[index]?.widthRight ?? point.widthRight,
    })),
    revision: previous.revision + 1,
  };
}

export function createEditableCircuit(track: Circuit): EditableCircuit {
  const editable: EditableCircuit = {
    ...track,
    sourceId: track.id,
    custom: true,
    points: track.points.map(([x, y]) => [x, y] as const),
    width: 1,
    startIndex: 0,
    scenery: createScenery(),
  };
  editable.trackDocument = migrateLegacyTrack(editable);
  return editable;
}

function cloneEditableCircuit(track: EditableCircuit): EditableCircuit {
  return {
    ...track,
    points: track.points.map(([x, y]) => [x, y] as const),
    scenery: track.scenery.map((element) => ({ ...element })),
    trackDocument: track.trackDocument ? structuredClone(track.trackDocument) : migrateLegacyTrack(track),
  };
}

function isEditableCircuit(track: Circuit | EditableCircuit): track is EditableCircuit {
  return "custom" in track && track.custom === true && Array.isArray(track.scenery);
}

export function loadCustomCircuits(): EditableCircuit[] {
  return circuitRepository.load();
}

function isCircuitArray(value: unknown): value is EditableCircuit[] {
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

function distance(a: readonly [number, number], b: readonly [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function orientation(a: readonly [number, number], b: readonly [number, number], c: readonly [number, number]) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function crosses(a: readonly [number, number], b: readonly [number, number], c: readonly [number, number], d: readonly [number, number]) {
  return orientation(a, b, c) * orientation(a, b, d) < 0 && orientation(c, d, a) * orientation(c, d, b) < 0;
}

export function validateCircuit(circuit: EditableCircuit) {
  const errors: string[] = [];
  const points = circuit.points;
  if (points.length < 8) errors.push("The circuit needs at least 8 control points.");
  for (let i = 0; i < points.length; i += 1) {
    const next = points[(i + 1) % points.length];
    if (distance(points[i], next) < 0.018) errors.push(`Points ${i + 1} and ${(i + 1) % points.length + 1} are too close.`);
    for (let j = i + 2; j < points.length; j += 1) {
      if (i === 0 && j === points.length - 1) continue;
      if (crosses(points[i], next, points[j], points[(j + 1) % points.length])) {
        errors.push(`Intersection between segments ${i + 1} and ${j + 1}.`);
        break;
      }
    }
  }
  if (points.length >= 4) {
    try {
      const document = synchronizeTrackDocument(circuit);
      errors.push(...validateTrackDocument(document));
      errors.push(...validateCompiledTrack(compileTrack(document)));
    } catch {
      errors.push("The physical track geometry could not be compiled.");
    }
  }
  return [...new Set(errors)].slice(0, 4);
}

function normalizedFromEvent(event: React.PointerEvent<SVGSVGElement>, svg: SVGSVGElement): [number, number] {
  const rect = svg.getBoundingClientRect();
  return [
    Math.max(0.02, Math.min(0.98, (event.clientX - rect.left) / rect.width)),
    Math.max(0.03, Math.min(0.97, (event.clientY - rect.top) / rect.height)),
  ];
}

export function pathFor(points: ReadonlyArray<readonly [number, number]>) {
  if (!points.length) return "";
  if (points.length < 3) return `M ${points.map(([x, y]) => `${x * VIEWBOX_WIDTH},${y * VIEWBOX_HEIGHT}`).join(" L ")} Z`;
  const scaled = points.map(([x, y]) => [x * VIEWBOX_WIDTH, y * VIEWBOX_HEIGHT] as const);
  const commands = scaled.map((point, index) => {
    const previous = scaled[(index - 1 + scaled.length) % scaled.length];
    const next = scaled[(index + 1) % scaled.length];
    const afterNext = scaled[(index + 2) % scaled.length];
    const controlOne = [point[0] + (next[0] - previous[0]) / 6, point[1] + (next[1] - previous[1]) / 6];
    const controlTwo = [next[0] - (afterNext[0] - point[0]) / 6, next[1] - (afterNext[1] - point[1]) / 6];
    return `C ${controlOne[0]},${controlOne[1]} ${controlTwo[0]},${controlTwo[1]} ${next[0]},${next[1]}`;
  });
  return `M ${scaled[0][0]},${scaled[0][1]} ${commands.join(" ")} Z`;
}

function polylinePath(points: ReadonlyArray<{ x: number; y: number }>) {
  return points.length ? `M ${points.map((point) => `${point.x},${point.y}`).join(" L ")} Z` : "";
}

function elementIcon(element: TrackElement) {
  const { x, y, scale, rotation } = element;
  const transform = `translate(${x * VIEWBOX_WIDTH} ${y * VIEWBOX_HEIGHT}) rotate(${rotation}) scale(${scale})`;
  if (element.type === "tree") return <g transform={transform}><circle r="18" fill="#4d9258" opacity=".3" /><circle cy="-10" r="18" fill="#5d9f55" /><rect x="-3" y="5" width="6" height="17" rx="2" fill="#795443" /></g>;
  if (element.type === "shrub") return <g transform={transform}><circle r="12" fill="#75a85b" /><circle cx="10" cy="2" r="9" fill="#5e954c" /></g>;
  if (element.type === "lake") return <ellipse transform={transform} rx="56" ry="28" fill="#80c9d1" stroke="#e7f5eb" strokeWidth="4" />;
  if (element.type === "grandstand") return <g transform={transform}><rect x="-55" y="-18" width="110" height="36" rx="3" fill="#d8dee0" stroke="#78858a" strokeWidth="3" /><path d="M-42 -12h84M-42 -3h84M-42 6h84" stroke="#869398" strokeWidth="4" /></g>;
  if (element.type === "pits") return <g transform={transform}><rect x="-50" y="-15" width="100" height="30" rx="3" fill="#f2f1e9" stroke="#606e71" strokeWidth="3" /><path d="M-32 -10v20M-10 -10v20M12 -10v20M34 -10v20" stroke="#ef4650" strokeWidth="3" /></g>;
  if (element.type === "tower") return <g transform={transform}><rect x="-12" y="-26" width="24" height="52" fill="#e6e6dd" stroke="#59686b" strokeWidth="3" /><path d="M-18 -26h36M-16 -34h32" stroke="#59686b" strokeWidth="4" /></g>;
  if (element.type === "building") return <g transform={transform}><rect x="-30" y="-24" width="60" height="48" rx="3" fill="#d8d9d1" stroke="#697578" strokeWidth="3" /><path d="M-20 -12h12v12h-12zM8 -12h12v12H8z" fill="#8bb1b4" /></g>;
  if (element.type === "barrier") return <g transform={transform}><rect x="-50" y="-5" width="100" height="10" rx="3" fill="#e9e7d9" stroke="#e4424c" strokeWidth="4" strokeDasharray="12 9" /></g>;
  if (element.type === "sign") return <g transform={transform}><rect x="-24" y="-18" width="48" height="28" rx="3" fill="#e8424c" /><path d="M0 10v20" stroke="#59686b" strokeWidth="4" /></g>;
  return <g transform={transform}><path d="M0 -28v56M-10 -12h20M-10 6h20" stroke="#6b7d80" strokeWidth="4" /><circle cy="-31" r="7" fill="#fff2b5" /></g>;
}

export function TrackEditor({ tracks, onSave, onBack }: { tracks: Circuit[]; onSave: (circuit: EditableCircuit) => void; onBack: () => void }) {
  const [selectedId, setSelectedId] = useState(tracks[0]?.id ?? "");
  const [circuit, setCircuit] = useState<EditableCircuit>(() => createEditableCircuit(tracks[0] ?? { id: "empty", name: "New Circuit", country: "Custom", style: "balanced", points: [] }));
  const [tool, setTool] = useState<EditorTool>("select");
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  const [activeElementType, setActiveElementType] = useState<TrackElementType>("tree");
  const [preview, setPreview] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [layers, setLayers] = useState<Record<string, boolean>>({ terrain: true, decor: true, structures: true, safety: true, track: true, controls: true });
  const [analysisOverlay, setAnalysisOverlay] = useState<"none" | "boundaries" | "curvature" | "grip">("none");
  const [history, setHistory] = useState<EditorSnapshot[]>([]);
  const [future, setFuture] = useState<EditorSnapshot[]>([]);
  const [dirty, setDirty] = useState(false);
  const [drag, setDrag] = useState<{ kind: "point" | "element"; index?: number; id?: string } | null>(null);
  const [message, setMessage] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);
  const dragOriginRef = useRef<EditorSnapshot | null>(null);
  const errors = useMemo(() => validateCircuit(circuit), [circuit]);
  const compiledTrack = useMemo(() => {
    try { return compileTrack(synchronizeTrackDocument(circuit)); } catch { return null; }
  }, [circuit]);
  const trackMetrics = useMemo(() => {
    try {
      const compiled = compiledTrack ?? compileTrack(synchronizeTrackDocument(circuit));
      const cornerRadii = compiled.samples
        .filter((sample) => Math.abs(sample.curvature) > 0.0001)
        .map((sample) => 1 / Math.abs(sample.curvature));
      return {
        lengthMeters: compiled.lengthMeters,
        sharpestRadius: cornerRadii.length ? Math.min(...cornerRadii) : null,
      };
    } catch {
      return { lengthMeters: 0, sharpestRadius: null };
    }
  }, [circuit, compiledTrack]);

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement>) => {
    const point = normalizedFromEvent(event, event.currentTarget);
    if (!snapToGrid) return point;
    return [Math.round(point[0] * 100) / 100, Math.round(point[1] * 100) / 100] as [number, number];
  };

  useEffect(() => {
    const next = tracks.find((track) => track.id === selectedId);
    if (next) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCircuit(isEditableCircuit(next) ? cloneEditableCircuit(next) : createEditableCircuit(next));
      setHistory([]);
      setFuture([]);
      setSelectedPoint(null);
      setSelectedElement(null);
      setDirty(false);
    }
  // The catalog may change after saving; the selected editor state must not reset from that prop update.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const commit = (next: EditableCircuit) => {
    setHistory((current) => [...current.slice(-39), cloneSnapshot(circuit)]);
    setFuture([]);
    setCircuit({ ...next, trackDocument: synchronizeTrackDocument(next) });
    setDirty(true);
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [cloneSnapshot(circuit), ...current.slice(0, 39)]);
    setHistory((current) => current.slice(0, -1));
    setCircuit(fromSnapshot(circuit, previous));
    setDirty(true);
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current.slice(-39), cloneSnapshot(circuit)]);
    setFuture((current) => current.slice(1));
    setCircuit(fromSnapshot(circuit, next));
    setDirty(true);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLTextAreaElement) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); if (!errors.length) save(); }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedPoint !== null && circuit.points.length > 8) {
        event.preventDefault();
        commit(applyTrackCommand(circuit, { type: "removePoint", index: selectedPoint }));
        setSelectedPoint(null);
      }
      if (event.key === "Escape") { setTool("select"); setSelectedPoint(null); setSelectedElement(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  function save() {
    if (errors.length) { setMessage(UI_COPY.editor.track.fixGeometry); return; }
    const savedBase = { ...circuit, id: circuit.id.startsWith("custom-") ? circuit.id : `custom-${circuit.id}`, name: circuit.name.endsWith(" (Custom)") ? circuit.name : `${circuit.name} (Custom)` };
    const saved = { ...savedBase, trackDocument: synchronizeTrackDocument(savedBase) };
    const stored = [...loadCustomCircuits().filter((item) => item.id !== saved.id), saved];
    if (!circuitRepository.save(stored)) {
      setMessage(UI_COPY.editor.track.storageFailure);
      return;
    }
    onSave(saved);
    setSelectedId(saved.id);
    setCircuit(saved);
    setDirty(false);
    setMessage(UI_COPY.editor.track.saved);
  };

  const onCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || preview) return;
    const point = pointFromEvent(event);
    if (tool === "add") {
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      circuit.points.forEach((item, index) => {
        const next = circuit.points[(index + 1) % circuit.points.length];
        const candidate: [number, number] = [(item[0] + next[0]) / 2, (item[1] + next[1]) / 2];
        const gap = distance(point, candidate);
        if (gap < bestDistance) { bestDistance = gap; bestIndex = index + 1; }
      });
      commit(applyTrackCommand(circuit, { type: "insertPoint", index: bestIndex, point }));
      setSelectedPoint(bestIndex);
      return;
    }
    if (tool === "delete") {
      if (selectedPoint !== null && circuit.points.length > 8) {
        commit(applyTrackCommand(circuit, { type: "removePoint", index: selectedPoint }));
        setSelectedPoint(null);
      } else if (selectedElement) {
        deleteElement();
      }
      return;
    }
    if (tool === "element") {
      const element = ELEMENTS.find((item) => item.type === activeElementType) ?? ELEMENTS[0];
      const created: TrackElement = { id: `${element.type}-${Date.now()}`, type: element.type, x: point[0], y: point[1], scale: 1, rotation: 0, layer: element.layer };
      commit({ ...circuit, scenery: [...circuit.scenery, created] });
      setSelectedElement(created.id);
    }
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag || !svgRef.current || preview) return;
    const point = pointFromEvent(event);
    if (drag.kind === "point" && drag.index !== undefined) {
      setCircuit((current) => ({ ...current, points: current.points.map((item, index) => index === drag.index ? point : item) }));
      setDirty(true);
    }
    if (drag.kind === "element" && drag.id) {
      setCircuit((current) => ({ ...current, scenery: current.scenery.map((item) => item.id === drag.id ? { ...item, x: point[0], y: point[1] } : item) }));
      setDirty(true);
    }
  };

  const endDrag = () => {
    if (drag && dragOriginRef.current) {
      setHistory((current) => [...current.slice(-39), dragOriginRef.current as EditorSnapshot]);
      setFuture([]);
    }
    dragOriginRef.current = null;
    setDrag(null);
  };

  const beginDrag = (nextDrag: { kind: "point" | "element"; index?: number; id?: string }) => {
    dragOriginRef.current = cloneSnapshot(circuit);
    setDrag(nextDrag);
  };

  const leaveEditor = () => {
    if (dirty && !window.confirm(UI_COPY.editor.discardChanges)) return;
    onBack();
  };

  const selectElement = (event: React.PointerEvent<SVGGElement>, element: TrackElement) => {
    event.stopPropagation();
    if (tool === "delete") {
      commit({ ...circuit, scenery: circuit.scenery.filter((item) => item.id !== element.id) });
      setSelectedElement(null);
      return;
    }
    if (!element.locked) {
      setSelectedElement(element.id);
      beginDrag({ kind: "element", id: element.id });
    }
  };

  const setElementType = (type: TrackElementType) => {
    const template = ELEMENTS.find((item) => item.type === type);
    if (!template) return;
    setTool("element");
    setActiveElementType(type);
    setMessage(UI_COPY.editor.track.addElementHint(template.label));
  };

  const deleteElement = () => {
    if (!selectedElement) return;
    commit({ ...circuit, scenery: circuit.scenery.filter((item) => item.id !== selectedElement) });
    setSelectedElement(null);
  };

  const duplicateElement = () => {
    const element = circuit.scenery.find((item) => item.id === selectedElement);
    if (!element) return;
    const duplicate = { ...element, id: `${element.type}-${Date.now()}`, x: Math.min(.98, element.x + .025), y: Math.min(.97, element.y + .025), locked: false };
    commit({ ...circuit, scenery: [...circuit.scenery, duplicate] });
    setSelectedElement(duplicate.id);
  };

  const moveElementInHierarchy = (direction: -1 | 1) => {
    const index = circuit.scenery.findIndex((item) => item.id === selectedElement);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= circuit.scenery.length) return;
    const scenery = [...circuit.scenery];
    [scenery[index], scenery[target]] = [scenery[target], scenery[index]];
    commit({ ...circuit, scenery });
  };

  const deleteSelectedPoint = () => {
    if (selectedPoint === null || circuit.points.length <= 8) return;
    commit(applyTrackCommand(circuit, { type: "removePoint", index: selectedPoint }));
    setSelectedPoint(null);
  };

  const setStartAtSelectedPoint = () => {
    if (selectedPoint === null) return;
    commit(applyTrackCommand(circuit, { type: "setStart", index: selectedPoint }));
  };

  const smoothSelected = () => {
    if (selectedPoint === null) return;
    const previous = circuit.points[(selectedPoint - 1 + circuit.points.length) % circuit.points.length];
    const next = circuit.points[(selectedPoint + 1) % circuit.points.length];
    const point: readonly [number, number] = [(previous[0] + next[0]) / 2, (previous[1] + next[1]) / 2];
    commit({ ...circuit, points: circuit.points.map((item, index) => index === selectedPoint ? point : item) });
  };

  const duplicateSelectedPoint = () => {
    if (selectedPoint === null) return;
    const nextIndex = (selectedPoint + 1) % circuit.points.length;
    const current = circuit.points[selectedPoint];
    const next = circuit.points[nextIndex];
    const inserted: readonly [number, number] = [(current[0] + next[0]) / 2, (current[1] + next[1]) / 2];
    const insertIndex = selectedPoint + 1;
    commit(applyTrackCommand(circuit, { type: "insertPoint", index: insertIndex, point: inserted }));
    setSelectedPoint(insertIndex);
  };

  const updateSelectedPointDocument = (update: { mode?: "smooth" | "corner" | "symmetric"; widthLeft?: number; widthRight?: number }) => {
    if (selectedPoint === null) return;
    const document = synchronizeTrackDocument(circuit);
    const point = document.controlPoints[selectedPoint];
    if (!point) return;
    let next = document;
    if (update.mode) next = applyTrackDocumentCommand(next, { type: "setPointMode", ids: [point.id], mode: update.mode });
    if (update.widthLeft !== undefined || update.widthRight !== undefined) next = applyTrackDocumentCommand(next, { type: "setSegmentWidth", ids: [point.id], widthLeft: update.widthLeft ?? point.widthLeft, widthRight: update.widthRight ?? point.widthRight });
    commit({ ...circuit, trackDocument: next });
  };

  return (
    <main className="track-editor-shell">
      <header className="editor-topbar">
        <Brand className="brand" />
        <div><span className="editor-kicker">{UI_COPY.editor.track.creationTool}</span><strong>{UI_COPY.editor.track.title}</strong></div>
        <div className="editor-top-actions"><button onClick={leaveEditor}>← {UI_COPY.navigation.back}</button><button className="editor-save" onClick={save} disabled={Boolean(errors.length)}>SAVE</button></div>
      </header>
      <div className="editor-layout">
        <aside className="editor-sidebar circuit-library">
          <span className="editor-label">CIRCUITS</span>
          <div className="circuit-list">
            {tracks.map((track) => <button key={track.id} className={track.id === selectedId ? "active" : ""} onClick={() => { if (track.id === selectedId) return; if (dirty && !window.confirm(UI_COPY.editor.discardChanges)) return; setSelectedId(track.id); }}><span>{track.name}</span><small>{track.country} · {track.style}</small></button>)}
          </div>
        </aside>
        <section className="editor-workspace">
          <div className="editor-toolbar" role="toolbar" aria-label={UI_COPY.editor.track.tools}>
            {([ ["select", UI_COPY.editor.track.select], ["add", UI_COPY.editor.track.createPoint], ["delete", UI_COPY.editor.track.removePoint], ["smooth", UI_COPY.editor.track.smoothCurve], ["element", UI_COPY.editor.track.addElement] ] as const).map(([value, label]) => <button key={value} className={tool === value ? "active" : ""} onClick={() => { setTool(value); if (value === "smooth") smoothSelected(); }} title={label}>{label}</button>)}
            <span className="toolbar-spacer" />
            <select aria-label="Analysis overlay" value={analysisOverlay} onChange={(event) => setAnalysisOverlay(event.target.value as typeof analysisOverlay)}><option value="none">NO OVERLAY</option><option value="boundaries">BOUNDARIES</option><option value="curvature">CURVATURE HEAT</option><option value="grip">SURFACE GRIP</option></select>
            <button disabled={selectedPoint === null} onClick={() => updateSelectedPointDocument({ mode: "smooth" })}>SMOOTH MODE</button>
            <button disabled={selectedPoint === null} onClick={() => updateSelectedPointDocument({ mode: "corner" })}>CORNER MODE</button>
            <button disabled={selectedPoint === null} onClick={() => updateSelectedPointDocument({ mode: "symmetric" })}>SYMMETRIC MODE</button>
            <button disabled={!selectedElement} onClick={duplicateElement}>DUPLICATE ELEMENT</button>
            <button disabled={!selectedElement} onClick={() => moveElementInHierarchy(-1)}>MOVE LAYER UP</button>
            <button disabled={!selectedElement} onClick={() => moveElementInHierarchy(1)}>MOVE LAYER DOWN</button>
            <button onClick={undo} disabled={!history.length}>↶</button><button onClick={redo} disabled={!future.length}>↷</button>
            <button onClick={() => setZoom((value) => Math.min(2, value + 0.1))}>＋</button><button onClick={() => setZoom((value) => Math.max(0.7, value - 0.1))}>−</button><button onClick={() => setZoom(1)}>FIT</button>
            <button className={preview ? "active" : ""} onClick={() => setPreview((value) => !value)}>{preview ? "EDIT" : "PREVIEW"}</button>
            <button className={snapToGrid ? "active" : ""} aria-pressed={snapToGrid} onClick={() => setSnapToGrid((value) => !value)}>{UI_COPY.editor.track.snap}</button>
          </div>
          <div className="editor-shortcuts" aria-label="Keyboard shortcuts">Ctrl/Cmd+Z Undo · Ctrl/Cmd+Shift+Z Redo · Ctrl/Cmd+S Save · Delete Remove · Esc Select</div>
          <div className="editor-canvas-wrap">
            <svg ref={svgRef} className={`editor-canvas ${preview ? "preview" : ""}`} viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} style={{ transform: `scale(${zoom})` }} onPointerDown={onCanvasPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag} role="application" aria-label={UI_COPY.editor.track.editingArea}>
              {layers.terrain && <rect width="1000" height="620" fill="#cbdcbf" />}
              {layers.terrain && <path d="M0 130H1000M0 280H1000M0 440H1000" stroke="#b7d0b0" strokeWidth="2" opacity=".5" />}
              {snapToGrid && !preview && <path d="M0 62H1000M0 124H1000M0 186H1000M0 248H1000M0 310H1000M0 372H1000M0 434H1000M0 496H1000M0 558H1000M100 0V620M200 0V620M300 0V620M400 0V620M500 0V620M600 0V620M700 0V620M800 0V620M900 0V620" stroke="#1769ff" strokeWidth="1" opacity=".12" pointerEvents="none" />}
              {layers.terrain && circuit.scenery.filter((item) => item.layer === "terrain").map((item) => <g key={item.id} onPointerDown={(event) => selectElement(event, item)}>{elementIcon(item)}{selectedElement === item.id && !preview && <circle cx={item.x * 1000} cy={item.y * 620} r="28" fill="none" stroke="#1769ff" strokeWidth="3" strokeDasharray="5 5" />}</g>)}
              {layers.structures && circuit.scenery.filter((item) => item.layer === "structures").map((item) => <g key={item.id} onPointerDown={(event) => selectElement(event, item)}>{elementIcon(item)}{selectedElement === item.id && !preview && <circle cx={item.x * 1000} cy={item.y * 620} r="34" fill="none" stroke="#1769ff" strokeWidth="3" strokeDasharray="5 5" />}</g>)}
              {layers.safety && circuit.scenery.filter((item) => item.layer === "safety").map((item) => <g key={item.id} onPointerDown={(event) => selectElement(event, item)}>{elementIcon(item)}</g>)}
              {layers.decor && circuit.scenery.filter((item) => item.layer === "decor").map((item) => <g key={item.id} onPointerDown={(event) => selectElement(event, item)}>{elementIcon(item)}</g>)}
              {layers.track && <><path d={pathFor(circuit.points)} fill="none" stroke="#87968d" strokeWidth={62 * circuit.width} strokeLinejoin="round" strokeLinecap="round" /><path d={pathFor(circuit.points)} fill="none" stroke="#263238" strokeWidth={52 * circuit.width} strokeLinejoin="round" strokeLinecap="round" /><path d={pathFor(circuit.points)} fill="none" stroke="#e9e8da" strokeWidth={54 * circuit.width} strokeDasharray="14 12" strokeLinejoin="round" strokeLinecap="round" /><path d={pathFor(circuit.points)} fill="none" stroke="#e6424c" strokeWidth={54 * circuit.width} strokeDasharray="7 19" strokeLinejoin="round" strokeLinecap="round" /><path d={pathFor(circuit.points)} fill="none" stroke="#263238" strokeWidth={47 * circuit.width} strokeLinejoin="round" strokeLinecap="round" /><path d={pathFor(circuit.points)} fill="none" stroke="#a9d2b2" strokeWidth="2" strokeDasharray="10 12" opacity=".65" /></>}
              {layers.controls && !preview && circuit.points.map(([x, y], index) => <g key={`${x}-${y}-${index}`} onPointerDown={(event) => { event.stopPropagation(); if (tool === "delete" && circuit.points.length > 8) { commit(applyTrackCommand(circuit, { type: "removePoint", index })); setSelectedPoint(null); return; } setSelectedPoint(index); beginDrag({ kind: "point", index }); }}><circle cx={x * 1000} cy={y * 620} r={selectedPoint === index ? 9 : 6} fill={selectedPoint === index ? "#1769ff" : "#fff"} stroke={selectedPoint === index ? "#fff" : "#1769ff"} strokeWidth="3" /><text x={x * 1000 + 10} y={y * 620 - 10} fill="#17201c" fontSize="13" fontWeight="700">{index + 1}</text></g>)}
              {!preview && <path d={pathFor([circuit.points[circuit.startIndex], circuit.points[(circuit.startIndex + 1) % circuit.points.length]])} fill="none" stroke="#fff" strokeWidth="10" strokeDasharray="2 10" />}
              {compiledTrack && analysisOverlay === "boundaries" && <g className="compiled-boundary-overlay" pointerEvents="none"><path d={polylinePath(compiledTrack.leftBoundary)} fill="none" stroke="var(--status-warning)" strokeWidth="2" /><path d={polylinePath(compiledTrack.rightBoundary)} fill="none" stroke="var(--status-warning)" strokeWidth="2" /></g>}
              {compiledTrack && analysisOverlay === "curvature" && <g className="compiled-curvature-overlay" pointerEvents="none">{compiledTrack.samples.filter((_, index) => index % 4 === 0).map((sample, index) => <circle key={index} cx={sample.position.x} cy={sample.position.y} r="4" fill={`hsl(${Math.max(0, 120 - Math.abs(sample.curvature) * 1800)} 85% 48%)`} />)}</g>}
              {compiledTrack && analysisOverlay === "grip" && <g className="compiled-grip-overlay" pointerEvents="none">{compiledTrack.samples.filter((_, index) => index % 4 === 0).map((sample, index) => <circle key={index} cx={sample.position.x} cy={sample.position.y} r="3" fill={`hsl(${sample.grip * 110} 80% 48%)`} />)}</g>}
              {!preview && errors.map((error, index) => { const point = circuit.points[index % Math.max(1, circuit.points.length)]; if (!point) return null; return <g key={error} className="validation-issue-marker" role="button" aria-label={error} onPointerDown={(event) => { event.stopPropagation(); setSelectedPoint(index % circuit.points.length); }}><circle cx={point[0] * VIEWBOX_WIDTH} cy={point[1] * VIEWBOX_HEIGHT} r="13" fill="var(--status-failure)" stroke="white" strokeWidth="2" /><text x={point[0] * VIEWBOX_WIDTH} y={point[1] * VIEWBOX_HEIGHT + 5} textAnchor="middle" fill="white" fontSize="13" fontWeight="800">!</text></g>; })}
            </svg>
            <div className="editor-canvas-hint">{preview ? UI_COPY.editor.track.finalMode : UI_COPY.editor.track.canvasHint}</div>
          </div>
        </section>
        <aside className="editor-sidebar editor-inspector">
          <span className="editor-label">PROPERTIES</span>
          <label className="editor-field"><span>CIRCUIT NAME</span><input value={circuit.name} onChange={(event) => { setCircuit((current) => ({ ...current, name: event.target.value })); setDirty(true); }} /></label>
          <label className="editor-field"><span>COUNTRY / REGION</span><input value={circuit.country} onChange={(event) => { setCircuit((current) => ({ ...current, country: event.target.value })); setDirty(true); }} /></label>
          <label className="editor-field"><span>STYLE</span><select value={circuit.style} onChange={(event) => { setCircuit((current) => ({ ...current, style: event.target.value as CircuitStyle })); setDirty(true); }}><option value="balanced">Balanced</option><option value="fast">Fast</option><option value="flowing">Flowing</option><option value="technical">Technical</option><option value="street">Street</option></select></label>
          <label className="editor-field"><span>TRACK WIDTH · {Math.round(circuit.width * 100)}%</span><input type="range" min=".75" max="1.25" step=".01" value={circuit.width} onChange={(event) => { setCircuit((current) => ({ ...current, width: Number(event.target.value) })); setDirty(true); }} /></label>
          <div className="editor-diagnostics" aria-label={UI_COPY.editor.track.circuitMetrics}>
            <strong>{UI_COPY.editor.track.circuitMetrics}</strong>
            <span><small>{UI_COPY.editor.track.length}</small><b>{trackMetrics.lengthMeters >= 1_000 ? `${(trackMetrics.lengthMeters / 1_000).toFixed(2)} km` : `${Math.round(trackMetrics.lengthMeters)} m`}</b></span>
            <span><small>{UI_COPY.editor.track.controlPoints}</small><b>{circuit.points.length}</b></span>
            <span><small>{UI_COPY.editor.track.sharpestCorner}</small><b>{trackMetrics.sharpestRadius === null ? "—" : `R${Math.round(trackMetrics.sharpestRadius)} m`}</b></span>
            <span><small>{UI_COPY.editor.track.startPoint}</small><b>{circuit.startIndex + 1}</b></span>
          </div>
          {selectedPoint !== null && <div className="selection-card"><strong>POINT {selectedPoint + 1}</strong><label className="editor-field"><span>X POSITION</span><input type="number" min=".02" max=".98" step=".001" value={circuit.points[selectedPoint]?.[0] ?? 0} onChange={(event) => { const x = Number(event.target.value); setCircuit((current) => ({ ...current, points: current.points.map((point, index) => index === selectedPoint ? [Math.max(.02, Math.min(.98, x)), point[1]] as const : point) })); setDirty(true); }} /></label><label className="editor-field"><span>Y POSITION</span><input type="number" min=".03" max=".97" step=".001" value={circuit.points[selectedPoint]?.[1] ?? 0} onChange={(event) => { const y = Number(event.target.value); setCircuit((current) => ({ ...current, points: current.points.map((point, index) => index === selectedPoint ? [point[0], Math.max(.03, Math.min(.97, y))] as const : point) })); setDirty(true); }} /></label></div>}
          {selectedElement && (() => { const element = circuit.scenery.find((item) => item.id === selectedElement); if (!element) return null; return <div className="selection-card"><strong>{element.type.toUpperCase()}</strong><label className="editor-field"><span>SCALE · {Math.round(element.scale * 100)}%</span><input type="range" min=".4" max="2.5" step=".05" value={element.scale} onChange={(event) => commit({ ...circuit, scenery: circuit.scenery.map((item) => item.id === element.id ? { ...item, scale: Number(event.target.value) } : item) })} /></label><label className="editor-field"><span>ROTATION · {Math.round(element.rotation)}°</span><input type="range" min="-180" max="180" step="1" value={element.rotation} onChange={(event) => commit({ ...circuit, scenery: circuit.scenery.map((item) => item.id === element.id ? { ...item, rotation: Number(event.target.value) } : item) })} /></label><label className="selection-check"><input type="checkbox" checked={Boolean(element.locked)} onChange={(event) => commit({ ...circuit, scenery: circuit.scenery.map((item) => item.id === element.id ? { ...item, locked: event.target.checked } : item) })} /><span>LOCK ELEMENT</span></label></div>; })()}
          <div className="editor-inspector-actions"><button onClick={smoothSelected} disabled={selectedPoint === null}>SMOOTH POINT</button><button onClick={duplicateSelectedPoint} disabled={selectedPoint === null}>{UI_COPY.editor.track.duplicatePoint}</button><button onClick={setStartAtSelectedPoint} disabled={selectedPoint === null}>SET START / FINISH</button><button onClick={deleteSelectedPoint} disabled={selectedPoint === null || circuit.points.length <= 8}>DELETE POINT</button><button onClick={deleteElement} disabled={!selectedElement}>DELETE ELEMENT</button><button onClick={() => { setCircuit(createEditableCircuit(tracks.find((track) => track.id === selectedId) ?? tracks[0])); setHistory([]); setFuture([]); setDirty(true); }}>RESTORE ORIGINAL</button></div>
          <span className="editor-label">ENVIRONMENT ELEMENTS</span>
          <div className="element-library">{ELEMENT_CATEGORIES.map((category) => <div className="element-group" key={category}><strong>{category}</strong>{ELEMENTS.filter((element) => element.category === category).map((element) => <button key={element.type} className={activeElementType === element.type && tool === "element" ? "active" : ""} onClick={() => setElementType(element.type)}><span className="element-asset-glyph"><svg viewBox="0 0 64 64" aria-hidden="true"><use href={`/assets/scenery-atlas.svg#${element.type}`} /></svg></span>{element.label}</button>)}</div>)}</div>
          <span className="editor-label">SCENE HIERARCHY</span>
          <div className="scene-list">{circuit.scenery.length ? circuit.scenery.map((element) => <button key={element.id} className={selectedElement === element.id ? "active" : ""} onClick={() => { setSelectedElement(element.id); setSelectedPoint(null); }}><span>{element.type}</span><small>{element.layer}{element.locked ? " · locked" : ""}</small></button>) : <small className="scene-empty">No elements added.</small>}</div>
          <span className="editor-label">LAYERS</span>
          <div className="layer-list">{Object.keys(layers).map((layer) => <label key={layer}><input type="checkbox" checked={layers[layer]} onChange={() => setLayers((current) => ({ ...current, [layer]: !current[layer] }))} /><span>{layer}</span></label>)}</div>
          <div className={`editor-validation ${errors.length ? "invalid" : "valid"}`}><strong>{errors.length ? "WARNING" : "VALID TRACK"}</strong>{errors.length ? errors.map((error) => <span key={error}>{error}</span>) : <span>No intersections detected. The circuit can be saved.</span>}</div>
          {message && <p className="editor-message" role="status">{message}</p>}
          {dirty && <small className="editor-dirty">● Unsaved changes</small>}
        </aside>
      </div>
    </main>
  );
}
