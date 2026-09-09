import type { ReactNode } from "react";
import type { ChampionshipStanding } from "../race/RaceResultsOverlay";
import { UI_COPY } from "../ui-copy";
import { Brand } from "../ui/brand";

type ChampionshipResultsProps = {
  standings: ChampionshipStanding[];
  rounds: number;
  championPreview?: ReactNode;
  onMenu: () => void;
  onNewChampionship: () => void;
};

export function ChampionshipResults({ standings, rounds, championPreview, onMenu, onNewChampionship }: ChampionshipResultsProps) {
  const champion = standings[0];
  return <main className="menu-shell results-screen"><div className="menu-grid" aria-hidden="true" /><Brand className="menu-brand" /><section className="results-card"><div className="champion-copy"><span className="menu-kicker">{UI_COPY.results.championshipComplete}</span><h1>{champion?.driver.name}</h1><p>{champion ? UI_COPY.results.championSummary(champion.points, rounds) : ""}</p>{championPreview}</div><div className="season-table" role="table" aria-label={UI_COPY.championship.standingsLabel}>{standings.map(({ driver, points }, index) => <div key={driver.id} role="row" className={index === 0 ? "champion-row" : ""}><span>{String(index + 1).padStart(2, "0")}</span><i style={{ background: driver.color }} /><strong>{driver.code}<small>{driver.name}</small></strong><b>{points} {UI_COPY.championship.pointsShort}</b></div>)}</div><div className="results-actions"><button className="ghost-action" onClick={onMenu}>{UI_COPY.navigation.mainMenu}</button><button className="confirm-action" onClick={onNewChampionship}>{UI_COPY.results.newChampionship} <span>→</span></button></div></section></main>;
}
