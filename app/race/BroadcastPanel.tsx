"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type BattleEntry = { id: string; code: string; gapSeconds: number; status: "running" | "failing" | "retired" };
export function BroadcastPanel({ entries, fastestDriver, fastestLap, currentLap, totalLaps }: { entries: BattleEntry[]; fastestDriver?: string; fastestLap?: string; currentLap: number; totalLaps: number }) {
  const [callout, setCallout] = useState<string | null>(null);
  const previousOrder = useRef<string[]>(entries.map((entry) => entry.id));
  const battle = useMemo(() => entries.slice(1).map((entry, index) => ({ front: entries[index], rear: entry, gap: entry.gapSeconds - entries[index].gapSeconds })).filter((item) => item.front.status === "running" && item.rear.status === "running").sort((a, b) => a.gap - b.gap)[0], [entries]);
  const orderKey = entries.map((entry) => entry.id).join("|");
  const failingCode = entries.find((entry) => entry.status === "failing")?.code;
  useEffect(() => {
    const moved = entries.find((entry, index) => { const previous = previousOrder.current.indexOf(entry.id); return previous >= 0 && index < previous; });
    previousOrder.current = entries.map((entry) => entry.id);
    const message = currentLap === totalLaps ? "FINAL LAP" : failingCode ? `MECHANICAL ISSUE · ${failingCode}` : moved ? `OVERTAKE COMPLETE · ${moved.code}` : fastestDriver && fastestLap ? `FASTEST LAP · ${fastestDriver} · ${fastestLap}` : null;
    if (!message) return;
    setCallout(message);
    const timeout = window.setTimeout(() => setCallout(null), 4_000);
    return () => window.clearTimeout(timeout);
  // Order/status signatures prevent high-frequency timing snapshots from restarting the callout timer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLap, failingCode, fastestDriver, fastestLap, orderKey, totalLaps]);
  return <>{callout && <div className="broadcast-callout" role="status" aria-live="polite">{callout}</div>}{battle && battle.gap < 2.5 && <aside className="battle-panel" aria-label="Closest active battle"><span>CLOSEST BATTLE</span><strong>{battle.front.code} <i>vs</i> {battle.rear.code}</strong><small>{battle.gap.toFixed(2)} seconds</small></aside>}</>;
}
