export type ResultCar = {
  id: string | number;
  finishPosition: number | null;
  finishedAt: number | null;
  finishGapSeconds: number | null;
  bestLap: number | null;
  mechanical: "running" | "failing" | "retired";
};

export type ResultDriver = {
  id: string | number;
  code: string;
  name: string;
  team: string;
  color: string;
};

export type RaceResultEntry = {
  id: string | number;
  position: number | null;
  code: string;
  name: string;
  team: string;
  color: string;
  finishTime: number | null;
  gapSeconds: number | null;
  bestLap: number | null;
  status: "classified" | "retired";
};

export type RaceResultSnapshot = {
  trackName: string;
  categoryName: string;
  mode: "single" | "championship";
  round: number;
  totalLaps: number;
  winnerTime: number | null;
  completedAt: number;
  bestLap: number | null;
  entries: RaceResultEntry[];
};

export function calculateFinishGap(finishedAt: number | null, winnerFinishedAt: number | null) {
  if (finishedAt === null || winnerFinishedAt === null) return null;
  return Math.max(0, finishedAt - winnerFinishedAt);
}

export function buildRaceResultSnapshot(
  cars: ResultCar[],
  drivers: ResultDriver[],
  metadata: Omit<RaceResultSnapshot, "winnerTime" | "bestLap" | "entries">,
): RaceResultSnapshot {
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
  const ordered = [...cars].sort((left, right) => {
    const leftRetired = left.mechanical === "retired";
    const rightRetired = right.mechanical === "retired";
    if (leftRetired !== rightRetired) return leftRetired ? 1 : -1;
    return (left.finishPosition ?? Number.MAX_SAFE_INTEGER) - (right.finishPosition ?? Number.MAX_SAFE_INTEGER);
  });
  const winner = ordered.find((car) => car.finishPosition === 1 && car.mechanical !== "retired");
  const winnerTime = winner?.finishedAt ?? null;
  const entries: RaceResultEntry[] = ordered.map((car) => {
    const driver = driverById.get(car.id);
    return {
      id: car.id,
      position: car.mechanical === "retired" ? null : car.finishPosition,
      code: driver?.code ?? "—",
      name: driver?.name ?? "Unknown driver",
      team: driver?.team ?? "Independent",
      color: driver?.color ?? "#ffffff",
      finishTime: car.finishedAt,
      gapSeconds: car.finishGapSeconds ?? calculateFinishGap(car.finishedAt, winnerTime),
      bestLap: car.bestLap,
      status: car.mechanical === "retired" ? "retired" as const : "classified" as const,
    };
  });
  const bestLap = entries.reduce<number | null>((best, entry) => entry.bestLap !== null && (best === null || entry.bestLap < best) ? entry.bestLap : best, null);
  return { ...metadata, winnerTime, bestLap, entries };
}
