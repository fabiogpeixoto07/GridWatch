import type { VehicleSpec } from "../domain/vehicle-spec.js";
import type { CompiledTrack, Vector2 } from "./compiled-track.js";

export type RacingTrajectorySample = {
  progress: number;
  position: Vector2;
  tangent: Vector2;
  normal: Vector2;
  curvature: number;
  lineOffset: number;
  targetSpeed: number;
  passingOpportunity: number;
  widthLeft: number;
  widthRight: number;
  grip: number;
};

export type RacingTrajectory = {
  trackId: string;
  samples: RacingTrajectorySample[];
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const wrap = (index: number, length: number) => ((index % length) + length) % length;

function smoothCircular(values: number[], radius: number) {
  return values.map((_, index) => {
    let total = 0;
    let weight = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const factor = radius + 1 - Math.abs(offset);
      total += values[wrap(index + offset, values.length)] * factor;
      weight += factor;
    }
    return total / weight;
  });
}

/** Builds a curvature-aware racing line and physically reachable closed-loop speed profile. */
export function buildRacingTrajectory(track: CompiledTrack, spec: VehicleSpec): RacingTrajectory {
  const count = track.samples.length;
  const spacing = track.sampleSpacingMeters;
  const rawOffsets = track.samples.map((sample, index) => {
    const future = track.samples[wrap(index + Math.max(2, Math.round(26 / spacing)), count)];
    const direction = Math.sign(sample.curvature || future.curvature);
    const severity = clamp(Math.max(Math.abs(sample.curvature), Math.abs(future.curvature)) * 70, 0, 1);
    const entryOutside = -Math.sign(future.curvature) * severity * Math.min(sample.widthLeft, sample.widthRight) * 0.38;
    const apexInside = direction * severity * Math.min(sample.widthLeft, sample.widthRight) * 0.43;
    return entryOutside * 0.52 + apexInside * 0.48;
  });
  const lineOffsets = smoothCircular(rawOffsets, Math.max(2, Math.round(18 / spacing))).map((offset, index) => {
    const sample = track.samples[index];
    const leftLimit = sample.widthLeft - spec.widthMeters / 2 - 0.7;
    const rightLimit = sample.widthRight - spec.widthMeters / 2 - 0.7;
    return clamp(offset, -rightLimit, leftLimit);
  });

  const maximumSpeed = 95;
  const speeds = track.samples.map((sample) => {
    const effectiveCurvature = Math.max(0.00005, Math.abs(sample.curvature));
    const lateralAcceleration = spec.tireGrip * sample.grip * 9.81;
    return clamp(Math.sqrt(lateralAcceleration / effectiveCurvature), 8, maximumSpeed);
  });
  const brakingAcceleration = Math.max(4, spec.maxBrakeForceNewtons / spec.massKg * 0.72);
  const engineAcceleration = Math.max(1, spec.maxEngineForceNewtons / spec.massKg * 0.68);
  for (let pass = 0; pass < 4; pass += 1) {
    for (let index = count - 1; index >= 0; index -= 1) {
      const next = speeds[wrap(index + 1, count)];
      speeds[index] = Math.min(speeds[index], Math.sqrt(next * next + 2 * brakingAcceleration * spacing));
    }
    for (let index = 0; index < count; index += 1) {
      const previous = speeds[wrap(index - 1, count)];
      const speedLimitedAcceleration = engineAcceleration * clamp(1 - previous / maximumSpeed * 0.65, 0.28, 1);
      speeds[index] = Math.min(speeds[index], Math.sqrt(previous * previous + 2 * speedLimitedAcceleration * spacing));
    }
  }

  return {
    trackId: track.id,
    samples: track.samples.map((sample, index) => {
      const lineOffset = lineOffsets[index];
      const futureCurvature = Math.abs(track.samples[wrap(index + Math.round(35 / spacing), count)].curvature);
      const passingOpportunity = clamp(1 - Math.max(Math.abs(sample.curvature), futureCurvature) * 85, 0, 1);
      return {
        progress: sample.progress,
        position: {
          x: sample.position.x + sample.normal.x * lineOffset,
          y: sample.position.y + sample.normal.y * lineOffset,
        },
        tangent: sample.tangent,
        normal: sample.normal,
        curvature: sample.curvature,
        lineOffset,
        targetSpeed: speeds[index],
        passingOpportunity,
        widthLeft: sample.widthLeft,
        widthRight: sample.widthRight,
        grip: sample.grip,
      };
    }),
  };
}
