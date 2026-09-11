import type { ConnectorReference, TrackDocument, TrackModule } from "./types.js";
import {
  buildPathGeometry,
  effectiveModule,
  getOpenConnectors,
} from "./geometry.js";
import { id } from "./document.js";
import { defaultFreeform } from "./advancedModules.js";

/** Materialize semantic pit lines at explicit shared junction traversals. */
export function syncPitJunctions(document: TrackDocument): TrackDocument {
  const primary = document.paths.find((p) => p.kind === "primary-loop");
  const main = primary && buildPathGeometry(document, primary.id)?.path;
  if (!main || !primary) return document;
  for (const pit of document.paths.filter(
    (p) => p.kind === "pit" && p.traversals?.length,
  )) {
    for (const [step, type, field] of [
      [pit.traversals![0], "pit-entry", "entryMarkerId"],
      [pit.traversals!.at(-1)!, "pit-exit", "exitMarkerId"],
    ] as const) {
      const module = document.modules.find((m) => m.id === step.moduleId);
      if (
        !module ||
        step.traversalId !== "branch" ||
        !primary.sourceModuleIds.includes(module.id) ||
        module.definitionId !== type
      )
        continue;
      const sample = main.samples.find(
        (s) =>
          s.moduleId === module.id &&
          Math.abs(s.localT - (type === "pit-entry" ? 0 : 1)) < 1e-6,
      );
      if (!sample) continue;
      let marker = document.markers.find((m) => m.id === pit[field]);
      if (!marker) {
        marker = {
          id: id(type),
          type,
          location: { pathId: primary.id, distanceMeters: sample.s },
          configuration: {},
        };
        document.markers.push(marker);
        pit[field] = marker.id;
      }
      marker.location = {
        pathId: primary.id,
        distanceMeters: main.wrapDistance(sample.s),
        anchor: {
          moduleId: module.id,
          localT: sample.localT,
          traversalId: sample.traversalId,
        },
      };
    }
  }
  return document;
}

/** Creates one tangent-aligned Freeform road between the selected open route ends. */
export function createConnectorBridge(
  document: TrackDocument,
  pathId: string,
  sourceEnd: ConnectorReference,
  targetStart: ConnectorReference,
): TrackDocument {
  if (sourceEnd.connectorId !== "end" || targetStart.connectorId !== "start")
    throw new Error("Choose an open End connector followed by an open Start connector.");
  if (
    sourceEnd.moduleId === targetStart.moduleId ||
    !document.paths.find((path) => path.id === pathId)?.sourceModuleIds.includes(sourceEnd.moduleId) ||
    !document.paths.find((path) => path.id === pathId)?.sourceModuleIds.includes(targetStart.moduleId)
  )
    throw new Error("Both connectors must belong to distinct modules on the active route.");

  const open = getOpenConnectors(document, pathId);
  const source = open.find(
    (item) => item.module.id === sourceEnd.moduleId && item.connector.id === sourceEnd.connectorId,
  );
  const target = open.find(
    (item) => item.module.id === targetStart.moduleId && item.connector.id === targetStart.connectorId,
  );
  if (!source || !target) throw new Error("Choose two currently open route connectors.");

  const next = structuredClone(document);
  const path = next.paths.find((item) => item.id === pathId)!;
  const inheritedSource = next.modules.find((item) => item.id === targetStart.moduleId)!;
  const inherited = effectiveModule(next, inheritedSource);
  const length = Math.max(
    4,
    Math.hypot(
      target.connector.position.x - source.connector.position.x,
      target.connector.position.y - source.connector.position.y,
    ) / 3,
  );
  const controls = defaultFreeform();
  controls[0].outHandle = {
    x: Math.cos(source.connector.tangent) * length,
    y: Math.sin(source.connector.tangent) * length,
  };
  controls[1].position = {
    x: target.connector.position.x - source.connector.position.x,
    y: target.connector.position.y - source.connector.position.y,
    z: target.connector.position.z - source.connector.position.z,
  };
  controls[1].inHandle = {
    x: Math.cos(target.connector.tangent) * length,
    y: Math.sin(target.connector.tangent) * length,
  };
  const width = inherited.parameters.width ?? target.connector.width;
  const bridge: TrackModule = {
    id: id("module"),
    definitionId: "freeform-curve",
    transform: { position: { ...source.connector.position }, rotation: 0 },
    parameters: {
      width,
      length: length * 3,
      offset: 0,
      elevationDelta: controls[1].position.z,
      connectorBridge: 1,
    },
    controlPoints: controls,
    properties: inherited.properties,
    generatedBridge: {
      sourceEnd,
      targetStart,
      inheritedFromModuleId: targetStart.moduleId,
    },
  };
  next.modules.push(bridge);
  path.sourceModuleIds.push(bridge.id);
  if (path.traversals) {
    const sourceIndex = path.traversals.findIndex(
      (step) => step.moduleId === sourceEnd.moduleId,
    );
    if (sourceIndex < 0) throw new Error("The selected End is not in the active route traversal.");
    path.traversals.splice(sourceIndex + 1, 0, {
      moduleId: bridge.id,
      traversalId: "main",
      reversed: false,
    });
  }
  next.connections.push(
    {
      id: id("connection"),
      a: sourceEnd,
      b: { moduleId: bridge.id, connectorId: "start" },
    },
    {
      id: id("connection"),
      a: { moduleId: bridge.id, connectorId: "end" },
      b: targetStart,
    },
  );
  path.closed = getOpenConnectors(next, pathId).length === 0;
  return next;
}
