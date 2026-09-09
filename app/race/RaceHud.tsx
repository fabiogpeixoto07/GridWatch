import type { ReactNode, RefObject } from "react";
import { UI_COPY } from "../ui-copy";

type RaceHudProps = {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  trackName: string;
  physicalCarCount: number;
  currentLap: number;
  totalLaps: number;
  raceTime: string;
  leaderCode: string;
  leaderColor: string;
  bestLap: string;
  countdown: number | null;
  overlay?: ReactNode;
};

export function RaceHud({ canvasRef, trackName, physicalCarCount, currentLap, totalLaps, raceTime, leaderCode, leaderColor, bestLap, countdown, overlay }: RaceHudProps) {
  return <div className="track-stage">
    <canvas ref={canvasRef} data-physical-cars={physicalCarCount} aria-label={`Top-down view of the entire ${trackName} racing circuit`} />
    <div className="telemetry-strip">
      <div><span>{UI_COPY.race.lap}</span><strong>{currentLap}<small>/ {totalLaps}</small></strong></div>
      <div><span>{UI_COPY.race.raceTime}</span><strong>{raceTime}</strong></div>
      <div className="leader-stat"><span>{UI_COPY.race.leader}</span><strong><i style={{ background: leaderColor }} />{leaderCode}</strong></div>
      <div><span>{UI_COPY.race.bestLap}</span><strong>{bestLap}</strong></div>
    </div>
    {countdown !== null && <div className="start-lights" aria-live="assertive">
      {[3, 2, 1].map((light) => <i key={light} className={countdown <= light ? "on" : ""} />)}
      <strong>{Math.ceil(countdown) || "GO"}</strong>
    </div>}
    {overlay}
  </div>;
}
