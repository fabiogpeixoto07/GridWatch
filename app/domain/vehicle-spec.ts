export const VEHICLE_SPEC_VERSION = 1 as const;

export type VehicleSpec = {
  version: typeof VEHICLE_SPEC_VERSION;
  massKg: number;
  lengthMeters: number;
  widthMeters: number;
  wheelbaseMeters: number;
  maxSteeringDegrees: number;
  maxEngineForceNewtons: number;
  maxBrakeForceNewtons: number;
  brakeBias: number;
  tireGrip: number;
  corneringStiffness: number;
  dragCoefficient: number;
  downforceCoefficient: number;
  rollingResistance: number;
  reliability: number;
};

export const DEFAULT_FORMULA_VEHICLE_SPEC: VehicleSpec = Object.freeze({
  version: VEHICLE_SPEC_VERSION,
  massKg: 798,
  lengthMeters: 5.45,
  widthMeters: 2,
  wheelbaseMeters: 3.6,
  maxSteeringDegrees: 24,
  maxEngineForceNewtons: 13_500,
  maxBrakeForceNewtons: 31_000,
  brakeBias: 0.57,
  tireGrip: 1.72,
  corneringStiffness: 8.4,
  dragCoefficient: 0.92,
  downforceCoefficient: 1.45,
  rollingResistance: 0.015,
  reliability: 0.94,
});

const bounded = (value: unknown, fallback: number, minimum: number, maximum: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
};

export function normalizeVehicleSpec(value: Partial<VehicleSpec> | null | undefined): VehicleSpec {
  const fallback = DEFAULT_FORMULA_VEHICLE_SPEC;
  return {
    version: VEHICLE_SPEC_VERSION,
    massKg: bounded(value?.massKg, fallback.massKg, 300, 3_000),
    lengthMeters: bounded(value?.lengthMeters, fallback.lengthMeters, 2.5, 8),
    widthMeters: bounded(value?.widthMeters, fallback.widthMeters, 1.2, 3),
    wheelbaseMeters: bounded(value?.wheelbaseMeters, fallback.wheelbaseMeters, 1.8, 5),
    maxSteeringDegrees: bounded(value?.maxSteeringDegrees, fallback.maxSteeringDegrees, 8, 45),
    maxEngineForceNewtons: bounded(value?.maxEngineForceNewtons, fallback.maxEngineForceNewtons, 2_000, 40_000),
    maxBrakeForceNewtons: bounded(value?.maxBrakeForceNewtons, fallback.maxBrakeForceNewtons, 5_000, 80_000),
    brakeBias: bounded(value?.brakeBias, fallback.brakeBias, 0.4, 0.75),
    tireGrip: bounded(value?.tireGrip, fallback.tireGrip, 0.45, 2.5),
    corneringStiffness: bounded(value?.corneringStiffness, fallback.corneringStiffness, 1, 20),
    dragCoefficient: bounded(value?.dragCoefficient, fallback.dragCoefficient, 0.05, 3),
    downforceCoefficient: bounded(value?.downforceCoefficient, fallback.downforceCoefficient, 0, 100),
    rollingResistance: bounded(value?.rollingResistance, fallback.rollingResistance, 0, 0.08),
    reliability: bounded(value?.reliability, fallback.reliability, 0.5, 1),
  };
}

export function validateVehicleSpec(spec: VehicleSpec) {
  const issues: string[] = [];
  if (spec.massKg < 300 || spec.massKg > 3_000) issues.push("Vehicle mass must be between 300 and 3,000 kg.");
  if (spec.tireGrip < 0.45 || spec.tireGrip > 2.5) issues.push("Tire grip must be between 0.45 and 2.5.");
  if (spec.maxSteeringDegrees < 8 || spec.maxSteeringDegrees > 45) issues.push("Steering lock must be between 8 and 45 degrees.");
  if (spec.reliability < 0.5 || spec.reliability > 1) issues.push("Reliability must be between 0.5 and 1.");
  if (spec.wheelbaseMeters >= spec.lengthMeters) issues.push("Wheelbase must be shorter than the vehicle length.");
  if (spec.widthMeters >= spec.lengthMeters) issues.push("Vehicle width must be shorter than its length.");
  if (spec.maxBrakeForceNewtons <= spec.maxEngineForceNewtons) issues.push("Brake force must exceed engine force.");
  return issues;
}
