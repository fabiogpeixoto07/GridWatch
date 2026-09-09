export type DrivingPhase = "straight" | "approach" | "braking" | "turn-in" | "apex" | "exit" | "following" | "overtaking" | "defending" | "recovering";
export type OvertakeState = "idle" | "approach" | "evaluate" | "position" | "commit" | "overlap" | "complete" | "abort" | "cooldown";

export type DrivingSample = {
  x: number;
  y: number;
  angle: number;
  curve: number;
};

export type AnalyzedTrackSample = DrivingSample & {
  progress: number;
  curvature: number;
  severity: number;
  direction: -1 | 0 | 1;
  racingLineOffset: number;
  targetSpeedFactor: number;
  passingOpportunity: number;
};

export type DrivingGeometry = {
  samples: AnalyzedTrackSample[];
  trackWidth: number;
};

export type DrivingCar = {
  id: string;
  raceSkill: number;
  raceAggression: number;
  raceConsistency: number;
  raceCornering: number;
  raceOvertaking: number;
  raceDefense: number;
  raceRisk: number;
  distance: number;
  speed: number;
  lane: number;
  targetLane: number;
  mechanical: "running" | "failing" | "retired";
  finishPosition: number | null;
  performanceModifier: number;
  lapPerformanceModifier: number;
  lineErrorUntil: number;
  mistakeUntil: number;
  lineErrorSide: number;
  lateralVelocity: number;
  throttle: number;
  brake: number;
  steering: number;
  targetSpeed: number;
  drivingPhase: DrivingPhase;
  overtakeState: OvertakeState;
  overtakeTargetId: string | null;
  overtakeSide: -1 | 1;
  overtakeUntil: number;
  overtakeCooldownUntil: number;
  slipstream: number;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const wrapIndex = (index: number, length: number) => ((index % length) + length) % length;
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function smoothCircular(values: number[], radius: number) {
  return values.map((_, index) => {
    let total = 0;
    let weight = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const factor = radius + 1 - Math.abs(offset);
      total += values[wrapIndex(index + offset, values.length)] * factor;
      weight += factor;
    }
    return total / weight;
  });
}

/** Converts render samples into a cyclic driving map without changing saved tracks. */
export function analyzeTrack(samples: DrivingSample[], trackWidth: number): DrivingGeometry {
  const count = samples.length;
  if (count < 8) return { samples: samples.map((sample, index) => ({ ...sample, progress: index / Math.max(1, count), curvature: 0, severity: 0, direction: 0, racingLineOffset: 0, targetSpeedFactor: 1, passingOpportunity: 0 })), trackWidth };
  const rawCurvature = samples.map((sample, index) => {
    const previous = samples[wrapIndex(index - 3, count)];
    const next = samples[wrapIndex(index + 3, count)];
    return angleDelta(previous.angle, next.angle) / 6;
  });
  const curvature = smoothCircular(rawCurvature, 5);
  const severity = smoothCircular(curvature.map((value) => clamp(Math.abs(value) / 0.095, 0, 1)), 7);
  const direction = curvature.map((value, index) => severity[index] < 0.05 ? 0 : value > 0 ? 1 : -1) as Array<-1 | 0 | 1>;

  const line = severity.map((value, index) => {
    if (value < 0.045 || direction[index] === 0) return 0;
    // The future curve moves the car outside before turn-in; current curvature puts it on apex.
    const futureIndex = wrapIndex(index + Math.round(16 + value * 18), count);
    const futureDirection = direction[futureIndex] || direction[index];
    const entryOutside = -futureDirection * clamp(severity[futureIndex] * 0.44, 0, 0.44);
    const apexInside = direction[index] * clamp(value * 0.5, 0, 0.5);
    return clamp(entryOutside * 0.55 + apexInside * 0.45, -0.52, 0.52);
  });
  const racingLineOffset = smoothCircular(line, 10);

  return {
    trackWidth,
    samples: samples.map((sample, index) => {
      const next = severity[wrapIndex(index + 28, count)];
      const current = severity[index];
      const targetSpeedFactor = clamp(1 - Math.max(current, next * 0.92) * 0.52, 0.42, 1);
      const passingOpportunity = clamp((1 - Math.max(current, next)) * (0.45 + (1 - Math.abs(racingLineOffset[index])) * 0.55), 0, 1);
      return { ...sample, progress: index / count, curvature: curvature[index], severity: current, direction: direction[index], racingLineOffset: racingLineOffset[index], targetSpeedFactor, passingOpportunity };
    }),
  };
}

function progressToIndex(distance: number, length: number) {
  const progress = ((distance % 1) + 1) % 1;
  return Math.floor(progress * length) % length;
}

function aheadOf(car: DrivingCar, other: DrivingCar) {
  const gap = other.distance - car.distance;
  return gap > 0 && gap < 0.14 ? gap : Infinity;
}

function nearestAhead(car: DrivingCar, cars: DrivingCar[]) {
  let nearest: DrivingCar | undefined;
  let gap = Infinity;
  for (const other of cars) {
    if (other.id === car.id || other.mechanical !== "running" || other.finishPosition !== null) continue;
    const candidate = aheadOf(car, other);
    if (candidate < gap) { gap = candidate; nearest = other; }
  }
  return { car: nearest, gap };
}

function nearestBehind(car: DrivingCar, cars: DrivingCar[]) {
  let nearest: DrivingCar | undefined;
  let gap = Infinity;
  for (const other of cars) {
    if (other.id === car.id || other.mechanical !== "running" || other.finishPosition !== null) continue;
    const candidate = car.distance - other.distance;
    if (candidate > 0 && candidate < 0.14 && candidate < gap) { gap = candidate; nearest = other; }
  }
  return { car: nearest, gap };
}

function sideIsClear(car: DrivingCar, cars: DrivingCar[], side: -1 | 1) {
  const targetLane = side * 0.52;
  return !cars.some((other) => other.id !== car.id && other.mechanical === "running" && other.finishPosition === null && Math.abs(other.distance - car.distance) < 0.012 && Math.abs(other.lane - targetLane) < 0.2);
}

function chooseSide(car: DrivingCar, sample: AnalyzedTrackSample, cars: DrivingCar[]) {
  const inside = (sample.direction || 1) as -1 | 1;
  const preferred: Array<-1 | 1> = sample.passingOpportunity > 0.72 ? [car.overtakeSide, (car.overtakeSide * -1) as -1 | 1] : [inside, (inside * -1) as -1 | 1];
  return preferred.find((side) => sideIsClear(car, cars, side)) ?? preferred[0];
}

/** Advances all running cars by one fixed simulation step. Cars are mutated deliberately for render-loop performance. */
export function stepDriving(cars: DrivingCar[], geometry: DrivingGeometry, delta: number, raceTime: number) {
  const active = cars.filter((car) => car.mechanical === "running" && car.finishPosition === null);
  const count = geometry.samples.length;
  for (const car of active) {
    const index = progressToIndex(car.distance, count);
    const sample = geometry.samples[index];
    const future = geometry.samples[wrapIndex(index + Math.round(18 + car.speed * 900), count)];
    const { car: ahead, gap } = nearestAhead(car, active);
    const { car: behind, gap: behindGap } = nearestBehind(car, active);
    const cruiseSpeed = 0.036 + car.raceSkill * 0.000065;
    const cornerFactor = Math.min(sample.targetSpeedFactor, future.targetSpeedFactor);
    let targetSpeed = cruiseSpeed * cornerFactor * (1 + clamp(car.performanceModifier + car.lapPerformanceModifier, -0.11, 0.11));
    // Look far enough ahead to begin slowing before the entry, not when the apex is already reached.
    let slowestFactor = 1;
    let slowestOffset = 0;
    const horizon = Math.min(Math.round(92 + car.speed * 500), Math.max(24, count - 1));
    for (let offset = 8; offset <= horizon; offset += 4) {
      const candidate = geometry.samples[wrapIndex(index + offset, count)].targetSpeedFactor;
      if (candidate < slowestFactor) {
        slowestFactor = candidate;
        slowestOffset = offset;
      }
    }
    if (slowestOffset > 0) {
      const cornerTarget = cruiseSpeed * slowestFactor;
      const brakeCapability = 0.065 + car.raceCornering * 0.00023;
      const distanceToCorner = slowestOffset / count;
      const brakingDistance = Math.max(0, (car.speed * car.speed - cornerTarget * cornerTarget) / (2 * brakeCapability));
      if (brakingDistance + 0.0015 >= distanceToCorner) {
        // The reachable speed enforces a smooth braking ramp through the full approach.
        const reachableSpeed = Math.sqrt(Math.max(cornerTarget * cornerTarget, cornerTarget * cornerTarget + 2 * brakeCapability * Math.max(0, distanceToCorner - 0.0015)));
        targetSpeed = Math.min(targetSpeed, reachableSpeed);
      }
    }
    const speedDelta = ahead ? car.speed - ahead.speed : 0;
    const desiredGap = 0.0045 + car.speed * 0.19;
    car.slipstream = ahead && gap < 0.028 && Math.abs(car.lane - ahead.lane) < 0.16 && sample.passingOpportunity > 0.6 ? clamp((0.028 - gap) / 0.028, 0, 1) : 0;
    if (car.slipstream > 0) targetSpeed += 0.0032 * car.slipstream;
    const attacking = car.overtakeState === "approach" || car.overtakeState === "evaluate" || car.overtakeState === "position" || car.overtakeState === "commit" || car.overtakeState === "overlap";
    if (ahead && gap < desiredGap + Math.max(0, speedDelta) * 0.7 && !attacking) {
      const closing = clamp((desiredGap - gap + Math.max(0, speedDelta) * 0.5) / Math.max(0.003, desiredGap), 0, 1);
      targetSpeed *= 1 - closing * 0.42;
    }

    const canAttack = ahead && gap < 0.045 && gap > 0.0012 && car.speed >= ahead.speed - 0.003 && (sample.passingOpportunity > 0.3 || future.passingOpportunity > 0.55);
    if (car.overtakeState === "idle" && canAttack && raceTime >= car.overtakeCooldownUntil) {
      car.overtakeState = "approach";
      car.overtakeTargetId = ahead.id;
      car.overtakeUntil = raceTime + 0.24;
    }
    if (car.overtakeState === "approach" && raceTime >= car.overtakeUntil) {
      car.overtakeState = "evaluate";
    }
    if (car.overtakeState === "evaluate") {
      const intent = (car.raceOvertaking * 0.45 + car.raceAggression * 0.35 + car.raceRisk * 0.2) / 100;
      if (ahead && gap < 0.035 && (intent > 0.45 || sample.passingOpportunity > 0.58)) {
        car.overtakeSide = chooseSide(car, sample, active);
        car.overtakeState = "position";
        car.overtakeUntil = raceTime + 0.32;
      } else {
        car.overtakeState = "cooldown";
        car.overtakeCooldownUntil = raceTime + 0.45;
      }
    }
    if (car.overtakeState === "position" && raceTime >= car.overtakeUntil) {
      car.overtakeState = "commit";
      car.overtakeUntil = raceTime + 2.6;
    }
    if ((car.overtakeState === "position" || car.overtakeState === "commit") && (!ahead || gap > 0.065 || (car.overtakeState === "position" && !sideIsClear(car, active, car.overtakeSide)))) {
      car.overtakeState = "abort";
      car.overtakeUntil = raceTime + 0.45;
    }
    if (car.overtakeState === "commit" && ahead && Math.abs(gap) < 0.006) car.overtakeState = "overlap";
    if (car.overtakeState === "overlap" && (!ahead || car.distance > (ahead?.distance ?? -Infinity) + 0.002)) {
      car.overtakeState = "complete";
      car.overtakeUntil = raceTime + 0.45;
    }
    if ((car.overtakeState === "commit" || car.overtakeState === "overlap") && raceTime >= car.overtakeUntil) {
      car.overtakeState = "abort";
      car.overtakeUntil = raceTime + 0.45;
    }
    if (car.overtakeState === "complete" || car.overtakeState === "abort") {
      if (raceTime >= car.overtakeUntil) {
        car.overtakeState = "cooldown";
        car.overtakeCooldownUntil = raceTime + 0.45;
      }
    }
    if (car.overtakeState === "cooldown" && raceTime >= car.overtakeCooldownUntil) car.overtakeState = "idle";

    let targetLane = sample.racingLineOffset;
    if (car.overtakeState === "approach") targetLane += car.overtakeSide * 0.12;
    if (car.overtakeState === "position" || car.overtakeState === "commit" || car.overtakeState === "overlap") {
      targetLane = car.overtakeSide * 0.52;
      targetSpeed += car.overtakeState === "position" ? 0.002 : car.overtakeState === "commit" ? 0.0048 : 0.0031;
    }
    if (car.overtakeState === "abort") targetLane = sample.racingLineOffset * 0.5;
    if (ahead && gap < 0.018 && ahead.raceDefense > 78 && car.overtakeState === "idle") targetLane += ahead.lane > 0 ? -0.16 : 0.16;
    const defending = behind && behindGap < 0.021 && car.raceDefense > 76 && car.overtakeState === "idle" && sample.passingOpportunity > 0.48;
    if (defending) targetLane = sample.direction ? -sample.direction * 0.34 : (behind.lane > 0 ? 0.3 : -0.3);
    if (car.distance < car.lineErrorUntil || car.distance < car.mistakeUntil) {
      targetLane = car.lineErrorSide * 0.78;
      targetSpeed *= 0.7;
      car.drivingPhase = "recovering";
    } else if (car.overtakeState === "position" || car.overtakeState === "commit" || car.overtakeState === "overlap") car.drivingPhase = "overtaking";
    else if (defending) car.drivingPhase = "defending";
    else if (ahead && gap < desiredGap * 1.7) car.drivingPhase = "following";
    else if (future.severity > sample.severity + 0.12 && car.speed > targetSpeed) car.drivingPhase = "braking";
    else if (sample.severity > 0.45) car.drivingPhase = "apex";
    else if (future.severity > 0.16) car.drivingPhase = "turn-in";
    else if (sample.severity > 0.1) car.drivingPhase = "exit";
    else car.drivingPhase = "straight";

    targetLane = clamp(targetLane, -0.72, 0.72);
    car.targetLane = targetLane;
    car.targetSpeed = Math.max(0.004, targetSpeed);
    const speedError = car.targetSpeed - car.speed;
    car.throttle = speedError > 0 ? clamp(speedError / 0.008, 0, 1) : 0;
    car.brake = speedError < 0 ? clamp(-speedError / 0.011, 0, 1) : 0;
    const acceleration = car.throttle * (0.012 + car.raceSkill * 0.00005) - car.brake * (0.065 + car.raceCornering * 0.00023);
    car.speed = Math.max(0.001, car.speed + acceleration * delta);
    const laneError = targetLane - car.lane;
    const desiredSteering = clamp(laneError * 1.75 - car.lateralVelocity * 0.46, -1, 1);
    car.steering += clamp(desiredSteering - car.steering, -3.6 * delta, 3.6 * delta);
    const lateralAcceleration = car.steering * (2.6 + car.raceCornering * 0.012) - car.lateralVelocity * 4.5;
    car.lateralVelocity = clamp(car.lateralVelocity + lateralAcceleration * delta, -1.15, 1.15);
    car.lane = clamp(car.lane + car.lateralVelocity * delta, -0.76, 0.76);
    car.distance += car.speed * delta;
  }
  // A deterministic safety pass prevents visual overlap when a fixed step catches up after a slow frame.
  const ordered = [...active].sort((a, b) => b.distance - a.distance);
  for (let index = 1; index < ordered.length; index += 1) {
    const leader = ordered[index - 1];
    const follower = ordered[index];
    const gap = leader.distance - follower.distance;
    if (gap > 0 && gap < 0.0018 && Math.abs(leader.lane - follower.lane) < 0.14) {
      follower.distance = leader.distance - 0.0018;
      follower.speed = Math.min(follower.speed, leader.speed * 0.96);
      follower.brake = Math.max(follower.brake, 0.6);
    }
  }
}
