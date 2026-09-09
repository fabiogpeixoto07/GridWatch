"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TRACKS, type Circuit } from "../tracks";
import { loadCustomCircuits, loadSavedCircuits, TrackEditor, type EditableCircuit } from "../track-editor";
import { categoryDrivers, CompetitionEditor, createDefaultCategory, loadCategories, type CompetitionCategory } from "../competition-editor";
import { analyzeTrack, stepDriving, type DrivingGeometry, type DrivingPhase, type OvertakeState } from "../racing";
import { buildRaceResultSnapshot, calculateFinishGap, type RaceResultSnapshot } from "../race-results";
import { UI_COPY } from "../ui-copy";
import { readStored, writeStored } from "../storage";
import { tintSprite } from "../lib/sprite-service";
import { Brand } from "../ui/brand";
import { LoadingScreen } from "../ui/loading-screen";
import { transitionRace, type RaceStatus } from "../race/lifecycle";
import {
  ChampionshipAutoplayDirector,
  type ChampionshipPlaybackMode,
} from "../championship/autoplay-director";
import { migrateLegacyTrack } from "../domain/track-document";
import { documentToLegacyCircuit } from "../domain/circuit-document";
import { clearLegacyCircuitStorage } from "../domain/circuit-repository";
import { TRACK_CHUNK_TEMPLATE_MAP } from "../track-chunks";
import { compileCircuitDocument } from "../simulation/circuit-compiler";
import { advanceRouteController, assignPitBox, beginPitService, completePitService, createRouteController, enterEscapeRoute, registerRouteCar, rejoinMainRoute, requestPitEntry, reverseAtEscapeTerminal, type RouteControllerState } from "../simulation/route-controller";
import { compileTrack } from "../simulation/track-compiler";
import { WorldRaceEngine, type WorldRaceCarSnapshot } from "../simulation/world-race-engine";
import {
  championshipSessionRepository,
  createChampionshipSession,
  type ChampionshipSession,
} from "../domain/championship-session";
import { MainMenu } from "../menu/MainMenu";
import { SettingsDetail, SettingsHub, type SettingsSection } from "../menu/SettingsScreens";
import { ChampionshipSetup, SingleRaceSetup } from "../menu/RaceSetupScreens";
import { ChampionshipResults } from "../championship/ChampionshipResults";
import { ChampionshipStandingsOverlay, RaceResultsOverlay } from "../race/RaceResultsOverlay";
import { RaceHud } from "../race/RaceHud";
import { LiveTiming } from "../race/LiveTiming";
import { RaceActionsMenu } from "../race/RaceActionsMenu";
import { assetRegistry } from "../assets/asset-registry";
import { BroadcastPanel } from "../race/BroadcastPanel";
import { createCarStrategyState, DEFAULT_FORMULA_STRATEGY, shouldRequestPitStop, type CarStrategyState, type StrategyRulesV1 } from "../domain/race-strategy";
type GameMode = "single" | "championship";
type GameTheme = "dark" | "light";
const WINNER_PRESENTATION_DURATION_MS = 2_000;
const THEME_STORAGE_KEY = "gridwatch.theme";
const isGameTheme = (value: unknown): value is GameTheme => value === "dark" || value === "light";
type MenuScreen =
  | "mode"
  | "single-setup"
  | "championship-setup"
  | "settings"
  | "race-settings"
  | "audio-settings"
  | "appearance-settings"
  | "track-editor"
  | "competition-editor"
  | "race"
  | "championship-results";

type Driver = {
  id: string | number;
  number?: number;
  code: string;
  name: string;
  team: string;
  color: string;
  accent: string;
  thirdColor?: string;
  helmetColor?: string;
  skill: number;
  aggression: number;
  consistency: number;
  cornering: number;
  overtaking: number;
  defense: number;
  risk: number;
};

type CarState = {
  id: string;
  seedKey: number;
  raceSkill: number;
  raceAggression: number;
  raceConsistency: number;
  raceCornering: number;
  raceOvertaking: number;
  raceDefense: number;
  raceRisk: number;
  distance: number;
  previousDistance: number;
  speed: number;
  lane: number;
  targetLane: number;
  mistakeUntil: number;
  nextMistake: number;
  lastLapStartedAt: number;
  lastLap: number | null;
  bestLap: number | null;
  finishPosition: number | null;
  finishedAt: number | null;
  finishGapSeconds: number | null;
  mechanical: "running" | "failing" | "retired";
  failureStartedAt: number;
  failureSide: number;
  failureChance: number;
  failureAt: number | null;
  performanceModifier: number;
  lapPerformanceModifier: number;
  performanceLap: number;
  performanceTarget: number;
  nextPerformanceShift: number;
  performanceShiftIndex: number;
  lineErrorChance: number;
  lineErrorAt: number | null;
  lineErrorUntil: number;
  lineErrorSide: number;
  lineErrorLapChecked: number;
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
  worldX: number | null;
  worldY: number | null;
  worldHeading: number | null;
  strategy: CarStrategyState;
};

type TrackSample = {
  x: number;
  y: number;
  angle: number;
  curve: number;
};

type Geometry = {
  samples: TrackSample[];
  width: number;
  height: number;
  trackWidth: number;
  driving: DrivingGeometry;
  worldBounds: { minX: number; maxX: number; minY: number; maxY: number };
};

type AudioSystem = {
  context: AudioContext;
  master: GainNode;
  engineGain: GainNode;
  crowdGain: GainNode;
  engineOne: OscillatorNode;
  engineTwo: OscillatorNode;
  crowd: AudioBufferSourceNode;
};

const DRIVERS: Driver[] = [
  { id: 0, code: "SOL", name: "Maya Solari", team: "Solaris GP", color: "#ffb703", accent: "#fff2b8", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 1, code: "VALE", name: "Luca Vale", team: "Velox Racing", color: "#ed263a", accent: "#ffd5da", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 2, code: "KAI", name: "Ari Kai", team: "Apex Blue", color: "#209cff", accent: "#c8e9ff", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 3, code: "NOVA", name: "Nico Nova", team: "Nova Corse", color: "#9b5cff", accent: "#e3d5ff", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 4, code: "MOR", name: "Theo Moreau", team: "Ardent", color: "#ff6b35", accent: "#ffe1d1", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 5, code: "REI", name: "Inez Rei", team: "Verdant Works", color: "#43d17b", accent: "#ccffe0", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 6, code: "FOX", name: "Ezra Fox", team: "Vanta Sport", color: "#f5f5f5", accent: "#7ef0ff", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 7, code: "LIN", name: "Sora Lin", team: "Pulse Racing", color: "#ff4fb3", accent: "#ffd0ea", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 8, code: "BEK", name: "Jonas Beck", team: "Nord Motorsport", color: "#00d1c7", accent: "#c7fffb", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 9, code: "ARO", name: "Milo Aro", team: "Kinetic", color: "#b7f34b", accent: "#edffc9", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 10, code: "SAI", name: "Lena Saito", team: "Ember GP", color: "#ff814a", accent: "#ffe0cf", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 11, code: "IVO", name: "Dani Ivo", team: "Cobalt One", color: "#3e5dff", accent: "#d3dbff", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 12, code: "ZED", name: "Rafa Zed", team: "Prisma", color: "#f35cff", accent: "#fbd4ff", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 13, code: "RIN", name: "Noa Rin", team: "Aurora", color: "#56e2ff", accent: "#d5f8ff", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 14, code: "ORO", name: "Enzo Oro", team: "Titan Racing", color: "#ffc83d", accent: "#fff1bd", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
  { id: 15, code: "MAE", name: "Clara Mae", team: "Vector", color: "#a8b1bb", accent: "#f3f6f8", skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const CAR_SCALE_FACTOR = 0.85 * 0.7;
const RACE_ATTRIBUTE_VARIATION = 5;
const CURB_OFFSET_FACTOR = 0.42;
const CURB_LINE_WIDTH = 3.4;
const EMPTY_TRACK: Circuit = { id: "empty", name: "No circuit created", country: "—", style: "balanced", points: [] };

function seeded(seed: number) {
  const value = Math.sin(seed * 9283.31 + 17.71) * 43758.5453;
  return value - Math.floor(value);
}

function raceAttribute(base: number, seed: number) {
  const variation = (seeded(seed) * 2 - 1) * RACE_ATTRIBUTE_VARIATION;
  return clamp(base + variation, 0, 100);
}

function formatTime(seconds: number | null, includeMinutes = true) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (!includeMinutes && minutes === 0) return `${secs.toFixed(3)}s`;
  return `${minutes}:${secs.toFixed(3).padStart(6, "0")}`;
}

function compareRaceOrder(a: CarState, b: CarState) {
  const aRetired = a.mechanical === "retired";
  const bRetired = b.mechanical === "retired";
  if (aRetired !== bRetired) return aRetired ? 1 : -1;
  const aFinished = a.finishPosition !== null;
  const bFinished = b.finishPosition !== null;
  if (aFinished !== bFinished) return aFinished ? -1 : 1;
  if (aFinished && bFinished) return a.finishPosition! - b.finishPosition!;
  return b.distance - a.distance;
}

function catmullRom(
  p0: readonly number[],
  p1: readonly number[],
  p2: readonly number[],
  p3: readonly number[],
  t: number,
) {
  const t2 = t * t;
  const t3 = t2 * t;
  const curved = [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
  const linear = [
    p1[0] + (p2[0] - p1[0]) * t,
    p1[1] + (p2[1] - p1[1]) * t,
  ];
  const minX = Math.min(p0[0], p1[0], p2[0], p3[0]);
  const maxX = Math.max(p0[0], p1[0], p2[0], p3[0]);
  const minY = Math.min(p0[1], p1[1], p2[1], p3[1]);
  const maxY = Math.max(p0[1], p1[1], p2[1], p3[1]);
  const blend = 0.12;
  return [
    clamp(linear[0] + (curved[0] - linear[0]) * blend, minX, maxX),
    clamp(linear[1] + (curved[1] - linear[1]) * blend, minY, maxY),
  ];
}

function buildGeometry(
  width: number,
  height: number,
  trackPoints: ReadonlyArray<readonly [number, number]>,
  startIndex = 0,
): Geometry {
  const raw: { x: number; y: number }[] = [];
  const orderedPoints = trackPoints.map((_, index) => trackPoints[(startIndex + index) % trackPoints.length]);
  const segments = orderedPoints.length;
  const stepsPerSegment = 30;
  const minX = Math.min(...orderedPoints.map(([x]) => x));
  const maxX = Math.max(...orderedPoints.map(([x]) => x));
  const minY = Math.min(...orderedPoints.map(([, y]) => y));
  const maxY = Math.max(...orderedPoints.map(([, y]) => y));
  const fitX = (value: number) =>
    0.035 + ((value - minX) / Math.max(0.000001, maxX - minX)) * 0.93;
  const fitY = (value: number) =>
    0.045 + ((value - minY) / Math.max(0.000001, maxY - minY)) * 0.89;
  for (let i = 0; i < segments; i++) {
    const p0 = orderedPoints[(i - 1 + segments) % segments];
    const p1 = orderedPoints[i];
    const p2 = orderedPoints[(i + 1) % segments];
    const p3 = orderedPoints[(i + 2) % segments];
    for (let step = 0; step < stepsPerSegment; step++) {
      const [nx, ny] = catmullRom(p0, p1, p2, p3, step / stepsPerSegment);
      raw.push({ x: fitX(nx) * width, y: fitY(ny) * height });
    }
  }

  const cumulative = [0];
  let total = 0;
  for (let i = 1; i <= raw.length; i++) {
    const a = raw[i - 1];
    const b = raw[i % raw.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    cumulative.push(total);
  }

  const samples: TrackSample[] = [];
  const targetCount = 900;
  for (let i = 0; i < targetCount; i++) {
    const target = (i / targetCount) * total;
    let low = 0;
    let high = cumulative.length - 1;
    while (low < high - 1) {
      const middle = Math.floor((low + high) / 2);
      if (cumulative[middle] <= target) low = middle;
      else high = middle;
    }
    const a = raw[low % raw.length];
    const b = raw[(low + 1) % raw.length];
    const span = cumulative[low + 1] - cumulative[low] || 1;
    const mix = (target - cumulative[low]) / span;
    samples.push({
      x: a.x + (b.x - a.x) * mix,
      y: a.y + (b.y - a.y) * mix,
      angle: Math.atan2(b.y - a.y, b.x - a.x),
      curve: 0,
    });
  }

  samples.forEach((sample, index) => {
    const before = samples[(index - 4 + samples.length) % samples.length];
    const after = samples[(index + 4) % samples.length];
    sample.angle = Math.atan2(after.y - before.y, after.x - before.x);
    let turn = Math.atan2(Math.sin(after.angle - before.angle), Math.cos(after.angle - before.angle));
    turn = Math.abs(turn);
    sample.curve = clamp(turn / 0.3, 0, 1);
  });

  const trackWidth = clamp(width * 0.032, 24, 42);
  return {
    samples,
    width,
    height,
    trackWidth,
    driving: analyzeTrack(samples, trackWidth),
    worldBounds: { minX: minX * 1_000, maxX: maxX * 1_000, minY: minY * 620, maxY: maxY * 620 },
  };
}

function stableSeedKey(id: string | number) {
  if (typeof id === "number") return id;
  let hash = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16_777_619);
  return hash >>> 0;
}

function worldToCanvas(position: { x: number; y: number }, geometry: Geometry) {
  const { minX, maxX, minY, maxY } = geometry.worldBounds;
  return {
    x: (0.035 + (position.x - minX) / Math.max(0.0001, maxX - minX) * 0.93) * geometry.width,
    y: (0.045 + (position.y - minY) / Math.max(0.0001, maxY - minY) * 0.89) * geometry.height,
  };
}

function initialCars(gridSize: number, seed: number, totalLaps: number, drivers: Driver[] = DRIVERS, strategyRules: StrategyRulesV1 = DEFAULT_FORMULA_STRATEGY): CarState[] {
  const selected = drivers.slice(0, gridSize)
    .map((driver) => ({ driver, seedKey: stableSeedKey(driver.id), sort: seeded(seed * 19 + stableSeedKey(driver.id) * 137) }))
    .sort((a, b) => a.sort - b.sort);

  return selected.map(({ driver, seedKey }, index) => {
    const attributeSeed = seed * 1009 + seedKey * 313;
    const failureChance = 0.09 + seeded(seed * 83 + seedKey * 61) * 0.06;
    const willFail = seeded(seed * 127 + seedKey * 109) < failureChance;
    const failureAt = willFail
      ? 0.35 + seeded(seed * 211 + seedKey * 157) * Math.max(0.45, totalLaps - 0.65)
      : null;

    return {
      id: String(driver.id),
      seedKey,
      raceSkill: raceAttribute(driver.skill, attributeSeed + 11),
      raceAggression: raceAttribute(driver.aggression, attributeSeed + 23),
      raceConsistency: raceAttribute(driver.consistency, attributeSeed + 37),
      raceCornering: raceAttribute(driver.cornering, attributeSeed + 47),
      raceOvertaking: raceAttribute(driver.overtaking, attributeSeed + 59),
      raceDefense: raceAttribute(driver.defense, attributeSeed + 71),
      raceRisk: raceAttribute(driver.risk, attributeSeed + 83),
      distance: -(index + 1) * 0.008,
      previousDistance: -(index + 1) * 0.008,
      speed: 0,
      lane: index % 2 === 0 ? -0.24 : 0.24,
      targetLane: index % 2 === 0 ? -0.24 : 0.24,
      mistakeUntil: -1,
      nextMistake: 0.45 + seeded(seed * 3 + seedKey) * 1.5,
      lastLapStartedAt: 0,
      lastLap: null,
      bestLap: null,
      finishPosition: null,
      finishedAt: null,
      finishGapSeconds: null,
      mechanical: "running" as const,
      failureStartedAt: -1,
      failureSide: seeded(seed * 47 + seedKey * 29) > 0.5 ? 1 : -1,
      failureChance,
      failureAt,
      performanceModifier: seeded(seed * 307 + seedKey * 181) * 0.1 - 0.05,
      lapPerformanceModifier: seeded(seed * 353 + seedKey * 199) * 0.12 - 0.06,
      performanceLap: 0,
      performanceTarget: seeded(seed * 401 + seedKey * 223) * 0.1 - 0.05,
      nextPerformanceShift: 3 + seeded(seed * 503 + seedKey * 269) * 5,
      performanceShiftIndex: 0,
      lineErrorChance: 0.15 + seeded(seed * 607 + seedKey * 347) * 0.05,
      lineErrorAt: null,
      lineErrorUntil: -1,
      lineErrorSide: seeded(seed * 701 + seedKey * 389) > 0.5 ? 1 : -1,
      lineErrorLapChecked: 0,
      lateralVelocity: 0,
      throttle: 0,
      brake: 0,
      steering: 0,
      targetSpeed: 0,
      drivingPhase: "straight",
      overtakeState: "idle",
      overtakeTargetId: null,
      overtakeSide: index % 2 === 0 ? -1 : 1,
      overtakeUntil: 0,
      overtakeCooldownUntil: 0,
      slipstream: 0,
      worldX: null,
      worldY: null,
      worldHeading: null,
      strategy: createCarStrategyState(strategyRules, seedKey + seed),
    };
  });
}

function TeamTintedSprite({ source, driver, alt }: { source: string; driver: Driver; alt: string }) {
  const [tintedSource, setTintedSource] = useState(source);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    void tintSprite(source, { blue: driver.color, green: driver.accent, white: driver.thirdColor ?? "#ffffff", red: driver.helmetColor ?? "#ff0000" }, controller.signal)
      .then((result) => { if (!controller.signal.aborted) { setTintedSource(result); setState("ready"); } })
      .catch(() => { if (!controller.signal.aborted) { setTintedSource(source); setState("error"); } });
    return () => controller.abort();
  }, [driver.accent, driver.color, driver.helmetColor, driver.thirdColor, source]);

  // The source is a generated local data URL and has no stable remote image path.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="timing-car-sprite imported-sprite" src={tintedSource} alt={alt} data-asset-state={state} aria-busy={state === "loading"} />;
}

function TimingCarSprite({ driver, spriteSrc }: { driver: Driver; spriteSrc?: string }) {
  if (spriteSrc?.startsWith("data:") || spriteSrc?.startsWith("/")) {
    return <TeamTintedSprite source={spriteSrc} driver={driver} alt={`${driver.team} Formula car`} />;
  }
  return (
    <svg
      className="timing-car-sprite"
      viewBox="0 0 120 40"
      role="img"
      aria-label={`${driver.team} Formula car`}
    >
      <defs>
        <linearGradient id={`timing-body-${driver.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={driver.accent} />
          <stop offset="0.28" stopColor={driver.color} />
          <stop offset="1" stopColor={driver.color} />
        </linearGradient>
        <linearGradient id={`timing-carbon-${driver.id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#07090a" />
          <stop offset="0.5" stopColor="#24282a" />
          <stop offset="1" stopColor="#050708" />
        </linearGradient>
      </defs>

      {/* Carbon floor and the stepped aero surfaces keep the car low and Formula-like. */}
      <path d="M14 29.3h94l6.5 2H9z" fill={`url(#timing-carbon-${driver.id})`} opacity=".96" />
      <path d="M7 27.4 20 22h22l10.5-6.8h26.8l16.5 7.1h11.8v6.2H92l-10 3H38l-8-3H7z" fill={`url(#timing-body-${driver.id})`} stroke="rgba(0,0,0,.3)" strokeWidth=".7" />

      {/* Long pointed nose and layered front wing. */}
      <path d="M3 27.5 19 22.2h23l-5.8 6.3H11z" fill={driver.color} />
      <path d="M2.5 29h26v2.2H2.5zM5.2 26.1h2.2v7H5.2z" fill="#080b0c" />
      <path d="M4 29.2h23v.9H4z" fill={driver.accent} />
      <path d="m15 26.2 25.5-2.8 7.5-4.8h7.2l-7 7.3z" fill={driver.accent} opacity=".48" />

      {/* Sculpted sidepod, cockpit opening, halo and airbox. */}
      <path d="M48 19.2h16.5l11.8 3.1 9.5 7H52l-7.5-3.6z" fill={driver.color} />
      <path d="M58 16.2h20l16.2 7.2-32.8-1.2z" fill={driver.color} />
      <path d="M50.5 21.7c3.9-7.2 9.2-10.1 17.2-10.1 6.3 0 11.1 2.9 14.8 9.5h-4.2c-3.1-4.6-6.4-6.5-10.9-6.5-5.5 0-9.5 2.2-12.8 7.1z" fill="#0b1012" />
      <path d="M62.5 15.1h7.2v7.2h-7.2z" fill="#171c1e" />
      <path d="M69.8 11.5h5.3v9.8h-5.3z" fill={driver.color} />
      <path d="m75.1 11.5 3.6 1.6-3.6 1.5z" fill="#080b0c" />
      <path d="M53.8 20.6c3.3-6.3 8.1-8.8 14.7-8.8 5.8 0 9.8 2.4 13.3 8.1" fill="none" stroke="#15191b" strokeWidth="2" strokeLinecap="round" />
      <path d="M66.8 11.9v8.8" stroke="#15191b" strokeWidth="1.6" />
      <path d="M77 21.8 96 23.2l-7.8 7.2H73.5z" fill={driver.accent} opacity=".5" />
      <path d="M48 27.2h38" stroke="rgba(255,255,255,.28)" strokeWidth=".7" />

      {/* Suspension arms and exposed wheels. */}
      <path d="M25 23.4 39 19.7M25 29.2l15-4.7M94 22.3l8-4.3M94 29l8-5.1" fill="none" stroke="#15191b" strokeWidth="1.25" />
      {[25, 101].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="29" r="9.7" fill="#050708" />
          <circle cx={cx} cy="29" r="6" fill="#252a2c" stroke={driver.color} strokeWidth=".85" />
          <circle cx={cx} cy="29" r="3.1" fill="#747d80" />
          <circle cx={cx} cy="29" r="1.2" fill="#171a1c" />
          <path d={`M${cx - 6.4} 21.9a9.6 9.6 0 0 1 12.8 0`} fill="none" stroke={driver.accent} strokeWidth=".8" opacity=".9" />
        </g>
      ))}

      {/* Tall rear wing inspired by the reference profile. */}
      <path d="M98 12.6h18v3.6H99.5zM109.6 11.2h3.5v13.1h-3.5z" fill="#080b0c" />
      <path d="M98.8 13h16.3v1.3H99.3z" fill={driver.color} />
      <path d="M86.5 30.2h20" stroke={driver.color} strokeWidth="1.2" />
    </svg>
  );
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  driver: Driver,
  x: number,
  y: number,
  angle: number,
  scale: number,
  isLeader: boolean,
  mechanical: CarState["mechanical"],
  raceTime: number,
  importedSprite?: HTMLImageElement | null,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  ctx.scale(scale, scale);

  if (importedSprite?.complete && importedSprite.naturalWidth > 0) {
    ctx.drawImage(importedSprite, -15, -23, 30, 46);
    ctx.restore();
    return;
  }

  if (isLeader) {
    ctx.beginPath();
    ctx.ellipse(0, -0.8, 11.8, 17.2, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,.82)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
  }

  ctx.shadowColor = "rgba(0,0,0,.72)";
  ctx.shadowBlur = 4.5;
  ctx.shadowOffsetY = 2.5;

  // Carbon floor and diffuser.
  ctx.beginPath();
  ctx.moveTo(-3.8, -5.4);
  ctx.lineTo(-6.1, -1.5);
  ctx.lineTo(-6.4, 8.9);
  ctx.lineTo(-4.5, 11.4);
  ctx.lineTo(4.5, 11.4);
  ctx.lineTo(6.4, 8.9);
  ctx.lineTo(6.1, -1.5);
  ctx.lineTo(3.8, -5.4);
  ctx.closePath();
  ctx.fillStyle = "#0a0e10";
  ctx.fill();

  ctx.shadowBlur = 1.8;

  // Exposed suspension arms from the reference car.
  const suspensionLine = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  ctx.strokeStyle = "#171c1f";
  ctx.lineWidth = 1;
  [[-1, -1], [1, 1]].forEach(([side]) => {
    suspensionLine(side * 1.8, -7.1, side * 6.5, -9.1);
    suspensionLine(side * 2.3, -5.1, side * 6.5, -9.1);
    suspensionLine(side * 3.4, 6.2, side * 6.6, 8.2);
    suspensionLine(side * 2.7, 9.8, side * 6.6, 8.2);
  });

  // Four large open wheels with subtle tire highlights.
  const wheel = (wx: number, wy: number, width: number, height: number) => {
    ctx.beginPath();
    ctx.roundRect(wx - width / 2, wy - height / 2, width, height, 1.25);
    ctx.fillStyle = "#050708";
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(wx - width * 0.32, wy - height * 0.42, width * 0.64, height * 0.84, 0.8);
    ctx.fillStyle = "#151a1c";
    ctx.fill();
    ctx.fillStyle = driver.color;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(wx - width * 0.28, wy - height * 0.38, width * 0.56, 0.45);
    ctx.globalAlpha = 1;
  };
  wheel(-7.3, -8.9, 4.25, 7.1);
  wheel(7.3, -8.9, 4.25, 7.1);
  wheel(-7.4, 7.9, 4.55, 7.6);
  wheel(7.4, 7.9, 4.55, 7.6);

  // Front wing, flaps and endplates.
  ctx.fillStyle = "#080b0d";
  ctx.fillRect(-10.1, -14.3, 20.2, 2.2);
  ctx.fillRect(-10.5, -15.1, 1.1, 4.1);
  ctx.fillRect(9.4, -15.1, 1.1, 4.1);
  ctx.fillStyle = driver.color;
  ctx.fillRect(-9.2, -13.85, 18.4, 1.05);
  ctx.fillStyle = driver.accent;
  ctx.globalAlpha = 0.82;
  ctx.fillRect(-7.7, -12.45, 5.7, 0.65);
  ctx.fillRect(2, -12.45, 5.7, 0.65);
  ctx.globalAlpha = 1;

  // Rear wing and supports.
  ctx.fillStyle = "#070a0c";
  ctx.fillRect(-9.6, 11.2, 19.2, 3);
  ctx.fillRect(-10, 10.4, 1, 4.5);
  ctx.fillRect(9, 10.4, 1, 4.5);
  ctx.fillStyle = driver.color;
  ctx.fillRect(-8.9, 11.8, 17.8, 1.35);
  ctx.strokeStyle = "#242a2d";
  ctx.lineWidth = 0.85;
  suspensionLine(-2.4, 9.1, -4.1, 11.3);
  suspensionLine(2.4, 9.1, 4.1, 11.3);

  // Long nose, wide sidepods and tapered engine cover.
  ctx.beginPath();
  ctx.moveTo(0, -14.7);
  ctx.lineTo(-1.35, -13.1);
  ctx.lineTo(-1.8, -6.7);
  ctx.lineTo(-3.35, -3.8);
  ctx.lineTo(-5.25, -1.2);
  ctx.lineTo(-5.55, 4.5);
  ctx.lineTo(-4.45, 8.8);
  ctx.lineTo(-2.1, 10.8);
  ctx.lineTo(0, 11.25);
  ctx.lineTo(2.1, 10.8);
  ctx.lineTo(4.45, 8.8);
  ctx.lineTo(5.55, 4.5);
  ctx.lineTo(5.25, -1.2);
  ctx.lineTo(3.35, -3.8);
  ctx.lineTo(1.8, -6.7);
  ctx.lineTo(1.35, -13.1);
  ctx.closePath();
  const bodyGradient = ctx.createLinearGradient(-5.5, 0, 5.5, 0);
  bodyGradient.addColorStop(0, driver.color);
  bodyGradient.addColorStop(0.44, driver.color);
  bodyGradient.addColorStop(0.53, driver.accent);
  bodyGradient.addColorStop(1, driver.color);
  ctx.fillStyle = bodyGradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,.24)";
  ctx.lineWidth = 0.55;
  ctx.stroke();

  // Team livery stripe along the nose and engine spine.
  ctx.beginPath();
  ctx.moveTo(-0.42, -13.8);
  ctx.lineTo(-0.72, -4.5);
  ctx.lineTo(-0.5, 10.2);
  ctx.lineTo(0.5, 10.2);
  ctx.lineTo(0.72, -4.5);
  ctx.lineTo(0.42, -13.8);
  ctx.closePath();
  ctx.fillStyle = driver.accent;
  ctx.globalAlpha = 0.58;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Sidepod air intakes and sculpted upper surfaces.
  ctx.fillStyle = "#171d20";
  ctx.beginPath();
  ctx.moveTo(-4.75, -0.8);
  ctx.lineTo(-3.1, -1.95);
  ctx.lineTo(-2.85, 1.6);
  ctx.lineTo(-4.7, 2.25);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(4.75, -0.8);
  ctx.lineTo(3.1, -1.95);
  ctx.lineTo(2.85, 1.6);
  ctx.lineTo(4.7, 2.25);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.23)";
  ctx.lineWidth = 0.5;
  suspensionLine(-4.5, 4, -3.5, 8.1);
  suspensionLine(4.5, 4, 3.5, 8.1);

  // Deep cockpit, driver helmet and halo.
  ctx.fillStyle = "#12191e";
  ctx.beginPath();
  ctx.ellipse(0, -0.2, 2.65, 4.25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = driver.accent;
  ctx.beginPath();
  ctx.arc(0, -0.65, 1.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#252b2e";
  ctx.beginPath();
  ctx.arc(0, -0.65, 0.78, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#0c1012";
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.arc(0, -0.7, 2.7, Math.PI * 0.07, Math.PI * 0.93);
  ctx.stroke();
  suspensionLine(0, -3.35, 0, 1.85);

  // Airbox and small car number on the nose.
  ctx.fillStyle = "#0b1012";
  ctx.beginPath();
  ctx.roundRect(-1.2, 3.55, 2.4, 2.8, 0.7);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.9)";
  ctx.font = "700 3.1px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(driver.number ?? stableSeedKey(driver.id) % 100).padStart(2, "0"), 0, -7.9);
  ctx.restore();

  if (mechanical !== "running") {
    ctx.save();
    const smokeStrength = mechanical === "failing" ? 1 : 0.62;
    const exhaustX = x - Math.cos(angle) * 13 * scale;
    const exhaustY = y - Math.sin(angle) * 13 * scale;
    for (let puff = 0; puff < 4; puff++) {
      const phase = raceTime * (1.7 + puff * 0.09) + puff * 1.4 + stableSeedKey(driver.id);
      const drift = 4 + puff * 3 + (Math.sin(phase) + 1) * 1.5;
      ctx.beginPath();
      ctx.arc(
        exhaustX - Math.cos(angle) * drift + Math.sin(phase) * 2.5,
        exhaustY - Math.sin(angle) * drift - puff * 1.4,
        (2.1 + puff * 0.7) * scale,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = `rgba(185, 193, 190, ${Math.max(0.05, (0.28 - puff * 0.05) * smokeStrength)})`;
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawTrack(ctx: CanvasRenderingContext2D, geometry: Geometry, track: Circuit) {
  const { samples, width, height, trackWidth } = geometry;
  ctx.clearRect(0, 0, width, height);

  const grass = ctx.createLinearGradient(0, 0, width, height);
  const grassPalette = track.style === "street"
    ? ["#b7c1b8", "#9eaba3", "#87968d"]
    : track.style === "fast"
      ? ["#dbe9cb", "#c9dfba", "#b5d0a7"]
      : ["#e8f0df", "#d7e7cb", "#c4dcba"];
  grass.addColorStop(0, grassPalette[0]);
  grass.addColorStop(0.5, grassPalette[1]);
  grass.addColorStop(1, grassPalette[2]);
  ctx.fillStyle = grass;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.24;
  ctx.strokeStyle = "#a7c39a";
  ctx.lineWidth = 1;
  for (let y = -height; y < height * 2; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y + width * 0.18);
    ctx.stroke();
  }
  ctx.restore();

  const makePath = (offset = 0) => {
    ctx.beginPath();
    ctx.moveTo(
      samples[0].x - Math.sin(samples[0].angle) * offset,
      samples[0].y + Math.cos(samples[0].angle) * offset,
    );
    for (let i = 1; i < samples.length; i++) {
      ctx.lineTo(
        samples[i].x - Math.sin(samples[i].angle) * offset,
        samples[i].y + Math.cos(samples[i].angle) * offset,
      );
    }
    ctx.closePath();
  };

  const drawCurbEdge = (edge: number) => {
    ctx.beginPath();
    let canContinue = false;
    samples.forEach((sample, index) => {
      const previous = samples[(index - 1 + samples.length) % samples.length];
      const next = samples[(index + 1) % samples.length];
      const turn = Math.abs(
        Math.atan2(
          Math.sin(next.angle - sample.angle),
          Math.cos(next.angle - sample.angle),
        ),
      );
      const offset = trackWidth * CURB_OFFSET_FACTOR;
      const x = sample.x - Math.sin(sample.angle) * edge * offset;
      const y = sample.y + Math.cos(sample.angle) * edge * offset;
      // Tight apexes need a circular offset join. Connecting the incoming and
      // outgoing curb points around the apex prevents the triangular fold.
      if (turn > 0.35) {
        const startAngle = Math.atan2(
          Math.cos(previous.angle) * edge,
          -Math.sin(previous.angle) * edge,
        );
        const endAngle = Math.atan2(
          Math.cos(next.angle) * edge,
          -Math.sin(next.angle) * edge,
        );
        let deltaAngle = endAngle - startAngle;
        while (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
        while (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
        ctx.moveTo(
          sample.x + Math.cos(startAngle) * offset,
          sample.y + Math.sin(startAngle) * offset,
        );
        ctx.arc(
          sample.x,
          sample.y,
          offset,
          startAngle,
          startAngle + deltaAngle,
          deltaAngle < 0,
        );
        canContinue = true;
      } else if (!canContinue || index === 0) {
        ctx.moveTo(x, y);
        canContinue = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
  };

  // Subtle service roads, gravel runoff and vegetation create the miniature
  // aerial-map feeling of the reference without obscuring the racing line.
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  makePath(trackWidth * 0.92 + 25);
  ctx.strokeStyle = "rgba(224, 229, 220, 0.92)";
  ctx.lineWidth = 13;
  ctx.stroke();
  makePath(trackWidth * 0.92 + 38);
  ctx.strokeStyle = "rgba(177, 196, 166, 0.42)";
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 14]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const drawTree = (x: number, y: number, size: number, tone: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(44, 72, 43, 0.16)";
    ctx.beginPath();
    ctx.ellipse(2, size * 0.44, size * 0.72, size * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#806d4d";
    ctx.fillRect(-size * 0.08, size * 0.04, size * 0.16, size * 0.52);
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(-size * 0.2, 0, size * 0.42, 0, Math.PI * 2);
    ctx.arc(size * 0.2, -size * 0.08, size * 0.48, 0, Math.PI * 2);
    ctx.arc(0, -size * 0.32, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.arc(-size * 0.16, -size * 0.42, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  for (let index = 0; index < 58; index++) {
    const sample = samples[Math.floor(seeded(index * 31.7 + 4.2) * samples.length)];
    const side = seeded(index * 47.1 + 9.4) > 0.5 ? 1 : -1;
    const distance = trackWidth * 0.55 + 32 + seeded(index * 71.3 + 2.1) * 78;
    const x = sample.x - Math.sin(sample.angle) * side * distance;
    const y = sample.y + Math.cos(sample.angle) * side * distance;
    const size = 3.5 + seeded(index * 19.7 + 5.6) * 5.5;
    drawTree(x, y, size, index % 3 === 0 ? "#729b62" : "#86ab70");
  }

  const drawGrandstand = (sampleIndex: number, side: number) => {
    const sample = samples[sampleIndex % samples.length];
    const offset = side * (trackWidth * 0.72 + 42);
    const x = sample.x - Math.sin(sample.angle) * offset;
    const y = sample.y + Math.cos(sample.angle) * offset;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(sample.angle);
    ctx.fillStyle = "rgba(71, 83, 87, 0.2)";
    ctx.fillRect(-29, -10, 58, 20);
    ctx.fillStyle = "#f3f5f2";
    ctx.fillRect(-25, -8, 50, 15);
    ctx.fillStyle = "#b5c0c2";
    for (let row = 0; row < 3; row++) {
      ctx.fillRect(-21, -5 + row * 4, 42, 1.4);
    }
    ctx.restore();
  };

  drawGrandstand(34, -1);
  drawGrandstand(Math.floor(samples.length * 0.58), 1);

  makePath();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(50, 62, 63, 0.28)";
  ctx.lineWidth = trackWidth + 18;
  ctx.stroke();

  makePath();
  const asphalt = ctx.createLinearGradient(0, 0, width, height);
  asphalt.addColorStop(0, "#3c4549");
  asphalt.addColorStop(0.5, "#2f373a");
  asphalt.addColorStop(1, "#252d30");
  ctx.strokeStyle = asphalt;
  ctx.lineWidth = trackWidth;
  ctx.stroke();

  // Deterministic micro-texture keeps the asphalt from reading as a flat fill
  // while remaining stable between frames and race seeds.
  ctx.save();
  ctx.lineWidth = 1;
  for (let index = 0; index < 260; index += 1) {
    const sample = samples[Math.floor(seeded(index * 13.7 + 21) * samples.length)];
    const lateral = (seeded(index * 29.1 + 8) - 0.5) * trackWidth * 0.78;
    const longitudinal = (seeded(index * 47.3 + 3) - 0.5) * 7;
    const x = sample.x - Math.sin(sample.angle) * lateral + Math.cos(sample.angle) * longitudinal;
    const y = sample.y + Math.cos(sample.angle) * lateral + Math.sin(sample.angle) * longitudinal;
    ctx.fillStyle = index % 5 === 0 ? "rgba(238, 242, 235, .07)" : "rgba(8, 12, 13, .09)";
    ctx.fillRect(x, y, 0.8 + seeded(index * 5.9) * 1.3, 0.8 + seeded(index * 7.4) * 1.3);
  }
  ctx.restore();

  makePath(trackWidth * 0.28);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
  ctx.lineWidth = 1;
  ctx.setLineDash([22, 28]);
  ctx.stroke();

  for (const edge of [-1, 1]) {
    drawCurbEdge(edge);
    ctx.strokeStyle = "#f4f1e8";
    ctx.lineWidth = CURB_LINE_WIDTH;
    ctx.setLineDash([8, 9]);
    ctx.lineDashOffset = edge < 0 ? 10 : 0;
    ctx.stroke();

    drawCurbEdge(edge);
    ctx.strokeStyle = "#d82c36";
    ctx.lineWidth = CURB_LINE_WIDTH;
    ctx.setLineDash([8, 9]);
    ctx.lineDashOffset = edge < 0 ? 0 : 10;
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const start = samples[0];
  const nx = -Math.sin(start.angle);
  const ny = Math.cos(start.angle);
  const cells = 10;
  for (let i = 0; i < cells; i++) {
    const side = (i / cells - 0.5) * trackWidth;
    ctx.strokeStyle = i % 2 === 0 ? "#f3f4ef" : "#111516";
    ctx.lineWidth = trackWidth / cells + 0.8;
    ctx.beginPath();
    ctx.moveTo(start.x + nx * side - Math.cos(start.angle) * 2.3, start.y + ny * side - Math.sin(start.angle) * 2.3);
    ctx.lineTo(start.x + nx * side + Math.cos(start.angle) * 2.3, start.y + ny * side + Math.sin(start.angle) * 2.3);
    ctx.stroke();
  }

  const barrierGroups = [0.135, 0.405, 0.735];
  barrierGroups.forEach((progress, group) => {
    for (let i = -3; i <= 3; i++) {
      const sample = samples[Math.floor((progress * samples.length + i * 3 + samples.length) % samples.length)];
      const bx = sample.x - Math.sin(sample.angle) * (trackWidth / 2 + 11);
      const by = sample.y + Math.cos(sample.angle) * (trackWidth / 2 + 11);
      ctx.beginPath();
      ctx.arc(bx, by, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = (i + group) % 2 === 0 ? "#e9ecdf" : "#d52d36";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });

}

const CHAMPIONSHIP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

function shuffledTrackIndices(seed: number, tracks: Circuit[] = TRACKS) {
  return tracks
    .map((_, index) => ({ index, order: seeded(seed * 41 + index * 173) }))
    .sort((a, b) => a.order - b.order)
    .map(({ index }) => index);
}

function randomTrackIndex(seed: number, currentIndex?: number, tracks: Circuit[] = TRACKS) {
  const candidates = shuffledTrackIndices(seed, tracks).filter((index) => index !== currentIndex);
  return candidates[0] ?? 0;
}

export function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const simulationAccumulatorRef = useRef(0);
  const geometryRef = useRef<Geometry | null>(null);
  const carsRef = useRef<CarState[]>(initialCars(12, 1, 6));
  const currentTrackRef = useRef<Circuit>(EMPTY_TRACK);
  const modeRef = useRef<GameMode | null>(null);
  const raceTimeRef = useRef(0);
  const countdownRef = useRef(3);
  const statusRef = useRef<RaceStatus>("ready");
  const speedRef = useRef(1);
  const lapsRef = useRef(6);
  const sessionSeedRef = useRef(1);
  const raceSeedSequenceRef = useRef(1);
  const audioRef = useRef<AudioSystem | null>(null);
  const topSpriteRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const lastCountdownTickRef = useRef(4);
  const finishSoundPlayedRef = useRef(false);
  const effectCooldownRef = useRef(0);
  const raceScoredRef = useRef(false);
  const raceResultRef = useRef<RaceResultSnapshot | null>(null);
  const winnerPresentationTimerRef = useRef<number | null>(null);
  const raceStartTimerRef = useRef<number | null>(null);
  const raceActionsRef = useRef<HTMLDivElement>(null);
  const raceActionsTriggerRef = useRef<HTMLButtonElement>(null);
  const worldRaceEngineRef = useRef<WorldRaceEngine | null>(null);
  const worldRaceEnginePromiseRef = useRef<Promise<WorldRaceEngine | null> | null>(null);
  const worldRaceEngineGenerationRef = useRef(0);
  const routeControllerRef = useRef<RouteControllerState | null>(null);

  const [screen, setScreen] = useState<MenuScreen>("mode");
  const [gameMode, setGameMode] = useState<GameMode | null>(null);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [selectedTrackChoice, setSelectedTrackChoice] = useState("random");
  const [championshipLength, setChampionshipLength] = useState(5);
  const [championshipSchedule, setChampionshipSchedule] = useState<number[]>([]);
  const [championshipRound, setChampionshipRound] = useState(0);
  const [championshipPoints, setChampionshipPoints] = useState<Record<string, number>>({});
  const [championshipResults, setChampionshipResults] = useState<Record<string, number[]>>({});
  const [championshipPlaybackMode, setChampionshipPlaybackMode] = useState<ChampionshipPlaybackMode>("manual");
  const [resultDurationSeconds, setResultDurationSeconds] = useState(8);
  const [standingsDurationSeconds, setStandingsDurationSeconds] = useState(6);
  const [pauseWhenHidden, setPauseWhenHidden] = useState(true);
  const [savedChampionshipSession, setSavedChampionshipSession] = useState<ChampionshipSession | null>(null);
  const [autoplayPaused, setAutoplayPaused] = useState(false);
  const [autoplayDirector] = useState(() => new ChampionshipAutoplayDirector());
  const [showRoundStandings, setShowRoundStandings] = useState(false);
  const [raceResult, setRaceResult] = useState<RaceResultSnapshot | null>(null);
  const [showRaceResults, setShowRaceResults] = useState(false);
  const [status, setStatus] = useState<RaceStatus>("ready");
  const [cars, setCars] = useState<CarState[]>(() => initialCars(12, 1, 6));
  const [raceTime, setRaceTime] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [simSpeed, setSimSpeed] = useState(1);
  const [totalLaps, setTotalLaps] = useState(6);
  const [gridSize, setGridSize] = useState(12);
  const [soundOn, setSoundOn] = useState(false);
  const [theme, setTheme] = useState<GameTheme>(() => readStored(THEME_STORAGE_KEY, "dark", isGameTheme));
  const [showDrivingDebug, setShowDrivingDebug] = useState(false);
  const [raceActionsOpen, setRaceActionsOpen] = useState(false);
  const [worldEngineState, setWorldEngineState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [customTracks, setCustomTracks] = useState<EditableCircuit[]>([]);
  const [customCategories, setCustomCategories] = useState<CompetitionCategory[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [officialCategory] = useState(createDefaultCategory);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const catalog = useMemo(() => [...TRACKS, ...customTracks], [customTracks]);
  const currentTrack = catalog[currentTrackIndex] ?? catalog[0] ?? EMPTY_TRACK;
  const categories = useMemo(() => [officialCategory, ...customCategories], [customCategories, officialCategory]);
  const activeCategory = categories.find((category) => category.id === selectedCategoryId) ?? officialCategory;
  const activeDrivers = useMemo(() => categoryDrivers(activeCategory) as Driver[], [activeCategory]);
  const driverById = useMemo(() => new Map(activeDrivers.map((driver) => [String(driver.id), driver])), [activeDrivers]);
  const maxGridSize = Math.max(1, activeDrivers.length);
  const selectedGridSize = clamp(gridSize, 1, maxGridSize);

  useEffect(() => {
    const controller = new AbortController();
    // Browser storage is restored after hydration to avoid server/client markup divergence.
    clearLegacyCircuitStorage();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCustomTracks(loadCustomCircuits());
    setCustomCategories(loadCategories());
    setSavedChampionshipSession(championshipSessionRepository.load());
    void Promise.all([assetRegistry.preloadCritical(controller.signal), loadSavedCircuits()]).then(([, circuits]) => {
      if (!controller.signal.aborted) setCustomTracks(circuits);
    }).finally(() => { if (!controller.signal.aborted) setStorageReady(true); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeStored(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!raceActionsOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setRaceActionsOpen(false);
      raceActionsTriggerRef.current?.focus();
    };
    const closeOnPointerDown = (event: PointerEvent) => {
      if (raceActionsRef.current?.contains(event.target as Node)) return;
      setRaceActionsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnPointerDown);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnPointerDown);
    };
  }, [raceActionsOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "F3") return;
      event.preventDefault();
      setShowDrivingDebug((visible) => !visible);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (gridSize > maxGridSize || gridSize < 1) {
      // Keep the persisted control value valid for the selected category.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGridSize(maxGridSize);
    }
  }, [gridSize, maxGridSize]);

  useEffect(() => {
    topSpriteRef.current = new Map();
    const source = activeCategory.sprites.main;
    if (!source.startsWith("data:") && !source.startsWith("/")) return;
    const controller = new AbortController();
    activeDrivers.forEach((driver) => {
      void tintSprite(source, { blue: driver.color, green: driver.accent, white: driver.thirdColor ?? "#ffffff", red: driver.helmetColor ?? "#ff0000" }, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        const tinted = new Image();
        tinted.onload = () => { if (!controller.signal.aborted) topSpriteRef.current.set(String(driver.id), tinted); };
        tinted.src = result;
      }).catch(() => { /* Generated Canvas cars remain the fixed-size fallback. */ });
    });
    return () => controller.abort();
  }, [activeCategory.sprites.main, activeDrivers]);

  const initAudio = useCallback(() => {
    if (audioRef.current) {
      void audioRef.current.context.resume();
      audioRef.current.master.gain.setTargetAtTime(0.55, audioRef.current.context.currentTime, 0.04);
      setSoundOn(true);
      return audioRef.current;
    }

    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);

    const engineGain = context.createGain();
    engineGain.gain.value = 0.008;
    engineGain.connect(master);
    const engineOne = context.createOscillator();
    engineOne.type = "sawtooth";
    engineOne.frequency.value = 105;
    const engineTwo = context.createOscillator();
    engineTwo.type = "triangle";
    engineTwo.frequency.value = 210;
    engineOne.connect(engineGain);
    engineTwo.connect(engineGain);
    engineOne.start();
    engineTwo.start();

    const crowdGain = context.createGain();
    crowdGain.gain.value = 0.018;
    const crowdFilter = context.createBiquadFilter();
    crowdFilter.type = "lowpass";
    crowdFilter.frequency.value = 720;
    crowdGain.connect(crowdFilter);
    crowdFilter.connect(master);
    const crowdBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const channel = crowdBuffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) {
      const envelope = 0.45 + Math.sin(i / 8900) * 0.18;
      channel[i] = (seeded(i * 0.013 + 44) * 2 - 1) * envelope;
    }
    const crowd = context.createBufferSource();
    crowd.buffer = crowdBuffer;
    crowd.loop = true;
    crowd.connect(crowdGain);
    crowd.start();

    audioRef.current = { context, master, engineGain, crowdGain, engineOne, engineTwo, crowd };
    setSoundOn(true);
    return audioRef.current;
  }, []);

  const playEffect = useCallback((effect: "countdown" | "go" | "squeal" | "impact" | "finish") => {
    const audio = audioRef.current;
    if (!audio || !soundOn) return;
    const { context, master } = audio;
    const now = context.currentTime;

    const tone = (frequency: number, start: number, duration: number, volume: number, type: OscillatorType = "sine") => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
      return oscillator;
    };

    if (effect === "countdown") tone(390, now, 0.13, 0.16, "square");
    if (effect === "go") {
      tone(720, now, 0.34, 0.18, "square");
      tone(1080, now, 0.34, 0.08, "sine");
    }
    if (effect === "squeal") {
      const oscillator = tone(1050, now, 0.28, 0.055, "sawtooth");
      oscillator.frequency.exponentialRampToValueAtTime(470, now + 0.27);
    }
    if (effect === "impact") {
      const oscillator = tone(105, now, 0.12, 0.1, "triangle");
      oscillator.frequency.exponentialRampToValueAtTime(42, now + 0.11);
    }
    if (effect === "finish") {
      [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => {
        tone(note, now + index * 0.14, 0.34, 0.1, "triangle");
      });
    }
  }, [soundOn]);

  const setRaceStatus = useCallback((next: RaceStatus) => {
    const resolved = transitionRace(statusRef.current, next);
    statusRef.current = resolved;
    setStatus(resolved);
    const audio = audioRef.current;
    if (audio) {
      const level = next === "racing" ? 0.055 : next === "paused" ? 0.006 : 0.014;
      audio.engineGain.gain.setTargetAtTime(level, audio.context.currentTime, 0.08);
    }
  }, []);

  const initializeWorldRaceEngine = useCallback((raceCars: CarState[]) => {
    const generation = ++worldRaceEngineGenerationRef.current;
    worldRaceEngineRef.current?.free();
    worldRaceEngineRef.current = null;
    setWorldEngineState("loading");
    const authoredTemplates = currentTrackRef.current.document ? new Map([...TRACK_CHUNK_TEMPLATE_MAP.entries(), ...(currentTrackRef.current.document.embeddedTemplates ?? []).map((template) => [template.id, template] as const)]) : TRACK_CHUNK_TEMPLATE_MAP;
    const authoredCircuit = currentTrackRef.current.document ? compileCircuitDocument(currentTrackRef.current.document, authoredTemplates) : null;
    if (authoredCircuit) {
      routeControllerRef.current = createRouteController(authoredCircuit);
      for (const car of raceCars) routeControllerRef.current = registerRouteCar(routeControllerRef.current, String(car.id), car.distance);
    } else {
      routeControllerRef.current = null;
    }
    const trackDocument = authoredCircuit
      ? migrateLegacyTrack({ ...documentToLegacyCircuit(currentTrackRef.current.document as NonNullable<Circuit["document"]>), points: authoredCircuit.main.samples.map((sample) => [sample.x / currentTrackRef.current.document!.world.widthMeters, sample.y / currentTrackRef.current.document!.world.heightMeters] as const) })
      : migrateLegacyTrack(currentTrackRef.current);
    const compiledTrack = compileTrack(trackDocument);
    const drivers = raceCars.map((car) => {
        return {
          id: String(car.id),
          skill: car.raceSkill,
          aggression: car.raceAggression,
          consistency: car.raceConsistency,
          cornering: car.raceCornering,
          overtaking: car.raceOvertaking,
          defense: car.raceDefense,
          risk: car.raceRisk,
        };
      });
    const promise = WorldRaceEngine.create(compiledTrack, activeCategory.vehicleSpec, drivers)
      .then((engine) => {
        if (generation !== worldRaceEngineGenerationRef.current) {
          engine.free();
          return null;
        }
        worldRaceEngineRef.current = engine;
        setWorldEngineState("ready");
        return engine;
      })
      .catch(() => {
        if (generation === worldRaceEngineGenerationRef.current) setWorldEngineState("error");
        return null;
      });
    worldRaceEnginePromiseRef.current = promise;
    return promise;
  }, [activeCategory.vehicleSpec]);

  const resetRace = useCallback((newSeed?: number) => {
    const seed = newSeed ?? sessionSeedRef.current;
    sessionSeedRef.current = seed;
    carsRef.current = initialCars(selectedGridSize, seed, totalLaps, activeDrivers, activeCategory.strategyRules);
    raceTimeRef.current = 0;
    simulationAccumulatorRef.current = 0;
    countdownRef.current = 3;
    lastCountdownTickRef.current = 4;
    finishSoundPlayedRef.current = false;
    effectCooldownRef.current = 0;
    raceScoredRef.current = false;
    raceResultRef.current = null;
    if (winnerPresentationTimerRef.current !== null) {
      window.clearTimeout(winnerPresentationTimerRef.current);
      winnerPresentationTimerRef.current = null;
    }
    if (raceStartTimerRef.current !== null) {
      window.clearTimeout(raceStartTimerRef.current);
      raceStartTimerRef.current = null;
    }
    setShowRoundStandings(false);
    setRaceResult(null);
    setShowRaceResults(false);
    setCars([...carsRef.current]);
    setRaceTime(0);
    setCountdown(3);
    setRaceStatus("ready");
    if (modeRef.current) initializeWorldRaceEngine(carsRef.current);
  }, [activeCategory.strategyRules, activeDrivers, initializeWorldRaceEngine, selectedGridSize, totalLaps, setRaceStatus]);

  const rollRaceSeed = useCallback(() => {
    raceSeedSequenceRef.current += 1;
    return 17 + raceSeedSequenceRef.current * 7919;
  }, []);

  const loadTrack = useCallback((trackIndex: number) => {
    const nextTrack = catalog[trackIndex] ?? catalog[0] ?? EMPTY_TRACK;
    currentTrackRef.current = nextTrack;
    geometryRef.current = null;
    setCurrentTrackIndex(trackIndex);
  }, [catalog]);

  const queueRaceCountdown = useCallback((delayMs = 0) => {
    if (raceStartTimerRef.current !== null) window.clearTimeout(raceStartTimerRef.current);
    initAudio();
    const generation = worldRaceEngineGenerationRef.current;
    const begin = async () => {
      raceStartTimerRef.current = null;
      await worldRaceEnginePromiseRef.current;
      if (generation !== worldRaceEngineGenerationRef.current || modeRef.current === null) return;
      countdownRef.current = 3;
      lastCountdownTickRef.current = 4;
      setCountdown(3);
      setRaceStatus("countdown");
    };
    if (delayMs <= 0) void begin();
    else raceStartTimerRef.current = window.setTimeout(() => void begin(), delayMs);
  }, [initAudio, setRaceStatus]);

  const beginSingleRace = useCallback(() => {
    if (!selectedCategoryId || !catalog.length) return;
    const seed = rollRaceSeed();
    const trackIndex =
      selectedTrackChoice === "random"
        ? randomTrackIndex(seed, undefined, catalog)
        : Math.max(0, catalog.findIndex((track) => track.id === selectedTrackChoice));
    modeRef.current = "single";
    setGameMode("single");
    setChampionshipSchedule([]);
    setChampionshipRound(0);
    setChampionshipPoints({});
    setChampionshipResults({});
    setAutoplayPaused(false);
    autoplayDirector.cancel();
    loadTrack(trackIndex);
    resetRace(seed);
    setScreen("race");
  }, [autoplayDirector, catalog, loadTrack, resetRace, rollRaceSeed, selectedCategoryId, selectedTrackChoice]);

  const beginChampionship = useCallback(() => {
    if (!selectedCategoryId || catalog.length < 2) return;
    const seed = rollRaceSeed();
    const raceCount = clamp(Math.round(championshipLength), 2, catalog.length);
    const schedule = shuffledTrackIndices(seed, catalog).slice(0, raceCount);
    modeRef.current = "championship";
    setGameMode("championship");
    setChampionshipLength(raceCount);
    setChampionshipSchedule(schedule);
    setChampionshipRound(0);
    setChampionshipPoints({});
    setChampionshipResults({});
    championshipSessionRepository.reset();
    setSavedChampionshipSession(null);
    setAutoplayPaused(false);
    autoplayDirector.cancel();
    loadTrack(schedule[0]);
    resetRace(seed);
    setScreen("race");
    if (championshipPlaybackMode === "auto") queueRaceCountdown(120);
  }, [autoplayDirector, catalog, championshipLength, championshipPlaybackMode, loadTrack, queueRaceCountdown, resetRace, rollRaceSeed, selectedCategoryId]);

  const discardSavedChampionship = useCallback(() => {
    championshipSessionRepository.reset();
    setSavedChampionshipSession(null);
  }, []);

  const resumeSavedChampionship = useCallback(() => {
    const session = savedChampionshipSession;
    if (!session) return;
    const schedule = session.scheduleTrackIds.map((trackId) => catalog.findIndex((track) => track.id === trackId));
    const category = categories.find((candidate) => candidate.id === session.categoryId);
    if (!category || schedule.some((index) => index < 0)) {
      discardSavedChampionship();
      return;
    }
    modeRef.current = "championship";
    sessionSeedRef.current = session.seed;
    raceSeedSequenceRef.current = Math.max(1, session.completedRounds + 1);
    setSelectedCategoryId(category.id);
    setGameMode("championship");
    setChampionshipLength(schedule.length);
    setChampionshipSchedule(schedule);
    setChampionshipRound(Math.min(session.completedRounds, schedule.length - 1));
    setChampionshipPoints({ ...session.points });
    setChampionshipResults({ ...session.results });
    setChampionshipPlaybackMode(session.playback.mode);
    setSimSpeed(session.playback.simulationSpeed);
    setResultDurationSeconds(session.playback.resultDurationMs / 1_000);
    setStandingsDurationSeconds(session.playback.standingsDurationMs / 1_000);
    setPauseWhenHidden(session.playback.pauseWhenHidden);
    setGridSize(session.gridSize);
    setTotalLaps(session.totalLaps);
    setAutoplayPaused(false);
    autoplayDirector.cancel();
    if (session.completedRounds >= schedule.length) {
      setScreen("championship-results");
      return;
    }
    loadTrack(schedule[session.completedRounds]);
    resetRace(session.seed + session.completedRounds * 7_919);
    setScreen("race");
    if (session.playback.mode === "auto") queueRaceCountdown(120);
  }, [autoplayDirector, catalog, categories, discardSavedChampionship, loadTrack, queueRaceCountdown, resetRace, savedChampionshipSession]);

  const startRace = useCallback(() => {
    resetRace(rollRaceSeed());
    queueRaceCountdown();
  }, [queueRaceCountdown, resetRace, rollRaceSeed]);

  const restartRace = useCallback(() => {
    resetRace(rollRaceSeed());
    if (gameMode === "championship" && championshipPlaybackMode === "auto") queueRaceCountdown(120);
  }, [championshipPlaybackMode, gameMode, queueRaceCountdown, resetRace, rollRaceSeed]);

  const nextRace = useCallback(() => {
    const seed = rollRaceSeed();
    if (gameMode === "championship") {
      const nextRound = championshipRound + 1;
      if (nextRound >= championshipSchedule.length) {
        setScreen("championship-results");
        return;
      }
      setChampionshipRound(nextRound);
      loadTrack(championshipSchedule[nextRound]);
    } else {
      loadTrack(randomTrackIndex(seed, currentTrackIndex, catalog));
    }
    resetRace(seed);
    queueRaceCountdown(120);
  }, [
    championshipRound,
    championshipSchedule,
    catalog,
    currentTrackIndex,
    gameMode,
    loadTrack,
    queueRaceCountdown,
    resetRace,
    rollRaceSeed,
  ]);

  const returnToMenu = useCallback(() => {
    autoplayDirector.cancel();
    setAutoplayPaused(false);
    if (raceStartTimerRef.current !== null) window.clearTimeout(raceStartTimerRef.current);
    worldRaceEngineGenerationRef.current += 1;
    worldRaceEngineRef.current?.free();
    worldRaceEngineRef.current = null;
    worldRaceEnginePromiseRef.current = null;
    routeControllerRef.current = null;
    setWorldEngineState("idle");
    setRaceStatus("ready");
    modeRef.current = null;
    setGameMode(null);
    setScreen("mode");
  }, [autoplayDirector, setRaceStatus]);

  const continueFromRaceResults = useCallback(() => {
    if (!raceResult) return;
    if (raceResult.mode !== "championship") {
      nextRace();
      return;
    }
    setRaceResult(null);
    if (championshipRound + 1 >= championshipSchedule.length) {
      setScreen("championship-results");
      return;
    }
    setShowRaceResults(false);
    setShowRoundStandings(true);
  }, [championshipRound, championshipSchedule.length, nextRace, raceResult]);

  const toggleAutoplayPause = useCallback(() => {
    setAutoplayPaused((paused) => !paused);
  }, []);

  useEffect(() => {
    if (!showRaceResults || raceResult?.mode !== "championship") return;
    const finalRound = raceResult.round >= championshipSchedule.length;
    if (finalRound && championshipPlaybackMode !== "auto") return;
    autoplayDirector.schedule(
      resultDurationSeconds * 1_000,
      continueFromRaceResults,
    );
    return () => autoplayDirector.clear();
  }, [autoplayDirector, championshipPlaybackMode, championshipSchedule.length, continueFromRaceResults, raceResult, resultDurationSeconds, showRaceResults]);

  useEffect(() => {
    if (!showRoundStandings || gameMode !== "championship" || championshipPlaybackMode !== "auto") return;
    autoplayDirector.schedule(
      standingsDurationSeconds * 1_000,
      nextRace,
    );
    return () => autoplayDirector.clear();
  }, [autoplayDirector, championshipPlaybackMode, gameMode, nextRace, showRoundStandings, standingsDurationSeconds]);

  useEffect(() => {
    if (championshipPlaybackMode === "auto" && autoplayPaused) autoplayDirector.pause();
    else autoplayDirector.resume();
  }, [autoplayDirector, autoplayPaused, championshipPlaybackMode]);

  useEffect(() => {
    if (!pauseWhenHidden || gameMode !== "championship" || championshipPlaybackMode !== "auto") return;
    let pausedForVisibility = false;
    const onVisibilityChange = () => {
      if (document.hidden && !autoplayPaused) {
        pausedForVisibility = true;
        setAutoplayPaused(true);
      } else if (!document.hidden && pausedForVisibility) {
        pausedForVisibility = false;
        setAutoplayPaused(false);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [autoplayPaused, championshipPlaybackMode, gameMode, pauseWhenHidden]);

  useEffect(() => {
    if (gameMode !== "championship" || !raceResult || raceResult.mode !== "championship" || !championshipSchedule.length) return;
    const completedRounds = raceResult.round;
    const scoringComplete = Object.values(championshipResults).some((results) => results.length >= completedRounds);
    if (!scoringComplete) return;
    const session = createChampionshipSession({
      seed: sessionSeedRef.current,
      scheduleTrackIds: championshipSchedule.map((index) => catalog[index]?.id).filter((id): id is string => Boolean(id)),
      completedRounds,
      categoryId: activeCategory.id,
      categoryRevision: activeCategory.updatedAt,
      totalLaps,
      gridSize: selectedGridSize,
      points: Object.fromEntries(Object.entries(championshipPoints).map(([id, points]) => [id, points])),
      results: Object.fromEntries(Object.entries(championshipResults).map(([id, results]) => [id, results])),
      playback: {
        mode: championshipPlaybackMode,
        simulationSpeed: simSpeed as 1 | 2 | 4,
        resultDurationMs: resultDurationSeconds * 1_000,
        standingsDurationMs: standingsDurationSeconds * 1_000,
        audioEnabled: soundOn,
        pauseWhenHidden,
      },
    });
    if (session.scheduleTrackIds.length === championshipSchedule.length && championshipSessionRepository.save(session)) setSavedChampionshipSession(session);
  }, [activeCategory.id, activeCategory.updatedAt, catalog, championshipPlaybackMode, championshipPoints, championshipResults, championshipSchedule, gameMode, pauseWhenHidden, raceResult, resultDurationSeconds, selectedGridSize, simSpeed, soundOn, standingsDurationSeconds, totalLaps]);

  useEffect(() => () => autoplayDirector.cancel(), [autoplayDirector]);
  useEffect(() => () => {
    worldRaceEngineGenerationRef.current += 1;
    worldRaceEngineRef.current?.free();
    worldRaceEngineRef.current = null;
  }, []);

  useEffect(() => {
    lapsRef.current = totalLaps;
  }, [totalLaps]);

  useEffect(() => {
    speedRef.current = simSpeed;
  }, [simSpeed]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (status === "ready") resetRace();
    // Reset is intentionally tied to setup controls only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridSize, totalLaps]);

  const updateRace = useCallback((deltaReal: number) => {
    const currentStatus = statusRef.current;
    if (currentStatus === "countdown") {
      countdownRef.current -= deltaReal;
      const tick = Math.max(0, Math.ceil(countdownRef.current));
      if (tick !== lastCountdownTickRef.current) {
        lastCountdownTickRef.current = tick;
        playEffect(tick === 0 ? "go" : "countdown");
      }
      setCountdown(Math.max(0, countdownRef.current));
      if (countdownRef.current <= 0) setRaceStatus("racing");
      return;
    }
    if (currentStatus !== "racing") return;

    const delta = Math.min(deltaReal, 0.05);
    raceTimeRef.current += delta;
    const currentRaceTime = raceTimeRef.current;
    if (routeControllerRef.current) routeControllerRef.current = advanceRouteController(routeControllerRef.current, delta, currentRaceTime);
    for (const car of carsRef.current) {
      // The high-frequency simulation state intentionally stays in a mutable ref.
      // eslint-disable-next-line react-hooks/immutability
      car.previousDistance = car.distance;
      if (car.mechanical === "retired") {
        car.speed = 0;
        continue;
      }

      if (car.mechanical === "failing") {
        const failureAge = currentRaceTime - car.failureStartedAt;
        car.strategy.damage = Math.min(1, car.strategy.damage + delta * .03);
        if (routeControllerRef.current && failureAge < delta * 2) routeControllerRef.current = enterEscapeRoute(routeControllerRef.current, car.id);
        car.targetLane = car.failureSide * 1.12;
        car.lane += (car.targetLane - car.lane) * Math.min(1, delta * 1.35);
        car.speed = Math.max(0, car.speed - delta * (0.0062 + failureAge * 0.0014));
        car.distance += car.speed * delta;
        if (car.speed <= 0.00012) {
          car.speed = 0;
          if (routeControllerRef.current?.cars[car.id]?.escapeState === "entering") routeControllerRef.current = reverseAtEscapeTerminal(routeControllerRef.current, car.id);
          if (routeControllerRef.current?.cars[car.id]?.escapeState === "reversing" && failureAge <= 4) {
            car.targetLane = 0;
          } else {
            if (routeControllerRef.current?.cars[car.id]?.escapeState === "reversing") routeControllerRef.current = rejoinMainRoute(routeControllerRef.current, car.id, car.distance);
            car.mechanical = "retired";
          }
        }
        continue;
      }

      if (car.finishPosition !== null) {
        car.targetLane = 0;
        car.lane += (car.targetLane - car.lane) * Math.min(1, delta * 0.8);
        car.speed = Math.max(0, car.speed - delta * 0.018);
        continue;
      }

      const strategyRules = activeCategory.strategyRules;
      const compound = strategyRules.compounds.find((item) => item.id === car.strategy.compoundId) ?? strategyRules.compounds[0];
      car.strategy.fuelLiters = Math.max(0, car.strategy.fuelLiters - strategyRules.fuelBurnLitersPerLap * delta * Math.max(.35, car.speed * 2));
      car.strategy.tireWear = Math.min(1, car.strategy.tireWear + (compound?.wearPerLap ?? .08) * delta * Math.max(.35, car.speed * 2));
      if (car.strategy.pitService === "on-track" && (shouldRequestPitStop(car.strategy, strategyRules, Math.floor(Math.max(0, car.distance)), totalLaps) || car.strategy.tireWear > .72 || car.strategy.fuelLiters < strategyRules.fuelBurnLitersPerLap * 1.15 || car.strategy.damage > .45)) car.strategy.pitService = "requested";
      let routeState = routeControllerRef.current;
      if (routeState && car.strategy.pitService === "requested") {
        routeState = requestPitEntry(routeState, car.id);
        routeState = assignPitBox(routeState, car.id);
        routeControllerRef.current = routeState;
      }
      const routeCar = routeState?.cars[car.id];
      if (routeCar && routeState) {
        if (routeCar.pitState === "queued") routeState = beginPitService(routeState, car.id, currentRaceTime);
        routeControllerRef.current = routeState;
        const activeRouteCar = routeState.cars[car.id];
        if (activeRouteCar?.pitState === "servicing" && activeRouteCar.serviceStartedAt !== null && currentRaceTime - activeRouteCar.serviceStartedAt >= strategyRules.tireChangeSeconds + car.strategy.damage * strategyRules.repairSecondsPerDamage) {
          routeState = completePitService(routeState, car.id);
          routeControllerRef.current = routeState;
          car.strategy.tireWear = 0;
          if (strategyRules.refuelingAllowed) car.strategy.fuelLiters = strategyRules.fuelCapacityLiters;
          car.strategy.damage = 0;
          car.strategy.pitStops += 1;
        }
        const finalRouteCar = routeState.cars[car.id];
        if (finalRouteCar) {
          car.strategy.pitService = finalRouteCar.pitState;
          car.strategy.assignedBoxId = finalRouteCar.assignedBoxId;
          car.strategy.serviceStartedAt = finalRouteCar.serviceStartedAt;
        }
      }

      if (car.failureAt !== null && car.distance >= car.failureAt) {
        car.mechanical = "failing";
        car.failureStartedAt = currentRaceTime;
        car.targetLane = car.failureSide * 1.12;
        continue;
      }

      if (car.lineErrorAt !== null && car.distance >= car.lineErrorAt) {
        const errorSeed =
          sessionSeedRef.current * 1901 +
          car.seedKey * 829 +
          car.lineErrorLapChecked * 433;
        car.lineErrorUntil =
          car.distance + 0.032 + seeded(errorSeed + 17) * 0.018;
        car.lineErrorSide = seeded(errorSeed + 31) > 0.5 ? 1 : -1;
        car.lineErrorAt = null;
        car.targetLane = car.lineErrorSide * (0.9 + seeded(errorSeed + 47) * 0.1);
        if (currentRaceTime > effectCooldownRef.current) {
          playEffect("squeal");
          effectCooldownRef.current = currentRaceTime + 1.4;
        }
      }
      const hasLineError = car.distance < car.lineErrorUntil;

      if (currentRaceTime >= car.nextPerformanceShift) {
        car.performanceShiftIndex += 1;
        car.performanceTarget =
          seeded(
            sessionSeedRef.current * 1201 +
            car.seedKey * 619 +
            car.performanceShiftIndex * 277,
          ) * 0.1 - 0.05;
        car.nextPerformanceShift +=
          4 +
          seeded(
            sessionSeedRef.current * 1597 +
            car.seedKey * 743 +
            car.performanceShiftIndex * 331,
          ) * 7;
      }
      car.performanceModifier +=
        (car.performanceTarget - car.performanceModifier) *
        Math.min(1, delta * (0.22 + car.raceConsistency * 0.0015));

      if (!hasLineError && car.distance > car.nextMistake) {
        const mistakeChance = (100 - car.raceConsistency + car.raceRisk * 0.22) / 135;
        if (seeded(Math.floor(car.nextMistake * 1000) + car.seedKey * 7) < mistakeChance) {
          car.mistakeUntil = car.distance + 0.018 + seeded(car.seedKey + car.nextMistake * 19) * 0.028;
          car.targetLane = (seeded(car.seedKey * 17 + car.distance) > 0.5 ? 1 : -1) * 0.78;
          if (currentRaceTime > effectCooldownRef.current) {
            playEffect("squeal");
            effectCooldownRef.current = currentRaceTime + 1.8;
          }
        }
        car.nextMistake += 0.72 + seeded(car.seedKey * 31 + car.nextMistake * 9) * 1.7;
      }
    }

    const worldEngine = worldRaceEngineRef.current;
    if (worldEngine) {
      for (const car of carsRef.current) {
        const id = String(car.id);
        if (car.mechanical !== "running" || car.finishPosition !== null) {
          worldEngine.removeVehicle(id);
          car.worldX = null;
          car.worldY = null;
          car.worldHeading = null;
          continue;
        }
        worldEngine.setPerformanceModifier(id, car.performanceModifier + car.lapPerformanceModifier);
        const hasPhysicalError = car.distance < car.lineErrorUntil || car.distance < car.mistakeUntil;
        worldEngine.setLineError(id, hasPhysicalError ? car.lineErrorSide * 6.5 : 0);
      }
      worldEngine.step(2);
      const snapshots = new Map<string, WorldRaceCarSnapshot>(worldEngine.snapshot().map((snapshot) => [snapshot.id, snapshot]));
      for (const car of carsRef.current) {
        const snapshot = snapshots.get(car.id);
        if (!snapshot || car.mechanical !== "running" || car.finishPosition !== null) continue;
        const sampleIndex = Math.floor(snapshot.lapProgress * worldEngine.track.samples.length) % worldEngine.track.samples.length;
        const physicalSample = worldEngine.track.samples[sampleIndex];
        const halfWidth = Math.max(1, (physicalSample.widthLeft + physicalSample.widthRight) / 2);
        car.distance = snapshot.completedDistance / worldEngine.track.lengthMeters;
        car.lane = clamp(snapshot.lateralOffset / halfWidth, -1.4, 1.4);
        car.targetLane = car.lane;
        car.speed = Math.max(0, snapshot.longitudinalVelocity / worldEngine.track.lengthMeters);
        car.targetSpeed = Math.max(0, snapshot.targetSpeed / worldEngine.track.lengthMeters);
        car.throttle = snapshot.throttle;
        car.brake = snapshot.brake;
        car.steering = clamp(snapshot.steeringAngle / Math.max(0.01, activeCategory.vehicleSpec.maxSteeringDegrees * Math.PI / 180), -1, 1);
        car.lateralVelocity = snapshot.lateralVelocity;
        car.drivingPhase = snapshot.drivingPhase === "following" ? "following"
          : snapshot.drivingPhase === "attacking" || snapshot.drivingPhase === "side-by-side" ? "overtaking"
            : snapshot.drivingPhase === "recovering" ? "recovering"
              : snapshot.brake > 0.12 ? "braking"
                : Math.abs(physicalSample.curvature) > 0.012 ? "apex" : "straight";
        car.overtakeState = snapshot.drivingPhase === "side-by-side" ? "overlap" : snapshot.drivingPhase === "attacking" ? "commit" : "idle";
        car.overtakeTargetId = snapshot.overtakeTargetId;
        car.worldX = snapshot.position.x;
        car.worldY = snapshot.position.y;
        car.worldHeading = snapshot.heading;
      }
    } else {
      const drivingGeometry = geometryRef.current?.driving;
      if (drivingGeometry) stepDriving(carsRef.current, drivingGeometry, delta, currentRaceTime);
    }
    for (const car of carsRef.current) {
      if (car.mechanical !== "running" || car.finishPosition !== null) continue;
      if (car.previousDistance < 0 && car.distance >= 0) {
        car.lastLapStartedAt = currentRaceTime;
        car.lineErrorLapChecked = 1;
        car.performanceLap = 1;
        car.lapPerformanceModifier = seeded(sessionSeedRef.current * 2801 + car.seedKey * 613 + car.performanceLap * 419) * 0.12 - 0.06;
        const checkSeed = sessionSeedRef.current * 2203 + car.seedKey * 977 + 1 * 541;
        if (seeded(checkSeed) < car.lineErrorChance) car.lineErrorAt = 0.18 + seeded(checkSeed + 13) * 0.62;
      } else {
        const oldLap = Math.floor(Math.max(0, car.previousDistance));
        const newLap = Math.floor(Math.max(0, car.distance));
        if (newLap > oldLap) {
          const lapTime = currentRaceTime - car.lastLapStartedAt;
          car.lastLap = lapTime;
          car.bestLap = car.bestLap === null ? lapTime : Math.min(car.bestLap, lapTime);
          car.lastLapStartedAt = currentRaceTime;
          const lapNumber = newLap + 1;
          if (lapNumber <= lapsRef.current) {
            car.lineErrorLapChecked = lapNumber;
            car.performanceLap = lapNumber;
            car.lapPerformanceModifier = seeded(sessionSeedRef.current * 2801 + car.seedKey * 613 + car.performanceLap * 419) * 0.12 - 0.06;
            const checkSeed = sessionSeedRef.current * 2203 + car.seedKey * 977 + lapNumber * 541;
            car.lineErrorAt = seeded(checkSeed) < car.lineErrorChance ? newLap + 0.18 + seeded(checkSeed + 13) * 0.62 : null;
          }
        }
      }
      if (car.distance >= lapsRef.current) {
        car.finishPosition = carsRef.current.filter((other) => other.finishPosition !== null).length + 1;
        car.finishedAt = currentRaceTime;
        const winner = carsRef.current.find((other) => other.finishPosition === 1);
        car.finishGapSeconds = calculateFinishGap(car.finishedAt, winner?.finishedAt ?? null);
        car.targetLane = 0;
      }
    }

    const audio = audioRef.current;
    if (audio) {
      const runningCars = carsRef.current.filter((car) => car.mechanical !== "retired");
      const averageSpeed = runningCars.reduce((sum, car) => sum + car.speed, 0) / Math.max(1, runningCars.length);
      const engineFrequency = 92 + averageSpeed * 2500 + Math.sin(currentRaceTime * 19) * 5;
      audio.engineOne.frequency.setTargetAtTime(engineFrequency, audio.context.currentTime, 0.04);
      audio.engineTwo.frequency.setTargetAtTime(engineFrequency * 2.02, audio.context.currentTime, 0.04);
    }
    const classifiedWinner = carsRef.current.find((car) => car.finishPosition === 1);
    if (classifiedWinner?.finishedAt !== null && classifiedWinner?.finishedAt !== undefined && currentRaceTime - classifiedWinner.finishedAt > 90) {
      for (const car of carsRef.current) {
        if (car.finishPosition !== null || car.mechanical === "retired") continue;
        car.mechanical = "retired";
        worldEngine?.removeVehicle(car.id);
        car.worldX = null;
        car.worldY = null;
        car.worldHeading = null;
      }
    }
    const raceComplete = carsRef.current.every(
      (car) => car.finishPosition !== null || car.mechanical === "retired",
    );
    if (raceComplete) {
      if (!raceResultRef.current) {
        const snapshot = buildRaceResultSnapshot(carsRef.current, activeDrivers, {
          trackName: currentTrackRef.current.name,
          categoryName: activeCategory.name,
          mode: modeRef.current ?? "single",
          round: championshipRound + 1,
          totalLaps: lapsRef.current,
          completedAt: currentRaceTime,
        });
        raceResultRef.current = snapshot;
        setRaceResult(snapshot);
        winnerPresentationTimerRef.current = window.setTimeout(() => {
          winnerPresentationTimerRef.current = null;
          setShowRaceResults(true);
        }, WINNER_PRESENTATION_DURATION_MS);
      }
      if (!raceScoredRef.current && modeRef.current === "championship") {
        raceScoredRef.current = true;
        const results = [...carsRef.current].sort(compareRaceOrder);
        setChampionshipPoints((current) => {
          const updated = { ...current };
          results.slice(0, CHAMPIONSHIP_POINTS.length).forEach((car, index) => {
            updated[car.id] = (updated[car.id] ?? 0) + CHAMPIONSHIP_POINTS[index];
          });
          return updated;
        });
        setChampionshipResults((current) => {
          const updated = { ...current };
          results.forEach((car, index) => {
            updated[car.id] = [...(updated[car.id] ?? []), index + 1];
          });
          return updated;
        });
      }
      if (!finishSoundPlayedRef.current) {
        finishSoundPlayedRef.current = true;
        playEffect("finish");
      }
      setRaceStatus("finished");
    }
  }, [activeCategory.name, activeCategory.strategyRules, activeCategory.vehicleSpec.maxSteeringDegrees, activeDrivers, championshipRound, playEffect, setRaceStatus, totalLaps]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const geometry = geometryRef.current;
    if (!canvas || !geometry) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawTrack(ctx, geometry, currentTrackRef.current);

    const sorted = [...carsRef.current].sort(compareRaceOrder);
    const leaderId = sorted[0]?.id;
    for (let index = sorted.length - 1; index >= 0; index--) {
      const car = sorted[index];
      if (car.finishPosition !== null) continue;
      const progress = ((car.distance % 1) + 1) % 1;
      const sampleIndex = Math.floor(progress * geometry.samples.length) % geometry.samples.length;
      const sample = geometry.samples[sampleIndex];
      const lanePx = car.lane * geometry.trackWidth * 0.62;
      const physicalPosition = car.worldX === null || car.worldY === null ? null : worldToCanvas({ x: car.worldX, y: car.worldY }, geometry);
      const x = physicalPosition?.x ?? sample.x - Math.sin(sample.angle) * lanePx;
      const y = physicalPosition?.y ?? sample.y + Math.cos(sample.angle) * lanePx;
      const heading = car.worldHeading ?? sample.angle + car.steering * 0.12;
      const scale = clamp(geometry.width / 1000, 0.68, 1.12) * CAR_SCALE_FACTOR;
      drawCar(
        ctx,
        driverById.get(car.id)!,
        x,
        y,
        heading,
        scale,
        car.id === leaderId && car.mechanical === "running",
        car.mechanical,
        raceTimeRef.current,
        topSpriteRef.current.get(car.id) ?? null,
      );
    }

    if (showDrivingDebug && geometry.driving.samples.length) {
      ctx.save();
      ctx.strokeStyle = "rgba(102, 232, 255, .75)";
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      const worldTrajectory = worldRaceEngineRef.current?.trajectory.samples;
      const debugLine = worldTrajectory?.map((sample) => worldToCanvas(sample.position, geometry))
        ?? geometry.driving.samples.map((sample) => {
          const lanePx = sample.racingLineOffset * geometry.trackWidth * 0.62;
          return { x: sample.x - Math.sin(sample.angle) * lanePx, y: sample.y + Math.cos(sample.angle) * lanePx };
        });
      debugLine.forEach(({ x, y }, index) => {
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.stroke();
      const selected = sorted.find((car) => car.finishPosition === null && car.mechanical === "running");
      if (selected) {
        const selectedIndex = Math.floor((((selected.distance % 1) + 1) % 1) * geometry.driving.samples.length) % geometry.driving.samples.length;
        const selectedSample = geometry.driving.samples[selectedIndex];
        let brakingIn = 0;
        for (let offset = 8; offset < 100; offset += 4) {
          if (geometry.driving.samples[(selectedIndex + offset) % geometry.driving.samples.length].targetSpeedFactor < selectedSample.targetSpeedFactor - 0.08) { brakingIn = offset / geometry.driving.samples.length; break; }
        }
        const detail = [
          `AI DEBUG · ${driverById.get(selected.id)?.code ?? selected.id}`,
          `STATE ${selected.drivingPhase.toUpperCase()} · PASS ${selected.overtakeState.toUpperCase()}`,
          `SPD ${selected.speed.toFixed(3)} / ${selected.targetSpeed.toFixed(3)} · T ${Math.round(selected.throttle * 100)}% B ${Math.round(selected.brake * 100)}%`,
          `CURVE ${selectedSample.severity.toFixed(2)} · BRAKE IN ${(brakingIn * 100).toFixed(1)}% · TARGET ${selected.overtakeTargetId ?? "—"}`,
          `STEER ${selected.steering.toFixed(2)} · SLIP ${Math.round(selected.slipstream * 100)}%`,
        ];
        ctx.fillStyle = "rgba(4, 12, 15, .86)";
        ctx.fillRect(14, 14, Math.min(520, geometry.width - 28), 94);
        ctx.fillStyle = "#a8fbff";
        ctx.font = "700 11px Arial";
        detail.forEach((line, index) => ctx.fillText(line, 24, 33 + index * 15));
      }
      ctx.restore();
    }

    if (statusRef.current === "finished" && sorted[0]) {
      ctx.save();
      ctx.fillStyle = "rgba(4,8,7,.76)";
      ctx.fillRect(0, 0, geometry.width, geometry.height);
      ctx.textAlign = "center";
      ctx.fillStyle = "#9fa9a4";
      ctx.font = `700 ${clamp(geometry.width * 0.013, 11, 16)}px Arial`;
      ctx.fillText("RACE WINNER", geometry.width / 2, geometry.height * 0.44);
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${clamp(geometry.width * 0.035, 27, 48)}px Arial`;
      ctx.fillText((driverById.get(sorted[0].id)?.name ?? sorted[0].id).toUpperCase(), geometry.width / 2, geometry.height * 0.51);
      ctx.fillStyle = driverById.get(sorted[0].id)?.color ?? "#ffffff";
      ctx.fillRect(geometry.width * 0.43, geometry.height * 0.545, geometry.width * 0.14, 3);
      ctx.restore();
    }
  }, [driverById, showDrivingDebug]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(rect.width * ratio);
      canvas.height = Math.floor(rect.height * ratio);
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
      geometryRef.current = buildGeometry(rect.width, rect.height, currentTrack.points, currentTrack.startIndex ?? 0);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    return () => observer.disconnect();
  }, [currentTrack, draw, screen]);

  useEffect(() => {
    let lastUiUpdate = 0;
    const loop = (time: number) => {
      const delta = lastFrameRef.current ? (time - lastFrameRef.current) / 1000 : 0;
      lastFrameRef.current = time;
      if (statusRef.current === "racing") {
        simulationAccumulatorRef.current += Math.min(delta, 0.1) * speedRef.current;
        let steps = 0;
        while (simulationAccumulatorRef.current >= 1 / 60 && steps < 8) {
          updateRace(1 / 60);
          simulationAccumulatorRef.current -= 1 / 60;
          steps += 1;
        }
        if (steps === 8) simulationAccumulatorRef.current = Math.min(simulationAccumulatorRef.current, 1 / 30);
      } else {
        updateRace(delta);
      }
      draw();
      if (time - lastUiUpdate > 120) {
        setCars(carsRef.current.map((car) => ({ ...car })));
        setRaceTime(raceTimeRef.current);
        lastUiUpdate = time;
      }
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [draw, updateRace]);

  const standings = useMemo(
    () => [...cars].sort(compareRaceOrder),
    [cars],
  );
  const leader = standings[0];
  const bestLapEntry = standings
    .filter((car) => car.bestLap !== null)
    .sort((a, b) => (a.bestLap ?? Infinity) - (b.bestLap ?? Infinity))[0];
  const currentLap = leader ? clamp(Math.floor(Math.max(0, leader.distance)) + 1, 1, totalLaps) : 1;
  const championshipStandings = activeDrivers
    .slice(0, selectedGridSize)
    .map((driver) => {
      const results = championshipResults[driver.id] ?? [];
      return {
        driver,
        points: championshipPoints[driver.id] ?? 0,
        wins: results.filter((position) => position === 1).length,
        bestResult: results.length > 0 ? Math.min(...results) : null,
        results,
      };
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.wins !== a.wins) return b.wins - a.wins;
      for (let position = 2; position <= selectedGridSize; position++) {
        const aCount = a.results.filter((result) => result === position).length;
        const bCount = b.results.filter((result) => result === position).length;
        if (bCount !== aCount) return bCount - aCount;
      }
      return String(a.driver.id).localeCompare(String(b.driver.id));
    });
  const selectedTrackPreview =
    selectedTrackChoice === "random"
      ? catalog[randomTrackIndex(2026, undefined, catalog)] ?? EMPTY_TRACK
      : catalog.find((track) => track.id === selectedTrackChoice) ?? catalog[0] ?? EMPTY_TRACK;
  const isFinalChampionshipRound =
    gameMode === "championship" &&
    championshipSchedule.length > 0 &&
    championshipRound === championshipSchedule.length - 1;

  const togglePause = () => {
    if (statusRef.current === "racing") setRaceStatus("paused");
    else if (statusRef.current === "paused") setRaceStatus("racing");
  };

  const toggleSound = () => {
    if (!audioRef.current || !soundOn) {
      initAudio();
      return;
    }
    audioRef.current.master.gain.setTargetAtTime(0.0001, audioRef.current.context.currentTime, 0.04);
    setSoundOn(false);
  };

  const statusLabel = status === "ready" && worldEngineState === "loading" ? UI_COPY.race.loadingPhysics
    : status === "ready" && worldEngineState === "error" ? UI_COPY.race.physicsFallback
      : UI_COPY.race.status[status];

  if (screen === "mode") {
    return <MainMenu savedSession={savedChampionshipSession} circuitCount={catalog.length} driverCount={activeDrivers.length} onSingleRace={() => setScreen("single-setup")} onSettings={() => setScreen("settings")} onChampionship={() => setScreen("championship-setup")} onResumeChampionship={resumeSavedChampionship} onDiscardChampionship={discardSavedChampionship} />;
  }

  if (screen === "settings") {
    return <SettingsHub onOpen={(section) => setScreen(section === "race" || section === "audio" || section === "appearance" ? `${section}-settings` : section)} onBack={() => setScreen("mode")} />;
  }

  if (screen === "race-settings" || screen === "audio-settings" || screen === "appearance-settings") {
    return <SettingsDetail section={screen.replace("-settings", "") as SettingsSection} totalLaps={totalLaps} gridSize={selectedGridSize} theme={theme} soundOn={soundOn} onLapsChange={setTotalLaps} onGridChange={setGridSize} onThemeChange={setTheme} onToggleSound={toggleSound} onBack={() => setScreen("settings")} />;
  }

  if (screen === "track-editor") {
    if (!storageReady) return <LoadingScreen title={UI_COPY.editor.loadingLibrary} detail={UI_COPY.editor.restoringCircuits} />;
    return <TrackEditor tracks={catalog} onSave={(saved) => setCustomTracks((current) => [...current.filter((track) => track.id !== saved.id), saved])} onBack={() => setScreen("settings")} />;
  }

  if (screen === "competition-editor") {
    if (!storageReady) return <LoadingScreen title={UI_COPY.editor.loadingLibrary} detail={UI_COPY.editor.restoringCategories} />;
    return <CompetitionEditor onBack={() => setScreen("settings")} onSave={(saved) => setCustomCategories((current) => [...current.filter((category) => category.id !== saved.id), saved])} />;
  }

  if (screen === "single-setup") {
    return <SingleRaceSetup catalog={catalog} categories={categories} selectedCategoryId={selectedCategoryId} selectedTrackChoice={selectedTrackChoice} selectedTrackPreview={selectedTrackPreview} activeCategory={activeCategory} totalLaps={totalLaps} gridSize={selectedGridSize} maxGridSize={maxGridSize} onCategoryChange={setSelectedCategoryId} onTrackChange={setSelectedTrackChoice} onLapsChange={setTotalLaps} onGridChange={setGridSize} onBack={() => setScreen("mode")} onConfirm={beginSingleRace} />;
  }

  if (screen === "championship-setup") {
    return <ChampionshipSetup catalog={catalog} categories={categories} selectedCategoryId={selectedCategoryId} totalLaps={totalLaps} gridSize={selectedGridSize} maxGridSize={maxGridSize} championshipLength={championshipLength} playbackMode={championshipPlaybackMode} resultDurationSeconds={resultDurationSeconds} standingsDurationSeconds={standingsDurationSeconds} pauseWhenHidden={pauseWhenHidden} onCategoryChange={setSelectedCategoryId} onLapsChange={setTotalLaps} onGridChange={setGridSize} onLengthChange={(value) => setChampionshipLength(clamp(value, 2, 50))} onPlaybackModeChange={(value) => { setChampionshipPlaybackMode(value); setAutoplayPaused(false); }} onResultDurationChange={(value) => setResultDurationSeconds(clamp(value, 2, 30))} onStandingsDurationChange={(value) => setStandingsDurationSeconds(clamp(value, 2, 30))} onPauseWhenHiddenChange={setPauseWhenHidden} onBack={() => setScreen("mode")} onConfirm={beginChampionship} />;
  }

  if (screen === "championship-results") {
    const champion = championshipStandings[0];
    return <ChampionshipResults standings={championshipStandings} rounds={championshipSchedule.length} championPreview={champion ? <TimingCarSprite driver={champion.driver} spriteSrc={activeCategory.sprites.lateral} /> : null} onMenu={returnToMenu} onNewChampionship={() => setScreen("championship-setup")} />;
  }

  return (
    <main className="race-shell" data-race-layout="fullscreen" data-physics-engine={worldEngineState === "ready" ? "rapier" : worldEngineState}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">Race status {statusLabel}. {leader ? `Leader ${driverById.get(leader.id)?.name ?? leader.id}. Lap ${currentLap} of ${totalLaps}.` : "Waiting for the grid."}</div>
      <header className="top-bar">
        <Brand className="brand" />
        <div className="event-title">
          <span>{activeCategory.name} · {gameMode === "championship" ? "CHAMPIONSHIP" : "SINGLE RACE"}</span>
          <strong>{currentTrack.name.toUpperCase()}</strong>
        </div>
        <RaceActionsMenu containerRef={raceActionsRef} triggerRef={raceActionsTriggerRef} open={raceActionsOpen} status={status} championship={gameMode === "championship"} autoBroadcast={championshipPlaybackMode === "auto"} autoplayPaused={autoplayPaused} finalRound={isFinalChampionshipRound} laps={totalLaps} grid={selectedGridSize} maxGrid={maxGridSize} speed={simSpeed} soundOn={soundOn} onOpenChange={setRaceActionsOpen} onStart={startRace} onPause={togglePause} onRestart={restartRace} onNext={nextRace} onToggleAutoplay={toggleAutoplayPause} onLaps={setTotalLaps} onGrid={setGridSize} onSpeed={setSimSpeed} onSound={toggleSound} onMenu={returnToMenu} />
      </header>

      <section className="race-layout">
        <RaceHud canvasRef={canvasRef} trackName={currentTrack.name} physicalCarCount={cars.filter((car) => car.worldX !== null && car.worldY !== null).length} currentLap={currentLap} totalLaps={totalLaps} raceTime={formatTime(raceTime)} leaderCode={leader ? driverById.get(leader.id)?.code ?? "—" : "—"} leaderColor={leader ? driverById.get(leader.id)?.color ?? "#fff" : "#fff"} bestLap={bestLapEntry ? formatTime(bestLapEntry.bestLap) : "—"} countdown={status === "countdown" ? countdown : null} overlay={<BroadcastPanel currentLap={currentLap} totalLaps={totalLaps} fastestDriver={bestLapEntry ? driverById.get(bestLapEntry.id)?.code : undefined} fastestLap={bestLapEntry ? formatTime(bestLapEntry.bestLap) : undefined} entries={standings.map((car, index) => ({ id: car.id, code: driverById.get(car.id)?.code ?? car.id, status: car.mechanical, gapSeconds: index === 0 ? 0 : Math.max(0, (leader ? leader.distance - car.distance : 0) * 22.8) }))} />} />
        <LiveTiming currentLap={currentLap} drivers={driverById} championship={gameMode === "championship"} renderCar={(driver) => <TimingCarSprite driver={driver as Driver} spriteSrc={activeCategory.sprites.lateral} />} entries={standings.map((car, index) => {
          const gapLaps = leader ? leader.distance - car.distance : 0;
          const resultEntry = raceResult?.entries.find((entry) => entry.id === car.id);
          const finalGap = resultEntry?.gapSeconds ?? calculateFinishGap(car.finishedAt, leader?.finishedAt ?? null);
          return { id: car.id, mechanical: car.mechanical, points: championshipPoints[car.id] ?? 0, gap: index === 0 ? "LEADER" : finalGap !== null ? `+${finalGap.toFixed(3)}` : `+${(gapLaps * 22.8).toFixed(2)}`, compound: activeCategory.strategyRules.compounds.find((compound) => compound.id === car.strategy.compoundId)?.label, tireWear: car.strategy.tireWear, fuelLiters: car.strategy.fuelLiters, pitService: car.strategy.pitService };
        })} />
      </section>


      {showRaceResults && raceResult && status === "finished" && <RaceResultsOverlay result={raceResult} championshipRounds={championshipSchedule.length} autoplay={championshipPlaybackMode === "auto"} autoplayPaused={autoplayPaused} onToggleAutoplay={toggleAutoplayPause} onContinue={continueFromRaceResults} onMenu={returnToMenu} />}

      {showRoundStandings && gameMode === "championship" && <ChampionshipStandingsOverlay standings={championshipStandings} round={championshipRound + 1} totalRounds={championshipSchedule.length} trackName={currentTrack.name} categoryName={activeCategory.name} autoplay={championshipPlaybackMode === "auto"} autoplayPaused={autoplayPaused} onToggleAutoplay={toggleAutoplayPause} onNextRace={nextRace} />}

      <footer className="control-deck">
        <div className="setup-controls">
          <button className="menu-button" onClick={returnToMenu}>☰ MENU</button>
          <label>
            <span>LAPS</span>
            <select value={totalLaps} disabled={status !== "ready" && status !== "finished"} onChange={(event) => setTotalLaps(Number(event.target.value))}>
              {[3, 6, 9, 12].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label>
            <span>GRID</span>
            <select value={selectedGridSize} disabled={status !== "ready" && status !== "finished"} onChange={(event) => setGridSize(Number(event.target.value))}>
              {Array.from({ length: maxGridSize }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        <div className="primary-controls">
          {status === "ready" || status === "finished" ? (
            <button className="start-button" onClick={startRace}><span>▶</span> {UI_COPY.race.start}</button>
          ) : (
            <button className="control-button" onClick={togglePause} disabled={status === "countdown"}>
              <span>{status === "paused" ? "▶" : "Ⅱ"}</span>{status === "paused" ? UI_COPY.race.resume : UI_COPY.race.pause}
            </button>
          )}
          <button className="control-button" onClick={restartRace}><span>↻</span> {UI_COPY.race.restart}</button>
          <button className="control-button" onClick={nextRace}>
            <span>↠</span>{isFinalChampionshipRound && status === "finished" ? UI_COPY.race.results : UI_COPY.race.nextRace}
          </button>
        </div>

        <div className="speed-controls" aria-label={UI_COPY.race.simulationSpeed}>
          <button className={`sound-button ${soundOn ? "active" : ""}`} aria-label={soundOn ? UI_COPY.race.audioOff : UI_COPY.race.audioOn} onClick={toggleSound}>
            {soundOn ? UI_COPY.race.volumeShort : UI_COPY.race.mute}
          </button>
          <span>SIM SPEED</span>
          <div>
            {[1, 2, 4].map((value) => (
              <button key={value} className={simSpeed === value ? "active" : ""} onClick={() => setSimSpeed(value)}>{value}×</button>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
