export type GamePhase =
  | "booting"
  | "menu"
  | "raceSetup"
  | "championshipSetup"
  | "preRace"
  | "countdown"
  | "racing"
  | "paused"
  | "winnerPresentation"
  | "raceResults"
  | "championshipStandings"
  | "championshipResults";

export type GameMode = "single" | "championship";

export type GameSessionState = {
  phase: GamePhase;
  mode: GameMode | null;
  round: number;
  totalRounds: number;
  autoplay: boolean;
  autoplayPaused: boolean;
};

export type GameEvent =
  | { type: "BOOT_COMPLETED" }
  | { type: "OPEN_RACE_SETUP" }
  | { type: "OPEN_CHAMPIONSHIP_SETUP" }
  | { type: "SINGLE_RACE_CREATED" }
  | { type: "CHAMPIONSHIP_CREATED"; totalRounds: number; autoplay: boolean }
  | { type: "RACE_STARTED" }
  | { type: "COUNTDOWN_COMPLETED" }
  | { type: "RACE_PAUSED" }
  | { type: "RACE_RESUMED" }
  | { type: "RACE_FINISHED" }
  | { type: "WINNER_PRESENTATION_EXPIRED" }
  | { type: "RESULTS_EXPIRED" }
  | { type: "STANDINGS_EXPIRED" }
  | { type: "NEXT_ROUND_REQUESTED" }
  | { type: "AUTOPLAY_PAUSED" }
  | { type: "AUTOPLAY_RESUMED" }
  | { type: "SESSION_ABORTED" };

export const INITIAL_GAME_SESSION: Readonly<GameSessionState> = Object.freeze({
  phase: "booting",
  mode: null,
  round: 0,
  totalRounds: 0,
  autoplay: false,
  autoplayPaused: false,
});

const requirePhase = (state: GameSessionState, event: GameEvent, allowed: GamePhase[]) => {
  if (!allowed.includes(state.phase)) throw new Error(`Event ${event.type} is invalid during ${state.phase}.`);
};

/** The authoritative, UI-independent lifecycle for single races and championships. */
export function reduceGameSession(state: GameSessionState, event: GameEvent): GameSessionState {
  if (event.type === "SESSION_ABORTED") return { ...INITIAL_GAME_SESSION, phase: "menu" };
  if (event.type === "BOOT_COMPLETED") {
    requirePhase(state, event, ["booting"]);
    return { ...state, phase: "menu" };
  }
  if (event.type === "OPEN_RACE_SETUP") {
    requirePhase(state, event, ["menu"]);
    return { ...state, phase: "raceSetup" };
  }
  if (event.type === "OPEN_CHAMPIONSHIP_SETUP") {
    requirePhase(state, event, ["menu"]);
    return { ...state, phase: "championshipSetup" };
  }
  if (event.type === "SINGLE_RACE_CREATED") {
    requirePhase(state, event, ["raceSetup"]);
    return { ...state, phase: "preRace", mode: "single", round: 1, totalRounds: 1, autoplay: false, autoplayPaused: false };
  }
  if (event.type === "CHAMPIONSHIP_CREATED") {
    requirePhase(state, event, ["championshipSetup", "menu"]);
    const totalRounds = Math.max(2, Math.round(event.totalRounds));
    return { ...state, phase: "preRace", mode: "championship", round: 1, totalRounds, autoplay: event.autoplay, autoplayPaused: false };
  }
  if (event.type === "RACE_STARTED") {
    requirePhase(state, event, ["preRace"]);
    return { ...state, phase: "countdown" };
  }
  if (event.type === "COUNTDOWN_COMPLETED") {
    requirePhase(state, event, ["countdown"]);
    return { ...state, phase: "racing" };
  }
  if (event.type === "RACE_PAUSED") {
    requirePhase(state, event, ["racing"]);
    return { ...state, phase: "paused" };
  }
  if (event.type === "RACE_RESUMED") {
    requirePhase(state, event, ["paused"]);
    return { ...state, phase: "racing" };
  }
  if (event.type === "RACE_FINISHED") {
    requirePhase(state, event, ["racing"]);
    return { ...state, phase: "winnerPresentation" };
  }
  if (event.type === "WINNER_PRESENTATION_EXPIRED") {
    requirePhase(state, event, ["winnerPresentation"]);
    return { ...state, phase: "raceResults" };
  }
  if (event.type === "RESULTS_EXPIRED") {
    requirePhase(state, event, ["raceResults"]);
    if (state.mode !== "championship") return { ...INITIAL_GAME_SESSION, phase: "menu" };
    return { ...state, phase: state.round >= state.totalRounds ? "championshipResults" : "championshipStandings" };
  }
  if (event.type === "STANDINGS_EXPIRED" || event.type === "NEXT_ROUND_REQUESTED") {
    requirePhase(state, event, ["championshipStandings"]);
    if (state.round >= state.totalRounds) return { ...state, phase: "championshipResults" };
    return { ...state, phase: "preRace", round: state.round + 1 };
  }
  if (event.type === "AUTOPLAY_PAUSED") {
    if (!state.autoplay) throw new Error("Manual championships cannot pause autoplay.");
    return { ...state, autoplayPaused: true };
  }
  if (event.type === "AUTOPLAY_RESUMED") {
    if (!state.autoplay) throw new Error("Manual championships cannot resume autoplay.");
    return { ...state, autoplayPaused: false };
  }
  return state;
}
