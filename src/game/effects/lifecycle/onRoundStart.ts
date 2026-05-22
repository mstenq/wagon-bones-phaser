// ─── on-round-start lifecycle handlers ───

import { HandType } from '../../types';
import type { EquipmentInstance } from '../../ItemsSystem';
import { getPlayerState } from '../../PlayerState';
import { resolveEffectParam } from '../../effectParams';
import { resolveCopyTarget } from '../../Constants';
import { effectRegistry } from '../registry';
import { dispatchLifecycle } from './dispatch';
import { processEquipmentOnDiceDestroyed } from './onDiceDestroyed';

/** A single animated equipment destruction: source triggered victim's removal */
export interface AnimatedDestruction {
  sourceIdx: number;
  victimIdx: number;
}

export interface RoundStartAccumulators {
  equipmentToCreate: number;
  equipmentCreateRarity: string;
  stoneDiceToAdd: number;
  stickerDiceToAdd: number;
  daysBonus: number;
  loseAllRerolls: boolean;
  burnBarrelMoney: number;
  burnBarrelTriggered: boolean;
  supplyCardsToAdd: number;
}

/** Mutable context passed to each on-round-start handler */
export interface RoundStartContext {
  equipment: EquipmentInstance[];
  index: number;
  isBossRound: boolean;
  isCopy: boolean;
  destroyedIndices: number[];
  animatedDestructions: AnimatedDestruction[];
  pendingAnimatedDestroy: Set<number>;
  result: RoundStartAccumulators;
}

effectRegistry.registerLifecycle('on-round-start', (equip, ctxUnknown) => {
  const ctx = ctxUnknown as RoundStartContext;
  const { equipment, index: i, isBossRound, isCopy, destroyedIndices, pendingAnimatedDestroy, result } = ctx;

  switch (equip.def.effectType) {
    case 'ROUND_START_ADD_STONE':
      result.stoneDiceToAdd++;
      break;
    case 'ROUND_START_ADD_DICE':
      result.stickerDiceToAdd++;
      break;
    case 'ROUND_START_CREATE_EQUIPMENT':
      result.equipmentToCreate += equip.def.effectParams.count as number;
      result.equipmentCreateRarity = equip.def.effectParams.rarity as string;
      break;
    case 'ROUND_START_XMULT_DESTROY':
      if (isCopy) break;
      if (!isBossRound) {
        equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.value as number);
        const otherIndices = equipment
          .map((_, idx) => idx)
          .filter((idx) => idx !== i && !destroyedIndices.includes(idx) && !pendingAnimatedDestroy.has(idx));
        if (otherIndices.length > 0) {
          const victimIdx = otherIndices[Math.floor(Math.random() * otherIndices.length)];
          pendingAnimatedDestroy.add(victimIdx);
          ctx.animatedDestructions.push({ sourceIdx: i, victimIdx });
        }
      }
      break;
    case 'ROUND_START_SELL_VALUE':
      equip.sellValue += equip.def.effectParams.value as number;
      break;
    case 'ROUND_START_DAYS_NO_REROLLS':
      result.daysBonus += equip.def.effectParams.days as number;
      result.loseAllRerolls = true;
      break;
    case 'ROUND_START_DESTROY_STANDARD_DICE': {
      const player = getPlayerState();
      const standardIdx = player.dice.findIndex((d) => d.enhancement === null);
      if (standardIdx >= 0) {
        player.dice.splice(standardIdx, 1);
        processEquipmentOnDiceDestroyed(player.equipment, 1);
        const moneyVal = equip.def.effectParams.value as number;
        player.economy.earn(moneyVal);
        result.burnBarrelMoney += moneyVal;
        result.burnBarrelTriggered = true;
        console.log(`  [equip] ${equip.def.name}: destroyed standard die, earned $${moneyVal}`);
      }
      break;
    }
    case 'WANTED_HAND_MONEY': {
      const handTypes = Object.values(HandType);
      equip.state.targetHand = Math.floor(Math.random() * handTypes.length);
      break;
    }
    case 'ROUND_START_DESTROY_RIGHT':
      if (isCopy) break;
      {
        const rightIdx = i + 1;
        if (
          rightIdx < equipment.length &&
          !destroyedIndices.includes(rightIdx) &&
          !pendingAnimatedDestroy.has(rightIdx)
        ) {
          const rightEquip = equipment[rightIdx];
          equip.state.mult = (equip.state.mult ?? 0) + rightEquip.sellValue * 2;
          pendingAnimatedDestroy.add(rightIdx);
          ctx.animatedDestructions.push({ sourceIdx: i, victimIdx: rightIdx });
        }
      }
      break;
    case 'DECAYING_MULT': {
      const decay = equip.def.effectParams.decayPerRound as number;
      equip.state.mult = (equip.state.mult ?? 0) - decay;
      equip.state.roundsPlayed = (equip.state.roundsPlayed ?? 0) + 1;
      if (equip.state.roundsPlayed >= (equip.def.effectParams.maxRounds as number)) {
        destroyedIndices.push(i);
      }
      break;
    }
    case 'LUCKY_NUMBER_PIP_XMULT':
      equip.state.pip = Math.ceil(Math.random() * 12);
      break;
    case 'REPEAT_HAND_XMULT':
      for (const key of Object.keys(equip.state)) {
        if (key.startsWith('round_')) {
          delete equip.state[key];
        }
      }
      break;
    case 'SCORED_RETRIGGER_TIMED':
      break;
    case 'PHANTOM_WAGON':
      if (!isCopy) {
        equip.state.roundsHeld = (equip.state.roundsHeld ?? 0) + 1;
      }
      break;
    case 'FLOUR_SACK': {
      if (!isCopy) {
        const p = equip.def.effectParams as Record<string, unknown>;
        const decay = resolveEffectParam<number>(p, 'decayPerRound', getPlayerState().profession?.id);
        if (decay > 0) {
          equip.state.handSizeBonus = Math.max(0, (equip.state.handSizeBonus ?? 0) - decay);
        }
      }
      break;
    }
    case 'ROUND_START_SUPPLY':
      result.supplyCardsToAdd++;
      break;
  }
});

export function processEquipmentOnRoundStart(
  equipment: EquipmentInstance[],
  isBossRound: boolean = false,
): {
  destroyedIndices: number[];
  animatedDestructions: AnimatedDestruction[];
  equipmentToCreate: number;
  equipmentCreateRarity: string;
  stoneDiceToAdd: number;
  stickerDiceToAdd: number;
  daysBonus: number;
  loseAllRerolls: boolean;
  burnBarrelMoney: number;
  burnBarrelTriggered: boolean;
  supplyCardsToAdd: number;
} {
  const destroyedIndices: number[] = [];
  const animatedDestructions: AnimatedDestruction[] = [];
  const pendingAnimatedDestroy = new Set<number>();
  const result: RoundStartAccumulators = {
    equipmentToCreate: 0,
    equipmentCreateRarity: 'common',
    stoneDiceToAdd: 0,
    stickerDiceToAdd: 0,
    daysBonus: 0,
    loseAllRerolls: false,
    burnBarrelMoney: 0,
    burnBarrelTriggered: false,
    supplyCardsToAdd: 0,
  };

  const ctx: RoundStartContext = {
    equipment,
    index: 0,
    isBossRound,
    isCopy: false,
    destroyedIndices,
    animatedDestructions,
    pendingAnimatedDestroy,
    result,
  };

  const maxCopyDepth = equipment.length;
  for (let i = 0; i < equipment.length; i++) {
    if (pendingAnimatedDestroy.has(i) || destroyedIndices.includes(i)) continue;

    const originalEquip = equipment[i];
    let equip = originalEquip;
    let isCopy = false;

    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, i, maxCopyDepth);
      if (!resolved) continue;
      equip = resolved;
      isCopy = true;
    }

    ctx.index = i;
    ctx.isCopy = isCopy;
    dispatchLifecycle('on-round-start', equip, ctx);
  }

  return {
    destroyedIndices,
    animatedDestructions,
    equipmentToCreate: result.equipmentToCreate,
    equipmentCreateRarity: result.equipmentCreateRarity,
    stoneDiceToAdd: result.stoneDiceToAdd,
    stickerDiceToAdd: result.stickerDiceToAdd,
    daysBonus: result.daysBonus,
    loseAllRerolls: result.loseAllRerolls,
    burnBarrelMoney: result.burnBarrelMoney,
    burnBarrelTriggered: result.burnBarrelTriggered,
    supplyCardsToAdd: result.supplyCardsToAdd,
  };
}
