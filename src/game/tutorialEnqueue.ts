// ─── Tutorial playback enqueue (No Phaser imports) ───

import type { TutorialMessageId } from '../data/tutorialMessages';
import { enqueuePlayback } from './playback/queue';
import { getRunState } from './store/runStore';
import { isTutorialSeen } from './TutorialPreferences';
import { canShowTutorial, type TutorialTriggerContext } from './tutorialTriggers';

export function tryEnqueueTutorial(id: TutorialMessageId, ctx: TutorialTriggerContext = {}): boolean {
  if (isTutorialSeen(id)) return false;
  const run = getRunState();
  if (!canShowTutorial(id, run, ctx)) return false;
  enqueuePlayback({ kind: 'tutorial', tutorialId: id });
  return true;
}

/** Enqueue multiple tutorials in order; later ids in a chain get chainActive after a prior enqueue. */
export function tryEnqueueTutorials(ids: TutorialMessageId[], ctx: TutorialTriggerContext = {}): void {
  let chained = false;
  for (const id of ids) {
    const chainCtx = chained ? { ...ctx, chainActive: true } : ctx;
    const enqueued = tryEnqueueTutorial(id, chainCtx);
    if (enqueued) chained = true;
  }
}
