import type { RaceResultSnapshot } from "../race-results";
import { UI_COPY } from "../ui-copy";

export type ChampionshipStanding = {
  driver: { id: string | number; code: string; name: string; color: string };
  points: number;
  wins: number;
  bestResult: number | null;
};

const formatTime = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;
};

type RaceResultsOverlayProps = {
  result: RaceResultSnapshot;
  championshipRounds: number;
  autoplay: boolean;
  autoplayPaused: boolean;
  onToggleAutoplay: () => void;
  onContinue: () => void;
  onMenu: () => void;
};

export function RaceResultsOverlay({ result, championshipRounds, autoplay, autoplayPaused, onToggleAutoplay, onContinue, onMenu }: RaceResultsOverlayProps) {
  const winner = result.entries.find((entry) => entry.position === 1);
  const championship = result.mode === "championship";
  const finalRound = championship && result.round >= championshipRounds;
  return (
    <div className="race-results-overlay" role="dialog" aria-modal="true" aria-label={UI_COPY.results.raceResults}>
      <section className="race-results-card">
        <header><div><span>{UI_COPY.results.officialRaceResult}</span><h2>{winner?.name ?? UI_COPY.results.raceComplete}</h2><p>{winner?.team ?? result.trackName} · {result.trackName}</p></div><div className="result-winner-time"><span>{UI_COPY.race.raceTime}</span><strong>{formatTime(result.winnerTime)}</strong></div></header>
        <div className="race-results-meta"><span>{result.categoryName}</span><span>{championship ? UI_COPY.championship.roundLabel(result.round) : UI_COPY.setup.singleRace}</span><span>{UI_COPY.results.bestLapLabel(formatTime(result.bestLap))}</span></div>
        <div className="race-results-table" role="table" aria-label={UI_COPY.results.finalClassification}>
          <div className="race-results-head" role="row"><span>{UI_COPY.race.position}</span><span /><span>{UI_COPY.race.driver}</span><span>{UI_COPY.results.timeGap}</span><span>{UI_COPY.results.best}</span></div>
          <div className="race-results-scroll">{result.entries.map((entry) => <div key={entry.id} role="row" className={entry.position === 1 ? "winner" : entry.status}><span>{entry.position === null ? "DNF" : String(entry.position).padStart(2, "0")}</span><i style={{ background: entry.color }} /><strong>{entry.code}<small>{entry.name} · {entry.team}</small></strong><b>{entry.status === "retired" ? "DNF" : entry.position === 1 ? formatTime(entry.finishTime) : `+${(entry.gapSeconds ?? 0).toFixed(3)}`}</b><em>{formatTime(entry.bestLap)}</em></div>)}</div>
        </div>
        <footer><span>{championship ? autoplay ? UI_COPY.championship.autoBroadcastActive : UI_COPY.championship.standingsAfterResult : UI_COPY.results.finishGapNote}</span><div>{!championship && <button onClick={onMenu}>{UI_COPY.navigation.menu}</button>}{championship && autoplay && <button onClick={onToggleAutoplay}>{autoplayPaused ? UI_COPY.championship.resumeBroadcast : UI_COPY.championship.pauseBroadcast}</button>}<button className="primary" autoFocus onClick={onContinue}>{championship && autoplay ? UI_COPY.championship.skipPresentation : championship ? finalRound ? UI_COPY.championship.viewResults : UI_COPY.championship.viewStandings : UI_COPY.race.nextRace}</button></div></footer>
      </section>
    </div>
  );
}

type ChampionshipStandingsOverlayProps = {
  standings: ChampionshipStanding[];
  round: number;
  totalRounds: number;
  trackName: string;
  categoryName: string;
  autoplay: boolean;
  autoplayPaused: boolean;
  onToggleAutoplay: () => void;
  onNextRace: () => void;
};

export function ChampionshipStandingsOverlay({ standings, round, totalRounds, trackName, categoryName, autoplay, autoplayPaused, onToggleAutoplay, onNextRace }: ChampionshipStandingsOverlayProps) {
  return (
    <div className="race-results-overlay championship-standings-overlay"><section className="race-results-card championship-standings-card" role="dialog" aria-modal="true" aria-label={UI_COPY.championship.partialStandingsLabel}>
      <header><div><span>{UI_COPY.championship.roundLabel(round)}</span><h2>{UI_COPY.championship.partialStandings}</h2><p>{trackName} · {categoryName}</p></div><div className="result-winner-time"><span>{UI_COPY.race.leader}</span><strong>{standings[0]?.driver.code ?? "—"}</strong></div></header>
      <div className="race-results-meta"><span>{UI_COPY.championship.roundComplete(round)}</span><span>{UI_COPY.championship.roundsRemaining(totalRounds - round)}</span><span>{UI_COPY.championship.tiebreak}</span></div>
      <div className="race-results-table" role="table" aria-label={UI_COPY.championship.currentStandings}><div className="race-results-head" role="row"><span>{UI_COPY.race.position}</span><span /><span>{UI_COPY.race.driver}</span><span>{UI_COPY.championship.pointsShort}</span><span>{UI_COPY.championship.winsShort}</span><span>{UI_COPY.results.best}</span></div><div className="race-results-scroll">{standings.map(({ driver, points, wins, bestResult }, index) => <div key={driver.id} role="row" className={index === 0 ? "winner" : ""}><span>{String(index + 1).padStart(2, "0")}</span><i style={{ background: driver.color }} /><strong>{driver.code}<small>{driver.name}</small></strong><b>{points}</b><b>{wins}</b><em>{bestResult === null ? "—" : `P${bestResult}`}</em></div>)}</div></div>
      <footer><span>{autoplay ? UI_COPY.championship.standingsAutoAdvance : UI_COPY.championship.standingsManualAdvance}</span><div>{autoplay && <button onClick={onToggleAutoplay}>{autoplayPaused ? UI_COPY.championship.resumeBroadcast : UI_COPY.championship.pauseBroadcast}</button>}<button className="primary" autoFocus onClick={onNextRace}>{autoplay ? UI_COPY.championship.nextRoundNow : UI_COPY.race.nextRace}</button></div></footer>
    </section></div>
  );
}
