// ─── Tutorial trigger rules (No Phaser imports) ───

import type { TutorialMessageId } from '../data/tutorialMessages';
import { GAMEPLAY } from './Constants';
import type { RunState } from './store/types';
import type { PhaseState } from './types';

export interface TutorialTriggerContext {
  phase?: PhaseState | null;
  equipmentCount?: number;
  consumableCount?: number;
  shopConsumablePurchases?: number;
  permitVisible?: boolean;
  roundDay?: number;
  rerollsRemaining?: number;
  hasLoadedDieInLineup?: boolean;
}

function isFirstMileRound(run: RunState): boolean {
  return run.leg === 1 && run.round === 1;
}

/** First shop visit — after winning the Mile Marker (round already advanced to 2). */
function isFirstShopVisit(run: RunState): boolean {
  return run.leg === 1 && run.round === 2;
}

/** Second shop visit — after winning the River Ford. */
function isSecondShopVisit(run: RunState): boolean {
  return run.leg === 1 && run.round === 3;
}

/** Whether a tutorial id's run-milestone gate passes (ignores seen state). */
export function canShowTutorial(id: TutorialMessageId, run: RunState, ctx: TutorialTriggerContext = {}): boolean {
  switch (id) {
    case 'round_select_intro':
      return isFirstMileRound(run);
    case 'first_round_play':
      return isFirstMileRound(run) && ctx.phase === 'SELECT';
    case 'reroll_intro':
      return isFirstMileRound(run) && ctx.phase === 'ROLL' && (ctx.rerollsRemaining ?? 0) > 0;
    case 'days_rerolls_limit':
      return isFirstMileRound(run) && (ctx.roundDay ?? 1) >= 2;
    case 'shop_welcome':
      return isFirstShopVisit(run);
    case 'consumable_slots':
      return isFirstShopVisit(run) && (ctx.shopConsumablePurchases ?? 0) >= 1;
    case 'shop_extras':
      return isSecondShopVisit(run);
    case 'round_choice_intro':
      return run.leg === 1 && run.round === 2;
    case 'beat_showdown_advance':
      return run.leg === 1 && run.round === GAMEPLAY.ROUNDS_PER_LEG;
    case 'reach_oregon':
      return run.leg === 2;
    case 'equipment_order':
      return (ctx.equipmentCount ?? 0) >= 2;
    case 'consumable_use':
      return (ctx.consumableCount ?? 0) >= 1;
    case 'loaded_dice_intro':
      return ctx.hasLoadedDieInLineup === true;
    default:
      return false;
  }
}
