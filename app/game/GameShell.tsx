"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadRaceTracks, raceTrackFromDocument, type RaceTrack } from "../track-creator/race-library";
import { discardRetiredCircuitEditorData } from "../track-creator/retired-circuit-cleanup";
import { getThemePalette } from "../track-creator/domain/track/themes";
import { categoryDrivers, CompetitionEditor, createDefaultCategory, loadCategories, resolveDriverSprite, type CompetitionCategory, type DriverSpriteOverrides } from "../competition-editor";
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
import type { CompiledTrack } from "../simulation/compiled-track";
import { compileAuthoringTrack } from "../simulation/authoring-track-compiler";
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
type GameMode = "single" | "championship";
type GameTheme = "dark" | "light";
const WINNER_PRESENTATION_DURATION_MS = 2_000;
const THEME_STORAGE_KEY = "gridwatch.theme";
const trackOverlayImages = new Map<string, HTMLImageElement>();
const TrackCreator = lazy(() =>
  import("../track-creator/App").then((module) => ({ default: module.TrackCreator })),
);
const isGameTheme = (value: unknown): value is GameTheme => value === "dark" || value === "light";
type MenuScreen =
  | "mode"
  | "single-setup"
  | "championship-setup"
  | "settings"
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
  sprites?: DriverSpriteOverrides;
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
  towStartedAt?: number;
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
  camera?: { centerX: number; centerY: number; rotation: number; scale: number; screenX: number; screenY: number };
  compiled?: CompiledTrack;
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

function buildCompiledGeometry(
  width: number,
  height: number,
  track: CompiledTrack,
  frame?: { center: { x: number; y: number }; size: { x: number; y: number }; rotation: number },
): Geometry {
  const allPoints = [...track.leftBoundary, ...track.rightBoundary];
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));
  const centerX = frame?.center.x ?? (minX + maxX) / 2;
  const centerY = frame?.center.y ?? (minY + maxY) / 2;
  const rotation = frame?.rotation ?? 0;
  const spanX = frame?.size.x ?? Math.max(1, maxX - minX + 40);
  const spanY = frame?.size.y ?? Math.max(1, maxY - minY + 40);
  const scale = Math.min(width * 0.93 / spanX, height * 0.89 / spanY);
  const screenX = width / 2;
  const screenY = height / 2;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  const project = (position: { x: number; y: number }) => ({
    x: screenX + ((position.x - centerX) * cosine + (position.y - centerY) * sine) * scale,
    y: screenY + (-(position.x - centerX) * sine + (position.y - centerY) * cosine) * scale,
  });
  const samples = track.samples.map((sample, index) => {
    const point = project(sample.position);
    const next = project(track.samples[(index + 1) % track.samples.length].position);
    return { x: point.x, y: point.y, angle: Math.atan2(next.y - point.y, next.x - point.x), curve: Math.min(1, Math.abs(sample.curvature) * 18) };
  });
  const averageWidth = track.samples.reduce((total, sample) => total + sample.widthLeft + sample.widthRight, 0) / track.samples.length;
  return {
    samples,
    width,
    height,
    trackWidth: Math.max(10, averageWidth * scale),
    driving: analyzeTrack(samples, Math.max(10, averageWidth * scale)),
    worldBounds: { minX, maxX, minY, maxY },
    camera: { centerX, centerY, rotation, scale, screenX, screenY },
    compiled: track,
  };
}

function stableSeedKey(id: string | number) {
  if (typeof id === "number") return id;
  let hash = 2_166_136_261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16_777_619);
  return hash >>> 0;
}

function worldToCanvas(position: { x: number; y: number }, geometry: Geometry) {
  if (geometry.camera) {
    const { centerX, centerY, rotation, scale, screenX, screenY } = geometry.camera;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    return {
      x: screenX + ((position.x - centerX) * cosine + (position.y - centerY) * sine) * scale,
      y: screenY + (-(position.x - centerX) * sine + (position.y - centerY) * cosine) * scale,
    };
  }
  const { minX, maxX, minY, maxY } = geometry.worldBounds;
  return {
    x: (0.035 + (position.x - minX) / Math.max(0.0001, maxX - minX) * 0.93) * geometry.width,
    y: (0.045 + (position.y - minY) / Math.max(0.0001, maxY - minY) * 0.89) * geometry.height,
  };
}

function initialCars(gridSize: number, seed: number, totalLaps: number, drivers: Driver[] = DRIVERS, mechanicalFailureChancePercent = 12): CarState[] {
  const selected = drivers.slice(0, gridSize)
    .map((driver) => ({ driver, seedKey: stableSeedKey(driver.id) }));

  return selected.map(({ driver, seedKey }, index) => {
    const attributeSeed = seed * 1009 + seedKey * 313;
    const failureChance = clamp(mechanicalFailureChancePercent, 0, 100) / 100;
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
      towStartedAt: undefined,
    };
  });
}

function TeamTintedSprite({ source, driver, alt, shouldTint }: { source: string; driver: Driver; alt: string; shouldTint: boolean }) {
  const [tintedSource, setTintedSource] = useState(shouldTint ? "" : source);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    // Never show the untinted category source while its palette conversion is in progress.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTintedSource(shouldTint ? "" : source);
    setState(shouldTint ? "loading" : "ready");
    const imagePromise = shouldTint
      ? tintSprite(source, { blue: driver.color, green: driver.accent, white: driver.thirdColor ?? "#ffffff", red: driver.helmetColor ?? "#ff0000" }, controller.signal)
      : Promise.resolve(source);
    void imagePromise
      .then((result) => { if (!controller.signal.aborted) { setTintedSource(result); setState("ready"); } })
      .catch(() => { if (!controller.signal.aborted) { setTintedSource(""); setState("error"); } });
    return () => controller.abort();
  }, [driver.accent, driver.color, driver.helmetColor, driver.thirdColor, shouldTint, source]);

  if (!tintedSource) return <span className="timing-car-sprite sprite-loading" role="img" aria-label={alt} data-asset-state={state} aria-busy={state === "loading"}>—</span>;
  // The source is a generated local data URL and has no stable remote image path.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="timing-car-sprite imported-sprite" src={tintedSource} alt={alt} data-asset-state={state} aria-busy={state === "loading"} />;
}

function TimingCarSprite({ driver, category }: { driver: Driver; category: CompetitionCategory }) {
  const resolved = resolveDriverSprite(category, driver, "lateral");
  if (resolved.source?.startsWith("data:") || resolved.source?.startsWith("/")) {
    return <TeamTintedSprite source={resolved.source} shouldTint={resolved.shouldTint} driver={driver} alt={`${driver.team} Formula car`} />;
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

function drawAuthoredTrack(ctx: CanvasRenderingContext2D, geometry: Geometry, track: RaceTrack) {
  const compiled = geometry.compiled;
  if (!compiled) return;
  const palette = getThemePalette(track.trackDocument.theme);
  const surfaceColors: Record<CompiledTrack["samples"][number]["surface"], string> = {
    asphalt: palette.road,
    concrete: palette.runoff.concrete,
    curb: palette.kerbA,
    grass: palette.runoff.grass,
    gravel: palette.runoff.gravel,
  };
  ctx.clearRect(0, 0, geometry.width, geometry.height);
  ctx.fillStyle = palette.terrain;
  ctx.fillRect(0, 0, geometry.width, geometry.height);

  const project = (point: { x: number; y: number }) => worldToCanvas(point, geometry);
  const overlay = track.trackDocument.assetOverlay;
  if (overlay) {
    let image = trackOverlayImages.get(overlay.source);
    if (!image) {
      image = new Image();
      image.src = overlay.source;
      trackOverlayImages.set(overlay.source, image);
    }
    if (image.complete && image.naturalWidth) {
      const center = project(overlay.position);
      const size = 200 * overlay.scale * (geometry.camera?.scale ?? 1);
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(-overlay.rotation - (geometry.camera?.rotation ?? 0));
      ctx.globalAlpha = overlay.opacity;
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }
  // The authored surface ribbon is shared with the physical collision path, so width changes are visible immediately.
  for (const [ribbonIndex, ribbon] of compiled.surfaceRibbon.entries()) {
    const leftStart = project(ribbon.leftStart);
    const rightStart = project(ribbon.rightStart);
    const leftEnd = project(ribbon.leftEnd);
    const rightEnd = project(ribbon.rightEnd);
    ctx.beginPath();
    ctx.moveTo(leftStart.x, leftStart.y);
    ctx.lineTo(leftEnd.x, leftEnd.y);
    ctx.lineTo(rightEnd.x, rightEnd.y);
    ctx.lineTo(rightStart.x, rightStart.y);
    ctx.closePath();
    ctx.fillStyle = surfaceColors[ribbon.surface];
    ctx.fill();
    const elevation = (compiled.samples[ribbonIndex]?.elevation ?? 0) + (compiled.samples[(ribbonIndex + 1) % compiled.samples.length]?.elevation ?? 0);
    if (Math.abs(elevation) > 0.01) {
      ctx.fillStyle = elevation > 0 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.055)";
      ctx.fill();
    }
  }

  const runoffColor = (runoff: string) => runoff === "asphalt" ? palette.road : runoff === "concrete" ? palette.runoff.concrete : runoff === "gravel" ? palette.runoff.gravel : runoff === "sand" ? "#c9a86c" : palette.runoff.grass;
  const kerbColor = (kerb: string) => kerb === "blue-white" ? "#4c8bea" : kerb === "yellow-black" ? "#d7b12e" : palette.kerbB;
  for (let index = 0; index < compiled.samples.length; index += 1) {
    const sample = compiled.samples[index];
    const next = compiled.samples[(index + 1) % compiled.samples.length];
    (["left", "right"] as const).forEach((side) => {
      const start = side === "left" ? sample.leftBoundary : sample.rightBoundary;
      const end = side === "left" ? next.leftBoundary : next.rightBoundary;
      const normal = side === "left" ? sample.normal : { x: -sample.normal.x, y: -sample.normal.y };
      const edge = sample.edges?.[side] ?? track.trackDocument.environment;
      const outerStart = { x: start.x + normal.x * 10, y: start.y + normal.y * 10 };
      const outerEnd = { x: end.x + normal.x * 10, y: end.y + normal.y * 10 };
      const a = project(start); const b = project(end); const c = project(outerEnd); const d = project(outerStart);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath();
      ctx.fillStyle = runoffColor(edge.runoff); ctx.globalAlpha = 0.82; ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = edge.kerb === "none" ? palette.roadEdge : kerbColor(edge.kerb);
      ctx.lineWidth = edge.kerb === "none" ? 2 : 4;
      ctx.setLineDash(edge.kerb === "none" ? [] : [9, 9]); ctx.stroke(); ctx.setLineDash([]);
      if (edge.barrier !== "none") {
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y);
        ctx.strokeStyle = palette.barrier; ctx.lineWidth = edge.barrier === "wall" ? 4 : 2.5; ctx.stroke();
      }
    });
  }

  for (const prop of track.trackDocument.props) {
    const point = project(prop.position);
    const size = Math.max(3, Math.min(24, prop.scale * 7));
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(prop.rotation - (geometry.camera?.rotation ?? 0));
    if (prop.type === "tree") {
      ctx.fillStyle = palette.prop;
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();
    } else if (prop.type === "grandstand") {
      ctx.fillStyle = "rgba(238, 243, 241, .78)";
      ctx.fillRect(-size * 1.7, -size * .65, size * 3.4, size * 1.3);
    } else if (prop.type === "barrier") {
      ctx.strokeStyle = palette.barrier;
      ctx.lineWidth = Math.max(2, size / 3);
      ctx.beginPath();
      ctx.moveTo(-size * 1.4, 0);
      ctx.lineTo(size * 1.4, 0);
      ctx.stroke();
    } else {
      ctx.fillStyle = palette.prop;
      ctx.fillRect(-size / 2, -size / 2, size, size);
    }
    ctx.restore();
  }

  const start = compiled.sensors.find((sensor) => sensor.kind === "start-finish");
  if (start) {
    const source = compiled.samples.reduce((nearest, sample) =>
      (sample.position.x - start.position.x) ** 2 + (sample.position.y - start.position.y) ** 2 <
      (nearest.position.x - start.position.x) ** 2 + (nearest.position.y - start.position.y) ** 2 ? sample : nearest, compiled.samples[0]);
    const normal = { x: -source.tangent.y, y: source.tangent.x };
    const left = project({ x: source.position.x + normal.x * source.widthLeft, y: source.position.y + normal.y * source.widthLeft });
    const right = project({ x: source.position.x - normal.x * source.widthRight, y: source.position.y - normal.y * source.widthRight });
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();
  }
}

const CHAMPIONSHIP_POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

function shuffledTrackIndices(seed: number, tracks: RaceTrack[] = []) {
  return tracks
    .map((_, index) => ({ index, order: seeded(seed * 41 + index * 173) }))
    .sort((a, b) => a.order - b.order)
    .map(({ index }) => index);
}

function randomTrackIndex(seed: number, currentIndex?: number, tracks: RaceTrack[] = []) {
  const candidates = shuffledTrackIndices(seed, tracks).filter((index) => index !== currentIndex);
  return candidates[0] ?? 0;
}

export function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const simulationAccumulatorRef = useRef(0);
  const geometryRef = useRef<Geometry | null>(null);
  const carsRef = useRef<CarState[]>([]);
  const currentTrackRef = useRef<RaceTrack | null>(null);
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
  const gridDrawTimerRef = useRef<number | null>(null);
  const raceActionsRef = useRef<HTMLDivElement>(null);
  const raceActionsTriggerRef = useRef<HTMLButtonElement>(null);
  const worldRaceEngineRef = useRef<WorldRaceEngine | null>(null);
  const worldRaceEnginePromiseRef = useRef<Promise<WorldRaceEngine | null> | null>(null);
  const worldRaceEngineGenerationRef = useRef(0);

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
  const [cars, setCars] = useState<CarState[]>([]);
  const [gridReveal, setGridReveal] = useState<Driver[]>([]);
  const [gridDrawClosing, setGridDrawClosing] = useState(false);
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
  const [creatorTracks, setCreatorTracks] = useState<RaceTrack[]>([]);
  const [categories, setCategories] = useState<CompetitionCategory[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const catalog = useMemo(() => creatorTracks, [creatorTracks]);
  const currentTrack = catalog[currentTrackIndex] ?? catalog[0] ?? null;
  const hasCategories = categories.length > 0;
  const activeCategory = categories.find((category) => category.id === selectedCategoryId) ?? categories[0] ?? createDefaultCategory();
  const activeDrivers = useMemo(() => hasCategories ? categoryDrivers(activeCategory) as Driver[] : [], [activeCategory, hasCategories]);
  const driverById = useMemo(() => new Map(activeDrivers.map((driver) => [String(driver.id), driver])), [activeDrivers]);
  const maxGridSize = Math.max(1, activeDrivers.length);
  const selectedGridSize = clamp(gridSize, 1, maxGridSize);

  const selectCompetitionCategory = useCallback((id: string) => {
    setSelectedCategoryId(id);
    const category = categories.find((item) => item.id === id);
    if (!category) return;
    setTotalLaps(category.raceDefaults.totalLaps);
    setGridSize(Math.max(1, Math.min(category.drivers.length, category.raceDefaults.gridSize)));
  }, [categories]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await discardRetiredCircuitEditorData();
      const tracks = await loadRaceTracks();
      if (controller.signal.aborted) return;
      setCreatorTracks(tracks);
      currentTrackRef.current = tracks[0] ?? null;
    })().catch(() => {
      // IndexedDB is optional. The embedded editor exposes its own recovery error when it is unavailable.
    });
    void loadCategories().then((loaded) => { if (!controller.signal.aborted) setCategories(loaded); });
    setSavedChampionshipSession(championshipSessionRepository.load());
    void assetRegistry.preloadCritical(controller.signal).finally(() => { if (!controller.signal.aborted) setStorageReady(true); });
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
    const controller = new AbortController();
    activeDrivers.forEach((driver) => {
      const resolved = resolveDriverSprite(activeCategory, driver, "main");
      const source = resolved.source;
      if (!source) return;
      const imagePromise = resolved.shouldTint
        ? tintSprite(source, { blue: driver.color, green: driver.accent, white: driver.thirdColor ?? "#ffffff", red: driver.helmetColor ?? "#ff0000" }, controller.signal)
        : Promise.resolve(source);
      void imagePromise.then((result) => {
        if (controller.signal.aborted) return;
        const tinted = new Image();
        tinted.onload = () => { if (!controller.signal.aborted) topSpriteRef.current.set(String(driver.id), tinted); };
        tinted.src = result;
      }).catch(() => { /* Generated Canvas cars remain the fixed-size fallback. */ });
    });
    return () => controller.abort();
  }, [activeCategory, activeDrivers]);

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
    const selectedTrack = currentTrackRef.current;
    if (!selectedTrack) return;
    const generation = ++worldRaceEngineGenerationRef.current;
    worldRaceEngineRef.current?.free();
    worldRaceEngineRef.current = null;
    setWorldEngineState("loading");
    const compiledTrack = compileAuthoringTrack(selectedTrack.trackDocument);
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
    worldRaceEngineGenerationRef.current += 1;
    worldRaceEngineRef.current?.free();
    worldRaceEngineRef.current = null;
    worldRaceEnginePromiseRef.current = null;
    carsRef.current = [];
    setGridReveal([]);
    setGridDrawClosing(false);
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
    if (gridDrawTimerRef.current !== null) {
      window.clearTimeout(gridDrawTimerRef.current);
      gridDrawTimerRef.current = null;
    }
    setShowRoundStandings(false);
    setRaceResult(null);
    setShowRaceResults(false);
    setCars([]);
    setRaceTime(0);
    setCountdown(3);
    setRaceStatus("ready");
  }, [setRaceStatus]);

  const beginGridDraw = useCallback((seed: number, autoStart = false) => {
    if (gridDrawTimerRef.current !== null) window.clearTimeout(gridDrawTimerRef.current);
    const ranked = activeDrivers.slice(0, selectedGridSize)
      .map((driver) => ({ driver, order: seeded(seed * 19 + stableSeedKey(driver.id) * 137) }))
      .sort((left, right) => left.order - right.order)
      .map(({ driver }) => driver);
    setGridReveal([]);
    setGridDrawClosing(false);
    setRaceStatus("grid-draw");
    let revealCount = 0;
    const reveal = () => {
      revealCount += 1;
      setGridReveal(ranked.slice(0, revealCount));
      if (revealCount < ranked.length) {
        gridDrawTimerRef.current = window.setTimeout(reveal, 600);
        return;
      }
      gridDrawTimerRef.current = window.setTimeout(() => {
        setGridDrawClosing(true);
        gridDrawTimerRef.current = window.setTimeout(() => {
          const preparedCars = initialCars(selectedGridSize, seed, totalLaps, ranked, activeCategory.mechanicalFailureChancePercent);
          carsRef.current = preparedCars;
          setCars([...preparedCars]);
          initializeWorldRaceEngine(preparedCars);
          setGridReveal([]);
          setGridDrawClosing(false);
          setRaceStatus("ready");
          if (autoStart) {
            initAudio();
            void worldRaceEnginePromiseRef.current?.then(() => {
              if (statusRef.current !== "ready") return;
              countdownRef.current = 3;
              setCountdown(3);
              setRaceStatus("countdown");
            });
          }
        }, 300);
      }, 450);
    };
    gridDrawTimerRef.current = window.setTimeout(reveal, 600);
  }, [activeCategory.mechanicalFailureChancePercent, activeDrivers, initializeWorldRaceEngine, selectedGridSize, setRaceStatus, totalLaps]);

  const rollRaceSeed = useCallback(() => {
    raceSeedSequenceRef.current += 1;
    return 17 + raceSeedSequenceRef.current * 7919;
  }, []);

  const loadTrack = useCallback((trackIndex: number) => {
    const nextTrack = catalog[trackIndex] ?? catalog[0] ?? null;
    currentTrackRef.current = nextTrack;
    geometryRef.current = null;
    setCurrentTrackIndex(trackIndex);
  }, [catalog]);

  const queueRaceCountdown = useCallback((delayMs = 0) => {
    if (raceStartTimerRef.current !== null) window.clearTimeout(raceStartTimerRef.current);
    if (gridDrawTimerRef.current !== null) window.clearTimeout(gridDrawTimerRef.current);
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
    if (!selectedCategoryId || !hasCategories || catalog.length === 0) return;
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
  }, [autoplayDirector, catalog, hasCategories, loadTrack, resetRace, rollRaceSeed, selectedCategoryId, selectedTrackChoice]);

  const beginChampionship = useCallback(() => {
    if (!selectedCategoryId || !hasCategories || catalog.length < 2) return;
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
    if (championshipPlaybackMode === "auto") beginGridDraw(seed, true);
  }, [autoplayDirector, beginGridDraw, catalog, championshipLength, championshipPlaybackMode, hasCategories, loadTrack, resetRace, rollRaceSeed, selectedCategoryId]);

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
    if (session.playback.mode === "auto") beginGridDraw(session.seed + session.completedRounds * 7_919, true);
  }, [autoplayDirector, beginGridDraw, catalog, categories, discardSavedChampionship, loadTrack, resetRace, savedChampionshipSession]);

  const startRace = useCallback(() => {
    const seed = rollRaceSeed();
    resetRace(seed);
    beginGridDraw(seed, true);
  }, [beginGridDraw, resetRace, rollRaceSeed]);

  const restartRace = useCallback(() => {
    const seed = rollRaceSeed();
    resetRace(seed);
    beginGridDraw(seed, true);
  }, [beginGridDraw, resetRace, rollRaceSeed]);

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
    beginGridDraw(seed, true);
  }, [
    championshipRound,
    championshipSchedule,
    catalog,
    currentTrackIndex,
    gameMode,
    loadTrack,
    beginGridDraw,
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
        car.targetLane = car.failureSide * 1.12;
        car.lane += (car.targetLane - car.lane) * Math.min(1, delta * 1.35);
        car.speed = Math.max(0, car.speed - delta * (0.0062 + failureAge * 0.0014));
        car.distance += car.speed * delta;
        if (car.speed <= 0.00012) {
          car.speed = 0;
          car.mechanical = "retired";
        }
        continue;
      }

      if (car.finishPosition !== null) {
        car.targetLane = 0;
        car.lane += (car.targetLane - car.lane) * Math.min(1, delta * 0.8);
        car.speed = Math.max(0, car.speed - delta * 0.018);
        continue;
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
          if (!car.towStartedAt) {
            car.worldX = null;
            car.worldY = null;
            car.worldHeading = null;
          }
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
        const signedLateral = snapshot.lateralOffset;
        const edgeWidth = signedLateral >= 0 ? physicalSample.widthLeft : physicalSample.widthRight;
        const edge = signedLateral >= 0 ? physicalSample.edges?.left : physicalSample.edges?.right;
        const beyondEdge = Math.abs(signedLateral) - edgeWidth;
        if (beyondEdge > activeCategory.vehicleSpec.widthMeters * 0.7 && edge?.runoff === "sand") {
          car.mechanical = "retired";
          car.speed = 0;
        } else if (beyondEdge > 0 && edge?.barrier !== "none" && Math.abs(snapshot.longitudinalVelocity) < 0.8) {
          car.mechanical = "retired";
          car.speed = 0;
          car.towStartedAt = currentRaceTime;
        }
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
          trackName: currentTrackRef.current?.name ?? "Track Editor circuit",
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
  }, [activeCategory.name, activeCategory.vehicleSpec.maxSteeringDegrees, activeDrivers, championshipRound, playEffect, setRaceStatus]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const geometry = geometryRef.current;
    if (!canvas || !geometry) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const track = currentTrackRef.current;
    if (!track) return;
    drawAuthoredTrack(ctx, geometry, track);

    if (statusRef.current === "grid-draw" && geometry.compiled) {
      gridReveal.forEach((driver, index) => {
        const slot = geometry.compiled!.gridSlots[index];
        if (!slot) return;
        const point = worldToCanvas(slot.position, geometry);
        drawCar(ctx, driver, point.x, point.y, slot.heading, clamp(geometry.width / 1000, .68, 1.12) * CAR_SCALE_FACTOR, false, "running", raceTimeRef.current, null);
      });
    }

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
      const towAge = car.towStartedAt === undefined ? -1 : raceTimeRef.current - car.towStartedAt;
      const towProgress = clamp((towAge - 5) / 1.2, 0, 1);
      const towedX = x + Math.cos(heading + Math.PI / 2) * towProgress * 28;
      const towedY = y + Math.sin(heading + Math.PI / 2) * towProgress * 28 - Math.sin(towProgress * Math.PI) * 24;
      const scale = clamp(geometry.width / 1000, 0.68, 1.12) * CAR_SCALE_FACTOR;
      drawCar(
        ctx,
        driverById.get(car.id)!,
        towedX,
        towedY,
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
  }, [driverById, gridReveal, showDrivingDebug]);

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
      if (!currentTrack) return;
      geometryRef.current = buildCompiledGeometry(rect.width, rect.height, compileAuthoringTrack(currentTrack.trackDocument), currentTrack.trackDocument.spectatorFrame);
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
      ? catalog[randomTrackIndex(2026, undefined, catalog)]
      : catalog.find((track) => track.id === selectedTrackChoice) ?? catalog[0] ?? null;
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
    const compatibleSavedSession = savedChampionshipSession && categories.some((category) => category.id === savedChampionshipSession.categoryId) ? savedChampionshipSession : null;
    return <MainMenu savedSession={compatibleSavedSession} circuitCount={catalog.length} categoryCount={categories.length} driverCount={activeDrivers.length} onSingleRace={() => setScreen("single-setup")} onSettings={() => setScreen("settings")} onChampionship={() => setScreen("championship-setup")} onResumeChampionship={resumeSavedChampionship} onDiscardChampionship={discardSavedChampionship} />;
  }

  if (screen === "settings") {
    return <SettingsHub onOpen={(section) => setScreen(section === "audio" || section === "appearance" ? `${section}-settings` : section)} onBack={() => setScreen("mode")} />;
  }

  if (screen === "audio-settings" || screen === "appearance-settings") {
    return <SettingsDetail section={screen.replace("-settings", "") as SettingsSection} theme={theme} soundOn={soundOn} onThemeChange={setTheme} onToggleSound={toggleSound} onBack={() => setScreen("settings")} />;
  }

  if (screen === "track-editor") {
    if (!storageReady) return <LoadingScreen title={UI_COPY.editor.loadingLibrary} detail={UI_COPY.editor.restoringCircuits} />;
    return <div className="track-creator-root"><Suspense fallback={<LoadingScreen title="Opening Track Editor" detail="Restoring your local workspace." />}><TrackCreator onSaved={(document) => {
      const saved = raceTrackFromDocument(document);
      if (saved) setCreatorTracks((current) => [...current.filter((track) => track.id !== saved.id), saved]);
    }} onBack={() => setScreen("settings")} /></Suspense></div>;
  }

  if (screen === "competition-editor") {
    if (!storageReady) return <LoadingScreen title={UI_COPY.editor.loadingLibrary} detail={UI_COPY.editor.restoringCategories} />;
    return <CompetitionEditor onBack={() => setScreen("settings")} onLibraryChange={(next) => { setCategories(next); if (selectedCategoryId && !next.some((category) => category.id === selectedCategoryId)) setSelectedCategoryId(""); }} />;
  }

  if (screen === "single-setup") {
    return <SingleRaceSetup catalog={catalog} categories={categories} selectedCategoryId={selectedCategoryId} selectedTrackChoice={selectedTrackChoice} selectedTrackPreview={selectedTrackPreview} activeCategory={activeCategory} totalLaps={totalLaps} gridSize={selectedGridSize} maxGridSize={maxGridSize} onCategoryChange={selectCompetitionCategory} onTrackChange={setSelectedTrackChoice} onLapsChange={setTotalLaps} onGridChange={setGridSize} onBack={() => setScreen("mode")} onConfirm={beginSingleRace} />;
  }

  if (screen === "championship-setup") {
    return <ChampionshipSetup catalog={catalog} categories={categories} selectedCategoryId={selectedCategoryId} totalLaps={totalLaps} gridSize={selectedGridSize} maxGridSize={maxGridSize} championshipLength={championshipLength} playbackMode={championshipPlaybackMode} resultDurationSeconds={resultDurationSeconds} standingsDurationSeconds={standingsDurationSeconds} pauseWhenHidden={pauseWhenHidden} onCategoryChange={selectCompetitionCategory} onLapsChange={setTotalLaps} onGridChange={setGridSize} onLengthChange={(value) => setChampionshipLength(clamp(value, 2, 50))} onPlaybackModeChange={(value) => { setChampionshipPlaybackMode(value); setAutoplayPaused(false); }} onResultDurationChange={(value) => setResultDurationSeconds(clamp(value, 2, 30))} onStandingsDurationChange={(value) => setStandingsDurationSeconds(clamp(value, 2, 30))} onPauseWhenHiddenChange={setPauseWhenHidden} onBack={() => setScreen("mode")} onConfirm={beginChampionship} />;
  }

  if (screen === "championship-results") {
    const champion = championshipStandings[0];
    return <ChampionshipResults standings={championshipStandings} rounds={championshipSchedule.length} championPreview={champion ? <TimingCarSprite driver={champion.driver} category={activeCategory} /> : null} onMenu={returnToMenu} onNewChampionship={() => setScreen("championship-setup")} />;
  }

  return (
    <main className="race-shell" data-race-layout="fullscreen" data-physics-engine={worldEngineState === "ready" ? "rapier" : worldEngineState}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">Race status {statusLabel}. {leader ? `Leader ${driverById.get(leader.id)?.name ?? leader.id}. Lap ${currentLap} of ${totalLaps}.` : "Waiting for the grid."}</div>
      <header className="top-bar">
        <Brand className="brand" />
        <div className="event-title">
          <span>{activeCategory.name} · {gameMode === "championship" ? "CHAMPIONSHIP" : "SINGLE RACE"}</span>
          <strong>{currentTrack?.name.toUpperCase() ?? "TRACK EDITOR"}</strong>
        </div>
        <RaceActionsMenu containerRef={raceActionsRef} triggerRef={raceActionsTriggerRef} open={raceActionsOpen} status={status} championship={gameMode === "championship"} autoBroadcast={championshipPlaybackMode === "auto"} autoplayPaused={autoplayPaused} finalRound={isFinalChampionshipRound} laps={totalLaps} grid={selectedGridSize} maxGrid={maxGridSize} speed={simSpeed} soundOn={soundOn} onOpenChange={setRaceActionsOpen} onStart={startRace} onPause={togglePause} onRestart={restartRace} onNext={nextRace} onToggleAutoplay={toggleAutoplayPause} onLaps={setTotalLaps} onGrid={setGridSize} onSpeed={setSimSpeed} onSound={toggleSound} onMenu={returnToMenu} />
      </header>
      {status === "grid-draw" && (
        <div className={`grid-draw-overlay${gridDrawClosing ? " closing" : ""}`} role="status" aria-live="polite">
          <section>
            <span>GRID DRAW</span>
            <h2>Assigning the starting order</h2>
            <p>{gridReveal.length} / {selectedGridSize} positions confirmed</p>
            <ol>{gridReveal.map((driver, index) => <li key={driver.id}><b>{String(index + 1).padStart(2, "0")}</b><i style={{ background: driver.color }} /><strong>{driver.name}</strong><small>{driver.team}</small></li>)}</ol>
          </section>
        </div>
      )}

      <section className="race-layout">
        <RaceHud canvasRef={canvasRef} trackName={currentTrack?.name ?? "Track Editor circuit"} physicalCarCount={cars.filter((car) => car.worldX !== null && car.worldY !== null).length} currentLap={currentLap} totalLaps={totalLaps} raceTime={formatTime(raceTime)} leaderCode={leader ? driverById.get(leader.id)?.code ?? "—" : "—"} leaderColor={leader ? driverById.get(leader.id)?.color ?? "#fff" : "#fff"} bestLap={bestLapEntry ? formatTime(bestLapEntry.bestLap) : "—"} countdown={status === "countdown" ? countdown : null} overlay={<BroadcastPanel currentLap={currentLap} totalLaps={totalLaps} fastestDriver={bestLapEntry ? driverById.get(bestLapEntry.id)?.code : undefined} fastestLap={bestLapEntry ? formatTime(bestLapEntry.bestLap) : undefined} entries={standings.map((car, index) => ({ id: car.id, code: driverById.get(car.id)?.code ?? car.id, status: car.mechanical, gapSeconds: index === 0 ? 0 : Math.max(0, (leader ? leader.distance - car.distance : 0) * 22.8) }))} />} />
        <LiveTiming currentLap={currentLap} drivers={driverById} championship={gameMode === "championship"} renderCar={(driver) => <TimingCarSprite driver={driver as Driver} category={activeCategory} />} entries={standings.map((car, index) => {
          const gapLaps = leader ? leader.distance - car.distance : 0;
          const resultEntry = raceResult?.entries.find((entry) => entry.id === car.id);
          const finalGap = resultEntry?.gapSeconds ?? calculateFinishGap(car.finishedAt, leader?.finishedAt ?? null);
          return { id: car.id, mechanical: car.mechanical, points: championshipPoints[car.id] ?? 0, gap: index === 0 ? "LEADER" : finalGap !== null ? `+${finalGap.toFixed(3)}` : `+${(gapLaps * 22.8).toFixed(2)}` };
        })} />
      </section>


      {showRaceResults && raceResult && status === "finished" && <RaceResultsOverlay result={raceResult} championshipRounds={championshipSchedule.length} autoplay={championshipPlaybackMode === "auto"} autoplayPaused={autoplayPaused} onToggleAutoplay={toggleAutoplayPause} onContinue={continueFromRaceResults} onMenu={returnToMenu} />}

      {showRoundStandings && gameMode === "championship" && <ChampionshipStandingsOverlay standings={championshipStandings} round={championshipRound + 1} totalRounds={championshipSchedule.length} trackName={currentTrack?.name ?? "Track Editor circuit"} categoryName={activeCategory.name} autoplay={championshipPlaybackMode === "auto"} autoplayPaused={autoplayPaused} onToggleAutoplay={toggleAutoplayPause} onNextRace={nextRace} />}

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
