// ─── Playback queue runner (Phaser) ───

import type { Scene } from 'phaser';
import { runActions, runStore, getRunState } from '../../game/store/runStore';
import type { PlaybackCommand } from '../../game/playback/types';
import { bindStore } from '../store/subscribe';
import { isAutoDrainCommand, playPlaybackCommand, type PlaybackHandlerContext } from './handlers';

export type PlaybackRunnerContext = PlaybackHandlerContext;

export interface PlaybackRunnerHandle {
  unbind: () => void;
  setScoreLayoutGate: (gate: { promise: Promise<void> } | null) => void;
  /** Drain round-end held score-events before leg-end modifier feedback. */
  drainRoundEndHeld: () => Promise<void>;
  /** Process any commands already in the queue (e.g. round-start before first draw). */
  drainInitialSync: () => void;
}

export function bindPlaybackRunner(scene: Scene, ctx: PlaybackRunnerContext): PlaybackRunnerHandle {
  let draining = false;
  let scoreLayoutGate: { promise: Promise<void> } | null = ctx.scoreLayoutGate;

  const handlerCtx: PlaybackHandlerContext = {
    ...ctx,
    get scoreLayoutGate() {
      return scoreLayoutGate;
    },
  };

  async function drainQueue(predicate: (command: PlaybackCommand) => boolean): Promise<void> {
    if (draining) return;
    draining = true;
    try {
      while (true) {
        const batch = runActions.takePlayback(predicate);
        if (batch.length === 0) break;
        for (const command of batch) {
          await playPlaybackCommand(handlerCtx, command);
        }
      }
    } finally {
      draining = false;
      const remaining = getRunState().playbackQueue;
      if (remaining.some(predicate)) {
        void drainQueue(predicate);
      }
    }
  }

  const drainAuto = () => drainQueue((cmd) => isAutoDrainCommand(cmd));

  const unbind = bindStore(
    scene,
    runStore,
    (state) => state.playbackQueue.length,
    (length, prevLength) => {
      if (length > 0 && length !== prevLength) {
        void drainAuto();
      }
    },
    { fireImmediately: false, equalityFn: (a, b) => a === b },
  );

  return {
    unbind,
    setScoreLayoutGate(gate) {
      scoreLayoutGate = gate;
    },
    drainRoundEndHeld: () => drainQueue((cmd) => cmd.kind === 'score-events' && cmd.label === 'round-end-held'),
    drainInitialSync() {
      const taken = runActions.takePlayback(() => true);
      for (const command of taken) {
        void playPlaybackCommand(handlerCtx, command);
      }
    },
  };
}
