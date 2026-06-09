// ─── Equipment Effects (No Phaser imports) ───
// Applies owned equipment effects to scoring and config.

import { Die, HandType, HandResult, ScoreResult, ScoreAnimEvent } from './types';
import { getTrailGuideDefForHand } from './ConsumablesSystem';
import { EquipmentInstance } from './ItemsSystem';
import { getRunState } from './store/runStore';
import { selectProfession } from './store/selectors/runSelectors';
import { GAMEPLAY } from './Constants';
import { isDiceScoringDisabledByBoss } from './BossEffectsSystem';
import { walkEquipmentPerSlot } from './equipmentUtils';
import {
  buildHeldRetriggerSources,
  heldDieHasRetriggerableEffects,
  pushRetriggerAgainEvent,
} from './effects/retriggerAnim';
import { effectRegistry, type ScoringPipelineContext } from './effects';
import { createEmptyScoringMutations, mergeMutations } from './effects/applyMutations';
import type { ScoringMutations } from './effects/types';
import {
  applyEquipmentAuraForSlot,
  applyHolyAuraXMult,
  forEachEquipmentScoring,
  hasStackedDeck,
  multiplyCtxXMult,
} from './effects/helpers';
import { addScore, multiplyScore, balanceMilesAndMult, ZERO, ONE } from './scoreMath';
import { enhancementHeldGoldPayout, enhancementHeldSteelXMult, hasAlchemyKit } from './alchemyKit';
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
  console.log('[SCORE] Step 5 — Equipment pass (additive → auras → xMult → final miles)');
  const ctx = createEquipmentScoringContext(baseResult, equipment, context, animEvents);

  console.log('  [equip] Additive pass (bar order, fire/arcane per slot)');
  forEachEquipmentScoring(equipment, (equip, _original, i) => {
    effectRegistry.dispatchAdditive(equip.def.effectType, ctx, equip, i);
    applyEquipmentAuraForSlot(equipment, i, ctx);
  });

  console.log(`  [equip] After additive + auras: bonusMiles ${ctx.bonusMiles}, bonusMult ${ctx.bonusMult}`);

  const totalValue = baseResult.totalValue;
  const baseMiles = baseResult.handResult.baseMiles;
  let finalMult = applyHolyAuraXMult(addScore(baseResult.mult, ctx.bonusMult), equipment, ctx);

  console.log('  [equip] xMult pass (bar order)');
  ctx.xMult = ONE;
  forEachEquipmentScoring(
    equipment,
    (equip, _original, i) => {
      effectRegistry.dispatchXMult(equip.def.effectType, ctx, equip, i);
    },
    { unresolvedCopy: 'skip', logResolution: false },
  );
  finalMult = multiplyScore(finalMult, ctx.xMult);
  console.log(`  [equip] After xMult: equipment xMult ${ctx.xMult}, merged mult ${finalMult}`);

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
      `  [equip] Accountant balance: (${milesComponent} mi, ${preBalanceMult} mult) → ${balanced} × ${balanced} = ${finalMiles} mi`,
    );
  } else {
    console.log(
      `[SCORE] Final: (${baseMiles} baseMiles + ${totalValue} value + ${ctx.bonusMiles} bonusMiles) × ${finalMult} mult = ${finalMiles} mi`,
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

export { processEndOfRound, willEndLegRoundOnDayEnd } from './effects/lifecycle/onRoundEnd';

// ─── Held-in-Hand Processing (SCORE Step 4) ───

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

  const heldRetriggerSources = buildHeldRetriggerSources(equipment);
  const doubleDownCount = heldRetriggerSources.length;

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

  console.log(`[SCORE] Step 4 — Held-in-hand (${heldDice.length} dice, left → right)`);
  console.log(
    `  [held] Dice: ${heldDice.map((d) => `${d.id}(v${d.value} enh:${d.enhancement ?? '—'} sticker:${d.sticker ?? '—'})`).join(', ') || 'none'}`,
  );

  const alchemy = hasAlchemyKit(equipment);

  for (const die of heldDice) {
    if (isDiceScoringDisabledByBoss(die)) continue;

    const triggers = getHeldDieTriggerCount(die, doubleDownCount);

    for (let t = 0; t < triggers; t++) {
      if (t > 0 && heldDieHasRetriggerableEffects(die, heldDice, equipment, scoredHandType)) {
        pushRetriggerAgainEvent(animEvents, die, t, heldRetriggerSources);
      }
      const triggerLabel = t === 0 ? '' : ` (retrigger ${t})`;

      walkEquipmentPerSlot(
        equipment,
        (slot) => {
          const handler = effectRegistry.getHeldDie(slot.equip.def.effectType);
          if (handler) {
            handler(heldCtx, slot.equip, slot.index, die, t);
          }
        },
        { logResolution: true },
      );

      // Steel enhancement (or gold with Alchemy Kit): x1.5 mult per trigger
      if (enhancementHeldSteelXMult(die.enhancement, alchemy)) {
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
  const heldRetriggerSources = buildHeldRetriggerSources(equipment);
  const doubleDownCount = heldRetriggerSources.length;
  const animEvents: ScoreAnimEvent[] = [];
  let moneyEarned = 0;
  const perTrigger = GAMEPLAY.GOLD_DICE_HELD_MONEY;
  const alchemy = hasAlchemyKit(equipment);

  for (const die of heldDice) {
    if (!enhancementHeldGoldPayout(die.enhancement, alchemy)) continue;
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

  const heldRetriggerSources = buildHeldRetriggerSources(equipment);
  const doubleDownCount = heldRetriggerSources.length;
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
export { processPreScoreHandUpgrades } from './effects/lifecycle/preScoreHandUpgrades';
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

export { processEquipmentOnDayEnd, processEquipmentOnDayStart } from './effects/lifecycle/misc';

export { getConfigModifiers, findDeathPrevention } from './effects/helpers';
export { getGlobalScoredRetriggerCount as getScoredRetriggerCount } from './effects/scoredRetrigger';

export {
  processEquipmentOnDiceAdded,
  processEquipmentOnPackSkipped,
  processEquipmentOnPackOpened,
} from './effects/lifecycle/misc';
