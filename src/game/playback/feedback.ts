import type { ToastTone } from './types';
import { enqueuePlayback } from './queue';

/** Queue a center-screen success/failure toast for Phaser playback. */
export function enqueueToastFeedback(message: string, tone: ToastTone): void {
  enqueuePlayback({ kind: 'toast', message, tone });
}
