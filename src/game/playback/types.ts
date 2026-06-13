import type { ConsumableAnimEvent } from '../ConsumablesSystem';
import type { TrailGuideEatEvent } from '../effects/lifecycle/onRoundStart';
import type { HandUpgradeInfo, ScoreAnimEvent, ScoreResult } from '../types';

/** Center-screen success / failure toast tone. */
export type ToastTone = 'success' | 'failure';

/** End-of-round leased/perishable feedback shown before destruction animations. */
export interface ModifierFeedbackPayload {
  leasePaid: { index: number; equipmentName: string; cost: number }[];
  perished: { index: number; equipmentName: string }[];
  leaseDefaulted: { index: number; equipmentName: string }[];
}

/** Single queue item for UI animation / feedback. Logic enqueues; UI dequeues and plays. */
export type PlaybackCommand =
  /** New dice fly into the pouch after round start or rewards. */
  | { kind: 'dice-added'; dieIds: string[] }
  /** Batch equipment destructions at round start (e.g. Dynamite). */
  | { kind: 'round-start-destructions'; entries: { sourceIdx: number; victimIdx: number }[] }
  /** Ashfang eats trail guides — cards fly from consumable bar to equipment. */
  | { kind: 'round-start-trail-guide-eats'; events: TrailGuideEatEvent[] }
  /** Junk Dealer (and similar) spawns equipment at round start. */
  | { kind: 'round-start-equipment-created'; count: number }
  /** Specific equipment slots gained a new item. */
  | { kind: 'equipment-created'; equipmentIndices: number[] }
  /** Equipment bar pop-in count without slot indices. */
  | { kind: 'equipment-created-count'; count: number }
  /** Single equipment destroyed (source destroys victim). */
  | { kind: 'equipment-destroyed'; sourceIdx: number; victimIdx: number }
  /** Consumable use: bar animations and optional equipment pop-in. */
  | { kind: 'consumable-playback'; events: ConsumableAnimEvent[]; equipmentCreatedCount?: number }
  /** Full scored hand: runner plays result.animEvents and applies mutations. */
  | { kind: 'score'; result: ScoreResult }
  /** Standalone score animation events (e.g. round-end held dice). */
  | { kind: 'score-events'; events: ScoreAnimEvent[]; label?: 'round-end-held' }
  /** Hand level-up banners (queue before `score` when upgrades affect the scored hand). */
  | { kind: 'hand-upgrades'; upgrades: HandUpgradeInfo[] }
  /** End-of-day equipment self-destruct (Dynamite, Nitro) before continue. */
  | { kind: 'day-end-destructions'; indices: number[]; destroyedNames: string[]; holdMs: number }
  /** Trail tag fly-in to the tag stack (Round Select). */
  | { kind: 'tag-earned'; tagId: string; category: string; round: number }
  /** Leased upkeep paid, perishable expired, lease defaulted — before destruction anim. */
  | {
      kind: 'modifier-feedback';
      payload: ModifierFeedbackPayload;
      applyDestruction?: boolean;
    }
  /** Center-screen toast (e.g. Fool's Gold, Bless). */
  | { kind: 'toast'; message: string; tone: ToastTone }
  /** First-run tutorial popup (dismissible modal). */
  | { kind: 'tutorial'; tutorialId: string };

const PLAYBACK_COMMAND_KINDS = new Set<PlaybackCommand['kind']>([
  'dice-added',
  'round-start-destructions',
  'round-start-trail-guide-eats',
  'round-start-equipment-created',
  'equipment-created',
  'equipment-created-count',
  'equipment-destroyed',
  'consumable-playback',
  'score',
  'score-events',
  'hand-upgrades',
  'day-end-destructions',
  'tag-earned',
  'modifier-feedback',
  'toast',
  'tutorial',
]);

/** Type guard for deserialized or untyped queue entries (tests, debug). */
export function isPlaybackCommand(value: unknown): value is PlaybackCommand {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === 'string' && PLAYBACK_COMMAND_KINDS.has(kind as PlaybackCommand['kind']);
}
