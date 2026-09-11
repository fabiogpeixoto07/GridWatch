import { buildTrackGeometry } from "./domain/track/geometry.js";
import type { TrackDocument } from "./domain/track/types.js";
import { ensureStarterTrack } from "./persistence.js";

/** A raceable track is always a validated native Track Editor document. */
export type RaceTrack = {
  id: string;
  name: string;
  trackDocument: TrackDocument;
};

export function raceTrackFromDocument(document: TrackDocument): RaceTrack | null {
  const geometry = buildTrackGeometry(document);
  if (!geometry?.path.closed || geometry.path.samples.length < 8) return null;
  return { id: document.id, name: document.metadata.name || "Untitled Track", trackDocument: document };
}

export async function loadRaceTracks(): Promise<RaceTrack[]> {
  const documents = await ensureStarterTrack();
  return documents.flatMap((document) => {
    const track = document ? raceTrackFromDocument(document) : null;
    return track ? [track] : [];
  });
}
