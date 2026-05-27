// ─── Run status traits (sidebar positive/negative indicators) ───
// Consumables and other effects register traits via RunState flags.

import type { RunState } from './store/types';
import { getTrailDebuffLines, hasActiveTrailRoundEffects, trailRoundEffectsFromModifiers } from './TrailEventsSystem';

export type RunStatusTraitPolarity = 'positive' | 'negative';

export interface RunStatusTrait {
  id: string;
  label: string;
  lines: string[];
  polarity: RunStatusTraitPolarity;
}

/** Sidebar traits from consumable / run flags (not trail-event debuffs). */
export function selectRunStatusTraits(state: RunState): RunStatusTrait[] {
  const traits: RunStatusTrait[] = [];

  const trailEffects = hasActiveTrailRoundEffects(state.trailRoundEffects)
    ? state.trailRoundEffects
    : trailRoundEffectsFromModifiers(state.trailEventModifiers);
  const trailDebuffLines = getTrailDebuffLines(trailEffects);
  if (trailDebuffLines.length > 0) {
    traits.push({
      id: 'trail_debuffs',
      label: 'Trail',
      lines: trailDebuffLines,
      polarity: 'negative',
    });
  }

  const omenCopies = state.statusTraitTokens.find((t) => t.id === 'omen_stone')?.copies ?? 0;
  if (omenCopies > 0) {
    traits.push({
      id: 'omen_stone',
      label: 'Omen Stone',
      lines: ['Blocks next trail penalty'],
      polarity: 'positive',
    });
  }

  const shopPassCopies = state.statusTraitTokens.find((t) => t.id === 'shop_pass')?.copies ?? 0;
  if (shopPassCopies > 0) {
    traits.push({
      id: 'shop_pass',
      label: shopPassCopies > 1 ? `Shop Pass x${shopPassCopies}` : 'Shop Pass',
      lines: ['Free shop reroll'],
      polarity: 'positive',
    });
  }

  const echoCopies = state.statusTraitTokens.find((t) => t.id === 'echo_of_the_damned')?.copies ?? 0;
  if (echoCopies > 0) {
    traits.push({
      id: 'echo_of_the_damned',
      label: 'Echo of the Damned',
      lines: [`Next hand: +${echoCopies} retrigger${echoCopies === 1 ? '' : 's'} per die`],
      polarity: 'positive',
    });
  }

  const allInCopies = state.statusTraitTokens.find((t) => t.id === 'all_in')?.copies ?? 0;
  if (allInCopies > 0) {
    traits.push({
      id: 'all_in',
      label: 'All In',
      lines: ['No rerolls next round'],
      polarity: 'negative',
    });
  }

  return traits;
}
