import type { ChampionshipSession } from "../domain/championship-session";
import { UI_COPY } from "../ui-copy";
import { Brand } from "../ui/brand";

type MainMenuProps = {
  savedSession: ChampionshipSession | null;
  circuitCount: number;
  driverCount: number;
  onSingleRace: () => void;
  onSettings: () => void;
  onChampionship: () => void;
  onResumeChampionship: () => void;
  onDiscardChampionship: () => void;
};

export function MainMenu({ savedSession, circuitCount, driverCount, onSingleRace, onSettings, onChampionship, onResumeChampionship, onDiscardChampionship }: MainMenuProps) {
  return (
    <main className="menu-shell">
      <div className="menu-grid" aria-hidden="true" />
      <Brand className="menu-brand" />
      <section className="menu-hero">
        <span className="menu-kicker">{UI_COPY.menu.simulator}</span>
        <h1>{UI_COPY.menu.titleLead}<br /><em>{UI_COPY.menu.titleAccent}</em></h1>
        <p>{UI_COPY.menu.chooseRaceDescription}</p>
        {savedSession && (
          <aside className="championship-recovery" aria-live="polite">
            <strong>{UI_COPY.championship.recoveryTitle}</strong>
            <span>{UI_COPY.championship.recoveryDescription(savedSession.completedRounds, savedSession.scheduleTrackIds.length)}</span>
            <div>
              <button className="confirm-action" onClick={onResumeChampionship}>{UI_COPY.championship.resumeChampionship}</button>
              <button className="ghost-action" onClick={onDiscardChampionship}>{UI_COPY.championship.discardSession}</button>
            </div>
          </aside>
        )}
        <div className="mode-options main-options">
          <button onClick={onSingleRace} disabled={circuitCount < 1} aria-disabled={circuitCount < 1}>
            <small>01 · {UI_COPY.menu.quickEvent}</small>
            <strong>{UI_COPY.menu.singleRace}</strong>
            <span>{UI_COPY.menu.singleRaceDescription}</span>
            <b>{UI_COPY.navigation.start} <i>→</i></b>
          </button>
          <button onClick={onSettings}>
            <small>03 · {UI_COPY.menu.system}</small>
            <strong>{UI_COPY.menu.settings}</strong>
            <span>{UI_COPY.menu.settingsDescription}</span>
            <b>{UI_COPY.navigation.openSettings} <i>→</i></b>
          </button>
          <button onClick={onChampionship} disabled={circuitCount < 2} aria-disabled={circuitCount < 2}>
            <small>02 · {UI_COPY.menu.season}</small>
            <strong>{UI_COPY.menu.championship}</strong>
            <span>{UI_COPY.menu.championshipDescription}</span>
            <b>{UI_COPY.navigation.configure} <i>→</i></b>
          </button>
        </div>
        {circuitCount === 0 && <p className="empty-circuit-notice" role="status">Create and save a valid circuit in Settings → Circuit Editor before starting a race.</p>}
        {circuitCount === 1 && <p className="empty-circuit-notice" role="status">Create one more valid circuit to unlock Championship mode.</p>}
      </section>
      <footer className="menu-footer">
        <span>{circuitCount} {UI_COPY.menu.circuits}</span><span>{driverCount} {UI_COPY.menu.aiDrivers}</span><span>{UI_COPY.menu.fixedCamera}</span>
      </footer>
    </main>
  );
}
