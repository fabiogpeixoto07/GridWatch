export const STRATEGY_RULES_VERSION = 1 as const;

export type TireCompound = {
  id: string;
  label: string;
  grip: number;
  wearPerLap: number;
};

export type StrategyRulesV1 = {
  version: typeof STRATEGY_RULES_VERSION;
  compounds: TireCompound[];
  fuelCapacityLiters: number;
  fuelBurnLitersPerLap: number;
  fuelMassKgPerLiter: number;
  refuelingAllowed: boolean;
  refuelLitersPerSecond: number;
  tireChangeSeconds: number;
  repairSecondsPerDamage: number;
  mandatoryStops: number;
  minimumDistinctCompounds: number;
};

export type PitServiceState = "on-track" | "requested" | "queued" | "servicing" | "exiting";
export type EscapeState = "none" | "entering" | "reversing" | "rejoining";

export type CarStrategyState = {
  compoundId: string;
  tireWear: number;
  fuelLiters: number;
  damage: number;
  pitService: PitServiceState;
  pitStops: number;
  serviceStartedAt: number | null;
  assignedBoxId: string | null;
  escapeState: EscapeState;
};

export const DEFAULT_FORMULA_STRATEGY: StrategyRulesV1 = Object.freeze({
  version: STRATEGY_RULES_VERSION,
  compounds: [
    { id: "soft", label: "Soft", grip: 1.08, wearPerLap: .12 },
    { id: "medium", label: "Medium", grip: 1, wearPerLap: .08 },
    { id: "hard", label: "Hard", grip: .95, wearPerLap: .05 },
  ],
  fuelCapacityLiters: 110,
  fuelBurnLitersPerLap: 2.6,
  fuelMassKgPerLiter: .74,
  refuelingAllowed: false,
  refuelLitersPerSecond: 2,
  tireChangeSeconds: 2.4,
  repairSecondsPerDamage: 4,
  mandatoryStops: 0,
  minimumDistinctCompounds: 1,
});

const bounded = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;

export function normalizeStrategyRules(value: Partial<StrategyRulesV1> | null | undefined): StrategyRulesV1 {
  const source = value ?? {};
  const compounds = Array.isArray(source.compounds) && source.compounds.length ? source.compounds : DEFAULT_FORMULA_STRATEGY.compounds;
  return {
    version: STRATEGY_RULES_VERSION,
    compounds: compounds.slice(0, 5).map((compound, index) => ({ id: typeof compound.id === "string" && compound.id ? compound.id : `compound-${index + 1}`, label: typeof compound.label === "string" && compound.label ? compound.label : `Compound ${index + 1}`, grip: bounded(compound.grip, 1, .5, 1.5), wearPerLap: bounded(compound.wearPerLap, .08, .005, 1) })),
    fuelCapacityLiters: bounded(source.fuelCapacityLiters, DEFAULT_FORMULA_STRATEGY.fuelCapacityLiters, 20, 250),
    fuelBurnLitersPerLap: bounded(source.fuelBurnLitersPerLap, DEFAULT_FORMULA_STRATEGY.fuelBurnLitersPerLap, .1, 20),
    fuelMassKgPerLiter: bounded(source.fuelMassKgPerLiter, DEFAULT_FORMULA_STRATEGY.fuelMassKgPerLiter, .1, 2),
    refuelingAllowed: typeof source.refuelingAllowed === "boolean" ? source.refuelingAllowed : DEFAULT_FORMULA_STRATEGY.refuelingAllowed,
    refuelLitersPerSecond: bounded(source.refuelLitersPerSecond, DEFAULT_FORMULA_STRATEGY.refuelLitersPerSecond, .2, 10),
    tireChangeSeconds: bounded(source.tireChangeSeconds, DEFAULT_FORMULA_STRATEGY.tireChangeSeconds, .5, 20),
    repairSecondsPerDamage: bounded(source.repairSecondsPerDamage, DEFAULT_FORMULA_STRATEGY.repairSecondsPerDamage, .5, 30),
    mandatoryStops: Math.round(bounded(source.mandatoryStops, 0, 0, 3)),
    minimumDistinctCompounds: Math.round(bounded(source.minimumDistinctCompounds, 1, 1, compounds.length)),
  };
}

export function createCarStrategyState(rules: StrategyRulesV1, seed: number): CarStrategyState {
  const compound = rules.compounds[Math.abs(seed) % rules.compounds.length] ?? rules.compounds[0];
  return { compoundId: compound.id, tireWear: 0, fuelLiters: rules.fuelCapacityLiters, damage: 0, pitService: "on-track", pitStops: 0, serviceStartedAt: null, assignedBoxId: null, escapeState: "none" };
}

export function validateStrategyRules(rules: StrategyRulesV1) {
  const issues: string[] = [];
  if (rules.compounds.length < 1) issues.push("At least one tire compound is required.");
  if (new Set(rules.compounds.map((compound) => compound.id)).size !== rules.compounds.length) issues.push("Tire compound IDs must be unique.");
  if (rules.minimumDistinctCompounds > rules.compounds.length) issues.push("The minimum compound requirement exceeds the available compounds.");
  if (rules.fuelBurnLitersPerLap <= 0 || rules.fuelCapacityLiters <= 0) issues.push("Fuel capacity and consumption must be positive.");
  return issues;
}

export function shouldRequestPitStop(state: CarStrategyState, rules: StrategyRulesV1, lap: number, totalLaps: number) {
  const remaining = Math.max(0, totalLaps - lap);
  const mandatory = lap > 0 && state.pitStops < rules.mandatoryStops;
  const fuelRisk = state.fuelLiters < remaining * rules.fuelBurnLitersPerLap * 1.15;
  const tireRisk = state.tireWear > .72;
  const damageRisk = state.damage > .45;
  return mandatory || fuelRisk || tireRisk || damageRisk;
}
