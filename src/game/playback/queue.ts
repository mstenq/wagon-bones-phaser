import { getRunState, runStore } from '../store/runStore';
import type { PlaybackCommand } from './types';

export function enqueuePlayback(command: PlaybackCommand): void {
  runStore.setState((state) => ({
    playbackQueue: [...state.playbackQueue, command],
  }));
}

/** Remove and return commands matching the predicate (one-shot animation consumption). */
export function takePlayback(predicate: (command: PlaybackCommand) => boolean): PlaybackCommand[] {
  const state = getRunState();
  const taken: PlaybackCommand[] = [];
  const remaining: PlaybackCommand[] = [];
  for (const command of state.playbackQueue) {
    if (predicate(command)) taken.push(command);
    else remaining.push(command);
  }
  if (taken.length === 0) return [];

  runStore.setState({ playbackQueue: remaining });
  return taken;
}

export function clearPlayback(): void {
  runStore.setState({ playbackQueue: [] });
}
