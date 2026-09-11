import { UI_COPY } from "../ui-copy";
import { Brand } from "../ui/brand";
import { SegmentedControl } from "../ui/segmented-control";

export type SettingsSection = "audio" | "appearance";
export type GameTheme = "dark" | "light";

type SettingsHubProps = {
  onOpen: (section: SettingsSection | "track-editor" | "competition-editor") => void;
  onBack: () => void;
};

export function SettingsHub({ onOpen, onBack }: SettingsHubProps) {
  const options = [
    ["audio", "01", UI_COPY.settings.soundSystem, UI_COPY.settings.audio, UI_COPY.settings.audioDescription, UI_COPY.navigation.configure],
    ["appearance", "02", UI_COPY.settings.appearance, UI_COPY.settings.theme, UI_COPY.settings.themeDescription, UI_COPY.navigation.configure],
    ["track-editor", "03", UI_COPY.settings.trackCreationTool, UI_COPY.settings.trackEditor, UI_COPY.settings.trackEditorDescription, UI_COPY.navigation.openEditor],
    ["competition-editor", "04", UI_COPY.settings.competitionCreationTool, UI_COPY.settings.competitionEditor, UI_COPY.settings.competitionEditorDescription, UI_COPY.navigation.openEditor],
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
  theme: GameTheme;
  soundOn: boolean;
  onThemeChange: (value: GameTheme) => void;
  onToggleSound: () => void;
  onBack: () => void;
};

export function SettingsDetail({ section, theme, soundOn, onThemeChange, onToggleSound, onBack }: SettingsDetailProps) {
  const isAppearance = section === "appearance";
  const title = isAppearance ? UI_COPY.settings.appearanceTitle : UI_COPY.settings.audioTitle;
  const description = isAppearance ? UI_COPY.settings.appearanceFullDescription : UI_COPY.settings.audioFullDescription;
  const kicker = isAppearance ? UI_COPY.settings.appearance : UI_COPY.settings.soundSystem;
  return (
    <main className="menu-shell settings-screen">
      <div className="menu-grid" aria-hidden="true" />
      <Brand className="menu-brand" />
      <section className="settings-card">
        <div className="setup-copy">
          <span className="menu-kicker">{kicker}</span>
          <h1>{title.lead}<br /><em>{title.accent}</em></h1>
          <p>{description}</p>
          {isAppearance ? (
            <SegmentedControl className="theme-choice-card" label={UI_COPY.settings.colorTheme} value={theme} onChange={onThemeChange} options={[{ value: "dark", label: UI_COPY.settings.dark, description: UI_COPY.settings.darkDescription }, { value: "light", label: UI_COPY.settings.light, description: UI_COPY.settings.lightDescription }]} />
          ) : (
            <div className="audio-status-card"><span>{UI_COPY.settings.audioStatus}</span><strong>{soundOn ? UI_COPY.settings.enabled : UI_COPY.settings.disabled}</strong><button className="confirm-action" onClick={onToggleSound}>{soundOn ? UI_COPY.settings.disableAudio : UI_COPY.settings.enableAudio}<span>→</span></button></div>
          )}
          <div className="menu-actions"><button className="ghost-action" onClick={onBack}>← {UI_COPY.navigation.settings}</button></div>
        </div>
        <div className="settings-visual" aria-hidden="true"><span>{isAppearance ? UI_COPY.settings.themeShort : UI_COPY.settings.audioShort}</span><strong>{isAppearance ? theme.toUpperCase() : soundOn ? "ON" : "OFF"}</strong></div>
      </section>
    </main>
  );
}
