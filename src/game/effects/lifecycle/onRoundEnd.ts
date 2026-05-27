// ─── End-of-round lifecycle helpers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { checkLoadedChance } from '../../equipmentUtils';
import { getRunState, runActions } from '../../store/runStore';
import { resolveEffectParam } from '../helpers';
import { effectRegistry } from '../registry';
import { dispatchLifecycle } from './dispatch';

export interface RoundEndContext {
  equipment: EquipmentInstance[];
  moneyEarned: number;
  destroyedIndices: number[];
  index: number;
  professionId: string | null;
}

effectRegistry.registerLifecycle('on-round-end', (equip, ctxUnknown) => {
  const ctx = ctxUnknown as RoundEndContext;
  const { effectType, effectParams } = equip.def;
  const p = effectParams as Record<string, unknown>;

  switch (effectType) {
    case 'END_ROUND_MONEY': {
      const professionId = ctx.professionId ?? undefined;
      ctx.moneyEarned += resolveEffectParam<number>(p, 'value', professionId);
      break;
    }
    case 'END_ROUND_MONEY_SCALING': {
      const base = p.base as number;
      const perBoss = p.perBoss as number;
      const bossesDefeated = (equip.state.bossesDefeated as number) ?? 0;
      ctx.moneyEarned += base + perBoss * bossesDefeated;
      break;
    }
    case 'ADD_MULT_RISKY':
      if (checkLoadedChance(p.destroyChance as [number, number], ctx.equipment)) {
        ctx.destroyedIndices.push(ctx.index);
      }
      break;
    case 'XMULT_RISKY':
      if (checkLoadedChance(p.destroyChance as [number, number], ctx.equipment)) {
        ctx.destroyedIndices.push(ctx.index);
      }
      break;
    case 'END_ROUND_SELL_VALUE_ALL': {
      const bonus = (p.value as number) ?? 1;
      for (const other of ctx.equipment) {
        other.sellValue += bonus;
      }
      const run = getRunState();
      if (run.consumables.length > 0) {
        runActions.patch({
          consumables: run.consumables.map((c) => ({ ...c, sellValue: c.sellValue + bonus })),
        });
      }
      break;
    }
    case 'DECAYING_MULT': {
      const decay = equip.def.effectParams.decayPerRound as number;
      equip.state.mult = (equip.state.mult ?? 0) - decay;
      equip.state.roundsPlayed = (equip.state.roundsPlayed ?? 0) + 1;
      if (equip.state.roundsPlayed >= (equip.def.effectParams.maxRounds as number)) {
        ctx.destroyedIndices.push(ctx.index);
      }
      break;
    }
  }
});

export function processEndOfRound(equipment: EquipmentInstance[]): {
  moneyEarned: number;
  destroyedIndices: number[];
} {
  const ctx: RoundEndContext = {
    equipment,
    moneyEarned: 0,
    destroyedIndices: [],
    index: 0,
    professionId: getRunState().professionId,
  };

  for (let i = 0; i < equipment.length; i++) {
    ctx.index = i;
    dispatchLifecycle('on-round-end', equipment[i], ctx);
  }

  return { moneyEarned: ctx.moneyEarned, destroyedIndices: ctx.destroyedIndices };
}
