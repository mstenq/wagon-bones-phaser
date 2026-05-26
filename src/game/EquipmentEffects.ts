// ─── Equipment Effects (No Phaser imports) ───
// Applies owned equipment effects to scoring and config.

import { Die, HandType, HandResult, ScoreResult, ScoreAnimEvent } from './types';
import { getTrailGuideDefForHand } from './ConsumablesSystem';
import { EquipmentInstance } from './ItemsSystem';
import { getRunState } from './store/runStore';
import { selectProfession } from './store/selectors/runSelectors';
import { GAMEPLAY } from './Constants';
import { isEquipmentDisabledByBoss } from './BossEffectsSystem';
import { resolveCopyTarget } from './equipmentUtils';
import {
  buildHeldRetriggerSources,
  heldDieHasRetriggerableEffects,
  pushRetriggerAgainEvent,
} from './effects/retriggerAnim';
import { effectRegistry, type ScoringPipelineContext } from './effects';
import { createEmptyScoringMutations, mergeMutations } from './effects/applyMutations';
import type { ScoringMutations } from './effects/types';
import {
  applyEquipmentAuras,
  applyHolyAuraXMult,
  forEachEquipmentResolved,
  hasStackedDeck,
  multiplyCtxXMult,
} from './effects/helpers';
import { addScore, multiplyScore, balanceMilesAndMult, ZERO, ONE } from './scoreMath';
import type { Decimal } from './decimal';
export { processEquipmentOnRoundStart, type AnimatedDestruction } from './effects/lifecycle/onRoundStart';

export interface ScoringContext {
  handResult: HandResult;
  scoringDice: Die[];
  heldDice: Die[]; // dice rolled but not scored (held in hand)
  rerollsRemaining: number;
  equipmentCount: number;
  playerBalance: number; // current money
  professionId?: string | null;
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
    professionId: context.professionId ?? null,
    totalValue: baseResult.totalValue,
    bonusMult: ZERO,
    xMult: ONE,
    bonusMiles: ZERO,
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
  let finalMult = applyHolyAuraXMult(addScore(baseResult.mult, ctx.bonusMult), equipment, ctx);

  ctx.xMult = ONE;
  forEachEquipmentResolved(
    equipment,
    (equip, _original, i) => {
      effectRegistry.dispatchXMult(equip.def.effectType, ctx, equip, i);
    },
    'skip',
  );
  finalMult = multiplyScore(finalMult, ctx.xMult);

  const milesComponent = addScore(addScore(baseMiles, totalValue), ctx.bonusMiles);
  const run = getRunState();
  const balanceProfession = !!(selectProfession(run)?.modifiers as Record<string, unknown>)?.balanceMilesAndMult;
  let finalMiles = multiplyScore(milesComponent, finalMult);

  if (balanceProfession) {
    const preBalanceMult = finalMult;
    const { balanced, miles } = balanceMilesAndMult(milesComponent, finalMult);
    finalMult = balanced;
    finalMiles = miles;
    animEvents.push({
      target: { kind: 'balance' },
      popupType: 'balance',
      value: balanced.toNumber(),
      decimalValue: balanced,
    });
    console.log(
      `  [equip] Accountant balance: (${milesComponent} mi, ${preBalanceMult} mult) → ${balanced} × ${balanced} = ${finalMiles} miles`,
    );
  } else {
    console.log(
      `  [equip] Final: (${baseMiles} base + ${totalValue} value + ${ctx.bonusMiles} bonusMiles) * ${finalMult} = ${finalMiles} miles`,
    );
  }

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

function countHeldDoubleDownRetriggers(equipment: EquipmentInstance[]): number {
  const maxCopyDepthHeld = equipment.length;
  let doubleDownCount = 0;
  for (let i = 0; i < equipment.length; i++) {
    if (isEquipmentDisabledByBoss(i)) continue;
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
  return doubleDownCount;
}

function getHeldDieTriggerCount(die: Die, doubleDownCount: number): number {
  return 1 + (die.sticker === 'red_bullet' ? 1 : 0) + doubleDownCount;
}

interface HeldInHandResult {
  bonusMult: Decimal;
  xMult: Decimal;
  moneyEarned: number;
  mutations: ScoringMutations;
  animEvents: ScoreAnimEvent[];
}

/**
 * Process held-in-hand abilities for dice that were rolled but not scored.
 * Sequence per die (left to right): equipment triggers → steel enhancement → retriggers.
 * Retriggers: red_bullet sticker first, then Double Down equipment.
 */
export function processHeldInHand(
  heldDice: Die[],
  equipment: EquipmentInstance[],
  scoredHandType?: HandType,
): HeldInHandResult {
  const animEvents: ScoreAnimEvent[] = [];

  const doubleDownCount = countHeldDoubleDownRetriggers(equipment);
  const heldRetriggerSources = buildHeldRetriggerSources(equipment);

  const heldCtx: ScoringPipelineContext = {
    handResult: {
      type: HandType.HIGH_VALUE,
      name: '',
      baseMiles: ZERO,
      baseMult: ZERO,
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
    professionId: selectProfession(getRunState())?.id ?? null,
    totalValue: 0,
    bonusMult: ZERO,
    xMult: ONE,
    bonusMiles: ZERO,
    animEvents,
    mutations: createEmptyScoringMutations(),
  };

  console.log('[SCORE] Step 4: Held-in-hand abilities');
  console.log(
    `  [held] Held dice: ${heldDice.map((d) => `${d.id}(value:${d.value}, enh:${d.enhancement}, sticker:${d.sticker})`).join(', ') || 'none'}`,
  );

  for (const die of heldDice) {
    const triggers = getHeldDieTriggerCount(die, doubleDownCount);

    for (let t = 0; t < triggers; t++) {
      if (t > 0 && heldDieHasRetriggerableEffects(die, heldDice, equipment, scoredHandType)) {
        pushRetriggerAgainEvent(animEvents, die, t, heldRetriggerSources);
      }
      const triggerLabel = t === 0 ? '' : ` (retrigger ${t})`;

      // Equipment triggers on held dice (additive / conditional before steel xMult)
      for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
        if (isEquipmentDisabledByBoss(eIdx)) continue;
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

      // Steel enhancement: x1.5 mult per trigger
      if (die.enhancement === 'steel') {
        multiplyCtxXMult(heldCtx, 1.5);
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'xmult', value: 1.5 });
        console.log(`  [held] Die ${die.id}${triggerLabel}: STEEL x1.5 mult (xMult: ${heldCtx.xMult})`);
      }
    }
  }

  const bonusMult = heldCtx.bonusMult;
  const xMult = heldCtx.xMult;
  const moneyEarned = heldCtx.mutations.moneyEarned;

  console.log(
    `  [held] Totals: bonusMult: ${bonusMult}, xMult: ${xMult}, money: $${moneyEarned}, consumables: ${heldCtx.mutations.consumablesGranted.length}`,
  );
  return { bonusMult, xMult, moneyEarned, mutations: heldCtx.mutations, animEvents };
}

/** Gold dice held (not scored) at round end — pays per trigger (red_bullet, Silver Bullets, etc.). */
export function processGoldHeldAtRoundEnd(
  heldDice: Die[],
  equipment: EquipmentInstance[],
): { moneyEarned: number; animEvents: ScoreAnimEvent[] } {
  const doubleDownCount = countHeldDoubleDownRetriggers(equipment);
  const heldRetriggerSources = buildHeldRetriggerSources(equipment);
  const animEvents: ScoreAnimEvent[] = [];
  let moneyEarned = 0;
  const perTrigger = GAMEPLAY.GOLD_DICE_HELD_MONEY;

  for (const die of heldDice) {
    if (die.enhancement !== 'gold') continue;
    const triggers = getHeldDieTriggerCount(die, doubleDownCount);
    for (let t = 0; t < triggers; t++) {
      pushRetriggerAgainEvent(animEvents, die, t, heldRetriggerSources);
      moneyEarned += perTrigger;
      animEvents.push({
        target: { kind: 'die', dieId: die.id },
        popupType: 'money',
        value: perTrigger,
        dieId: die.id,
      });
    }
  }

  return { moneyEarned, animEvents };
}

/** Blue moon sticker held (not scored) when the round is won — trail guide for the last scored hand. */
export function processBlueMoonHeldAtRoundEnd(
  heldDice: Die[],
  equipment: EquipmentInstance[],
  scoredHandType: HandType | null,
): { consumablesGranted: string[]; animEvents: ScoreAnimEvent[] } {
  if (!scoredHandType) return { consumablesGranted: [], animEvents: [] };

  const doubleDownCount = countHeldDoubleDownRetriggers(equipment);
  const heldRetriggerSources = buildHeldRetriggerSources(equipment);
  const animEvents: ScoreAnimEvent[] = [];
  const consumablesGranted: string[] = [];
  const tgDef = getTrailGuideDefForHand(scoredHandType);

  for (const die of heldDice) {
    if (die.sticker !== 'blue_moon') continue;
    const triggers = getHeldDieTriggerCount(die, doubleDownCount);
    for (let t = 0; t < triggers; t++) {
      pushRetriggerAgainEvent(animEvents, die, t, heldRetriggerSources);
      consumablesGranted.push(tgDef.id);
      animEvents.push({
        target: { kind: 'die', dieId: die.id },
        popupType: 'trail_guide',
        value: 0,
        dieId: die.id,
        consumableId: tgDef.id,
      });
    }
  }

  return { consumablesGranted, animEvents };
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

export { processEquipmentOnDayEnd } from './effects/lifecycle/misc';

export { getConfigModifiers, findDeathPrevention, getScoredRetriggerCount } from './effects/helpers';

export {
  processEquipmentOnDiceAdded,
  processEquipmentOnSupplyUsed,
  processEquipmentOnPackSkipped,
  processEquipmentOnPackOpened,
} from './effects/lifecycle/misc';
