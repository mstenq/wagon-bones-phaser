// ─── Equipment Effects (No Phaser imports) ───
// Applies owned equipment effects to scoring and config.

import { Die, HandType, HandResult, ScoreResult, ScoreAnimEvent } from './types';
import { EquipmentInstance } from './ItemsSystem';
import { getPlayerState } from './PlayerState';
import { resolveCopyTarget } from './Constants';
import { effectRegistry, type ScoringPipelineContext } from './effects';
import { createEmptyScoringMutations, mergeMutations } from './effects/applyMutations';
import { applyEquipmentAuras, applyHolyAuraXMult, forEachEquipmentResolved, hasStackedDeck } from './effects/helpers';
import { processEquipmentOnDiceDestroyed } from './effects/lifecycle/onDiceDestroyed';

export interface ScoringContext {
  handResult: HandResult;
  scoringDice: Die[];
  heldDice: Die[]; // dice rolled but not scored (held in hand)
  rerollsRemaining: number;
  equipmentCount: number;
  playerBalance: number; // current money
  currentDay: number; // current day in the round (1-based)
  maxDays: number; // max days this round
  allDice?: Die[]; // all dice in player's collection (for Iron Furnace, etc.)
  handType?: HandType; // the hand type detected for this play
}

function createEquipmentScoringContext(
  baseResult: ScoreResult,
  equipment: EquipmentInstance[],
  context: ScoringContext,
  animEvents: ScoreAnimEvent[],
): ScoringPipelineContext {
  const mutations = createEmptyScoringMutations();
  mergeMutations(mutations, baseResult.mutations);

  return {
    handResult: context.handResult,
    scoringDice: context.scoringDice,
    heldDice: context.heldDice,
    equipment,
    hasStackedDeck: hasStackedDeck(equipment),
    rerollsRemaining: context.rerollsRemaining,
    currentDay: context.currentDay,
    maxDays: context.maxDays,
    allDice: context.allDice ?? [],
    handType: context.handType,
    playerBalance: context.playerBalance,
    totalValue: baseResult.totalValue,
    bonusMult: 0,
    xMult: 1,
    bonusMiles: 0,
    animEvents,
    mutations,
  };
}

/**
 * Apply all equipment effects to a base score result.
 * Returns a new ScoreResult with bonuses applied.
 */
export function applyEquipmentEffects(
  baseResult: ScoreResult,
  equipment: EquipmentInstance[],
  context: ScoringContext,
  animEvents: ScoreAnimEvent[] = [],
): ScoreResult {
  const ctx = createEquipmentScoringContext(baseResult, equipment, context, animEvents);

  forEachEquipmentResolved(equipment, (equip, _original, i) => {
    effectRegistry.dispatchAdditive(equip.def.effectType, ctx, equip, i);
  });
  applyEquipmentAuras(equipment, ctx);

  console.log(`  [equip] Step 4 totals: bonusMiles: ${ctx.bonusMiles}, bonusMult: ${ctx.bonusMult}`);

  const totalValue = baseResult.totalValue;
  const baseMiles = baseResult.handResult.baseMiles;
  let finalMult = applyHolyAuraXMult(baseResult.mult + ctx.bonusMult, equipment, ctx);

  ctx.xMult = 1;
  forEachEquipmentResolved(
    equipment,
    (equip, _original, i) => {
      effectRegistry.dispatchXMult(equip.def.effectType, ctx, equip, i);
    },
    'skip',
  );
  finalMult *= ctx.xMult;

  const finalMiles = (baseMiles + totalValue + ctx.bonusMiles) * finalMult;
  console.log(
    `  [equip] Final: (${baseMiles} base + ${totalValue} value + ${ctx.bonusMiles} bonusMiles) * ${finalMult} = ${finalMiles} miles`,
  );

  return {
    handResult: baseResult.handResult,
    totalValue,
    miles: finalMiles,
    mult: finalMult,
    animEvents: baseResult.animEvents.concat(animEvents),
    mutations: ctx.mutations,
  };
}

export { processEndOfRound } from './effects/lifecycle/onRoundEnd';

// ─── Held-in-Hand Processing (Step 4) ───

interface HeldInHandResult {
  bonusMult: number;
  xMult: number;
  moneyEarned: number;
  trailGuidesForHand: number; // blue_moon sticker: how many trail guides to grant for scored hand
  animEvents: ScoreAnimEvent[];
}

/**
 * Process held-in-hand abilities for dice that were rolled but not scored.
 * Sequence per die (left to right): steel enhancement → equipment triggers → retriggers.
 * Retriggers: red_bullet sticker first, then Double Down equipment.
 */
export function processHeldInHand(heldDice: Die[], equipment: EquipmentInstance[]): HeldInHandResult {
  let bonusMult = 0;
  let xMult = 1;
  let trailGuidesForHand = 0;
  const animEvents: ScoreAnimEvent[] = [];

  // Count retriggers from Double Down equipment (resolving copy items)
  const maxCopyDepthHeld = equipment.length;
  let doubleDownCount = 0;
  for (let i = 0; i < equipment.length; i++) {
    let equip = equipment[i];
    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, i, maxCopyDepthHeld);
      if (!resolved) continue;
      equip = resolved;
    }
    if (equip.def.effectType === 'HELD_RETRIGGER' || equip.def.effectType === 'ALL_RETRIGGER') {
      doubleDownCount += (equip.def.effectParams.value as number) ?? 1;
    }
  }

  const heldCtx: ScoringPipelineContext = {
    handResult: {
      type: HandType.HIGH_VALUE,
      name: '',
      baseMiles: 0,
      baseMult: 0,
      rank: 0,
      scoringDice: [],
    },
    scoringDice: [],
    heldDice,
    equipment,
    hasStackedDeck: hasStackedDeck(equipment),
    rerollsRemaining: 0,
    currentDay: 0,
    maxDays: 0,
    allDice: [],
    handType: undefined,
    playerBalance: 0,
    totalValue: 0,
    bonusMult,
    xMult,
    bonusMiles: 0,
    animEvents,
    mutations: {
      moneyEarned: 0,
      earnedMoney: 0,
      lostMoney: 0,
      earnedMiles: 0,
      lostMiles: 0,
      gainedDice: 0,
      lostDice: 0,
      gainedSupplyCards: 0,
      gainedEquipment: 0,
      lostEquipment: 0,
      daysBonus: 0,
      loseAllRerolls: false,
      burnBarrelMoney: 0,
      burnBarrelTriggered: false,
      supplyCardsToAdd: 0,
      diceDestroyed: [],
      diceEnhanced: [],
      consumablesGranted: [],
      diceCopied: [],
      dieBonusMilesAdded: [],
    },
  };

  console.log('[SCORE] Step 4: Held-in-hand abilities');
  console.log(
    `  [held] Held dice: ${heldDice.map((d) => `${d.id}(value:${d.value}, enh:${d.enhancement}, sticker:${d.sticker})`).join(', ') || 'none'}`,
  );

  for (const die of heldDice) {
    // Calculate how many times this die triggers:
    // 1 base + red_bullet sticker retrigger + Double Down retriggers
    const hasRedBullet = die.sticker === 'red_bullet';
    const triggers = 1 + (hasRedBullet ? 1 : 0) + doubleDownCount;

    for (let t = 0; t < triggers; t++) {
      const triggerLabel = t === 0 ? '' : ` (retrigger ${t})`;

      // Steel enhancement: x1.5 mult per trigger
      if (die.enhancement === 'steel') {
        heldCtx.xMult *= 1.5;
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'xmult', value: 1.5 });
        console.log(`  [held] Die ${die.id}${triggerLabel}: STEEL x1.5 mult (xMult: ${heldCtx.xMult})`);
      }

      // Sticker effects on held dice
      if (die.sticker === 'blue_moon') {
        trailGuidesForHand++;
        console.log(`  [held] Die ${die.id}${triggerLabel}: BLUE_MOON +1 trail guide for scored hand`);
      }

      // Equipment triggers on held dice
      for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
        const originalEquip = equipment[eIdx];
        let equip = originalEquip;

        if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
          const resolved = resolveCopyTarget(equipment, eIdx, equipment.length);
          if (!resolved) {
            console.log(`  [held] ${originalEquip.def.name}: nothing to copy for held trigger`);
            continue;
          }
          equip = resolved;
        }

        const handler = effectRegistry.getHeldDie(equip.def.effectType);
        if (handler) {
          handler(heldCtx, equip, eIdx, die, t);
        }
      }
    }
  }

  bonusMult = heldCtx.bonusMult;
  xMult = heldCtx.xMult;
  const moneyEarned = heldCtx.mutations.moneyEarned;

  console.log(
    `  [held] Totals: bonusMult: ${bonusMult}, xMult: ${xMult}, money: $${moneyEarned}, trailGuides: ${trailGuidesForHand}`,
  );
  return { bonusMult, xMult, moneyEarned, trailGuidesForHand, animEvents };
}

// ─── Helpers ───
// handTypeMatches is imported from ./effects/helpers

// ─── Equipment State Update Functions ───

export { processEquipmentOnHandPlayed } from './effects/lifecycle/onHandPlayed';
export { processEquipmentAfterHandScored } from './effects/lifecycle/afterHandScored';
export { processEquipmentOnReroll } from './effects/lifecycle/onReroll';
export { processEquipmentOnShopReroll } from './effects/lifecycle/onShopReroll';
export { processEquipmentOnShopEnd } from './effects/lifecycle/onShopEnd';
export {
  processEquipmentOnSell,
  processEquipmentOnBossDefeat,
  processEquipmentOnDiceSpent,
  processEquipmentOnLuckyTrigger,
  processEquipmentOnDiamondDestroyed,
} from './effects/lifecycle/onSell';
export { processEquipmentOnDiceDestroyed } from './effects/lifecycle/onDiceDestroyed';
export { processEquipmentPreScoring } from './effects/lifecycle/onPreScoring';

/** A single animated equipment destruction: source triggered victim's removal */
export interface AnimatedDestruction {
  sourceIdx: number;
  victimIdx: number;
}

/** Called at the start of each round. Updates/removes decaying equipment.
 *  Returns indices of equipment to remove. Equipment is processed left-to-right;
 *  if one item destroys another that hasn't triggered yet, the destroyed item is skipped. */
export function processEquipmentOnRoundStart(equipment: EquipmentInstance[], isBossRound: boolean = false): { destroyedIndices: number[]; animatedDestructions: AnimatedDestruction[]; equipmentToCreate: number; equipmentCreateRarity: string; stoneDiceToAdd: number; daysBonus: number; loseAllRerolls: boolean; burnBarrelMoney: number; burnBarrelTriggered: boolean; supplyCardsToAdd: number } {
  const destroyedIndices: number[] = [];
  const animatedDestructions: AnimatedDestruction[] = [];
  const pendingAnimatedDestroy = new Set<number>(); // indices pending animated destruction
  let equipmentToCreate = 0;
  let equipmentCreateRarity = 'common';
  let stoneDiceToAdd = 0;
  let daysBonus = 0;
  let loseAllRerolls = false;
  let burnBarrelMoney = 0;
  let burnBarrelTriggered = false;
  let supplyCardsToAdd = 0;
  const maxCopyDepth = equipment.length;
  for (let i = 0; i < equipment.length; i++) {
    // Skip items already destroyed by a previous item this round
    if (pendingAnimatedDestroy.has(i) || destroyedIndices.includes(i)) continue;

    const originalEquip = equipment[i];
    let equip = originalEquip;
    let isCopy = false;

    // Resolve copy items (Mirror Lake / Echo Chamber)
    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, i, maxCopyDepth);
      if (!resolved) continue;
      equip = resolved;
      isCopy = true;
    }

    switch (equip.def.effectType) {
      case 'ROUND_START_ADD_STONE': {
        // Quarry Stone: add a stone die
        stoneDiceToAdd++;
        break;
      }
      case 'ROUND_START_CREATE_EQUIPMENT': {
        // Junk Dealer: create common equipment
        equipmentToCreate += equip.def.effectParams.count as number;
        equipmentCreateRarity = equip.def.effectParams.rarity as string;
        break;
      }
      case 'ROUND_START_XMULT_DESTROY': {
        // Haunted Totem: gains xMult every round (except boss rounds), destroys random other equipment
        // Copy items get the xMult benefit during scoring but don't trigger the destruction
        if (isCopy) break;
        if (!isBossRound) {
          equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.value as number);
          // Pick a random OTHER equipment to destroy (not self, not already destroyed)
          const otherIndices = equipment
            .map((_, idx) => idx)
            .filter((idx) => idx !== i && !destroyedIndices.includes(idx) && !pendingAnimatedDestroy.has(idx));
          if (otherIndices.length > 0) {
            const victimIdx = otherIndices[Math.floor(Math.random() * otherIndices.length)];
            pendingAnimatedDestroy.add(victimIdx);
            animatedDestructions.push({ sourceIdx: i, victimIdx });
          }
        }
        break;
      }
      case 'ROUND_START_SELL_VALUE': {
        // Antique Revolver: gain sell value each round
        equip.sellValue += equip.def.effectParams.value as number;
        break;
      }
      case 'ROUND_START_DAYS_NO_REROLLS': {
        // Hardtack: +days, lose all rerolls
        daysBonus += equip.def.effectParams.days as number;
        loseAllRerolls = true;
        break;
      }
      case 'ROUND_START_DESTROY_STANDARD_DICE': {
        // Burn Barrel: destroy one standard non-enhanced die and earn money
        const player = getPlayerState();
        const standardIdx = player.dice.findIndex((d) => d.enhancement === null);
        if (standardIdx >= 0) {
          player.dice.splice(standardIdx, 1);
          processEquipmentOnDiceDestroyed(player.equipment, 1);
          const moneyVal = equip.def.effectParams.value as number;
          player.economy.earn(moneyVal);
          burnBarrelMoney += moneyVal;
          burnBarrelTriggered = true;
          console.log(`  [equip] ${equip.def.name}: destroyed standard die, earned $${moneyVal}`);
        }
        break;
      }
      case 'WANTED_HAND_MONEY': {
        // Wanted Poster: randomize target hand each round
        const handTypes = Object.values(HandType);
        equip.state.targetHand = Math.floor(Math.random() * handTypes.length);
        break;
      }
      case 'ROUND_START_DESTROY_RIGHT': {
        // Funeral Pyre: destroy equipment to the right and gain double sell value as mult
        // Copy items get the +mult benefit during scoring but don't trigger destruction
        if (isCopy) break;
        const rightIdx = i + 1;
        if (rightIdx < equipment.length && !destroyedIndices.includes(rightIdx) && !pendingAnimatedDestroy.has(rightIdx)) {
          const rightEquip = equipment[rightIdx];
          equip.state.mult = (equip.state.mult ?? 0) + rightEquip.sellValue * 2;
          pendingAnimatedDestroy.add(rightIdx);
          animatedDestructions.push({ sourceIdx: i, victimIdx: rightIdx });
        }
        break;
      }
      case 'DECAYING_MULT': {
        // Fading Memory: -4 mult per round, removed after 5 rounds
        const decay = equip.def.effectParams.decayPerRound as number;
        equip.state.mult = (equip.state.mult ?? 0) - decay;
        equip.state.roundsPlayed = (equip.state.roundsPlayed ?? 0) + 1;
        if (equip.state.roundsPlayed >= (equip.def.effectParams.maxRounds as number)) {
          destroyedIndices.push(i);
        }
        break;
      }
      case 'LUCKY_NUMBER_PIP_XMULT':
        // Lucky Number: randomize pip each round
        equip.state.pip = Math.ceil(Math.random() * 12);
        break;
      case 'REPEAT_HAND_XMULT':
        // Repeat Offender: reset round history on new round
        for (const key of Object.keys(equip.state)) {
          if (key.startsWith('round_')) {
            delete equip.state[key];
          }
        }
        break;
      case 'SCORED_RETRIGGER_TIMED':
        // War Drums: decrement days remaining
        if (equip.state.daysRemaining !== undefined && equip.state.daysRemaining > 0) {
          // don't decrement here, decrement per day in processEquipmentOnDayEnd
        }
        break;
      case 'PHANTOM_WAGON':
        // Phantom Wagon: track rounds held
        if (!isCopy) {
          equip.state.roundsHeld = (equip.state.roundsHeld ?? 0) + 1;
        }
        break;
      case 'FLOUR_SACK':
        // Flour Sack: reduce hand size bonus by 1 each round (min 0)
        if (!isCopy) {
          equip.state.handSizeBonus = Math.max(0, (equip.state.handSizeBonus ?? 0) - (equip.def.effectParams.decayPerRound as number));
        }
        break;
      case 'ROUND_START_SUPPLY':
        // Supply Drop: create a random supply card
        supplyCardsToAdd++;
        break;
    }
  }
  return { destroyedIndices, animatedDestructions, equipmentToCreate, equipmentCreateRarity, stoneDiceToAdd, daysBonus, loseAllRerolls, burnBarrelMoney, burnBarrelTriggered, supplyCardsToAdd };
}

export { processEquipmentOnDayEnd } from './effects/lifecycle/misc';

export {
  getConfigModifiers,
  findDeathPrevention,
  getDayModifiers,
  getScoredRetriggerCount,
} from './effects/helpers';

export {
  processEquipmentOnDiceAdded,
  processEquipmentOnSupplyUsed,
  processEquipmentOnPackSkipped,
  processEquipmentOnPackOpened,
} from './effects/lifecycle/misc';
