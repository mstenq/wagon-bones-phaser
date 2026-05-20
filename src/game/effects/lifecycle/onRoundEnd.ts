// ─── End-of-round lifecycle helpers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { checkLoadedChance } from '../../Constants';
import { getPlayerState } from '../../PlayerState';
import { resolveEffectParam } from '../helpers';

export function processEndOfRound(equipment: EquipmentInstance[]): {
  moneyEarned: number;
  destroyedIndices: number[];
} {
  let moneyEarned = 0;
  const destroyedIndices: number[] = [];

  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;

    if (effectType === 'END_ROUND_MONEY') {
      const professionId = getPlayerState().profession?.id;
      moneyEarned += resolveEffectParam<number>(p, 'value', professionId);
    }

    if (effectType === 'END_ROUND_MONEY_SCALING') {
      const base = p.base as number;
      const perBoss = p.perBoss as number;
      const bossesDefeated = (equip.state.bossesDefeated as number) ?? 0;
      moneyEarned += base + perBoss * bossesDefeated;
    }

    if (effectType === 'ADD_MULT_RISKY') {
      if (checkLoadedChance(p.destroyChance as [number, number], equipment)) {
        destroyedIndices.push(i);
      }
    }

    if (effectType === 'XMULT_RISKY') {
      if (checkLoadedChance(p.destroyChance as [number, number], equipment)) {
        destroyedIndices.push(i);
      }
    }

    // Intentionally includes self — Raffle Ticket compounds its own sell value each round.
    if (effectType === 'END_ROUND_SELL_VALUE_ALL') {
      const bonus = (p.value as number) ?? 1;
      for (const other of equipment) {
        other.sellValue += bonus;
      }
    }
  }

  return { moneyEarned, destroyedIndices };
}