export const RACE_PROTOCOL_VERSION = 1 as const;
export const RACE_SNAPSHOT_VERSION = 1 as const;
export const RACE_EVENT_VERSION = 1 as const;
export const AUTHORITATIVE_TICK_RATE_HZ = 120 as const;

export type Vector3 = Readonly<{ x: number; y: number; z: number }>;
export type Quaternion = Readonly<{ x: number; y: number; z: number; w: number }>;

export type RaceRevisionSet = Readonly<{
  engineVersion: string;
  contentRevision: string;
}>;

type RaceCommandBase = RaceRevisionSet & Readonly<{
  protocolVersion: typeof RACE_PROTOCOL_VERSION;
  sessionId: string;
  commandId: string;
  /** Last worker tick observed by the sender. The worker uses it to reject stale control. */
  expectedTick: number;
}>;

export type RaceCommand =
  | (RaceCommandBase & Readonly<{
      type: "initialize";
      seed: number;
      trackId: string;
      competitionId: string;
      vehicleSpecId: string;
      totalLaps: number;
      gridDriverIds: readonly string[];
    }>)
  | (RaceCommandBase & Readonly<{ type: "start"; countdownTicks: number }>)
  | (RaceCommandBase & Readonly<{ type: "pause" }>)
  | (RaceCommandBase & Readonly<{ type: "resume" }>)
  | (RaceCommandBase & Readonly<{ type: "set-playback-rate"; rate: 1 | 2 | 4 }>)
  | (RaceCommandBase & Readonly<{ type: "restart"; seed: number }>)
  | (RaceCommandBase & Readonly<{ type: "abort" }>)
  | (RaceCommandBase & Readonly<{ type: "dispose" }>);

export type RaceLifecycleState =
  | "uninitialized"
  | "ready"
  | "countdown"
  | "racing"
  | "paused"
  | "finished"
  | "disposed";

export type WheelSnapshot = Readonly<{
  id: string;
  position: Vector3;
  rotation: Quaternion;
  suspensionCompressionMeters: number;
  steeringRadians: number;
  spinRadians: number;
  grounded: boolean;
}>;

export type RaceCarTiming = Readonly<{
  completedLaps: number;
  currentLap: number;
  sectorIndex: number;
  currentLapTicks: number;
  lastLapTicks: number | null;
  bestLapTicks: number | null;
  gapToLeaderTicks: number | null;
  status: "running" | "finished" | "retired";
}>;

export type RaceCarSnapshot = Readonly<{
  driverId: string;
  position: Vector3;
  rotation: Quaternion;
  linearVelocity: Vector3;
  angularVelocity: Vector3;
  wheels: readonly WheelSnapshot[];
  timing: RaceCarTiming;
}>;

export type RaceClassificationEntry = Readonly<{
  position: number;
  driverId: string;
  completedLaps: number;
  finishTick: number | null;
  status: "running" | "finished" | "retired";
}>;

export type RaceSnapshot = RaceRevisionSet & Readonly<{
  version: typeof RACE_SNAPSHOT_VERSION;
  protocolVersion: typeof RACE_PROTOCOL_VERSION;
  sessionId: string;
  authoritativeTick: number;
  lifecycle: Exclude<RaceLifecycleState, "uninitialized" | "disposed">;
  cars: readonly RaceCarSnapshot[];
  classification: readonly RaceClassificationEntry[];
}>;

type RaceEventBase = RaceRevisionSet & Readonly<{
  version: typeof RACE_EVENT_VERSION;
  protocolVersion: typeof RACE_PROTOCOL_VERSION;
  sessionId: string;
  eventId: string;
  authoritativeTick: number;
}>;

export type RaceEvent =
  | (RaceEventBase & Readonly<{ type: "countdown-started"; durationTicks: number }>)
  | (RaceEventBase & Readonly<{ type: "race-started" }>)
  | (RaceEventBase & Readonly<{ type: "sector-completed"; driverId: string; lap: number; sectorIndex: number; sectorTicks: number }>)
  | (RaceEventBase & Readonly<{ type: "lap-completed"; driverId: string; lap: number; lapTicks: number; personalBest: boolean }>)
  | (RaceEventBase & Readonly<{ type: "overtake"; driverId: string; passedDriverId: string; position: number }>)
  | (RaceEventBase & Readonly<{ type: "collision"; driverIds: readonly string[]; impulseNewtonSeconds: number }>)
  | (RaceEventBase & Readonly<{ type: "off-track"; driverId: string; surface: string }>)
  | (RaceEventBase & Readonly<{ type: "recovered"; driverId: string }>)
  | (RaceEventBase & Readonly<{ type: "retired"; driverId: string; reason: string }>)
  | (RaceEventBase & Readonly<{ type: "driver-finished"; driverId: string; position: number; finishTick: number }>)
  | (RaceEventBase & Readonly<{ type: "race-completed"; classification: readonly RaceClassificationEntry[] }>);

export type RaceWorkerReady = RaceRevisionSet & Readonly<{
  type: "ready";
  protocolVersion: typeof RACE_PROTOCOL_VERSION;
  sessionId: string;
  commandId: string;
  authoritativeTick: 0;
  tickRateHz: typeof AUTHORITATIVE_TICK_RATE_HZ;
}>;

export type RaceWorkerAck = RaceRevisionSet & Readonly<{
  type: "ack";
  protocolVersion: typeof RACE_PROTOCOL_VERSION;
  sessionId: string;
  commandId: string;
  commandType: Exclude<RaceCommand["type"], "initialize">;
  authoritativeTick: number;
  lifecycle: RaceLifecycleState;
}>;

export type RaceWorkerFault = RaceRevisionSet & Readonly<{
  type: "fault";
  protocolVersion: typeof RACE_PROTOCOL_VERSION;
  sessionId: string;
  commandId: string | null;
  authoritativeTick: number;
  code: string;
  message: string;
  recoverable: boolean;
}>;

export type RaceWorkerInboundMessage = RaceCommand;

export type RaceWorkerOutboundMessage =
  | RaceWorkerReady
  | RaceWorkerAck
  | RaceWorkerFault
  | (RaceRevisionSet & Readonly<{
      type: "snapshot";
      protocolVersion: typeof RACE_PROTOCOL_VERSION;
      sessionId: string;
      authoritativeTick: number;
      snapshot: RaceSnapshot;
    }>)
  | (RaceRevisionSet & Readonly<{
      type: "events";
      protocolVersion: typeof RACE_PROTOCOL_VERSION;
      sessionId: string;
      authoritativeTick: number;
      events: readonly RaceEvent[];
    }>);

/** @deprecated Prefer the directional RaceWorkerInboundMessage/RaceWorkerOutboundMessage names. */
export type RaceWorkerMessage = RaceWorkerOutboundMessage;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isPositiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const isUint32 = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;
const hasUniqueStrings = (value: unknown): value is string[] => Array.isArray(value)
  && value.length > 0
  && value.every(isNonEmptyString)
  && new Set(value).size === value.length;

const hasProtocolIdentity = (value: UnknownRecord) => value.protocolVersion === RACE_PROTOCOL_VERSION
  && isNonEmptyString(value.sessionId)
  && isNonEmptyString(value.engineVersion)
  && isNonEmptyString(value.contentRevision);

const isVector3 = (value: unknown): value is Vector3 => isRecord(value)
  && isFiniteNumber(value.x)
  && isFiniteNumber(value.y)
  && isFiniteNumber(value.z);

const isQuaternion = (value: unknown): value is Quaternion => {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z) || !isFiniteNumber(value.w)) return false;
  const magnitudeSquared = value.x ** 2 + value.y ** 2 + value.z ** 2 + value.w ** 2;
  return magnitudeSquared >= 0.98 ** 2 && magnitudeSquared <= 1.02 ** 2;
};

const isWheelSnapshot = (value: unknown): value is WheelSnapshot => isRecord(value)
  && isNonEmptyString(value.id)
  && isVector3(value.position)
  && isQuaternion(value.rotation)
  && isFiniteNumber(value.suspensionCompressionMeters)
  && value.suspensionCompressionMeters >= 0
  && isFiniteNumber(value.steeringRadians)
  && isFiniteNumber(value.spinRadians)
  && typeof value.grounded === "boolean";

export const isRaceCarTiming = (value: unknown): value is RaceCarTiming => isRecord(value)
  && isNonNegativeInteger(value.completedLaps)
  && isPositiveInteger(value.currentLap)
  && isNonNegativeInteger(value.sectorIndex)
  && isNonNegativeInteger(value.currentLapTicks)
  && (value.lastLapTicks === null || isPositiveInteger(value.lastLapTicks))
  && (value.bestLapTicks === null || isPositiveInteger(value.bestLapTicks))
  && (value.gapToLeaderTicks === null || isNonNegativeInteger(value.gapToLeaderTicks))
  && (value.status === "running" || value.status === "finished" || value.status === "retired");

export const isRaceCarSnapshot = (value: unknown): value is RaceCarSnapshot => isRecord(value)
  && isNonEmptyString(value.driverId)
  && isVector3(value.position)
  && isQuaternion(value.rotation)
  && isVector3(value.linearVelocity)
  && isVector3(value.angularVelocity)
  && Array.isArray(value.wheels)
  && value.wheels.length === 4
  && value.wheels.every(isWheelSnapshot)
  && new Set(value.wheels.map((wheel) => wheel.id)).size === value.wheels.length
  && isRaceCarTiming(value.timing);

export const isRaceClassificationEntry = (value: unknown): value is RaceClassificationEntry => isRecord(value)
  && isPositiveInteger(value.position)
  && isNonEmptyString(value.driverId)
  && isNonNegativeInteger(value.completedLaps)
  && (value.finishTick === null || isNonNegativeInteger(value.finishTick))
  && ((value.status === "finished" && isNonNegativeInteger(value.finishTick))
    || ((value.status === "running" || value.status === "retired") && value.finishTick === null));

const isOrderedClassification = (value: unknown): value is RaceClassificationEntry[] => Array.isArray(value)
  && value.length > 0
  && value.every(isRaceClassificationEntry)
  && value.every((entry, index) => entry.position === index + 1)
  && new Set(value.map((entry) => entry.driverId)).size === value.length;

export function isRaceCommand(value: unknown): value is RaceCommand {
  if (!isRecord(value) || !hasProtocolIdentity(value) || !isNonEmptyString(value.commandId) || !isNonNegativeInteger(value.expectedTick)) return false;
  switch (value.type) {
    case "initialize":
      return value.expectedTick === 0
        && isUint32(value.seed)
        && isNonEmptyString(value.trackId)
        && isNonEmptyString(value.competitionId)
        && isNonEmptyString(value.vehicleSpecId)
        && isPositiveInteger(value.totalLaps)
        && hasUniqueStrings(value.gridDriverIds)
        && value.gridDriverIds.length <= 22;
    case "start": return isNonNegativeInteger(value.countdownTicks);
    case "pause":
    case "resume":
    case "abort":
    case "dispose": return true;
    case "set-playback-rate": return value.rate === 1 || value.rate === 2 || value.rate === 4;
    case "restart": return isUint32(value.seed);
    default: return false;
  }
}

export function isRaceSnapshot(value: unknown): value is RaceSnapshot {
  if (!isRecord(value) || value.version !== RACE_SNAPSHOT_VERSION || !hasProtocolIdentity(value)) return false;
  if (!isNonNegativeInteger(value.authoritativeTick)
    || (value.lifecycle !== "ready" && value.lifecycle !== "countdown" && value.lifecycle !== "racing" && value.lifecycle !== "paused" && value.lifecycle !== "finished")
    || !Array.isArray(value.cars)
    || !value.cars.every(isRaceCarSnapshot)
    || new Set(value.cars.map((car) => car.driverId)).size !== value.cars.length
    || !Array.isArray(value.classification)
    || !value.classification.every(isRaceClassificationEntry)) return false;
  const cars = value.cars as RaceCarSnapshot[];
  const carIds = new Set(cars.map((car) => car.driverId));
  return isOrderedClassification(value.classification)
    && value.classification.length === cars.length
    && value.classification.every((entry) => {
      const car = cars.find((candidate) => candidate.driverId === entry.driverId);
      return carIds.has(entry.driverId)
        && car?.timing.status === entry.status
        && car.timing.completedLaps === entry.completedLaps;
    });
}

export function isRaceEvent(value: unknown): value is RaceEvent {
  if (!isRecord(value)
    || value.version !== RACE_EVENT_VERSION
    || !hasProtocolIdentity(value)
    || !isNonEmptyString(value.eventId)
    || !isNonNegativeInteger(value.authoritativeTick)) return false;
  switch (value.type) {
    case "countdown-started": return isNonNegativeInteger(value.durationTicks);
    case "race-started": return true;
    case "sector-completed": return isNonEmptyString(value.driverId) && isPositiveInteger(value.lap) && isNonNegativeInteger(value.sectorIndex) && isPositiveInteger(value.sectorTicks);
    case "lap-completed": return isNonEmptyString(value.driverId) && isPositiveInteger(value.lap) && isPositiveInteger(value.lapTicks) && typeof value.personalBest === "boolean";
    case "overtake": return isNonEmptyString(value.driverId) && isNonEmptyString(value.passedDriverId) && value.driverId !== value.passedDriverId && isPositiveInteger(value.position);
    case "collision": return hasUniqueStrings(value.driverIds) && value.driverIds.length >= 1 && isFiniteNumber(value.impulseNewtonSeconds) && value.impulseNewtonSeconds >= 0;
    case "off-track": return isNonEmptyString(value.driverId) && isNonEmptyString(value.surface);
    case "recovered": return isNonEmptyString(value.driverId);
    case "retired": return isNonEmptyString(value.driverId) && isNonEmptyString(value.reason);
    case "driver-finished": return isNonEmptyString(value.driverId) && isPositiveInteger(value.position) && isNonNegativeInteger(value.finishTick) && value.finishTick === value.authoritativeTick;
    case "race-completed": return isOrderedClassification(value.classification)
      && value.classification.every((entry) => entry.status !== "running");
    default: return false;
  }
}

const isLifecycleState = (value: unknown): value is RaceLifecycleState => value === "uninitialized"
  || value === "ready"
  || value === "countdown"
  || value === "racing"
  || value === "paused"
  || value === "finished"
  || value === "disposed";

const isValidAcknowledgementState = (commandType: unknown, lifecycle: unknown, authoritativeTick: unknown) => {
  switch (commandType) {
    case "start": return lifecycle === "countdown";
    case "pause": return lifecycle === "paused";
    case "resume": return lifecycle === "racing";
    case "set-playback-rate": return isLifecycleState(lifecycle) && lifecycle !== "uninitialized" && lifecycle !== "disposed";
    case "restart": return lifecycle === "ready" && authoritativeTick === 0;
    case "abort":
    case "dispose": return lifecycle === "disposed";
    default: return false;
  }
};

export function isRaceWorkerMessage(value: unknown): value is RaceWorkerOutboundMessage {
  if (!isRecord(value) || !hasProtocolIdentity(value) || !isNonNegativeInteger(value.authoritativeTick)) return false;
  switch (value.type) {
    case "ready":
      return isNonEmptyString(value.commandId)
        && value.authoritativeTick === 0
        && value.tickRateHz === AUTHORITATIVE_TICK_RATE_HZ;
    case "ack":
      return isNonEmptyString(value.commandId)
        && isValidAcknowledgementState(value.commandType, value.lifecycle, value.authoritativeTick);
    case "fault":
      return (value.commandId === null || isNonEmptyString(value.commandId))
        && isNonEmptyString(value.code)
        && isNonEmptyString(value.message)
        && typeof value.recoverable === "boolean";
    case "snapshot":
      return isRaceSnapshot(value.snapshot)
        && value.snapshot.sessionId === value.sessionId
        && value.snapshot.authoritativeTick === value.authoritativeTick
        && value.snapshot.engineVersion === value.engineVersion
        && value.snapshot.contentRevision === value.contentRevision;
    case "events":
      return Array.isArray(value.events)
        && value.events.length > 0
        && value.events.every((event) => isRaceEvent(event)
          && event.sessionId === value.sessionId
          && event.authoritativeTick <= (value.authoritativeTick as number)
          && event.engineVersion === value.engineVersion
          && event.contentRevision === value.contentRevision);
    default: return false;
  }
}
