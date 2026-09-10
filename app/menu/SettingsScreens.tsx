import { UI_COPY } from "../ui-copy";
import { Brand } from "../ui/brand";
import { SegmentedControl } from "../ui/segmented-control";

export type SettingsSection = "race" | "audio" | "appearance";
export type GameTheme = "dark" | "light";

type SettingsHubProps = {
  onOpen: (section: SettingsSection | "track-editor" | "competition-editor") => void;
  onBack: () => void;
};

export function SettingsHub({ onOpen, onBack }: SettingsHubProps) {
  const options = [
    ["race", "01", UI_COPY.settings.raceControl, UI_COPY.settings.raceSettings, UI_COPY.settings.raceDescription, UI_COPY.navigation.configure],
    ["audio", "02", UI_COPY.settings.soundSystem, UI_COPY.settings.audio, UI_COPY.settings.audioDescription, UI_COPY.navigation.configure],
    ["appearance", "03", UI_COPY.settings.appearance, UI_COPY.settings.theme, UI_COPY.settings.themeDescription, UI_COPY.navigation.configure],
    ["track-editor", "04", UI_COPY.settings.trackCreationTool, UI_COPY.settings.trackEditor, UI_COPY.settings.trackEditorDescription, UI_COPY.navigation.openEditor],
    ["competition-editor", "05", UI_COPY.settings.competitionCreationTool, UI_COPY.settings.competitionEditor, UI_COPY.settings.competitionEditorDescription, UI_COPY.navigation.openEditor],
  ] as const;
  return (
    <main className="menu-shell settings-screen">
      <div className="menu-grid" aria-hidden="true" />
      <Brand className="menu-brand" />
      <section className="menu-hero">
        <span className="menu-kicker">{UI_COPY.settings.kicker}</span>
        <h1>{UI_COPY.settings.titleLead}<br /><em>{UI_COPY.settings.titleAccent}</em></h1>
        <p>{UI_COPY.settings.description}</p>
        <div className="mode-options settings-options">
          {options.map(([section, number, kicker, title, description, action]) => (
            <button key={section} onClick={() => onOpen(section)}>
              <small>{number} · {kicker}</small><strong>{title}</strong><span>{description}</span><b>{action} <i>→</i></b>
            </button>
          ))}
        </div>
        <div className="menu-actions settings-back"><button className="ghost-action" onClick={onBack}>← {UI_COPY.navigation.mainMenu}</button></div>
      </section>
    </main>
  );
}

type SettingsDetailProps = {
  section: SettingsSection;
  totalLaps: number;
  gridSize: number;
  theme: GameTheme;
  soundOn: boolean;
  onLapsChange: (value: number) => void;
  onGridChange: (value: number) => void;
  onThemeChange: (value: GameTheme) => void;
  onToggleSound: () => void;
  onBack: () => void;
};

export function SettingsDetail({ section, totalLaps, gridSize, theme, soundOn, onLapsChange, onGridChange, onThemeChange, onToggleSound, onBack }: SettingsDetailProps) {
  const isRace = section === "race";
  const isAppearance = section === "appearance";
  const title = isRace ? UI_COPY.settings.raceTitle : isAppearance ? UI_COPY.settings.appearanceTitle : UI_COPY.settings.audioTitle;
  const description = isRace ? UI_COPY.settings.raceDefaultsDescription : isAppearance ? UI_COPY.settings.appearanceFullDescription : UI_COPY.settings.audioFullDescription;
  const kicker = isRace ? UI_COPY.settings.raceControl : isAppearance ? UI_COPY.settings.appearance : UI_COPY.settings.soundSystem;
  return (
    <main className="menu-shell settings-screen">
      <div className="menu-grid" aria-hidden="true" />
      <Brand className="menu-brand" />
      <section className="settings-card">
        <div className="setup-copy">
          <span className="menu-kicker">{kicker}</span>
          <h1>{title.lead}<br /><em>{title.accent}</em></h1>
          <p>{description}</p>
          {isRace ? (
            <div className="menu-fields settings-fields">
              <label><span>{UI_COPY.settings.defaultLaps}</span><select value={totalLaps} onChange={(event) => onLapsChange(Number(event.target.value))}>{[3, 6, 9, 12].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label><span>{UI_COPY.settings.defaultGrid}</span><select value={gridSize} onChange={(event) => onGridChange(Number(event.target.value))}>{[8, 10, 12, 16].map((value) => <option key={value} value={value}>{UI_COPY.setup.carCount(value)}</option>)}</select></label>
            </div>
          ) : isAppearance ? (
            <SegmentedControl className="theme-choice-card" label={UI_COPY.settings.colorTheme} value={theme} onChange={onThemeChange} options={[{ value: "dark", label: UI_COPY.settings.dark, description: UI_COPY.settings.darkDescription }, { value: "light", label: UI_COPY.settings.light, description: UI_COPY.settings.lightDescription }]} />
          ) : (
            <div className="audio-status-card"><span>{UI_COPY.settings.audioStatus}</span><strong>{soundOn ? UI_COPY.settings.enabled : UI_COPY.settings.disabled}</strong><button className="confirm-action" onClick={onToggleSound}>{soundOn ? UI_COPY.settings.disableAudio : UI_COPY.settings.enableAudio}<span>→</span></button></div>
          )}
          <div className="menu-actions"><button className="ghost-action" onClick={onBack}>← {UI_COPY.navigation.settings}</button></div>
        </div>
        <div className="settings-visual" aria-hidden="true"><span>{isRace ? UI_COPY.settings.raceShort : isAppearance ? UI_COPY.settings.themeShort : UI_COPY.settings.audioShort}</span><strong>{isRace ? String(totalLaps).padStart(2, "0") : isAppearance ? theme.toUpperCase() : soundOn ? "ON" : "OFF"}</strong></div>
      </section>
    </main>
  );
}
