// ─── End-of-round lifecycle helpers ───

import type { EquipmentInstance } from '../../ItemsSystem';
import { isEquipmentCursed } from '../../ItemsSystem';
import { checkLoadedChance, walkEquipmentPerSlot } from '../../equipmentUtils';
import { getRunState, runActions } from '../../store/runStore';
import { getRoundState } from '../../store/roundStore';
import type { RoundRuntimeState, RunState } from '../../store/types';
import { resolveEffectParam, findDeathPrevention } from '../helpers';
import { effectRegistry } from '../registry';
import { dispatchLifecycle } from './dispatch';
import { getTrailTagById } from '../../../data/trail_tags';
import { tagActions } from '../../store/actions/tagActions';
import { selectIsBossRound } from '../../store/selectors/runSelectors';
import { rngInt } from '../../RunRng';
import { gte } from '../../scoreMath';
import { getInspectorRollSizeForDay } from '../../BossEffectsSystem';

function pushDestroyIndexIfAllowed(ctx: RoundEndContext): void {
  if (ctx.isCopy) return;
  const target = ctx.equipment[ctx.index];
  if (target && isEquipmentCursed(target)) return;
  ctx.destroyedIndices.push(ctx.index);
}

export interface RoundEndContext {
  equipment: EquipmentInstance[];
  moneyEarned: number;
  destroyedIndices: number[];
  index: number;
  professionId: string | null;
  /** True when this slot is a copy item emulating another card's effect. */
  isCopy: boolean;
  /** True when this day end finishes the leg round (win/loss), not a mid-round next day. */
  isLegRoundEnd: boolean;
}

/** Mirrors `roundActions.endDay` win/loss vs next-day branching for timed equipment. */
export function willEndLegRoundOnDayEnd(
  round: RoundRuntimeState,
  run: RunState,
  equipment: EquipmentInstance[],
): boolean {
  if (gte(round.totalMiles, round.config.targetMiles)) return true;

  if (round.day >= round.config.maxDays) {
    if (findDeathPrevention(equipment, round.totalMiles, round.config.targetMiles) < 0) {
      return true;
    }
  }

  const roundOver = gte(round.totalMiles, round.config.targetMiles) || round.day >= round.config.maxDays;
  const scoredIds = round.selectedForScoreIds;
  const rolledIds = round.rolledDice.map((d) => d.id);
  const spentAfter = new Set([...run.spentDiceIds, ...(roundOver ? rolledIds : scoredIds)]);

  const nextDay = round.day + 1;
  const inspectorRollSize = getInspectorRollSizeForDay(nextDay);
  const nextConfig = inspectorRollSize !== null ? { ...round.config, rollSize: inspectorRollSize } : round.config;
  const availableCount = run.dice.filter((d) => !spentAfter.has(d.id)).length;
  return availableCount < nextConfig.rollSize;
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
      if (!ctx.isLegRoundEnd) break;
      if (ctx.isCopy) break;
      if (checkLoadedChance(p.destroyChance as [number, number], ctx.equipment)) {
        pushDestroyIndexIfAllowed(ctx);
      }
      break;
    case 'XMULT_RISKY':
      if (!ctx.isLegRoundEnd) break;
      if (ctx.isCopy) break;
      if (checkLoadedChance(p.destroyChance as [number, number], ctx.equipment)) {
        pushDestroyIndexIfAllowed(ctx);
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
      if (!ctx.isLegRoundEnd) break;
      const decay = equip.def.effectParams.decayPerRound as number;
      equip.state.mult = (equip.state.mult ?? 0) - decay;
      equip.state.roundsPlayed = (equip.state.roundsPlayed ?? 0) + 1;
      if (equip.state.roundsPlayed >= (equip.def.effectParams.maxRounds as number)) {
        pushDestroyIndexIfAllowed(ctx);
      }
      break;
    }
    case 'POCKET_WATCH': {
      if (!ctx.isLegRoundEnd) break;
      const round = getRoundState();
      if (!round) break;
      const params = equip.def.effectParams as Record<string, unknown>;
      const milesPerLegRound = (params.milesPerLegRound as number) ?? 5;
      const multPerRerollsLeft = (params.multPerRerollsLeft as number) ?? 1;
      const rerollsLeft = Math.max(0, round.rerollsRemaining);
      equip.state.mult = (equip.state.mult ?? 0) + rerollsLeft * multPerRerollsLeft;
      equip.state.miles = (equip.state.miles ?? 0) + milesPerLegRound;
      break;
    }
    case 'SANDWICH': {
      if (!ctx.isLegRoundEnd) break;
      if ((equip.state.roundsRemaining ?? 0) > 0) {
        const packTagIds = ['tag_dice_mega', 'tag_supply_mega', 'tag_trail_guide_mega', 'tag_equipment_mega'];
        const randomTagId = packTagIds[rngInt('tags', 0, packTagIds.length - 1)];
        const tag = getTrailTagById(randomTagId);
        if (tag) tagActions.addTag(tag);
        equip.state.roundsRemaining -= 1;
        if (equip.state.roundsRemaining <= 0) {
          pushDestroyIndexIfAllowed(ctx);
        }
      }
      break;
    }
    case 'STEW': {
      if (!ctx.isLegRoundEnd) break;
      if ((equip.state.roundsRemaining ?? 0) > 0) {
        equip.state.roundsRemaining -= 1;
        if (equip.state.roundsRemaining <= 0) {
          pushDestroyIndexIfAllowed(ctx);
        }
      }
      break;
    }
    case 'CAMPFIRE_EMBERS': {
      if (!ctx.isLegRoundEnd) break;
      if (!selectIsBossRound(getRunState())) {
        const gain = (p.value as number) ?? 0.2;
        equip.state.xMult = (equip.state.xMult ?? 1) + gain;
      }
      break;
    }
  }
});

export function processEndOfRound(
  equipment: EquipmentInstance[],
  options?: { isLegRoundEnd?: boolean },
): {
  moneyEarned: number;
  destroyedIndices: number[];
} {
  const ctx: RoundEndContext = {
    equipment,
    moneyEarned: 0,
    destroyedIndices: [],
    index: 0,
    professionId: getRunState().professionId,
    isCopy: false,
    isLegRoundEnd: options?.isLegRoundEnd ?? false,
  };

  /** perSlot policy — see onRoundStart; lifecycleDedupe would skip source slots and break destruction effects. */
  walkEquipmentPerSlot(equipment, (slot) => {
    ctx.index = slot.index;
    ctx.isCopy = slot.isCopy;
    dispatchLifecycle('on-round-end', slot.equip, ctx);
  });

  return { moneyEarned: ctx.moneyEarned, destroyedIndices: ctx.destroyedIndices };
}
