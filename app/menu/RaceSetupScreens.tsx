import type { ChampionshipPlaybackMode } from "../championship/autoplay-director";
import type { CompetitionCategory } from "../competition-editor";
import { buildTrackGeometry } from "../track-creator/domain/track/geometry";
import type { RaceTrack } from "../track-creator/race-library";
import { UI_COPY } from "../ui-copy";
import { Brand } from "../ui/brand";
import { SegmentedControl } from "../ui/segmented-control";

const LAP_OPTIONS = [3, 6, 9, 12];

export function TrackPreview({ track, compact = false }: { track?: RaceTrack | null; compact?: boolean }) {
  const samples = track ? buildTrackGeometry(track.trackDocument)?.path.samples ?? [] : [];
  const bounds = samples.reduce((result, sample) => ({ minX: Math.min(result.minX, sample.position.x), maxX: Math.max(result.maxX, sample.position.x), minY: Math.min(result.minY, sample.position.y), maxY: Math.max(result.maxY, sample.position.y) }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const path = samples.length ? samples.map((sample, index) => `${index === 0 ? "M" : "L"} ${(18 + (sample.position.x - bounds.minX) / spanX * 244).toFixed(1)} ${(15 + (sample.position.y - bounds.minY) / spanY * 120).toFixed(1)}`).join(" ") + " Z" : "";
  return (
    <div className={`track-preview ${compact ? "compact" : ""}`}>
      <svg viewBox="0 0 280 150" role="img" aria-label={UI_COPY.setup.circuitLayout(track?.name ?? "track")}>
        {path ? <><path d={path} fill="none" stroke="#cfddc8" strokeWidth="18" strokeLinejoin="round" /><path d={path} fill="none" stroke="#343d40" strokeWidth="11" strokeLinejoin="round" /><path d={path} fill="none" stroke="#f1f3ed" strokeWidth="2.5" strokeDasharray="7 7" strokeLinejoin="round" /><path d={path} fill="none" stroke="#e32f3e" strokeWidth="2.5" strokeDasharray="7 7" strokeDashoffset="7" strokeLinejoin="round" /></> : <text x="140" y="78" textAnchor="middle" fill="#65736d" fontSize="12">NO SAVED TRACK</text>}
      </svg>
      {!compact && track && <div><span>TRACK EDITOR</span><strong>{track.name}</strong><small>AUTHORED TRACK</small></div>}
    </div>
  );
}

type SharedSetupProps = {
  catalog: RaceTrack[];
  categories: CompetitionCategory[];
  selectedCategoryId: string;
  totalLaps: number;
  gridSize: number;
  maxGridSize: number;
  onCategoryChange: (id: string) => void;
  onLapsChange: (laps: number) => void;
  onGridChange: (size: number) => void;
  onBack: () => void;
};

function CategoryField({ categories, value, onChange }: { categories: CompetitionCategory[]; value: string; onChange: (id: string) => void }) {
  return <label className="wide"><span>{UI_COPY.setup.requiredCategory}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{UI_COPY.setup.selectCategory}</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name} · {category.official ? UI_COPY.setup.official : UI_COPY.setup.custom}</option>)}</select></label>;
}

function RaceFields({ totalLaps, gridSize, maxGridSize, onLapsChange, onGridChange, lapLabel = UI_COPY.setup.laps }: Pick<SharedSetupProps, "totalLaps" | "gridSize" | "maxGridSize" | "onLapsChange" | "onGridChange"> & { lapLabel?: string }) {
  return <><label><span>{lapLabel}</span><select value={totalLaps} onChange={(event) => onLapsChange(Number(event.target.value))}>{LAP_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label><span>{UI_COPY.setup.grid}</span><select value={gridSize} onChange={(event) => onGridChange(Number(event.target.value))}>{Array.from({ length: maxGridSize }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{UI_COPY.setup.carCount(value)}</option>)}</select></label></>;
}

type SingleRaceSetupProps = SharedSetupProps & {
  selectedTrackChoice: string;
  selectedTrackPreview: RaceTrack | null;
  activeCategory: CompetitionCategory;
  onTrackChange: (id: string) => void;
  onConfirm: () => void;
};

export function SingleRaceSetup(props: SingleRaceSetupProps) {
  const { catalog, categories, selectedCategoryId, selectedTrackChoice, selectedTrackPreview, activeCategory, totalLaps, gridSize, maxGridSize, onCategoryChange, onTrackChange, onLapsChange, onGridChange, onBack, onConfirm } = props;
  return (
    <main className="menu-shell setup-screen"><div className="menu-grid" aria-hidden="true" /><Brand className="menu-brand" /><section className="setup-card">
      <div className="setup-copy"><span className="menu-kicker">{UI_COPY.setup.singleRace}</span><h1>{UI_COPY.setup.singleTitleLead}<br /><em>{UI_COPY.setup.singleTitleAccent}</em></h1><p>{UI_COPY.setup.singleDescription}</p>
        <div className="menu-fields"><label className="wide"><span>{UI_COPY.setup.circuit}</span><select value={selectedTrackChoice} onChange={(event) => onTrackChange(event.target.value)}><option value="random">{UI_COPY.setup.randomCircuit}</option>{catalog.map((track, index) => <option key={track.id} value={track.id}>{String(index + 1).padStart(2, "0")} · {track.name}</option>)}</select></label><CategoryField categories={categories} value={selectedCategoryId} onChange={onCategoryChange} /><RaceFields totalLaps={totalLaps} gridSize={gridSize} maxGridSize={maxGridSize} onLapsChange={onLapsChange} onGridChange={onGridChange} /></div>
        <div className="menu-actions"><button className="ghost-action" onClick={onBack}>← {UI_COPY.setup.back}</button><button className="confirm-action" onClick={onConfirm} disabled={!selectedCategoryId || catalog.length === 0}>{UI_COPY.setup.confirmRace} <span>→</span></button></div>
      </div>
      <div className="setup-visual"><span className="category-chip">{selectedCategoryId ? UI_COPY.setup.categorySummary(activeCategory.name, activeCategory.drivers.length) : UI_COPY.setup.selectCategoryPrompt}</span>{selectedTrackChoice === "random" && <span className="random-chip">{UI_COPY.setup.randomSelection}</span>}<TrackPreview track={selectedTrackPreview} /><small>{selectedTrackChoice === "random" ? UI_COPY.setup.randomReveal : UI_COPY.setup.catalogPosition(Math.max(0, selectedTrackPreview ? catalog.indexOf(selectedTrackPreview) : -1) + 1, catalog.length)}</small></div>
    </section></main>
  );
}

type ChampionshipSetupProps = SharedSetupProps & {
  championshipLength: number;
  playbackMode: ChampionshipPlaybackMode;
  resultDurationSeconds: number;
  standingsDurationSeconds: number;
  pauseWhenHidden: boolean;
  onLengthChange: (value: number) => void;
  onPlaybackModeChange: (value: ChampionshipPlaybackMode) => void;
  onResultDurationChange: (value: number) => void;
  onStandingsDurationChange: (value: number) => void;
  onPauseWhenHiddenChange: (value: boolean) => void;
  onConfirm: () => void;
};

export function ChampionshipSetup(props: ChampionshipSetupProps) {
  const { catalog, categories, selectedCategoryId, totalLaps, gridSize, maxGridSize, championshipLength, playbackMode, resultDurationSeconds, standingsDurationSeconds, pauseWhenHidden, onCategoryChange, onLapsChange, onGridChange, onLengthChange, onPlaybackModeChange, onResultDurationChange, onStandingsDurationChange, onPauseWhenHiddenChange, onBack, onConfirm } = props;
  return (
    <main className="menu-shell setup-screen"><div className="menu-grid" aria-hidden="true" /><Brand className="menu-brand" /><section className="setup-card championship-setup">
      <div className="setup-copy"><span className="menu-kicker">{UI_COPY.setup.championship}</span><h1>{UI_COPY.setup.championshipTitleLead}<br /><em>{UI_COPY.setup.championshipTitleAccent}</em></h1><p>{UI_COPY.setup.championshipDescription}</p>
        <div className="menu-fields"><label className="wide"><span>{UI_COPY.setup.raceCount}</span><input type="number" min="2" max="50" value={championshipLength} onChange={(event) => onLengthChange(Number(event.target.value) || 2)} /></label><CategoryField categories={categories} value={selectedCategoryId} onChange={onCategoryChange} /><RaceFields totalLaps={totalLaps} gridSize={gridSize} maxGridSize={maxGridSize} onLapsChange={onLapsChange} onGridChange={onGridChange} lapLabel={UI_COPY.setup.lapsPerRound} />
          <div className="championship-playback-field"><span>{UI_COPY.championship.playbackMode}</span><SegmentedControl className="championship-playback-control" label={UI_COPY.championship.playbackMode} value={playbackMode} onChange={onPlaybackModeChange} options={[{ value: "manual", label: UI_COPY.championship.manual, description: UI_COPY.championship.manualDescription }, { value: "auto", label: UI_COPY.championship.autoBroadcast, description: UI_COPY.championship.autoBroadcastDescription }]} />
            {playbackMode === "auto" && <div className="championship-playback-settings"><label><span>{UI_COPY.championship.resultDuration}</span><input type="number" min="2" max="30" value={resultDurationSeconds} onChange={(event) => onResultDurationChange(Number(event.target.value) || 2)} /></label><label><span>{UI_COPY.championship.standingsDuration}</span><input type="number" min="2" max="30" value={standingsDurationSeconds} onChange={(event) => onStandingsDurationChange(Number(event.target.value) || 2)} /></label><label className="championship-visibility-setting"><input type="checkbox" checked={pauseWhenHidden} onChange={(event) => onPauseWhenHiddenChange(event.target.checked)} /><span>{UI_COPY.championship.pauseWhenHidden}</span></label></div>}
          </div>
        </div>
        <div className="points-key"><span>{UI_COPY.setup.points}</span><strong>{UI_COPY.setup.pointsScale}</strong></div><div className="menu-actions"><button className="ghost-action" onClick={onBack}>← {UI_COPY.setup.back}</button><button className="confirm-action" onClick={onConfirm} disabled={!selectedCategoryId || catalog.length < 2}>{playbackMode === "auto" ? UI_COPY.championship.startAutoBroadcast : UI_COPY.championship.drawChampionship} <span>→</span></button></div>
      </div>
      <div className="championship-visual"><span className="season-number">{String(championshipLength).padStart(2, "0")}</span><strong>{UI_COPY.setup.uniqueRounds}</strong><div className="track-stack">{catalog.slice(1, 5).map((track, index) => <div key={track.id} style={{ transform: `translate(${index * 8}px, ${index * 8}px) rotate(${index % 2 ? 2 : -2}deg)` }}><TrackPreview track={track} compact /></div>)}</div></div>
    </section></main>
  );
}
