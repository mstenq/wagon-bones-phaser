// ─── Shared consumable targeting instruction copy (No Phaser imports) ───

import type { DiceSelectionConfig } from '../DiceSelectionSystem';
import { getDiceSelectionMaxPicks, getDiceSelectionMinPicks } from '../DiceSelectionSystem';
import type { ConsumableTargetingSnapshot } from './consumableTargetingSession';

export type FormatTargetingInstructionOptions = {
  useLabel?: string;
  cloneOrderHint?: boolean;
};

function withCardPrefix(cardName: string, text: string): string {
  if (!cardName) return text;
  return `${cardName}: ${text}`;
}

/** Instruction text for armed bar / game targeting (from session snapshot). */
export function formatTargetingInstruction(snap: ConsumableTargetingSnapshot): string {
  if (!snap.active) return '';

  if (snap.validationReason) {
    return withCardPrefix(snap.cardName, snap.validationReason);
  }

  if (snap.needsBumpDirection) {
    return withCardPrefix(snap.cardName, 'Ready! Choose +1 or -1 on the card');
  }

  if (snap.selectedCount < snap.maxPicks) {
    return withCardPrefix(snap.cardName, 'Ready! Pick another die or click USE on the card');
  }

  return withCardPrefix(snap.cardName, 'Ready! Click USE on the card');
}

/** Instruction text for pack lineup ambient pre-selection (no active session). */
export function formatLineupTargetingInstruction(
  config: DiceSelectionConfig,
  selectedCount: number,
  options: FormatTargetingInstructionOptions = {},
): string {
  const min = getDiceSelectionMinPicks(config);
  const max = getDiceSelectionMaxPicks(config);
  const isClone = config.effectType === 'CLONE';
  const useLabel = options.useLabel ?? 'USE';
  const cloneHint = options.cloneOrderHint !== false && isClone ? 'Drag to order — left copies right. ' : '';

  if (selectedCount < min) {
    const need = min - selectedCount;
    if (min === max) {
      return `${cloneHint}Select ${need} more dice from the lineup`;
    }
    return `${cloneHint}Select at least ${need} more die${need === 1 ? '' : 's'} (up to ${max})`;
  }

  if (selectedCount < max) {
    if (isClone) return 'Ready! Left die will copy the right';
    return `Ready! Pick another die or click ${useLabel}`;
  }

  if (isClone) return 'Ready! Left die will copy the right';
  return `Ready! Click ${useLabel} to apply`;
}
