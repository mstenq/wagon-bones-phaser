import { Events as PhaserEvents } from 'phaser';

// Used to emit events between components, HTML and Phaser scenes
export const EventBus = new PhaserEvents.EventEmitter();

// Event name constants — use domain:action naming
export const Events = {
  // Scene domain
  SCENE_READY: 'scene:ready',

  // Game domain
  PHASE_CHANGED: 'game:phase-changed',
  HAND_UPDATED: 'game:hand-updated',
  DICE_ROLLED: 'game:dice-rolled',
  SCORE_CALCULATED: 'game:score-calculated',
  DAY_ENDED: 'game:day-ended',
  ROUND_WON: 'game:round-won',
  ROUND_LOST: 'game:round-lost',
  REROLL_UPDATED: 'game:reroll-updated',
  SPENT_REFRESHED: 'game:spent-refreshed',
  TAG_EARNED: 'game:tag-earned',
  ROUND_SKIPPED: 'game:round-skipped',
  TAG_QUEUE_CHANGED: 'game:tag-queue-changed',
  PERMITS_CHANGED: 'player:permits-changed',

  // Equipment modifier domain
  EQUIPMENT_DESTROYED: 'equipment:destroyed',
  EQUIPMENT_PERISHED: 'equipment:perished',
  LEASE_PAID: 'equipment:lease_paid',
  LEASE_DEFAULTED: 'equipment:lease_defaulted',
} as const;
