import type { ReactNode } from "react";
import { UI_COPY } from "../ui-copy";

export type TimingDriver = { id: string | number; code: string; name: string; color: string };
export type TimingEntry = { id: string; mechanical: "running" | "failing" | "retired"; gap: string; points?: number; compound?: string; tireWear?: number; fuelLiters?: number; pitService?: string };

type LiveTimingProps = {
  currentLap: number;
  entries: TimingEntry[];
  drivers: Map<string, TimingDriver>;
  championship: boolean;
  renderCar: (driver: TimingDriver) => ReactNode;
};

export function LiveTiming({ currentLap, entries, drivers, championship, renderCar }: LiveTimingProps) {
  return <aside className="race-panel">
    <div className="panel-head"><div><span className="section-label">{UI_COPY.race.liveTiming}</span><h1>{UI_COPY.race.raceOrder}</h1></div><span className="lap-pill">L{currentLap}</span></div>
    <div className="leaderboard" role="table" aria-label={UI_COPY.race.leaderboard}>
      <div className="leaderboard-header" role="row"><span>{UI_COPY.race.position}</span><span className="color-column-label" aria-label={UI_COPY.race.teamColor} /><span className="car-column-label">{UI_COPY.race.car}</span><span>{UI_COPY.race.driver}</span><span>{UI_COPY.race.gap}</span></div>
      <div className="leaderboard-scroll">{entries.map((entry, index) => {
        const driver = drivers.get(entry.id);
        if (!driver) return null;
        return <div className={`driver-row ${index === 0 ? "first" : ""} ${entry.mechanical}`} role="row" key={entry.id}>
          <span className="position">{String(index + 1).padStart(2, "0")}</span><i className="team-color-bar" style={{ background: driver.color }} />
          <span className="timing-car">{renderCar(driver)}</span>
          <span className="driver-info"><span><strong>{driver.code}</strong><small>{driver.name}{championship ? ` · ${entry.points ?? 0} pts` : ""}</small><small className="strategy-meta">{entry.compound ? `${entry.compound.toUpperCase()} · ${Math.round((entry.tireWear ?? 0) * 100)}% wear · ${Math.round(entry.fuelLiters ?? 0)} L` : ""}{entry.pitService && entry.pitService !== "on-track" ? ` · ${entry.pitService.toUpperCase()}` : ""}</small></span></span>
          <span className="gap">{entry.mechanical === "retired" ? <em className="dnf">DNF</em> : entry.mechanical === "failing" ? <em className="issue">ISSUE</em> : entry.gap}</span>
        </div>;
      })}</div>
    </div>
  </aside>;
}
