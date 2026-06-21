import { getHandByType } from '../data/hands';
import type { TrailGuideDef } from '../data/trail_guides';
import type { RunState } from './store/types';

export function isSecretGuideSpawnable(guide: TrailGuideDef, run: RunState): boolean {
  if (!getHandByType(guide.handType)?.secret) return true;
  return (run.handStats[guide.handType]?.timesPlayed ?? 0) > 0;
}

export function filterSpawnableTrailGuides(guides: TrailGuideDef[], run: RunState): TrailGuideDef[] {
  return guides.filter((g) => isSecretGuideSpawnable(g, run));
}
