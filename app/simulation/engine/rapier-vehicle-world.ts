import type { RigidBody, World } from "@dimforge/rapier2d-deterministic";
import type { VehicleSpec } from "../../domain/vehicle-spec.js";
import type { CompiledTrack, Vector2 } from "../track-compiler.js";

export type VehicleControls = { throttle: number; brake: number; steering: number };
export type VehiclePhysicsState = {
  id: string;
  position: Vector2;
  heading: number;
  longitudinalVelocity: number;
  lateralVelocity: number;
  yawRate: number;
  steeringAngle: number;
  throttle: number;
  brake: number;
  wheelSlipFront: number;
  wheelSlipRear: number;
  surfaceGrip: number;
};

type VehicleEntry = {
  body: RigidBody;
  spec: VehicleSpec;
  controls: VehicleControls;
  steeringAngle: number;
  wheelSlipFront: number;
  wheelSlipRear: number;
  surfaceGrip: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const dot = (left: Vector2, right: Vector2) => left.x * right.x + left.y * right.y;
type RapierApi = typeof import("@dimforge/rapier2d-deterministic").default;
type RapierLoader = () => Promise<{ api: RapierApi; initialize?: () => Promise<void> }>;
let rapierLoader: RapierLoader = async () => ({ api: (await import("@dimforge/rapier2d-deterministic")).default });
let rapierInitialization: Promise<RapierApi> | null = null;

export function configureRapierLoader(loader: RapierLoader) {
  rapierLoader = loader;
  rapierInitialization = null;
}

function initializeRapier() {
  rapierInitialization ??= rapierLoader().then(async ({ api, initialize }) => {
    await initialize?.();
    return api;
  });
  return rapierInitialization;
}

/** Deterministic world-space vehicle foundation. AI supplies controls; this class owns physical motion and contact. */
export class RapierVehicleWorld {
  readonly world: World;
  private readonly vehicles = new Map<string, VehicleEntry>();

  private constructor(private readonly rapier: RapierApi, readonly timestep = 1 / 120) {
    this.world = new rapier.World({ x: 0, y: 0 });
    this.world.timestep = timestep;
  }

  static async create(timestep = 1 / 120) {
    const rapier = await initializeRapier();
    return new RapierVehicleWorld(rapier, timestep);
  }

  addTrackBoundaries(track: CompiledTrack) {
    const left = new Float32Array(track.leftBoundary.flatMap((point) => [point.x, point.y]));
    const right = new Float32Array(track.rightBoundary.flatMap((point) => [point.x, point.y]));
    const close = (vertices: Float32Array) => {
      const result = new Float32Array(vertices.length + 2);
      result.set(vertices);
      result[result.length - 2] = vertices[0];
      result[result.length - 1] = vertices[1];
      return result;
    };
    this.world.createCollider(this.rapier.ColliderDesc.polyline(close(left)).setFriction(0.4).setRestitution(0.05));
    this.world.createCollider(this.rapier.ColliderDesc.polyline(close(right)).setFriction(0.4).setRestitution(0.05));
  }

  addVehicle(id: string, spec: VehicleSpec, position: Vector2, heading: number) {
    if (this.vehicles.has(id)) throw new Error(`Vehicle ${id} already exists.`);
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y)
        .setRotation(heading)
        .setAdditionalMassProperties(
          spec.massKg,
          { x: 0, y: 0 },
          spec.massKg * (spec.lengthMeters ** 2 + spec.widthMeters ** 2) / 12,
        )
        .setLinearDamping(0.02)
        .setAngularDamping(0.08)
        .setCcdEnabled(true),
    );
    // The contact hull leaves wheel/bodywork clearance so dense fields can rotate through hairpins.
    const collider = this.rapier.ColliderDesc.roundCuboid(spec.lengthMeters * 0.41, spec.widthMeters * 0.36, 0.18)
      .setDensity(0)
      .setFriction(0.7)
      .setRestitution(0.04);
    this.world.createCollider(collider, body);
    this.vehicles.set(id, { body, spec, controls: { throttle: 0, brake: 0, steering: 0 }, steeringAngle: 0, wheelSlipFront: 0, wheelSlipRear: 0, surfaceGrip: 1 });
  }

  removeVehicle(id: string) {
    const entry = this.vehicles.get(id);
    if (!entry) return;
    this.world.removeRigidBody(entry.body);
    this.vehicles.delete(id);
  }

  setControls(id: string, controls: VehicleControls) {
    const entry = this.requireVehicle(id);
    entry.controls = {
      throttle: clamp(controls.throttle, 0, 1),
      brake: clamp(controls.brake, 0, 1),
      steering: clamp(controls.steering, -1, 1),
    };
  }

  assistRecovery(id: string, position: Vector2, targetHeading: number) {
    const entry = this.requireVehicle(id);
    const current = entry.body.rotation();
    const delta = Math.atan2(Math.sin(targetHeading - current), Math.cos(targetHeading - current));
    const heading = current + clamp(delta, -0.35, 0.35);
    entry.body.setTranslation(position, true);
    entry.body.setRotation(heading, true);
    entry.body.setAngvel(0, true);
    entry.body.setLinvel({ x: Math.cos(heading) * 2.5, y: Math.sin(heading) * 2.5 }, true);
  }

  step(surfaceGrip: (position: Vector2) => number = () => 1) {
    for (const entry of this.vehicles.values()) this.applyVehicleForces(entry, surfaceGrip(entry.body.translation()));
    this.world.step();
  }

  state(id: string): VehiclePhysicsState {
    const entry = this.requireVehicle(id);
    const position = entry.body.translation();
    const velocity = entry.body.linvel();
    const heading = entry.body.rotation();
    const forward = { x: Math.cos(heading), y: Math.sin(heading) };
    const lateral = { x: -forward.y, y: forward.x };
    return {
      id,
      position: { x: position.x, y: position.y },
      heading,
      longitudinalVelocity: dot(velocity, forward),
      lateralVelocity: dot(velocity, lateral),
      yawRate: entry.body.angvel(),
      steeringAngle: entry.steeringAngle,
      throttle: entry.controls.throttle,
      brake: entry.controls.brake,
      wheelSlipFront: entry.wheelSlipFront,
      wheelSlipRear: entry.wheelSlipRear,
      surfaceGrip: entry.surfaceGrip,
    };
  }

  snapshot() {
    return this.world.takeSnapshot();
  }

  free() {
    this.vehicles.clear();
    this.world.free();
  }

  private applyVehicleForces(entry: VehicleEntry, rawSurfaceGrip: number) {
    const { body, controls, spec } = entry;
    body.resetForces(true);
    body.resetTorques(true);
    const heading = body.rotation();
    const velocity = body.linvel();
    const forward = { x: Math.cos(heading), y: Math.sin(heading) };
    const lateral = { x: -forward.y, y: forward.x };
    const longitudinalVelocity = dot(velocity, forward);
    const lateralVelocity = dot(velocity, lateral);
    const speed = Math.hypot(velocity.x, velocity.y);
    const surface = clamp(rawSurfaceGrip, 0.2, 1.5);
    entry.surfaceGrip = surface;
    const aerodynamicLoad = spec.downforceCoefficient * speed * speed * 0.5;
    const normalLoad = spec.massKg * 9.81 + aerodynamicLoad;
    const gripForce = normalLoad * spec.tireGrip * surface;

    const maximumSteering = spec.maxSteeringDegrees * Math.PI / 180;
    const steeringTarget = controls.steering * maximumSteering;
    const steeringRate = maximumSteering * 2.8 * this.timestep;
    entry.steeringAngle += clamp(steeringTarget - entry.steeringAngle, -steeringRate, steeringRate);

    const frontAxle = spec.wheelbaseMeters * 0.52;
    const rearAxle = spec.wheelbaseMeters - frontAxle;
    const stableLongitudinalSpeed = Math.max(1.5, Math.abs(longitudinalVelocity));
    const yawRate = body.angvel();
    const frontSlip = Math.atan2(lateralVelocity + frontAxle * yawRate, stableLongitudinalSpeed) - entry.steeringAngle;
    const rearSlip = Math.atan2(lateralVelocity - rearAxle * yawRate, stableLongitudinalSpeed);
    entry.wheelSlipFront = frontSlip;
    entry.wheelSlipRear = rearSlip;
    const weightTransfer = clamp((controls.brake * spec.maxBrakeForceNewtons - controls.throttle * spec.maxEngineForceNewtons) * 0.18 / spec.wheelbaseMeters, -normalLoad * 0.16, normalLoad * 0.22);
    const frontLoad = normalLoad * (rearAxle / spec.wheelbaseMeters) + weightTransfer;
    const rearLoad = normalLoad - frontLoad;
    const stiffnessScale = spec.corneringStiffness * 0.11;
    const frontLimit = Math.max(0, frontLoad * spec.tireGrip * surface);
    const rearLimit = Math.max(0, rearLoad * spec.tireGrip * surface);
    const frontLateralForce = clamp(-frontSlip * frontLoad * stiffnessScale, -frontLimit, frontLimit);
    const rearLateralForce = clamp(-rearSlip * rearLoad * stiffnessScale, -rearLimit, rearLimit);
    const lateralForce = frontLateralForce * Math.cos(entry.steeringAngle) + rearLateralForce;
    const remainingLongitudinalGrip = Math.sqrt(Math.max(0, gripForce * gripForce - lateralForce * lateralForce));

    const engineForce = controls.throttle * spec.maxEngineForceNewtons;
    const brakeDirection = Math.abs(longitudinalVelocity) < 0.1 ? 0 : -Math.sign(longitudinalVelocity);
    const brakeForce = controls.brake * spec.maxBrakeForceNewtons * brakeDirection;
    const dragForce = -Math.sign(longitudinalVelocity) * spec.dragCoefficient * longitudinalVelocity * longitudinalVelocity;
    const rollingForce = -Math.sign(longitudinalVelocity) * spec.rollingResistance * spec.massKg * 9.81;
    const longitudinalForce = clamp(engineForce + brakeForce + dragForce + rollingForce, -remainingLongitudinalGrip, remainingLongitudinalGrip);

    body.addForce({
      x: forward.x * longitudinalForce + lateral.x * lateralForce,
      y: forward.y * longitudinalForce + lateral.y * lateralForce,
    }, true);
    const yawTorque = clamp(frontLateralForce * frontAxle * Math.cos(entry.steeringAngle) - rearLateralForce * rearAxle, -gripForce * spec.wheelbaseMeters, gripForce * spec.wheelbaseMeters);
    body.addTorque(yawTorque, true);
  }

  private requireVehicle(id: string) {
    const entry = this.vehicles.get(id);
    if (!entry) throw new Error(`Unknown vehicle ${id}.`);
    return entry;
  }
}
