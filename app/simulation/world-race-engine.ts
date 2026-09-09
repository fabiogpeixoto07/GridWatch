import type { VehicleSpec } from "../domain/vehicle-spec.js";
import { RapierVehicleWorld, type VehiclePhysicsState } from "./engine/rapier-vehicle-world.js";
import { buildRacingTrajectory, type RacingTrajectory } from "./speed-profile.js";
import type { CompiledTrack, Vector2 } from "./track-compiler.js";

export type RaceEngineDriver = {
  id: string;
  skill: number;
  aggression: number;
  consistency: number;
  cornering: number;
  overtaking: number;
  defense: number;
  risk: number;
};

export type WorldDrivingPhase = "grid" | "racing" | "closing" | "following" | "attacking" | "side-by-side" | "recovering";

export type WorldRaceCarSnapshot = VehiclePhysicsState & {
  completedDistance: number;
  lapProgress: number;
  lap: number;
  lateralOffset: number;
  commandedLateralOffset: number;
  paceModifier: number;
  targetSpeed: number;
  drivingPhase: WorldDrivingPhase;
  overtakeTargetId: string | null;
};

type EngineCar = {
  driver: RaceEngineDriver;
  sampleIndex: number;
  completedDistance: number;
  lateralOffset: number;
  commandedOffset: number;
  gridOffset: number;
  launchDelay: number;
  performanceModifier: number;
  targetPerformanceModifier: number;
  errorOffset: number;
  attackSide: -1 | 0 | 1;
  overtakeTargetId: string | null;
  attackUntil: number;
  attackCooldownUntil: number;
  attackReadiness: number;
  targetSpeed: number;
  phase: WorldDrivingPhase;
  stalledSeconds: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const wrap = (index: number, length: number) => ((index % length) + length) % length;
const dot = (left: Vector2, right: Vector2) => left.x * right.x + left.y * right.y;
const distanceSquared = (left: Vector2, right: Vector2) => (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Headless race engine combining physical vehicles, trajectory control, timing, and local racecraft. */
export class WorldRaceEngine {
  private elapsedSeconds = 0;
  private readonly cars = new Map<string, EngineCar>();

  private constructor(
    readonly track: CompiledTrack,
    readonly trajectory: RacingTrajectory,
    readonly spec: VehicleSpec,
    private readonly physics: RapierVehicleWorld,
  ) {}

  static async create(track: CompiledTrack, spec: VehicleSpec, drivers: RaceEngineDriver[]) {
    const physics = await RapierVehicleWorld.create();
    physics.addTrackBoundaries(track);
    const engine = new WorldRaceEngine(track, buildRacingTrajectory(track, spec), spec, physics);
    engine.createGrid(drivers);
    return engine;
  }

  setPerformanceModifier(id: string, modifier: number) {
    const car = this.requireCar(id);
    car.targetPerformanceModifier = clamp(modifier, -0.12, 0.12);
  }

  setLineError(id: string, offsetMeters: number) {
    const car = this.requireCar(id);
    car.errorOffset = clamp(offsetMeters, -10, 10);
  }

  removeVehicle(id: string) {
    if (!this.cars.has(id)) return;
    this.physics.removeVehicle(id);
    this.cars.delete(id);
  }

  step(steps = 1) {
    for (let iteration = 0; iteration < steps; iteration += 1) {
      const states = new Map([...this.cars.keys()].map((id) => [id, this.physics.state(id)]));
      const ordered = [...this.cars.entries()].sort((left, right) => right[1].completedDistance - left[1].completedDistance);
      for (const [id, car] of ordered) this.controlVehicle(id, car, states, ordered);
      this.physics.step((position) => this.surfaceGrip(position));
      this.elapsedSeconds += this.physics.timestep;
      for (const [id, car] of this.cars) this.updateProjection(car, this.physics.state(id));
    }
  }

  snapshot() {
    return [...this.cars.entries()].map(([id, car]): WorldRaceCarSnapshot => {
      const state = this.physics.state(id);
      return {
        ...state,
        completedDistance: car.completedDistance,
        lapProgress: ((car.completedDistance / this.track.lengthMeters) % 1 + 1) % 1,
        lap: Math.max(0, Math.floor(car.completedDistance / this.track.lengthMeters)),
        lateralOffset: car.lateralOffset,
        commandedLateralOffset: car.commandedOffset,
        paceModifier: car.performanceModifier,
        targetSpeed: car.targetSpeed,
        drivingPhase: car.phase,
        overtakeTargetId: car.overtakeTargetId,
      };
    });
  }

  free() {
    this.cars.clear();
    this.physics.free();
  }

  private createGrid(drivers: RaceEngineDriver[]) {
    const count = this.track.samples.length;
    for (let index = 0; index < drivers.length; index += 1) {
      const compiledSlot = this.track.gridSlots[index];
      const longitudinalOffset = 9 + Math.floor(index / 2) * 8.5;
      const sampleIndex = compiledSlot?.sampleIndex ?? wrap(count - Math.round(longitudinalOffset / this.track.sampleSpacingMeters), count);
      const sample = this.track.samples[sampleIndex];
      const lateralOffset = compiledSlot?.lateralOffset ?? (index % 2 === 0 ? -1 : 1) * Math.min(2.2, Math.min(sample.widthLeft, sample.widthRight) * 0.28);
      const position = compiledSlot?.position ?? {
        x: sample.position.x + sample.normal.x * lateralOffset,
        y: sample.position.y + sample.normal.y * lateralOffset,
      };
      this.physics.addVehicle(drivers[index].id, this.spec, position, compiledSlot?.heading ?? Math.atan2(sample.tangent.y, sample.tangent.x));
      this.cars.set(drivers[index].id, {
        driver: drivers[index],
        sampleIndex,
        completedDistance: -longitudinalOffset,
        lateralOffset,
        commandedOffset: lateralOffset,
        gridOffset: lateralOffset,
        launchDelay: Math.floor(index / 2) * 0.1,
        performanceModifier: 0,
        targetPerformanceModifier: 0,
        errorOffset: 0,
        attackSide: 0,
        overtakeTargetId: null,
        attackUntil: 0,
        attackCooldownUntil: 0,
        attackReadiness: 0,
        targetSpeed: 0,
        phase: "grid",
        stalledSeconds: 0,
      });
    }
  }

  private controlVehicle(id: string, car: EngineCar, states: Map<string, VehiclePhysicsState>, ordered: Array<[string, EngineCar]>) {
    const state = states.get(id) as VehiclePhysicsState;
    const sample = this.trajectory.samples[car.sampleIndex];
    const trackSample = this.track.samples[car.sampleIndex];
    const speed = Math.max(0, state.longitudinalVelocity);
    car.performanceModifier += clamp(car.targetPerformanceModifier - car.performanceModifier, -0.025 * this.physics.timestep, 0.025 * this.physics.timestep);
    const ahead = ordered
      .filter(([otherId, other]) => otherId !== id && other.completedDistance > car.completedDistance)
      .map(([otherId, other]) => ({ id: otherId, car: other, gap: other.completedDistance - car.completedDistance }))
      .sort((left, right) => left.gap - right.gap)[0];
    const desiredGap = 6 + speed * (0.28 + (100 - car.driver.aggression) * 0.0016);
    const attackScore = car.driver.overtaking * 0.55 + car.driver.aggression * 0.3 + car.driver.risk * 0.15;
    const canPrepareAttack = Boolean(ahead && ahead.gap < 42 && sample.passingOpportunity > 0.4 && attackScore >= 58 && this.elapsedSeconds >= car.attackCooldownUntil);
    const commitmentGap = Math.max(8.5, desiredGap * 1.18);

    if (canPrepareAttack && ahead) {
      const proximity = 1 - clamp((ahead.gap - commitmentGap) / Math.max(1, 42 - commitmentGap), 0, 1);
      car.attackReadiness = clamp(car.attackReadiness + this.physics.timestep * (0.35 + proximity * 1.2) * (attackScore / 100), 0, 1.5);
    } else {
      car.attackReadiness = Math.max(0, car.attackReadiness - this.physics.timestep * 0.8);
    }

    if (car.overtakeTargetId && this.elapsedSeconds >= car.attackUntil) {
      car.overtakeTargetId = null;
      car.attackSide = 0;
      car.attackCooldownUntil = this.elapsedSeconds + 2.4;
      car.attackReadiness = 0;
    }
    if (!car.overtakeTargetId && canPrepareAttack && ahead && ahead.gap <= commitmentGap && car.attackReadiness >= 0.48) {
      const preferred = this.chooseAttackSide(car, ahead.car, ordered);
      if (preferred !== 0) {
        car.overtakeTargetId = ahead.id;
        car.attackSide = preferred;
        car.attackUntil = this.elapsedSeconds + 5.5 + car.driver.overtaking / 100 * 2;
        car.attackReadiness = 0;
      }
    }
    if (car.overtakeTargetId) {
      const target = this.cars.get(car.overtakeTargetId);
      if (!target || car.completedDistance > target.completedDistance + 5) {
        car.overtakeTargetId = null;
        car.attackSide = 0;
        car.attackCooldownUntil = this.elapsedSeconds + 1.8;
      }
    }

    let tacticalOffset = car.errorOffset;
    if (Math.abs(car.errorOffset) > 0.1) {
      car.phase = "recovering";
    } else if (car.attackSide !== 0) {
      const available = car.attackSide > 0 ? sample.widthLeft : sample.widthRight;
      tacticalOffset = car.attackSide * Math.max(2.3, available * 0.48);
      car.phase = ahead && ahead.gap < 7 ? "side-by-side" : "attacking";
    } else if (canPrepareAttack && ahead) car.phase = "closing";
    else if (ahead && ahead.gap < desiredGap * 1.6) car.phase = "following";
    else car.phase = Math.abs(car.lateralOffset) > Math.max(trackSample.widthLeft, trackSample.widthRight) ? "recovering" : "racing";

    if (this.elapsedSeconds < 7 && car.phase !== "recovering" && car.attackSide === 0) {
      const gridBlend = 1 - clamp((this.elapsedSeconds - 1.5) / 5.5, 0, 1);
      tacticalOffset += car.gridOffset * gridBlend;
    }

    const lookaheadMeters = clamp(8 + speed * 0.42, 10, 42);
    const lookaheadIndex = wrap(car.sampleIndex + Math.round(lookaheadMeters / this.track.sampleSpacingMeters), this.track.samples.length);
    const targetSample = this.trajectory.samples[lookaheadIndex];
    const minimumTacticalOffset = -targetSample.widthRight + this.spec.widthMeters / 2 + 0.5 - targetSample.lineOffset;
    const maximumTacticalOffset = targetSample.widthLeft - this.spec.widthMeters / 2 - 0.5 - targetSample.lineOffset;
    const desiredOffset = clamp(tacticalOffset, minimumTacticalOffset, maximumTacticalOffset);
    const lateralRate = car.phase === "attacking" || car.phase === "side-by-side" ? 3.4 : car.phase === "recovering" ? 4.2 : 2.25;
    car.commandedOffset += clamp(desiredOffset - car.commandedOffset, -lateralRate * this.physics.timestep, lateralRate * this.physics.timestep);
    const targetOffset = clamp(car.commandedOffset, minimumTacticalOffset, maximumTacticalOffset);
    const targetPosition = {
      x: targetSample.position.x + targetSample.normal.x * targetOffset,
      y: targetSample.position.y + targetSample.normal.y * targetOffset,
    };
    const desiredHeading = Math.atan2(targetPosition.y - state.position.y, targetPosition.x - state.position.x);
    const headingError = angleDelta(state.heading, desiredHeading);
    const steeringPrecision = 0.85 + car.driver.skill / 100 * 0.35;
    const steering = clamp(headingError * 1.9 * steeringPrecision - state.lateralVelocity * 0.025 - state.yawRate * 0.07, -1, 1);

    const driverPace = 0.9 + car.driver.skill * 0.00055 + car.driver.cornering * 0.00045 + car.performanceModifier;
    let targetSpeed = targetSample.targetSpeed * clamp(driverPace, 0.86, 1.1);
    if (ahead && ahead.gap < desiredGap && car.attackSide === 0 && car.phase !== "closing") {
      const aheadState = states.get(ahead.id);
      const distanceFactor = clamp(ahead.gap / Math.max(1, desiredGap), 0.2, 1);
      targetSpeed = Math.min(targetSpeed, Math.max(4, (aheadState?.longitudinalVelocity ?? targetSpeed) * (0.78 + distanceFactor * 0.22)));
    }
    if (car.phase === "closing" && ahead) {
      const slipstream = clamp((42 - ahead.gap) / 34, 0, 1) * (0.012 + car.driver.overtaking * 0.00014);
      targetSpeed *= 1 + slipstream;
    }
    if (car.attackSide !== 0) targetSpeed *= 1.025 + car.driver.overtaking * 0.00008;
    car.targetSpeed = targetSpeed;
    const speedError = targetSpeed - speed;
    const throttle = this.elapsedSeconds < car.launchDelay ? 0 : speedError > 0 ? clamp(speedError / 9, 0, 1) : 0;
    const brake = speedError < 0 ? clamp(-speedError / 14, 0, 1) : 0;
    car.stalledSeconds = speed < 0.8 && targetSpeed > 5 && this.elapsedSeconds > car.launchDelay + 2 ? car.stalledSeconds + this.physics.timestep : 0;
    if (car.stalledSeconds > 2.5) {
      // Last-resort corruption safeguard: place an immobilized body at the first clear trajectory sample.
      let recoveryPosition = targetPosition;
      let recoveryHeading = desiredHeading;
      for (let offset = 0; offset <= 30; offset += 5) {
        const recoverySample = this.trajectory.samples[wrap(lookaheadIndex + offset, this.trajectory.samples.length)];
        const candidate = { x: recoverySample.position.x + recoverySample.normal.x * targetOffset, y: recoverySample.position.y + recoverySample.normal.y * targetOffset };
        const clear = [...states.entries()].every(([otherId, other]) => otherId === id || distanceSquared(candidate, other.position) > (this.spec.lengthMeters * 1.25) ** 2);
        if (clear) { recoveryPosition = candidate; recoveryHeading = Math.atan2(recoverySample.tangent.y, recoverySample.tangent.x); break; }
      }
      this.physics.assistRecovery(id, recoveryPosition, recoveryHeading);
      car.stalledSeconds = 0;
      car.phase = "recovering";
    }
    this.physics.setControls(id, { throttle, brake, steering });
  }

  private chooseAttackSide(car: EngineCar, target: EngineCar, ordered: Array<[string, EngineCar]>): -1 | 0 | 1 {
    const sample = this.track.samples[car.sampleIndex];
    const preferred = Math.sign(sample.curvature || 1) as -1 | 1;
    const candidates: Array<-1 | 1> = [preferred, preferred === 1 ? -1 : 1];
    for (const side of candidates) {
      const offset = side * Math.min(sample.widthLeft, sample.widthRight) * 0.5;
      const blocked = ordered.some(([, other]) => other !== car && other !== target && Math.abs(other.completedDistance - car.completedDistance) < 9 && Math.abs(other.lateralOffset - offset) < this.spec.widthMeters * 1.2);
      if (!blocked) return side;
    }
    return 0;
  }

  private updateProjection(car: EngineCar, state: VehiclePhysicsState) {
    const index = this.nearestSampleIndex(state.position, car.sampleIndex);
    const sample = this.track.samples[index];
    const rawProgress = index / this.track.samples.length;
    const previousLaps = Math.floor(car.completedDistance / this.track.lengthMeters);
    const candidates = [previousLaps - 1, previousLaps, previousLaps + 1, previousLaps + 2]
      .map((lap) => (lap + rawProgress) * this.track.lengthMeters);
    car.completedDistance = candidates.reduce((best, candidate) => Math.abs(candidate - car.completedDistance) < Math.abs(best - car.completedDistance) ? candidate : best);
    car.sampleIndex = index;
    car.lateralOffset = dot({ x: state.position.x - sample.position.x, y: state.position.y - sample.position.y }, sample.normal);
  }

  private nearestSampleIndex(position: Vector2, hint: number) {
    const count = this.track.samples.length;
    const radius = Math.min(count - 1, Math.max(24, Math.round(90 / this.track.sampleSpacingMeters)));
    let bestIndex = hint;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const index = wrap(hint + offset, count);
      const candidate = distanceSquared(position, this.track.samples[index].position);
      if (candidate < bestDistance) { bestDistance = candidate; bestIndex = index; }
    }
    if (bestDistance > 120 ** 2) {
      for (let index = 0; index < count; index += 8) {
        const candidate = distanceSquared(position, this.track.samples[index].position);
        if (candidate < bestDistance) { bestDistance = candidate; bestIndex = index; }
      }
    }
    return bestIndex;
  }

  private surfaceGrip(position: Vector2) {
    const index = this.nearestSampleIndex(position, 0);
    const sample = this.track.samples[index];
    const lateral = Math.abs(dot({ x: position.x - sample.position.x, y: position.y - sample.position.y }, sample.normal));
    const edge = Math.max(sample.widthLeft, sample.widthRight);
    if (lateral <= edge) return sample.grip;
    if (lateral <= edge + 1.5) return 0.78;
    return 0.46;
  }

  private requireCar(id: string) {
    const car = this.cars.get(id);
    if (!car) throw new Error(`Unknown race car ${id}.`);
    return car;
  }
}
