"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createStorageRepository, isRecord } from "./storage";
import { UI_COPY } from "./ui-copy";
import { DEFAULT_FORMULA_VEHICLE_SPEC, normalizeVehicleSpec, validateVehicleSpec, type VehicleSpec } from "./domain/vehicle-spec";
import { Brand } from "./ui/brand";
import { LoadingScreen } from "./ui/loading-screen";
import { DriverEditor } from "./editor/competition/DriverEditor";
import { Dialog } from "./design-system/Dialog";

export type CompetitionDriver = {
  id: string;
  code: string;
  name: string;
  teamId: string;
  color: string;
  accent: string;
  helmetColor: string;
  skill: number;
  aggression: number;
  consistency: number;
  cornering: number;
  overtaking: number;
  defense: number;
  risk: number;
  number: number;
  sprite?: string;
};

export type CompetitionTeam = {
  id: string;
  name: string;
  code: string;
  color: string;
  accent: string;
  thirdColor: string;
  logo?: string;
  order: number;
  sprite?: string;
  lateralSprite?: string;
};

export type CompetitionCategory = {
  id: string;
  name: string;
  description: string;
  manufacturer: string;
  primaryColor: string;
  secondaryColor: string;
  visualStyle: string;
  teams: CompetitionTeam[];
  drivers: CompetitionDriver[];
  sprites: { main: string; lateral: string; thumbnail: string };
  spriteScale?: number;
  lateralScale?: number;
  vehicleSpec: VehicleSpec;
  version: 2;
  official: boolean;
  updatedAt: string;
};

const STORAGE_KEY = "gridwatch.competition-categories";
const categoryRepository = createStorageRepository(STORAGE_KEY, [], isCategoryArray);
const draftRepository = createStorageRepository<CompetitionCategory | null>(`${STORAGE_KEY}.draft`, null, (value): value is CompetitionCategory | null => value === null || isCategoryDocument(value));
const roster = [
  ["SOL", "Maya Solari", "Solaris GP", "#ffb703", "#fff2b8"], ["VALE", "Luca Vale", "Velox Racing", "#ed263a", "#ffd5da"],
  ["KAI", "Ari Kai", "Apex Blue", "#209cff", "#c8e9ff"], ["NOVA", "Nico Nova", "Nova Corse", "#9b5cff", "#e3d5ff"],
  ["MOR", "Theo Moreau", "Ardent", "#ff6b35", "#ffe1d1"], ["REI", "Inez Rei", "Verdant Works", "#43d17b", "#ccffe0"],
  ["FOX", "Ezra Fox", "Vanta Sport", "#f5f5f5", "#7ef0ff"], ["LIN", "Sora Lin", "Pulse Racing", "#ff4fb3", "#ffd0ea"],
  ["BEK", "Jonas Beck", "Nord Motorsport", "#00d1c7", "#c7fffb"], ["ARO", "Milo Aro", "Kinetic", "#b7f34b", "#edffc9"],
  ["SAI", "Lena Saito", "Ember GP", "#ff814a", "#ffe0cf"], ["IVO", "Dani Ivo", "Cobalt One", "#3e5dff", "#d3dbff"],
  ["ZED", "Rafa Zed", "Prisma", "#f35cff", "#fbd4ff"], ["RIN", "Noa Rin", "Aurora", "#56e2ff", "#d5f8ff"],
  ["ORO", "Enzo Oro", "Titan Racing", "#ffc83d", "#fff1bd"], ["MAE", "Clara Mae", "Vector", "#a8b1bb", "#f3f6f8"],
  ["KIM", "Juno Kim", "Helix Motorsport", "#00a896", "#c7fff5"], ["PET", "Oskar Petrov", "Crimson Arrow", "#d7263d", "#ffd2d8"],
  ["AMA", "Leila Amari", "Atlas Racing", "#6c63ff", "#ddd9ff"], ["VOS", "Finn Vos", "Orion Works", "#2f4858", "#b7d5df"],
  ["CAV", "Sofia Caval", "Lumen GP", "#ff8c42", "#ffe0ca"], ["TAN", "Ren Tanaka", "Zenith Corse", "#8ac926", "#e7ffc8"],
] as const;

const HELMET_COLORS = ["#f4f4f1", "#18212b", "#f1c40f", "#e67e22", "#2ecc71", "#e74c3c", "#8e44ad", "#16a085", "#ecf0f1", "#34495e", "#d35400", "#2980b9", "#c0392b", "#7f8c8d", "#f39c12", "#95a5a6"];

const SPRITE_PRESETS = [
  { id: "default", label: "RESTORE DEFAULT", color: "#0066ff", main: "/assets/sprites/formula-default-top.svg", lateral: "/assets/sprites/formula-default-lateral.svg" },
  { id: "solaris", label: "SOLARIS", color: "#ffb703", main: "/assets/sprites/formula-solaris-top.svg", lateral: "/assets/sprites/formula-solaris-lateral.svg" },
  { id: "velox", label: "VELOX", color: "#ed263a", main: "/assets/sprites/formula-velox-top.svg", lateral: "/assets/sprites/formula-velox-lateral.svg" },
  { id: "apex", label: "APEX BLUE", color: "#209cff", main: "/assets/sprites/formula-apex-top.svg", lateral: "/assets/sprites/formula-apex-lateral.svg" },
] as const;

function isSafeSvg(source: string) {
  return /<svg[\s>]/i.test(source)
    && !/<script|<foreignObject|\son\w+\s*=|(?:href|src)\s*=\s*["']https?:/i.test(source);
}

function spriteMaskReport(source: string) {
  const masks = [["Blue", /#(?:0066ff|0000ff)/i], ["Green", /#00ff00/i], ["White", /#ffffff/i], ["Red", /#ff0000/i], ["Yellow", /#(?:ffff00|ffd200)/i]] as const;
  return masks.filter(([, pattern]) => !pattern.test(source)).map(([name]) => name);
}

function validateDecodedImage(source: string) {
  return new Promise<boolean>((resolve) => { const image = new Image(); image.onload = () => resolve(image.naturalWidth >= 16 && image.naturalHeight >= 16 && image.naturalWidth <= 4096 && image.naturalHeight <= 4096); image.onerror = () => resolve(false); image.src = source; });
}

function defaultTeams(): CompetitionTeam[] {
  return roster.map(([code, , name, color, accent], index) => ({ id: `team-${index}`, name, code: code.slice(0, 3), color, accent, thirdColor: "#ffffff", order: index }));
}

export function createDefaultCategory(): CompetitionCategory {
  const teams = defaultTeams();
  return {
    id: "mini-formula",
    name: "Mini Formula",
    description: "GridWatch's flagship category, with light cars and balanced competition.",
    manufacturer: "GridWatch Racing",
    primaryColor: "#ef3d49",
    secondaryColor: "#18221e",
    visualStyle: "single-seater",
    teams,
    drivers: roster.map(([code, name, , color, accent], index) => ({ id: `driver-${index + 1}`, code, name, teamId: teams[index].id, color, accent, helmetColor: HELMET_COLORS[index % HELMET_COLORS.length], number: index + 1, skill: 90, aggression: 90, consistency: 75, cornering: 80, overtaking: 90, defense: 75, risk: 90 })),
    sprites: { main: "/assets/sprites/formula-default-top.svg", lateral: "/assets/sprites/formula-default-lateral.svg", thumbnail: "/assets/sprites/formula-default-top.svg" },
    spriteScale: 1,
    lateralScale: 1,
    vehicleSpec: { ...DEFAULT_FORMULA_VEHICLE_SPEC },
    version: 2,
    official: true,
    updatedAt: new Date().toISOString(),
  };
}

export function loadCategories(): CompetitionCategory[] {
  const value = categoryRepository.load();
  return value.map((category) => ({
    ...category,
    version: 2,
    vehicleSpec: normalizeVehicleSpec(category.vehicleSpec),
    teams: category.teams.map((team) => ({ ...team, thirdColor: team.thirdColor ?? "#ffffff" })),
    drivers: category.drivers.map((driver, index) => ({ ...driver, id: typeof driver.id === "string" && driver.id ? driver.id : `driver-${index + 1}`, helmetColor: driver.helmetColor ?? HELMET_COLORS[index % HELMET_COLORS.length] })),
  }));
}

function isCategoryArray(value: unknown): value is CompetitionCategory[] {
  return Array.isArray(value) && value.every(isCategoryDocument);
}

function isCategoryDocument(value: unknown): value is CompetitionCategory {
  return isRecord(value)
    && (value.version === 1 || value.version === 2)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && Array.isArray(value.drivers)
    && value.drivers.every((driver) => isRecord(driver) && (typeof driver.id === "string" || typeof driver.id === "number") && typeof driver.name === "string" && typeof driver.code === "string" && typeof driver.teamId === "string" && typeof driver.number === "number")
    && Array.isArray(value.teams)
    && value.teams.every((team) => isRecord(team) && typeof team.id === "string" && typeof team.name === "string" && typeof team.code === "string" && typeof team.color === "string" && typeof team.accent === "string" && (team.thirdColor === undefined || typeof team.thirdColor === "string"))
    && isRecord(value.sprites)
    && typeof value.sprites.main === "string"
    && typeof value.sprites.lateral === "string";
}

export function saveCategories(categories: CompetitionCategory[]) {
  return categoryRepository.save(categories);
}

export function categoryDrivers(category: CompetitionCategory) {
  const teams = new Map(category.teams.map((team) => [team.id, team]));
  return category.drivers.map((driver) => ({ ...driver, team: teams.get(driver.teamId)?.name ?? "Independent", color: teams.get(driver.teamId)?.color ?? driver.color, accent: teams.get(driver.teamId)?.accent ?? driver.accent, thirdColor: teams.get(driver.teamId)?.thirdColor ?? "#ffffff" }));
}

function newCategory(index: number): CompetitionCategory {
  const base = createDefaultCategory();
  return { ...base, id: `custom-category-${Date.now()}`, name: `New Category ${index}`, description: "Custom GridWatch category.", official: false, updatedAt: new Date().toISOString(), teams: base.teams.map((team) => ({ ...team })), drivers: base.drivers.map((driver) => ({ ...driver })) };
}

export function validateCategory(category: CompetitionCategory) {
  const errors: string[] = [];
  if (!category.name.trim()) errors.push("The category needs a name.");
  if (!category.teams.length) errors.push("Add at least one team.");
  if (category.drivers.length < 2) errors.push("Add at least two drivers.");
  const teamCodes = new Set<string>();
  const codes = new Set<string>();
  const numbers = new Set<number>();
  const driverIds = new Set<string>();
  category.teams.forEach((team) => {
    const normalized = team.code.trim().toUpperCase();
    if (!team.name.trim()) errors.push("Every team needs a name.");
    if (!normalized) errors.push(`Team ${team.name || "unnamed"} needs a code.`);
    if (teamCodes.has(normalized)) errors.push(`Duplicate team code: ${normalized}.`);
    if (!/^#[0-9a-f]{6}$/i.test(team.color) || !/^#[0-9a-f]{6}$/i.test(team.accent) || !/^#[0-9a-f]{6}$/i.test(team.thirdColor)) errors.push(`Team ${team.name || "unnamed"} has an invalid color.`);
    teamCodes.add(normalized);
  });
  category.drivers.forEach((driver) => {
    if (!driver.id || driverIds.has(driver.id)) errors.push(`Duplicate or missing driver ID: ${driver.id || "unnamed"}.`);
    driverIds.add(driver.id);
    const normalizedCode = driver.code.trim().toUpperCase();
    if (!driver.name.trim()) errors.push("Every driver needs a name.");
    if (!/^[A-Z0-9]{2,4}$/.test(normalizedCode)) errors.push(`${driver.name || "Driver"} needs a 2–4 character code.`);
    if (codes.has(normalizedCode)) errors.push(`Duplicate code: ${normalizedCode}.`);
    codes.add(normalizedCode);
    if (!Number.isInteger(driver.number) || driver.number < 1 || driver.number > 999) errors.push(`Invalid number for ${driver.name}.`);
    if (numbers.has(driver.number)) errors.push(`Duplicate number: ${driver.number}.`);
    numbers.add(driver.number);
    if (!category.teams.some((team) => team.id === driver.teamId)) errors.push(`${driver.name} has no team.`);
    if (!/^#[0-9a-f]{6}$/i.test(driver.helmetColor)) errors.push(`Invalid helmet color for ${driver.name}.`);
    [driver.skill, driver.aggression, driver.consistency, driver.cornering, driver.overtaking, driver.defense, driver.risk].forEach((value) => { if (value < 0 || value > 100) errors.push(`Invalid attribute for ${driver.name}.`); });
  });
  errors.push(...validateVehicleSpec(category.vehicleSpec));
  return [...new Set(errors)].slice(0, 5);
}

function liveryFor(category: CompetitionCategory, driver: CompetitionDriver | undefined) {
  const team = category.teams.find((item) => item.id === driver?.teamId);
  return {
    first: team?.color ?? driver?.color ?? category.primaryColor,
    second: team?.accent ?? driver?.accent ?? category.secondaryColor,
    third: team?.thirdColor ?? "#ffffff",
    helmet: driver?.helmetColor ?? "#ff0000",
  };
}

function generatedSpriteSvg(category: CompetitionCategory, driver: CompetitionDriver | undefined, view: "main" | "lateral") {
  const { first, second, third, helmet } = liveryFor(category, driver);
  const number = driver?.number ?? "";
  if (view === "main") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160"><ellipse cx="60" cy="80" rx="27" ry="68" fill="#101718"/><path d="M60 8 78 44 72 130 60 151 48 130 42 44z" fill="${first}"/><path d="M60 14 68 52 60 112 52 52z" fill="${second}"/><path d="M43 72h34v12H43z" fill="${third}"/><circle cx="60" cy="57" r="9" fill="${helmet}"/><circle cx="39" cy="45" r="10" fill="#050707"/><circle cx="81" cy="45" r="10" fill="#050707"/><circle cx="39" cy="119" r="10" fill="#050707"/><circle cx="81" cy="119" r="10" fill="#050707"/><text x="60" y="91" text-anchor="middle" fill="#101718" font-size="14" font-family="Arial" font-weight="900">${number}</text></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 96"><path d="M18 66h52l22-21h49l30 20h52v12H18z" fill="#101718"/><path d="M26 62l56-9 18-19h41l35 18 48 4-11 15H38z" fill="${first}" stroke="#16201d" stroke-width="3"/><path d="M92 54h86l21 7H78z" fill="${second}"/><path d="M103 39c6-16 19-22 37-22 16 0 28 7 35 22h-11c-5-8-12-12-23-12-11 0-19 4-25 12z" fill="${helmet}"/><path d="M8 73h58v8H8zM190 73h62v8h-62z" fill="${third}"/><circle cx="56" cy="72" r="17" fill="#050707"/><circle cx="56" cy="72" r="10" fill="#454e50" stroke="${third}" stroke-width="3"/><circle cx="202" cy="72" r="17" fill="#050707"/><circle cx="202" cy="72" r="10" fill="#454e50" stroke="${third}" stroke-width="3"/><text x="130" y="65" text-anchor="middle" fill="#101718" font-size="17" font-family="Arial" font-weight="900">${number}</text></svg>`;
}

function CarPreview({ category, driver, view = "lateral" }: { category: CompetitionCategory; driver?: CompetitionDriver; view?: "main" | "lateral" }) {
  const gradientId = `category-car-gradient-${useId().replace(/:/g, "")}`;
  const previewScale = view === "main" ? category.spriteScale ?? 1 : category.lateralScale ?? 1;
  const { first: primary, second: secondary, third, helmet } = liveryFor(category, driver);
  const imported = category.sprites[view];
  // Imported data URLs are user-authored local assets; next/image cannot optimize them.
  // eslint-disable-next-line @next/next/no-img-element
  if (imported.startsWith("data:")) return <img className="competition-car-preview imported-sprite" style={{ transform: `scale(${previewScale})` }} src={imported} alt="Custom car sprite" />;
  return <svg className="competition-car-preview" style={{ transform: `scale(${previewScale})` }} viewBox="0 0 260 96" role="img" aria-label="Category car preview">
    <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop stopColor={secondary} /><stop offset=".35" stopColor={primary} /><stop offset="1" stopColor={primary} /></linearGradient></defs>
    <path d="M18 66h52l22-21h49l30 20h52v12H18z" fill="#101718" />
    <path d="M26 62l56-9 18-19h41l35 18 48 4-11 15H38z" fill={`url(#${gradientId})`} stroke="#16201d" strokeWidth="3" />
    <path d="M92 54h86l21 7H78z" fill={secondary} />
    <path d="M103 39c6-16 19-22 37-22 16 0 28 7 35 22h-11c-5-8-12-12-23-12-11 0-19 4-25 12z" fill={helmet} />
    <path d="M8 73h58v8H8zM190 73h62v8h-62z" fill={third} />
    {[56, 202].map((cx) => <g key={cx}><circle cx={cx} cy="72" r="17" fill="#050707" /><circle cx={cx} cy="72" r="10" fill="#454e50" stroke={third} strokeWidth="3" /></g>)}
    {driver && <text x="130" y="65" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="900">{driver.number}</text>}
  </svg>;
}

export function CompetitionEditor({ onBack, onSave }: { onBack: () => void; onSave: (category: CompetitionCategory) => void }) {
  const official = useMemo(() => createDefaultCategory(), []);
  const [categories, setCategories] = useState<CompetitionCategory[]>(() => [official]);
  const [storageReady, setStorageReady] = useState(false);
  const [selectedId, setSelectedId] = useState(official.id);
  const selected = categories.find((category) => category.id === selectedId) ?? official;
  const [draft, setDraft] = useState<CompetitionCategory>(selected);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [tab, setTab] = useState<"category" | "teams" | "drivers" | "sprites">("category");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingImport, setPendingImport] = useState<CompetitionCategory | null>(null);
  const errors = useMemo(() => validateCategory(draft), [draft]);

  useEffect(() => {
    // Restore browser-only data after hydration so SSR and client markup remain deterministic.
    const stored = loadCategories();
    const recovered = draftRepository.load();
    if (recovered && !recovered.official && window.confirm(UI_COPY.editor.competition.recoverDraft(recovered.name))) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategories([official, ...stored.filter((category) => category.id !== recovered.id), recovered]);
      setSelectedId(recovered.id);
      setMessage(UI_COPY.editor.competition.draftRecovered);
    } else {
      setCategories([official, ...stored]);
      if (recovered) draftRepository.reset();
    }
    setStorageReady(true);
  }, [official]);

  useEffect(() => {
    // The draft must follow an explicit category selection, not every draft edit.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(selected);
    setDirty(false);
    setSelectedDriverId(selected.drivers[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    if (!storageReady || !dirty || draft.official) return;
    const timeout = window.setTimeout(() => draftRepository.save(draft), 400);
    return () => window.clearTimeout(timeout);
  }, [draft, dirty, storageReady]);

  const updateDraft = (next: CompetitionCategory) => { setDraft({ ...next, updatedAt: new Date().toISOString() }); setDirty(true); };
  const updateVehicleSpec = (field: keyof Omit<VehicleSpec, "version">, value: number) => updateDraft({ ...draft, vehicleSpec: { ...draft.vehicleSpec, [field]: value } });
  const removeTeam = (team: CompetitionTeam) => {
    const remainingTeams = draft.teams.filter((item) => item.id !== team.id);
    if (!remainingTeams.length) { setMessage(UI_COPY.editor.competition.lastTeamProtected); return; }
    const fallback = remainingTeams[0];
    const affected = draft.drivers.filter((driver) => driver.teamId === team.id).length;
    const confirmation = affected > 0
      ? UI_COPY.editor.competition.removeTeamAndReassign(team.name, affected, fallback.name)
      : UI_COPY.editor.competition.removeTeam(team.name);
    if (!window.confirm(confirmation)) return;
    updateDraft({
      ...draft,
      teams: remainingTeams.map((item, index) => ({ ...item, order: index })),
      drivers: draft.drivers.map((driver) => driver.teamId === team.id ? { ...driver, teamId: fallback.id } : driver),
    });
    if (affected > 0) setMessage(UI_COPY.editor.competition.driversReassigned(affected, fallback.name));
  };
  const moveTeam = (teamId: string, offset: -1 | 1) => {
    const index = draft.teams.findIndex((team) => team.id === teamId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= draft.teams.length) return;
    const teams = [...draft.teams];
    [teams[index], teams[target]] = [teams[target], teams[index]];
    updateDraft({ ...draft, teams: teams.map((team, order) => ({ ...team, order })) });
  };
  const moveDriver = (driverId: string, offset: -1 | 1) => {
    const index = draft.drivers.findIndex((item) => item.id === driverId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= draft.drivers.length) return;
    const drivers = [...draft.drivers];
    [drivers[index], drivers[target]] = [drivers[target], drivers[index]];
    updateDraft({ ...draft, drivers });
  };
  const duplicateDriver = (source: CompetitionDriver) => {
    const usedNumbers = new Set(draft.drivers.map((item) => item.number));
    let number = source.number + 1;
    while (usedNumbers.has(number) && number <= 999) number += 1;
    if (number > 999) {
      number = 1;
      while (usedNumbers.has(number)) number += 1;
    }
    const usedCodes = new Set(draft.drivers.map((item) => item.code));
    let sequence = draft.drivers.length + 1;
    let code = `D${String(sequence).padStart(2, "0")}`;
    while (usedCodes.has(code)) { sequence += 1; code = `D${String(sequence).padStart(2, "0")}`; }
    const copy = { ...source, id: `${source.id}-copy-${Date.now()}`, name: `${source.name} Copy`, code, number };
    const index = draft.drivers.findIndex((item) => item.id === source.id);
    updateDraft({ ...draft, drivers: [...draft.drivers.slice(0, index + 1), copy, ...draft.drivers.slice(index + 1)] });
    setSelectedDriverId(copy.id);
  };
  const duplicate = () => { const copy = { ...draft, id: `custom-category-${Date.now()}`, name: `${draft.name} Copy`, official: false, teams: draft.teams.map((team) => ({ ...team, id: `${team.id}-copy` })), drivers: draft.drivers.map((driver) => ({ ...driver, teamId: `${driver.teamId}-copy` })) }; const next = [...categories, copy]; setCategories(next); setSelectedId(copy.id); saveCategories(next.filter((category) => !category.official)); setMessage(UI_COPY.editor.competition.duplicated); };
  const remove = () => { if (draft.official) { setMessage(UI_COPY.editor.competition.officialProtected); return; } const next = categories.filter((category) => category.id !== draft.id); setCategories(next); setSelectedId(official.id); saveCategories(next.filter((category) => !category.official)); setMessage(UI_COPY.editor.competition.removed); };
  const save = () => {
    if (draft.official) { setMessage(UI_COPY.editor.competition.protectedSave); return; }
    if (errors.length) { setMessage(UI_COPY.editor.competition.fixIssues); return; }
    const next = [...categories.filter((category) => category.id !== draft.id), draft];
    if (!saveCategories(next.filter((category) => !category.official))) {
      setMessage(UI_COPY.editor.competition.storageFailure);
      return;
    }
    setCategories(next);
    onSave(draft);
    setDirty(false);
    draftRepository.reset();
    setMessage(UI_COPY.editor.competition.saved);
  };
  const exportCategory = () => { const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${draft.id}.json`; anchor.click(); URL.revokeObjectURL(url); };
  const importCategory = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 2_000_000) { setMessage(UI_COPY.editor.competition.jsonTooLarge); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed: unknown = JSON.parse(String(reader.result));
        if (!isCategoryDocument(parsed)) throw new Error("schema");
        const imported = parsed;
        const next = {
          ...imported,
          id: `custom-category-${Date.now()}`,
          official: false,
          version: 2 as const,
          vehicleSpec: normalizeVehicleSpec(imported.vehicleSpec),
          teams: imported.teams.map((team, index) => ({ ...team, id: team.id || `team-imported-${index}`, thirdColor: team.thirdColor ?? "#ffffff" })),
          updatedAt: new Date().toISOString(),
        };
        const teamIds = new Set(next.teams.map((team) => team.id));
        const importedDriverIds = new Set<string>();
        next.drivers = imported.drivers.map((driver, index) => {
          const requestedId = typeof driver.id === "string" && driver.id ? driver.id : `driver-imported-${index + 1}`;
          const id = importedDriverIds.has(requestedId) ? `${requestedId}-${index + 1}` : requestedId;
          importedDriverIds.add(id);
          return { ...driver, id, teamId: teamIds.has(driver.teamId) ? driver.teamId : next.teams[0]?.id ?? "" };
        });
        setPendingImport(next);
      } catch { setMessage(UI_COPY.editor.competition.invalidJson); }
    };
    reader.readAsText(file);
  };
  const exportSprite = (view: "main" | "lateral") => {
    const source = draft.sprites[view];
    const imported = source.startsWith("data:");
    const svg = imported ? "" : generatedSpriteSvg(draft, driver, view);
    const blob = imported ? null : new Blob([svg], { type: "image/svg+xml" });
    const url = imported ? source : URL.createObjectURL(blob as Blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${draft.id}-${view === "main" ? "top" : "lateral"}-sprite.${imported && source.startsWith("data:image/png") ? "png" : imported && source.startsWith("data:image/webp") ? "webp" : "svg"}`;
    anchor.click();
    if (!imported) URL.revokeObjectURL(url);
  };

  const importSprite = (view: "main" | "lateral", event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10_000_000) { setMessage(UI_COPY.editor.competition.spriteTooLarge); event.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = async () => {
      const result = String(reader.result);
      const isSvg = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg");
      if (isSvg && !isSafeSvg(result)) { setMessage("The SVG contains unsupported or unsafe content."); return; }
      const value = file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")
        ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result)}`
        : result;
      if (!value.startsWith("data:image/")) { setMessage(UI_COPY.editor.competition.invalidSprite); return; }
      if (!await validateDecodedImage(value)) { setMessage(UI_COPY.editor.competition.spriteDimensionsInvalid); return; }
      updateDraft({ ...draft, sprites: { ...draft.sprites, [view]: value } });
      setMessage(isSvg ? UI_COPY.editor.competition.spriteMaskReport(spriteMaskReport(result)) : UI_COPY.editor.competition.importedSprite(view));
    };
    reader.onerror = () => setMessage(UI_COPY.editor.competition.spriteReadFailure);
    if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) reader.readAsText(file);
    else reader.readAsDataURL(file);
  };

  const driver = draft.drivers.find((item) => item.id === selectedDriverId);
  const leaveEditor = () => {
    if (dirty && !window.confirm(UI_COPY.editor.discardChanges)) return;
    onBack();
  };

  if (!storageReady) return <LoadingScreen title={UI_COPY.editor.competition.loading} detail={UI_COPY.editor.competition.restoring} />;

  return <main className="competition-editor-shell">
    <header className="competition-editor-header"><Brand className="brand" /><div><small>COMPETITION CREATION TOOL</small><strong>COMPETITION EDITOR</strong></div><div className="competition-editor-actions"><button onClick={leaveEditor}>← BACK</button><button onClick={duplicate}>DUPLICATE</button><button onClick={remove}>REMOVE</button><button className="primary" onClick={save} disabled={Boolean(errors.length || draft.official)}>SAVE</button></div></header>
    <div className="competition-editor-layout">
      <aside className="competition-list"><span className="editor-label">CATEGORIES</span>{categories.map((category) => <button key={category.id} className={category.id === selectedId ? "active" : ""} onClick={() => { if (dirty && !window.confirm(UI_COPY.editor.discardChanges)) return; setSelectedId(category.id); }}><strong>{category.name}</strong><small>{category.official ? UI_COPY.setup.official : UI_COPY.setup.custom} · {UI_COPY.setup.categoryDrivers(category.drivers.length)}</small></button>)}<button className="new-category" onClick={() => { const next = newCategory(categories.length); setCategories((current) => [...current, next]); setSelectedId(next.id); }}>+ NEW CATEGORY</button></aside>
      <section className="competition-editor-main"><div className="competition-tabs"><button className={tab === "category" ? "active" : ""} onClick={() => setTab("category")}>CATEGORY</button><button className={tab === "teams" ? "active" : ""} onClick={() => setTab("teams")}>TEAMS</button><button className={tab === "drivers" ? "active" : ""} onClick={() => setTab("drivers")}>DRIVERS</button><button className={tab === "sprites" ? "active" : ""} onClick={() => setTab("sprites")}>SPRITES</button></div>
        {tab === "category" && <div className="competition-form">
          <label><span>NAME</span><input value={draft.name} onChange={(event) => updateDraft({ ...draft, name: event.target.value })} /></label>
          <label><span>DESCRIPTION</span><textarea value={draft.description} onChange={(event) => updateDraft({ ...draft, description: event.target.value })} /></label>
          <label><span>MANUFACTURER / IDENTITY</span><input value={draft.manufacturer} onChange={(event) => updateDraft({ ...draft, manufacturer: event.target.value })} /></label>
          <div className="color-fields"><label><span>PRIMARY COLOR</span><input type="color" value={draft.primaryColor} onChange={(event) => updateDraft({ ...draft, primaryColor: event.target.value })} /></label><label><span>SECONDARY COLOR</span><input type="color" value={draft.secondaryColor} onChange={(event) => updateDraft({ ...draft, secondaryColor: event.target.value })} /></label></div>
          <section className="vehicle-spec-panel">
            <header><strong>{UI_COPY.editor.competition.vehiclePhysics}</strong><small>{UI_COPY.editor.competition.vehiclePhysicsDescription}</small></header>
            <div>
              <label><span>{UI_COPY.editor.competition.mass}</span><input type="number" min="300" max="3000" step="1" value={draft.vehicleSpec.massKg} onChange={(event) => updateVehicleSpec("massKg", Number(event.target.value))} /></label>
              <label><span>{UI_COPY.editor.competition.engineForce}</span><input type="number" min="2000" max="40000" step="100" value={draft.vehicleSpec.maxEngineForceNewtons} onChange={(event) => updateVehicleSpec("maxEngineForceNewtons", Number(event.target.value))} /></label>
              <label><span>{UI_COPY.editor.competition.brakeForce}</span><input type="number" min="5000" max="80000" step="100" value={draft.vehicleSpec.maxBrakeForceNewtons} onChange={(event) => updateVehicleSpec("maxBrakeForceNewtons", Number(event.target.value))} /></label>
              <label><span>{UI_COPY.editor.competition.tireGrip}</span><input type="number" min=".45" max="2.5" step=".01" value={draft.vehicleSpec.tireGrip} onChange={(event) => updateVehicleSpec("tireGrip", Number(event.target.value))} /></label>
              <label><span>{UI_COPY.editor.competition.downforce}</span><input type="number" min="0" max="4" step=".05" value={draft.vehicleSpec.downforceCoefficient} onChange={(event) => updateVehicleSpec("downforceCoefficient", Number(event.target.value))} /></label>
              <label><span>{UI_COPY.editor.competition.steeringLock}</span><input type="number" min="8" max="45" step="1" value={draft.vehicleSpec.maxSteeringDegrees} onChange={(event) => updateVehicleSpec("maxSteeringDegrees", Number(event.target.value))} /></label>
            </div>
          </section>
          <p className="editor-info">Category {draft.official ? "official and protected" : "custom"}. To modify an official category, use DUPLICATE.</p>
        </div>}
        {tab === "teams" && <div className="team-grid"><div className="team-grid-head"><span>TEAM</span><span>CODE</span><span>BLUE</span><span>GREEN</span><span>WHITE</span><span>ORDER</span></div>{draft.teams.map((team, index) => <article key={team.id}><input aria-label={UI_COPY.editor.competition.teamName(team.name)} value={team.name} onChange={(event) => updateDraft({ ...draft, teams: draft.teams.map((item) => item.id === team.id ? { ...item, name: event.target.value } : item) })} /><input aria-label={UI_COPY.editor.competition.teamCode(team.name)} value={team.code} maxLength={4} onChange={(event) => updateDraft({ ...draft, teams: draft.teams.map((item) => item.id === team.id ? { ...item, code: event.target.value.toUpperCase() } : item) })} /><input aria-label={UI_COPY.editor.competition.blueColor(team.name)} type="color" value={team.color} onChange={(event) => updateDraft({ ...draft, teams: draft.teams.map((item) => item.id === team.id ? { ...item, color: event.target.value } : item) })} /><input aria-label={UI_COPY.editor.competition.greenColor(team.name)} type="color" value={team.accent} onChange={(event) => updateDraft({ ...draft, teams: draft.teams.map((item) => item.id === team.id ? { ...item, accent: event.target.value } : item) })} /><input aria-label={UI_COPY.editor.competition.thirdColor(team.name)} type="color" value={team.thirdColor} onChange={(event) => updateDraft({ ...draft, teams: draft.teams.map((item) => item.id === team.id ? { ...item, thirdColor: event.target.value } : item) })} /><span className="team-row-actions"><button aria-label={`${UI_COPY.editor.competition.moveUp} ${team.name}`} disabled={index === 0} onClick={() => moveTeam(team.id, -1)}>↑</button><button aria-label={`${UI_COPY.editor.competition.moveDown} ${team.name}`} disabled={index === draft.teams.length - 1} onClick={() => moveTeam(team.id, 1)}>↓</button><button aria-label={UI_COPY.editor.competition.removeTeamLabel(team.name)} onClick={() => removeTeam(team)}>×</button></span></article>)}<button className="add-row" onClick={() => updateDraft({ ...draft, teams: [...draft.teams, { id: `team-${Date.now()}`, name: "New Team", code: "NEW", color: draft.primaryColor, accent: draft.secondaryColor, thirdColor: "#ffffff", order: draft.teams.length }] })}>+ ADD TEAM</button></div>}
        {tab === "drivers" && <DriverEditor category={draft} selectedId={selectedDriverId} onSelect={setSelectedDriverId} onChange={updateDraft} onDuplicate={duplicateDriver} onMove={moveDriver} />}
        {tab === "sprites" && <div className="sprite-editor"><div className="sprite-controls"><span className="editor-label">VISUAL LIBRARY</span><p>Use the category and team colors to generate vector sprites compatible with the circuit and Live Timing.</p><span className="sprite-subheading">LIVERY PRESETS</span><div className="sprite-presets">{SPRITE_PRESETS.map((preset) => <button key={preset.id} className={draft.sprites.lateral === preset.lateral ? "active" : ""} onClick={() => updateDraft({ ...draft, sprites: { ...draft.sprites, main: preset.main, lateral: preset.lateral, thumbnail: preset.main } })}><i style={{ background: preset.color }} />{preset.label}</button>)}</div><label><span>BODY SCALE · {Math.round((draft.spriteScale ?? 1) * 100)}%</span><input type="range" min=".8" max="1.2" step=".01" value={draft.spriteScale ?? 1} onChange={(event) => updateDraft({ ...draft, spriteScale: Number(event.target.value) })} /></label><label><span>LIVE TIMING SCALE · {Math.round((draft.lateralScale ?? 1) * 100)}%</span><input type="range" min=".7" max="1.2" step=".01" value={draft.lateralScale ?? 1} onChange={(event) => updateDraft({ ...draft, lateralScale: Number(event.target.value) })} /></label><button onClick={exportCategory}>EXPORT JSON</button><label className="import-button">IMPORT JSON<input type="file" accept="application/json" onChange={importCategory} /></label></div><div className="sprite-previews"><div><span className="sprite-preview-label">TOP VIEW</span><CarPreview category={draft} driver={driver} view="main" /></div><div><span className="sprite-preview-label">LIVE TIMING</span><CarPreview category={draft} driver={driver} view="lateral" /></div></div></div>}
        {tab === "sprites" && <div className="sprite-transfer-panel"><div><strong>TOP SPRITE · CIRCUIT</strong><small>{draft.sprites.main.startsWith("data:") ? "Custom" : "Generated from the category"}</small><button onClick={() => exportSprite("main")}>EXPORT SPRITE</button><label className="import-button">IMPORT SPRITE<input type="file" accept="image/svg+xml,image/png,image/webp" onChange={(event) => importSprite("main", event)} /></label></div><div><strong>LATERAL SPRITE · LIVE TIMING</strong><small>{draft.sprites.lateral.startsWith("data:") ? "Custom" : "Generated from the category"}</small><button onClick={() => exportSprite("lateral")}>EXPORT SPRITE</button><label className="import-button">IMPORT SPRITE<input type="file" accept="image/svg+xml,image/png,image/webp" onChange={(event) => importSprite("lateral", event)} /></label></div></div>}
      </section>
      <aside className="competition-preview"><span className="editor-label">PREVIEW</span><CarPreview category={draft} driver={driver} /><strong>{driver?.name ?? draft.name}</strong><small>{driver ? `${driver.code} · #${driver.number}` : draft.manufacturer}</small><div className="live-row-preview"><span>01</span><CarPreview category={draft} driver={driver} /><strong>{driver?.code ?? "SAI"}<small>{driver?.name ?? "Driver"}</small></strong><b>LEADER</b></div><div className={`category-validation ${errors.length ? "invalid" : "valid"}`}><strong>{errors.length ? "FIX BEFORE SAVING" : "CATEGORY VALID"}</strong>{errors.map((error) => <span key={error}>{error}</span>)}</div>{dirty && <small className="editor-dirty">● UNSAVED CHANGES</small>}{message && <p className="editor-message">{message}</p>}</aside>
    </div>
    {pendingImport && <Dialog title={UI_COPY.editor.competition.importPreview} onClose={() => setPendingImport(null)} actions={<><button onClick={() => setPendingImport(null)}>{UI_COPY.editor.competition.cancelImport}</button><button className="primary" onClick={() => { const next = [...categories, pendingImport]; setCategories(next); saveCategories(next.filter((category) => !category.official)); setSelectedId(pendingImport.id); setPendingImport(null); setMessage(UI_COPY.editor.competition.imported); }}>{UI_COPY.editor.competition.confirmImport}</button></>}><h2>{pendingImport.name}</h2><p>{pendingImport.teams.length} teams · {pendingImport.drivers.length} drivers · {pendingImport.vehicleSpec.massKg} kg</p></Dialog>}
  </main>;
}
