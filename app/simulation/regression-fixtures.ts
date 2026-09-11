import { DEFAULT_FORMULA_VEHICLE_SPEC } from "../domain/vehicle-spec.js";
import { createSampleDocument } from "../track-creator/domain/track/document.js";
import { compileAuthoringTrack } from "./authoring-track-compiler.js";
import { WorldRaceEngine, type RaceEngineDriver } from "./world-race-engine.js";

export type RegressionCircuitStyle = "fast" | "flowing" | "technical" | "street" | "custom";
export type RegressionFixture = { id: string; style: RegressionCircuitStyle; seed: number; gridSize: 12 | 16 | 22; steps: number };
export type RegressionMetrics = {
  fixtureId: string;
  seed: number;
  gridSize: number;
  averageSpeed: number;
  medianSpeed: number;
  p90Speed: number;
  averageDistance: number;
  leaderDistance: number;
  offTrackCars: number;
  order: string[];
};

export const REGRESSION_FIXTURES: readonly RegressionFixture[] = Object.freeze([
  { id: "fast-12-104729", style: "fast", seed: 104_729, gridSize: 12, steps: 1_200 },
  { id: "flowing-16-130363", style: "flowing", seed: 130_363, gridSize: 16, steps: 1_200 },
  { id: "technical-22-155921", style: "technical", seed: 155_921, gridSize: 22, steps: 1_200 },
  { id: "street-12-181081", style: "street", seed: 181_081, gridSize: 12, steps: 1_200 },
  { id: "custom-22-206369", style: "custom", seed: 206_369, gridSize: 22, steps: 1_200 },
]);

const seeded = (seed: number) => {
  const value = Math.sin(seed * 9283.31 + 17.71) * 43758.5453;
  return value - Math.floor(value);
};

function pointsFor(style: RegressionCircuitStyle) {
  const count = style === "technical" ? 28 : style === "street" ? 20 : 24;
  return Array.from({ length: count }, (_, index): readonly [number, number] => {
    const angle = index / count * Math.PI * 2;
    if (style === "fast") return [0.5 + Math.cos(angle) * 0.41, 0.5 + Math.sin(angle) * 0.32];
    if (style === "flowing") {
      const radius = 0.36 + Math.sin(angle * 3) * 0.025;
      return [0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * (0.3 + Math.cos(angle * 2) * 0.018)];
    }
    if (style === "technical") {
      const radius = 0.34 + Math.cos(angle * 4) * 0.035;
      return [0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * (0.285 + Math.sin(angle * 3) * 0.018)];
    }
    if (style === "street") {
      const power = 0.42;
      const x = Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** power;
      const y = Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** power;
      return [0.5 + x * 0.38, 0.5 + y * 0.3];
    }
    const radius = 0.35 + Math.sin(angle * 2) * 0.045 + Math.cos(angle * 5) * 0.018;
    return [0.5 + Math.cos(angle) * radius, 0.5 + Math.sin(angle) * radius * 0.82];
  });
}

function driversFor(fixture: RegressionFixture): RaceEngineDriver[] {
  return Array.from({ length: fixture.gridSize }, (_, index) => {
    const base = fixture.seed + index * 997;
    const attribute = (offset: number, minimum: number, span: number) => minimum + Math.round(seeded(base + offset) * span);
    return {
      id: `${fixture.id}-driver-${index + 1}`,
      skill: attribute(11, 68, 30),
      aggression: attribute(23, 45, 52),
      consistency: attribute(37, 60, 38),
      cornering: attribute(47, 65, 33),
      overtaking: attribute(59, 48, 50),
      defense: attribute(71, 48, 50),
      risk: attribute(83, 35, 62),
    };
  });
}

const percentile = (values: number[], fraction: number) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * fraction))] ?? 0;
const rounded = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

/** Replays one named seed into stable metrics suitable for numerical regression comparison. */
export async function runRegressionFixture(fixture: RegressionFixture): Promise<RegressionMetrics> {
  const document = createSampleDocument();
  document.id = fixture.id;
  document.metadata.name = fixture.id;
  const track = compileAuthoringTrack(document);
  const drivers = driversFor(fixture);
  const engine = await WorldRaceEngine.create(track, DEFAULT_FORMULA_VEHICLE_SPEC, drivers);
  drivers.forEach((driver, index) => engine.setPerformanceModifier(driver.id, (seeded(fixture.seed * 3 + index * 101) - 0.5) * 0.16));
  engine.step(fixture.steps);
  const snapshot = engine.snapshot();
  engine.free();
  const speeds = snapshot.map((car) => Math.max(0, car.longitudinalVelocity)).sort((a, b) => a - b);
  const distances = snapshot.map((car) => car.completedDistance);
  const order = [...snapshot].sort((a, b) => b.completedDistance - a.completedDistance).map((car) => car.id);
  return {
    fixtureId: fixture.id,
    seed: fixture.seed,
    gridSize: fixture.gridSize,
    averageSpeed: rounded(speeds.reduce((sum, value) => sum + value, 0) / speeds.length),
    medianSpeed: rounded(percentile(speeds, 0.5)),
    p90Speed: rounded(percentile(speeds, 0.9)),
    averageDistance: rounded(distances.reduce((sum, value) => sum + value, 0) / distances.length),
    leaderDistance: rounded(Math.max(...distances)),
    offTrackCars: snapshot.filter((car) => Math.abs(car.lateralOffset) > 7).length,
    order,
  };
}
