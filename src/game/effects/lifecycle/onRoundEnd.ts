// ─── End-of-round lifecycle helpers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { checkLoadedChance } from '../../equipmentUtils';
import { getRunState, runActions } from '../../store/runStore';
import { getRoundState } from '../../store/roundStore';
import { resolveEffectParam } from '../helpers';
import { effectRegistry } from '../registry';
import { dispatchLifecycle } from './dispatch';
import { getTrailTagById } from '../../../data/trail_tags';
import { tagActions } from '../../store/actions/tagActions';
import { selectIsBossRound } from '../../store/selectors/runSelectors';
import { rngInt } from '../../RunRng';

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
    case 'OLD_CALENDAR': {
      const round = getRoundState();
      if (!round) break;
      const daysLeft = Math.max(0, round.config.maxDays - round.day + 1);
      const rerollsLeft = Math.max(0, round.rerollsRemaining);
      equip.state.mult = (equip.state.mult ?? 0) + rerollsLeft;
      equip.state.miles = (equip.state.miles ?? 0) + daysLeft;
      break;
    }
    case 'SANDWICH': {
      if ((equip.state.roundsRemaining ?? 0) > 0) {
        const packTagIds = ['tag_dice_mega', 'tag_supply_mega', 'tag_trail_guide_mega', 'tag_equipment_mega'];
        const randomTagId = packTagIds[rngInt('tags', 0, packTagIds.length - 1)];
        const tag = getTrailTagById(randomTagId);
        if (tag) tagActions.addTag(tag);
        equip.state.roundsRemaining -= 1;
        if (equip.state.roundsRemaining <= 0) {
          ctx.destroyedIndices.push(ctx.index);
        }
      }
      break;
    }
    case 'CAMPFIRE_EMBERS': {
      if (!selectIsBossRound(getRunState())) {
        const gain = (p.value as number) ?? 0.2;
        equip.state.xMult = (equip.state.xMult ?? 1) + gain;
      }
      break;
    }
    case 'STEW': {
      if ((equip.state.roundsRemaining ?? 0) > 0) {
        equip.state.roundsRemaining -= 1;
        if (equip.state.roundsRemaining <= 0) {
          ctx.destroyedIndices.push(ctx.index);
        }
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
