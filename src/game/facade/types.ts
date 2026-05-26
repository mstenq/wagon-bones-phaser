// ─── Facade shared types (No Phaser imports) ───

import type { ScoreResult } from '../types';
import type { PayoutSceneState } from '../store/types';

export type EndDayResult = {
  outcome: 'next-day' | 'won' | 'lost';
  destroyedEquipment: string[];
  deferredDestroyIndices: number[];
};

export type BeginRoundSessionOptions = {
  /** When true, treat as autosave restore (skip tag consumption and new startRound). */
  restored?: boolean;
};

export type EndDayOptions = {
  deferEquipmentDestructionAnimation?: boolean;
};

export type FacadeScoreResult = ScoreResult;

export type { PayoutSceneState };
