import type { TrailGuideDef } from '../data/trail_guides';
import { isHandTypeSpawnableThisRun } from './handStatsHelpers';
import type { RunState } from './store/types';

export function isSecretGuideSpawnable(guide: TrailGuideDef, run: RunState): boolean {
  return isHandTypeSpawnableThisRun(guide.handType, run.handStats);
}

export function filterSpawnableTrailGuides(guides: TrailGuideDef[], run: RunState): TrailGuideDef[] {
  return guides.filter((g) => isSecretGuideSpawnable(g, run));
}
