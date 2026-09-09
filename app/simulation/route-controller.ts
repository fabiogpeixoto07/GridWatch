import type { CircuitRouteId } from "../domain/circuit-document.js";
import type { CompiledCircuit } from "./circuit-compiler.js";

export type RouteTravelDirection = "forward" | "reverse";
export type RouteCarState = {
  carId: string;
  routeId: CircuitRouteId;
  progress: number;
  direction: RouteTravelDirection;
  pitState: "on-track" | "requested" | "queued" | "servicing" | "exiting";
  escapeState: "none" | "entering" | "reversing" | "rejoining";
  assignedBoxId: string | null;
  serviceStartedAt: number | null;
};

export type RouteControllerState = {
  routeIds: CircuitRouteId[];
  reversibleRoutes: Set<CircuitRouteId>;
  pitBoxIds: string[];
  pitQueues: Record<string, string[]>;
  cars: Record<string, RouteCarState>;
};

export function createRouteController(circuit: CompiledCircuit): RouteControllerState {
  return {
    routeIds: circuit.routes.map((route) => route.id),
    reversibleRoutes: new Set(circuit.routes.filter((route) => route.reversible).map((route) => route.id)),
    pitBoxIds: circuit.pitBoxes.map((box) => box.id),
    pitQueues: Object.fromEntries(circuit.pitBoxes.map((box) => [box.id, []])),
    cars: {},
  };
}

function copyState(state: RouteControllerState): RouteControllerState {
  return {
    ...state,
    reversibleRoutes: new Set(state.reversibleRoutes),
    pitQueues: Object.fromEntries(Object.entries(state.pitQueues).map(([boxId, queue]) => [boxId, [...queue]])),
    cars: Object.fromEntries(Object.entries(state.cars).map(([carId, car]) => [carId, { ...car }])),
  };
}

export function registerRouteCar(state: RouteControllerState, carId: string, progress = 0): RouteControllerState {
  const next = copyState(state);
  next.cars[carId] = { carId, routeId: "main", progress: ((progress % 1) + 1) % 1, direction: "forward", pitState: "on-track", escapeState: "none", assignedBoxId: null, serviceStartedAt: null };
  return next;
}

export function requestPitEntry(state: RouteControllerState, carId: string): RouteControllerState {
  const next = copyState(state);
  const car = next.cars[carId];
  if (!car || !next.routeIds.some((routeId) => routeId.startsWith("pit:"))) return next;
  if (car.pitState === "on-track") car.pitState = "requested";
  return next;
}

export function assignPitBox(state: RouteControllerState, carId: string): RouteControllerState {
  const next = copyState(state);
  const car = next.cars[carId];
  if (!car || car.pitState !== "requested") return next;
  const available = next.pitBoxIds.find((boxId) => (next.pitQueues[boxId] ?? []).length === 0);
  const boxId = available ?? next.pitBoxIds.slice().sort((left, right) => (next.pitQueues[left]?.length ?? 0) - (next.pitQueues[right]?.length ?? 0))[0];
  if (!boxId) return next;
  car.assignedBoxId = boxId;
  car.pitState = "queued";
  next.pitQueues[boxId] = [...(next.pitQueues[boxId] ?? []), carId];
  return next;
}

export function beginPitService(state: RouteControllerState, carId: string, nowSeconds: number): RouteControllerState {
  const next = copyState(state);
  const car = next.cars[carId];
  if (!car || car.pitState !== "queued" || !car.assignedBoxId) return next;
  const queue = next.pitQueues[car.assignedBoxId] ?? [];
  if (queue[0] !== carId) return next;
  car.pitState = "servicing";
  car.serviceStartedAt = nowSeconds;
  return next;
}

export function completePitService(state: RouteControllerState, carId: string): RouteControllerState {
  const next = copyState(state);
  const car = next.cars[carId];
  if (!car || (car.pitState !== "servicing" && car.pitState !== "queued") || !car.assignedBoxId) return next;
  const boxId = car.assignedBoxId;
  next.pitQueues[boxId] = (next.pitQueues[boxId] ?? []).filter((queuedCarId) => queuedCarId !== carId);
  car.routeId = "main";
  car.progress = 0;
  car.direction = "forward";
  car.pitState = "exiting";
  car.serviceStartedAt = null;
  car.assignedBoxId = null;
  return next;
}

export function enterEscapeRoute(state: RouteControllerState, carId: string, routeId?: CircuitRouteId): RouteControllerState {
  const next = copyState(state);
  const car = next.cars[carId];
  const escapeId = routeId ?? next.routeIds.find((candidate) => candidate.startsWith("escape:"));
  if (!car || !escapeId || !next.reversibleRoutes.has(escapeId)) return next;
  car.routeId = escapeId;
  car.progress = 0;
  car.direction = "forward";
  car.escapeState = "entering";
  return next;
}

export function reverseAtEscapeTerminal(state: RouteControllerState, carId: string): RouteControllerState {
  const next = copyState(state);
  const car = next.cars[carId];
  if (!car || !car.routeId.startsWith("escape:") || !next.reversibleRoutes.has(car.routeId)) return next;
  car.direction = "reverse";
  car.escapeState = "reversing";
  car.progress = 1;
  return next;
}

export function rejoinMainRoute(state: RouteControllerState, carId: string, progress = 0): RouteControllerState {
  const next = copyState(state);
  const car = next.cars[carId];
  if (!car || !car.routeId.startsWith("escape:") || car.escapeState !== "reversing") return next;
  car.routeId = "main";
  car.progress = ((progress % 1) + 1) % 1;
  car.direction = "forward";
  car.escapeState = "rejoining";
  return next;
}

export function advanceRouteController(state: RouteControllerState, deltaSeconds: number, nowSeconds: number): RouteControllerState {
  const next = copyState(state);
  for (const car of Object.values(next.cars)) {
    if (car.pitState === "requested") {
      const assigned = assignPitBox(next, car.carId);
      Object.assign(next, assigned);
    } else if (car.pitState === "queued") {
      const started = beginPitService(next, car.carId, nowSeconds);
      Object.assign(next, started);
    } else if (car.pitState === "exiting") {
      car.pitState = "on-track";
    }
    if (car.escapeState === "reversing") car.progress = Math.max(0, car.progress - deltaSeconds * 0.12);
  }
  return next;
}
