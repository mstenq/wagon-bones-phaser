import { Events as PhaserEvents } from 'phaser';

// Cross-host bridge: Solid ↔ Phaser scene lifecycle only.
// Gameplay state changes use run/round/scene stores, gameFacade, and playbackQueue — not EventBus.
export const EventBus = new PhaserEvents.EventEmitter();

/** Host-only event names (`domain:action`). */
export const Events = {
  /** Emitted at end of scene `create()` so PhaserGame can track the active scene. */
  SCENE_READY: 'scene:ready',
} as const;
