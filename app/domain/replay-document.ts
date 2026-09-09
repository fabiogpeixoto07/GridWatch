import {
  AUTHORITATIVE_TICK_RATE_HZ,
  RACE_EVENT_VERSION,
  RACE_PROTOCOL_VERSION,
  type Quaternion,
  type RaceCarTiming,
  type RaceClassificationEntry,
  type RaceEvent,
  type Vector3,
  isRaceClassificationEntry,
  isRaceCarTiming,
  isRaceEvent,
} from "./race-protocol.js";

export const REPLAY_DOCUMENT_VERSION = 1 as const;

export type ReplayWheelFrame = Readonly<{
  id: string;
  position: Vector3;
  rotation: Quaternion;
  suspensionCompressionMeters: number;
  steeringRadians: number;
  spinRadians: number;
  grounded: boolean;
}>;

export type ReplayCarFrame = Readonly<{
  driverId: string;
  position: Vector3;
  rotation: Quaternion;
  wheels: readonly ReplayWheelFrame[];
  timing: RaceCarTiming;
}>;

export type ReplayFrame = Readonly<{
  authoritativeTick: number;
  cars: readonly ReplayCarFrame[];
}>;

export type ReplayDocumentV1 = Readonly<{
  version: typeof REPLAY_DOCUMENT_VERSION;
  protocolVersion: typeof RACE_PROTOCOL_VERSION;
  id: string;
  sessionId: string;
  createdAt: string;
  tickRateHz: typeof AUTHORITATIVE_TICK_RATE_HZ;
  durationTicks: number;
  metadata: Readonly<{
    engineVersion: string;
    contentRevision: string;
    trackId: string;
    trackRevision: string;
    competitionId: string;
    competitionRevision: string;
    vehicleSpecId: string;
    vehicleSpecRevision: string;
    seed: number;
  }>;
  roster: readonly Readonly<{ driverId: string; teamId: string; displayName: string; raceNumber: number }>[];
  frames: readonly ReplayFrame[];
  events: readonly RaceEvent[];
  finalClassification: readonly RaceClassificationEntry[];
}>;

export type ReplayValidationResult = Readonly<{
  valid: boolean;
  issues: readonly string[];
}>;

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isNonNegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isPositiveInteger = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const isUint32 = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 0xffff_ffff;
const isVector3 = (value: unknown): value is Vector3 => isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y) && isFiniteNumber(value.z);
const isQuaternion = (value: unknown): value is Quaternion => {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y) || !isFiniteNumber(value.z) || !isFiniteNumber(value.w)) return false;
  const magnitudeSquared = value.x ** 2 + value.y ** 2 + value.z ** 2 + value.w ** 2;
  return magnitudeSquared >= 0.98 ** 2 && magnitudeSquared <= 1.02 ** 2;
};
function eventDriverIds(event: RaceEvent) {
  switch (event.type) {
    case "sector-completed":
    case "lap-completed":
    case "off-track":
    case "recovered":
    case "retired":
    case "driver-finished": return [event.driverId];
    case "overtake": return [event.driverId, event.passedDriverId];
    case "collision": return [...event.driverIds];
    case "race-completed": return event.classification.map((entry) => entry.driverId);
    case "countdown-started":
    case "race-started": return [];
  }
}

function isReplayWheelFrame(value: unknown) {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isVector3(value.position)
    && isQuaternion(value.rotation)
    && isFiniteNumber(value.suspensionCompressionMeters)
    && value.suspensionCompressionMeters >= 0
    && isFiniteNumber(value.steeringRadians)
    && isFiniteNumber(value.spinRadians)
    && typeof value.grounded === "boolean";
}

function isReplayCarFrame(value: unknown): value is ReplayCarFrame {
  return isRecord(value)
    && isNonEmptyString(value.driverId)
    && isVector3(value.position)
    && isQuaternion(value.rotation)
    && Array.isArray(value.wheels)
    && value.wheels.length === 4
    && value.wheels.every(isReplayWheelFrame)
    && new Set(value.wheels.map((wheel) => wheel.id)).size === value.wheels.length
    && isRaceCarTiming(value.timing);
}

function validateMetadata(metadata: unknown, issues: string[]) {
  if (!isRecord(metadata)) {
    issues.push("Replay metadata is missing.");
    return;
  }
  for (const field of ["engineVersion", "contentRevision", "trackId", "trackRevision", "competitionId", "competitionRevision", "vehicleSpecId", "vehicleSpecRevision"] as const) {
    if (!isNonEmptyString(metadata[field])) issues.push(`Replay metadata.${field} must be a non-empty string.`);
  }
  if (!isUint32(metadata.seed)) issues.push("Replay metadata.seed must be an unsigned 32-bit integer.");
}

function classificationsMatch(left: readonly RaceClassificationEntry[], right: readonly RaceClassificationEntry[]) {
  return left.length === right.length && left.every((entry, index) => {
    const candidate = right[index];
    return candidate !== undefined
      && entry.position === candidate.position
      && entry.driverId === candidate.driverId
      && entry.completedLaps === candidate.completedLaps
      && entry.finishTick === candidate.finishTick
      && entry.status === candidate.status;
  });
}

export function validateReplayDocument(value: unknown): ReplayValidationResult {
  const issues: string[] = [];
  if (!isRecord(value)) return { valid: false, issues: ["Replay must be an object."] };
  if ("camera" in value || "cameraId" in value || "activeCameraId" in value) issues.push("Replay documents cannot store a playback camera selection.");
  if (value.version !== REPLAY_DOCUMENT_VERSION) issues.push(`Unsupported replay version; expected ${REPLAY_DOCUMENT_VERSION}.`);
  if (value.protocolVersion !== RACE_PROTOCOL_VERSION) issues.push(`Unsupported race protocol version; expected ${RACE_PROTOCOL_VERSION}.`);
  if (!isNonEmptyString(value.id)) issues.push("Replay id must be a non-empty string.");
  if (!isNonEmptyString(value.sessionId)) issues.push("Replay sessionId must be a non-empty string.");
  if (typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) issues.push("Replay createdAt must be an ISO-compatible timestamp.");
  if (value.tickRateHz !== AUTHORITATIVE_TICK_RATE_HZ) issues.push(`Replay tickRateHz must be ${AUTHORITATIVE_TICK_RATE_HZ}.`);
  if (!isNonNegativeInteger(value.durationTicks)) issues.push("Replay durationTicks must be a non-negative safe integer.");
  validateMetadata(value.metadata, issues);

  const rosterIds = new Set<string>();
  if (!Array.isArray(value.roster) || value.roster.length === 0 || value.roster.length > 22) {
    issues.push("Replay roster must contain between 1 and 22 drivers.");
  } else {
    for (const [index, member] of value.roster.entries()) {
      if (!isRecord(member)
        || !isNonEmptyString(member.driverId)
        || !isNonEmptyString(member.teamId)
        || !isNonEmptyString(member.displayName)
        || !isPositiveInteger(member.raceNumber)) {
        issues.push(`Replay roster entry ${index} is invalid.`);
        continue;
      }
      if (rosterIds.has(member.driverId)) issues.push(`Replay roster repeats driver ${member.driverId}.`);
      rosterIds.add(member.driverId);
    }
  }

  let previousTick = -1;
  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    issues.push("Replay must contain at least one frame.");
  } else {
    for (const [index, frame] of value.frames.entries()) {
      if (!isRecord(frame) || !isNonNegativeInteger(frame.authoritativeTick) || !Array.isArray(frame.cars)) {
        issues.push(`Replay frame ${index} is invalid.`);
        continue;
      }
      if ("camera" in frame || "cameraId" in frame || "activeCameraId" in frame) issues.push(`Replay frame ${index} cannot store a playback camera selection.`);
      if (frame.authoritativeTick <= previousTick) issues.push(`Replay frame ${index} is not in strictly increasing tick order.`);
      previousTick = frame.authoritativeTick;
      if (isNonNegativeInteger(value.durationTicks) && frame.authoritativeTick > value.durationTicks) issues.push(`Replay frame ${index} exceeds durationTicks.`);
      if (frame.cars.length !== rosterIds.size || !frame.cars.every(isReplayCarFrame)) {
        issues.push(`Replay frame ${index} does not contain one valid pose for every roster driver.`);
        continue;
      }
      const frameIds = frame.cars.map((car) => car.driverId as string);
      if (new Set(frameIds).size !== frameIds.length || frameIds.some((id) => !rosterIds.has(id))) issues.push(`Replay frame ${index} has unknown or duplicate drivers.`);
    }
    if (isRecord(value.frames[0]) && value.frames[0].authoritativeTick !== 0) issues.push("The first replay frame must start at tick zero.");
    if (isNonNegativeInteger(value.durationTicks) && previousTick !== value.durationTicks) issues.push("The final replay frame must equal durationTicks.");
  }

  if (!Array.isArray(value.events)) {
    issues.push("Replay events must be an array.");
  } else {
    let lastEventTick = -1;
    const eventIds = new Set<string>();
    for (const [index, event] of value.events.entries()) {
      if (!isRaceEvent(event)) {
        issues.push(`Replay event ${index} is invalid or uses an unsupported version.`);
        continue;
      }
      if (event.sessionId !== value.sessionId) issues.push(`Replay event ${index} belongs to another session.`);
      if (isRecord(value.metadata) && (event.engineVersion !== value.metadata.engineVersion || event.contentRevision !== value.metadata.contentRevision)) issues.push(`Replay event ${index} uses different content revisions.`);
      if (event.authoritativeTick < lastEventTick) issues.push(`Replay event ${index} is not in tick order.`);
      if (isNonNegativeInteger(value.durationTicks) && event.authoritativeTick > value.durationTicks) issues.push(`Replay event ${index} exceeds durationTicks.`);
      if (eventIds.has(event.eventId)) issues.push(`Replay event id ${event.eventId} is duplicated.`);
      if (eventDriverIds(event).some((driverId) => !rosterIds.has(driverId))) issues.push(`Replay event ${index} references a driver outside the roster.`);
      eventIds.add(event.eventId);
      lastEventTick = event.authoritativeTick;
    }
    const starts = value.events.filter((event): event is RaceEvent => isRaceEvent(event) && event.type === "race-started");
    const completions = value.events.filter((event): event is Extract<RaceEvent, { type: "race-completed" }> => isRaceEvent(event) && event.type === "race-completed");
    if (starts.length !== 1 || starts[0]?.authoritativeTick !== 0) issues.push("Replay must contain exactly one race-started event at tick zero.");
    if (completions.length !== 1 || completions[0]?.authoritativeTick !== value.durationTicks) issues.push("Replay must contain exactly one race-completed event at durationTicks.");
    if (completions.length === 1 && Array.isArray(value.finalClassification) && !classificationsMatch(completions[0].classification, value.finalClassification as RaceClassificationEntry[])) {
      issues.push("Replay race-completed classification must match finalClassification.");
    }
  }

  if (!Array.isArray(value.finalClassification)
    || value.finalClassification.length !== rosterIds.size
    || !value.finalClassification.every(isRaceClassificationEntry)) {
    issues.push("Replay finalClassification must contain one valid entry per roster driver.");
  } else {
    const classificationIds = value.finalClassification.map((entry) => entry.driverId);
    const validPositions = value.finalClassification.every((entry, index) => entry.position === index + 1);
    if (!validPositions || new Set(classificationIds).size !== classificationIds.length || classificationIds.some((id) => !rosterIds.has(id))) {
      issues.push("Replay finalClassification contains invalid positions, unknown drivers, or duplicates.");
    }
    if (value.finalClassification.some((entry) => entry.status === "running")) issues.push("Replay finalClassification cannot contain running drivers.");
    if (isNonNegativeInteger(value.durationTicks)) {
      const durationTicks = value.durationTicks;
      if (value.finalClassification.some((entry) => entry.finishTick !== null && entry.finishTick > durationTicks)) {
        issues.push("Replay finalClassification contains a finish tick beyond durationTicks.");
      }
    }
    const finalFrame = Array.isArray(value.frames) ? value.frames.at(-1) : undefined;
    if (isRecord(finalFrame) && Array.isArray(finalFrame.cars) && finalFrame.cars.every(isReplayCarFrame)) {
      const timingByDriver = new Map(finalFrame.cars.map((car) => [car.driverId, car.timing]));
      if (value.finalClassification.some((entry) => {
        const timing = timingByDriver.get(entry.driverId);
        return timing?.status !== entry.status || timing.completedLaps !== entry.completedLaps;
      })) issues.push("Replay final frame timing must match finalClassification.");
    }
  }

  return { valid: issues.length === 0, issues };
}

export function isReplayDocumentV1(value: unknown): value is ReplayDocumentV1 {
  return validateReplayDocument(value).valid;
}

/** Event documents deliberately share the live protocol version. */
export const REPLAY_EVENT_VERSION = RACE_EVENT_VERSION;
