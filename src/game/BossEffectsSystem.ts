// ─── Boss Round Effects (No Phaser imports) ───
// Applies boss modifiers during boss rounds, unless negated by Saint Elmo's Shield
// or Sheriff's Badge (sold this round).

import { getPlayerState } from './PlayerState';
import { isBossEffectNegated } from './effects/helpers';

export interface BossRoundConfigMods {
  targetMilesMultiplier: number;
  rerollsModifier: number;
}

const NO_MODS: BossRoundConfigMods = {
  targetMilesMultiplier: 1,
  rerollsModifier: 0,
};

/** Round-start config modifiers from the current boss, if active and not negated. */
export function getBossRoundConfigMods(): BossRoundConfigMods {
  if (isBossEffectNegated()) return NO_MODS;

  const boss = getPlayerState().currentBoss;
  if (!boss) return NO_MODS;

  const mods: BossRoundConfigMods = { ...NO_MODS };

  switch (boss.effectType) {
    case 'DISTANCE_MULTIPLIER':
      mods.targetMilesMultiplier = (boss.effectParams.multiplier as number) ?? 1;
      break;
    case 'MODIFY_REROLLS':
      mods.rerollsModifier = (boss.effectParams.value as number) ?? 0;
      break;
  }

  return mods;
}

/** Whether the current boss's round effects are actively applying. */
export function isBossEffectActive(): boolean {
  return !isBossEffectNegated() && getPlayerState().currentBoss !== null;
}
