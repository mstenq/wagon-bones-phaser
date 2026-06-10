// ─── Trail tag payout helpers (No Phaser imports) ───
// Shared by TagSystem grants and trail_tags tooltip descriptions.

import type { TagDisplayContext } from './displayContextTypes';

export function isLiveSkipOffer(ctx: TagDisplayContext): boolean {
  return ctx.round != null && ctx.round === ctx.currentRound && !ctx.skippedRoundsThisLeg.includes(ctx.round);
}

export function effectiveRoundsSkipped(ctx: TagDisplayContext): number {
  return ctx.roundsSkipped + (isLiveSkipOffer(ctx) ? 1 : 0);
}

/** Projected immediate-money payout for one tag (honors Twin Wagon copies). */
export function computeImmediateMoneyPayout(tagId: string, ctx: TagDisplayContext): number {
  const copies = ctx.copies;
  switch (tagId) {
    case 'tag_well_traveled':
      return ctx.daysScored * copies;
    case 'tag_pack_rat':
      return ctx.unusedRerollsTotal * copies;
    case 'tag_shortcut':
      return Math.max(5, effectiveRoundsSkipped(ctx) * 5) * copies;
    case 'tag_bank_deposit':
      if (ctx.balance < 0) return 0;
      return Math.min(ctx.balance, 40) * copies;
    default:
      return 0;
  }
}
