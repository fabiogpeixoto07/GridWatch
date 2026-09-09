import type { Ref } from "react";
import type { RaceStatus } from "./lifecycle";
import { UI_COPY } from "../ui-copy";

type Props = {
  containerRef: Ref<HTMLDivElement>; triggerRef: Ref<HTMLButtonElement>;
  open: boolean; status: RaceStatus; championship: boolean; autoBroadcast: boolean; autoplayPaused: boolean;
  finalRound: boolean; laps: number; grid: number; maxGrid: number; speed: number; soundOn: boolean;
  onOpenChange: (open: boolean) => void; onStart: () => void; onPause: () => void; onRestart: () => void;
  onNext: () => void; onToggleAutoplay: () => void; onLaps: (value: number) => void; onGrid: (value: number) => void;
  onSpeed: (value: number) => void; onSound: () => void; onMenu: () => void;
};

export function RaceActionsMenu(props: Props) {
  const { containerRef, triggerRef } = props;
  const closeAfter = (action: () => void) => { action(); props.onOpenChange(false); };
  return <div className="race-header-actions" ref={containerRef}>
    {props.championship && props.autoBroadcast && <span className={`auto-broadcast-pill ${props.autoplayPaused ? "paused" : ""}`}>{props.autoplayPaused ? UI_COPY.championship.autoBroadcastPaused : UI_COPY.championship.autoBroadcastActive}</span>}
    <div className={`live-status ${props.status}`}><i />{UI_COPY.race.status[props.status]}</div>
    <button ref={triggerRef} className="race-actions-trigger" type="button" aria-label={UI_COPY.race.openActions} aria-expanded={props.open} aria-controls="race-actions-menu" onClick={() => props.onOpenChange(!props.open)}>•••</button>
    {props.open && <div id="race-actions-menu" className="race-actions-menu" role="menu" aria-label={UI_COPY.race.actions}>
      <section><span>{UI_COPY.race.race}</span>
        {props.status === "ready" || props.status === "finished" ? <button role="menuitem" onClick={() => closeAfter(props.onStart)}>▶ {UI_COPY.race.start}</button> : <button role="menuitem" disabled={props.status === "countdown"} onClick={() => closeAfter(props.onPause)}>{props.status === "paused" ? `▶ ${UI_COPY.race.resume}` : `Ⅱ ${UI_COPY.race.pause}`}</button>}
        <button role="menuitem" onClick={() => closeAfter(props.onRestart)}>↻ {UI_COPY.race.restart}</button><button role="menuitem" onClick={() => closeAfter(props.onNext)}>{props.finalRound && props.status === "finished" ? UI_COPY.race.results : UI_COPY.race.nextRace}</button>
        {props.championship && props.autoBroadcast && <button role="menuitemcheckbox" aria-checked={props.autoplayPaused} onClick={props.onToggleAutoplay}>{props.autoplayPaused ? UI_COPY.championship.resumeBroadcast : UI_COPY.championship.pauseBroadcast}</button>}
      </section>
      <section><span>{UI_COPY.race.setup}</span><label>{UI_COPY.race.laps}<select aria-label={UI_COPY.race.lapsLabel} value={props.laps} disabled={props.status !== "ready" && props.status !== "finished"} onChange={(event) => props.onLaps(Number(event.target.value))}>{[3, 6, 9, 12].map((value) => <option key={value}>{value}</option>)}</select></label><label>{UI_COPY.race.grid}<select aria-label={UI_COPY.race.gridLabel} value={props.grid} disabled={props.status !== "ready" && props.status !== "finished"} onChange={(event) => props.onGrid(Number(event.target.value))}>{Array.from({ length: props.maxGrid }, (_, index) => index + 1).map((value) => <option key={value}>{value}</option>)}</select></label></section>
      <section><span>{UI_COPY.race.simulation}</span><div className="race-action-speeds">{[1, 2, 4].map((value) => <button key={value} role="menuitemradio" aria-checked={props.speed === value} className={props.speed === value ? "active" : ""} onClick={() => props.onSpeed(value)}>{value}×</button>)}</div><button role="menuitem" onClick={() => closeAfter(props.onSound)}>{props.soundOn ? UI_COPY.race.volumeOn : UI_COPY.race.mute}</button></section>
      <section><button className="race-menu-exit" role="menuitem" onClick={() => closeAfter(props.onMenu)}>☰ {UI_COPY.navigation.menu}</button></section>
    </div>}
  </div>;
}
