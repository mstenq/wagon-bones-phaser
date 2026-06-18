// ─── Score orchestration (no Phaser imports) ───
// Per-hand scoring: pre-scoring hooks, per-die/retrigger loop, destruction, mutations.
// Die lifecycle (create/roll/hand detect) lives in DiceSystem.ts; item handlers in effects/.
//
// Debug log pipeline ([SCORE] steps, shared with EquipmentEffects):
//   1 — Pre-scoring equipment   2 — Per-die scoring   3 — Post-score hooks
//   4 — Held-in-hand (EquipmentEffects)   5 — Equipment additive/xMult (EquipmentEffects)

import type { Die, HandResult, ScoreResult, ScoreAnimEvent } from '../types';
import { getRunState, runStore } from '../store/runStore';
import { diceActions } from '../store/actions/diceActions';
import type { EquipmentInstance } from '../ItemsSystem';
import { effectRegistry, type ScoringPipelineContext } from '../effects';
import { processEquipmentOnDiceDestroyed, processEquipmentPreScoring } from '../EquipmentEffects';
import { dispatchLifecycle } from '../effects/lifecycle/dispatch';
import { getRandomFrontierDef } from '../ConsumablesSystem';
import {
  walkEquipmentLifecycle,
  walkEquipmentPerSlot,
  walkEquipmentScoring,
  checkLoadedChance,
} from '../equipmentUtils';
import { getEnhancementScoreDestroyChance } from '../../data/dice_enhancements';
import { hasStackedDeck } from '../effects/helpers';
import { computeScoredDieRetriggers } from '../effects/scoredRetrigger';
import { pushRetriggerAgainEvent } from '../effects/retriggerAnim';
import { multiplyScore, addScore, ZERO, ONE } from '../scoreMath';
import { isDiceScoringDisabledByBoss } from '../BossEffectsSystem';
import { createEmptyScoringMutations } from '../effects/applyMutations';
import type { TrailRoundEffects } from '../TrailEventsSystem';
import { rngFloat } from '../RunRng';
import { createDie } from '../DiceSystem';
import { applyGreenContagionSpread, applyPurpleFlowerNonScoring } from './stickerScoring';

/**
 * Effective score-time destroy chance for a die (enhancement crack).
 * Moonshine overrides diamond with diamondDestroyChance; trail cold doubles diamond numerator.
 * Returns null when the die cannot crack from its enhancement ([0, 1]).
 */
export function resolveScoreDestroyChance(
  die: Die,
  equipment: EquipmentInstance[],
  trailRound: TrailRoundEffects,
): [number, number] | null {
  if (!die.enhancement) return null;

  if (die.enhancement === 'diamond') {
    let moonshineDiamond: [number, number] | undefined;
    walkEquipmentPerSlot(equipment, (slot) => {
      if (slot.equip.def.effectType !== 'ENHANCED_RETRIGGER') return;
      const p = slot.equip.def.effectParams as Record<string, unknown>;
      const fromEquip = p.diamondDestroyChance as [number, number] | undefined;
      if (fromEquip) {
        moonshineDiamond = fromEquip;
        return false;
      }
    });
    if (moonshineDiamond) {
      const [num, den] = moonshineDiamond;
      return trailRound.diamondCrackDoubled ? [num * 2, den] : [num, den];
    }
  }

  const [num, den] = getEnhancementScoreDestroyChance(die.enhancement);
  if (num <= 0) return null;

  if (die.enhancement === 'diamond' && trailRound.diamondCrackDoubled) {
    return [num * 2, den];
  }
  return [num, den];
}

/**
 * Calculate score for a played hand.
 * miles = (handBaseMiles + sum of scoring dice values) × handBaseMult
 */
export function scoreHand(
  handResult: HandResult,
  equipment: EquipmentInstance[],
  scoreContext?: {
    currentDay: number;
    maxDays: number;
    rerollsRemaining?: number;
    allDice?: Die[];
    selectedForScoreDice?: Die[];
  },
): ScoreResult {
  let totalValue = 0;
  let bonusMult = ZERO;
  let xMult = ONE;
  const run = getRunState();
  const animEvents: ScoreAnimEvent[] = [];

  const patchRunDice = (updater: (dice: Die[]) => Die[]): void => {
    runStore.setState((s) => ({ dice: updater(s.dice) }));
  };

  const removeRunDie = (dieId: string, enhancedCount = 0): boolean => {
    const current = getRunState();
    const idx = current.dice.findIndex((d) => d.id === dieId);
    if (idx < 0) return false;
    const wasEnhanced = current.dice[idx].enhancement !== null;
    patchRunDice((dice) => dice.filter((d) => d.id !== dieId));
    processEquipmentOnDiceDestroyed(equipment, 1, wasEnhanced ? 1 : enhancedCount);
    return true;
  };

  // ─── Step 1: Pre-scoring (Golden Spike, Graverobber, Lucky Find, copies, …) ───
  const preScoringMutations = createEmptyScoringMutations();
  if (scoreContext) {
    processEquipmentPreScoring(
      equipment,
      handResult.scoringDice,
      { currentDay: scoreContext.currentDay, maxDays: scoreContext.maxDays },
      preScoringMutations,
      animEvents,
    );
  } else {
    console.log('[SCORE] Step 1 — Pre-scoring skipped (no score context)');
  }

  console.log(
    `[SCORE] Step 2 — Per-die scoring (${handResult.scoringDice.length} dice, left → right, with retriggers)`,
  );

  const trailRound = run.trailRoundEffects;
  const standardDiceDay1 = scoreContext?.currentDay === 1 && trailRound.standardDiceDay1;
  const scoringEnhancement = (die: Die): Die['enhancement'] => (standardDiceDay1 ? null : die.enhancement);

  const stackedDeck = hasStackedDeck(equipment);

  // Create pipeline context for per-die handlers
  const pipelineCtx: ScoringPipelineContext = {
    handResult,
    scoringDice: handResult.scoringDice,
    heldDice: [],
    equipment,
    hasStackedDeck: stackedDeck,
    rerollsRemaining: scoreContext?.rerollsRemaining ?? 0,
    currentDay: scoreContext?.currentDay ?? 1,
    maxDays: scoreContext?.maxDays ?? 5,
    allDice: scoreContext?.allDice ?? [],
    handType: handResult.type,
    playerBalance: run.balance,
    professionId: run.professionId,
    totalValue,
    bonusMult: ZERO,
    xMult: ONE,
    bonusMiles: ZERO,
    animEvents,
    mutations: {
      moneyEarned: 0,
      earnedMoney: 0,
      lostMoney: 0,
      earnedMiles: ZERO,
      lostMiles: ZERO,
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
  const firstDieId = handResult.scoringDice.length > 0 ? handResult.scoringDice[0].id : null;
  const lastDieId =
    handResult.scoringDice.length > 0 ? handResult.scoringDice[handResult.scoringDice.length - 1].id : null;
  const echoCopies = getRunState().statusTraitTokens.find((t) => t.id === 'echo_of_the_damned')?.copies ?? 0;
  for (const die of handResult.scoringDice) {
    const bossDisabled = isDiceScoringDisabledByBoss(die);
    const dieEnhancement = scoringEnhancement(die);
    const { triggerCount: triggers, equipSources: retriggerSources } = computeScoredDieRetriggers({
      die,
      equipment,
      scoringDice: handResult.scoringDice,
      firstDieId,
      lastDieId,
      scoreContext,
      stackedDeck,
      isEnhanced: dieEnhancement !== null,
      isLucky: dieEnhancement === 'lucky',
      echoCopies,
      bossDisabled,
    });
    for (let t = 0; t < triggers; t++) {
      pushRetriggerAgainEvent(animEvents, die, t, retriggerSources);
      const triggerLabel = t > 0 ? ' (retrigger)' : '';

      // Save ctx values before this trigger (for delta calculation)
      const savedCtxTotalValue = pipelineCtx.totalValue;
      const savedCtxBonusMult = pipelineCtx.bonusMult;
      const savedCtxXMult = pipelineCtx.xMult;

      // Sync accumulated values from handlers into locals at start of each trigger
      totalValue = savedCtxTotalValue;
      bonusMult = savedCtxBonusMult;
      xMult = savedCtxXMult;

      // Base effect — value as miles (stone dice have 0 value but add 50 miles)
      const dieMiles = scoringEnhancement(die) === 'stone' ? 50 : die.value;
      if (!bossDisabled) {
        totalValue += dieMiles;
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'miles', value: dieMiles, dieId: die.id });
        console.log(
          `  [perDie] ${die.id}${triggerLabel}: +${dieMiles} ${scoringEnhancement(die) === 'stone' ? 'miles (stone)' : 'pip value'} (totalValue ${totalValue})`,
        );
      } else {
        console.log(`  [perDie] ${die.id}${triggerLabel}: boss-disabled (skipped)`);
      }

      // Permanent bonus miles (e.g. from Cowboy Boots)
      if (!bossDisabled && die.bonusMiles > 0) {
        totalValue += die.bonusMiles;
        animEvents.push({
          target: { kind: 'die', dieId: die.id },
          popupType: 'miles',
          value: die.bonusMiles,
          dieId: die.id,
        });
        console.log(`  [perDie] ${die.id}${triggerLabel}: +${die.bonusMiles} bonus miles (totalValue ${totalValue})`);
      }
      // Dice enhancement effects (skipped when boss-disabled)
      if (bossDisabled) {
        pipelineCtx.totalValue = totalValue;
        pipelineCtx.bonusMult = bonusMult;
        pipelineCtx.xMult = xMult;
        continue;
      }
      switch (scoringEnhancement(die)) {
        case 'bone':
          bonusMult = addScore(bonusMult, 4);
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'mult', value: 4, dieId: die.id });
          console.log(`  [perDie] ${die.id}${triggerLabel}: bone +4 mult (bonusMult ${bonusMult})`);
          break;
        case 'wooden':
          totalValue += 30;
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'miles', value: 30, dieId: die.id });
          console.log(`  [perDie] ${die.id}${triggerLabel}: wooden +30 miles (totalValue ${totalValue})`);
          break;
        case 'diamond':
          xMult = multiplyScore(xMult, 2);
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'xmult', value: 2, dieId: die.id });
          console.log(`  [perDie] ${die.id}${triggerLabel}: diamond ×2 (xMult ${xMult})`);
          break;
        case 'lucky': {
          const luckyMultChance: [number, number] = trailRound.luckyOddsHalved ? [1, 10] : [1, 5];
          const luckyMoneyChance: [number, number] = trailRound.luckyOddsHalved ? [1, 30] : [1, 15];
          if (checkLoadedChance(luckyMultChance, equipment, 'luckyDice')) {
            bonusMult = addScore(bonusMult, 20);
            animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'mult', value: 20, dieId: die.id });
            console.log(`  [perDie] ${die.id}${triggerLabel}: lucky +20 mult (bonusMult ${bonusMult})`);
            for (const e of equipment) dispatchLifecycle('on-lucky-trigger', e);
          }
          if (checkLoadedChance(luckyMoneyChance, equipment, 'luckyDice')) {
            pipelineCtx.mutations.moneyEarned += 20;
            animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'money', value: 20, dieId: die.id });
            console.log(`  [perDie] ${die.id}${triggerLabel}: lucky +$20`);
            for (const e of equipment) dispatchLifecycle('on-lucky-trigger', e);
          }
          break;
        }
      }

      // Dice aura effects
      switch (die.aura) {
        case 'fire':
          bonusMult = addScore(bonusMult, 10);
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'mult', value: 10, dieId: die.id });
          console.log(`  [perDie] ${die.id}${triggerLabel}: fire aura +10 mult (bonusMult ${bonusMult})`);
          break;
        case 'arcane':
          totalValue += 50;
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'miles', value: 50, dieId: die.id });
          console.log(`  [perDie] ${die.id}${triggerLabel}: arcane aura +50 miles (totalValue ${totalValue})`);
          break;
        case 'holy':
          xMult = multiplyScore(xMult, 1.5);
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'xmult', value: 1.5, dieId: die.id });
          console.log(`  [perDie] ${die.id}${triggerLabel}: holy aura ×1.5 (xMult ${xMult})`);
          break;
      }

      // Sticker effects (scored dice)
      if (die.sticker === 'golden_dollar') {
        pipelineCtx.mutations.moneyEarned += 3;
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'money', value: 3, dieId: die.id });
        console.log(`  [perDie] ${die.id}${triggerLabel}: sticker golden_dollar +$3`);
      }

      walkEquipmentScoring(equipment, (slot) => {
        const handler = effectRegistry.getPerDie(slot.equip.def.effectType);
        if (handler) {
          handler(pipelineCtx, slot.equip, slot.index, die, t);
        }
      });

      // Sync locals back to pipeline context, preserving handler deltas
      const handlerDeltaTotalValue = pipelineCtx.totalValue - savedCtxTotalValue;
      const handlerDeltaBonusMult = pipelineCtx.bonusMult.minus(savedCtxBonusMult);
      const handlerDeltaXMult = savedCtxXMult.eq(ZERO) ? ONE : pipelineCtx.xMult.div(savedCtxXMult);
      pipelineCtx.totalValue = totalValue + handlerDeltaTotalValue;
      pipelineCtx.bonusMult = addScore(bonusMult, handlerDeltaBonusMult);
      pipelineCtx.xMult = multiplyScore(xMult, handlerDeltaXMult);
    } // end trigger loop
  }

  // Final sync: pipeline context is the source of truth
  totalValue = pipelineCtx.totalValue;
  bonusMult = pipelineCtx.bonusMult;
  xMult = pipelineCtx.xMult;

  console.log('[SCORE] Step 3 — Post-score hooks (copy, destroy, trail/moonshine/cursed)');

  if (scoreContext?.selectedForScoreDice) {
    const scoringIds = new Set(handResult.scoringDice.map((d) => d.id));
    applyPurpleFlowerNonScoring(scoreContext.selectedForScoreDice, scoringIds, pipelineCtx.mutations, animEvents);
    applyGreenContagionSpread(scoreContext.selectedForScoreDice, equipment, pipelineCtx.mutations, animEvents);
  }

  // FIRST_DAY_SOLO_COPY: Bloodline — copy the solo die if scored alone on day 1
  if (scoreContext && scoreContext.currentDay === 1 && handResult.scoringDice.length === 1) {
    walkEquipmentPerSlot(equipment, ({ equip }) => {
      if (equip.def.effectType !== 'FIRST_DAY_SOLO_COPY') return;
      const target = handResult.scoringDice[0];
      const added = diceActions.addDie(
        createDie({
          value: target.value,
          enhancement: target.enhancement,
          sticker: target.sticker,
          aura: target.aura,
          bonusMiles: target.bonusMiles,
        }),
      );
      console.log(`  [postScore] ${equip.def.name}: copied die ${target.id} → ${added.id}`);
    });
  }

  // FIRST_HAND_ENHANCED_SIX: Hellfire Round — solo enhanced 6 on first hand → destroy, gain frontier card
  const hellfireSoloDie =
    scoreContext?.currentDay === 1 &&
    handResult.scoringDice.length === 1 &&
    handResult.scoringDice[0].value === 6 &&
    handResult.scoringDice[0].enhancement !== null
      ? handResult.scoringDice[0]
      : null;

  if (hellfireSoloDie) {
    walkEquipmentPerSlot(equipment, (slot) => {
      if (slot.equip.def.effectType !== 'FIRST_HAND_ENHANCED_SIX') return;
      if (!removeRunDie(hellfireSoloDie.id)) return;

      console.log(
        `  [postScore] ${slot.equip.def.name}: destroyed enhanced 6 (${hellfireSoloDie.id}), frontier card granted`,
      );
      const frontierDef = getRandomFrontierDef();
      if (!frontierDef) return;

      pipelineCtx.mutations.consumablesGranted.push(frontierDef.id);
      animEvents.push({ target: { kind: 'die', dieId: hellfireSoloDie.id }, popupType: 'crack', value: 0 });
      animEvents.push({
        target: { kind: 'equip', equipIndex: slot.index },
        popupType: 'supply',
        value: 0,
        consumableId: frontierDef.id,
      });
    });
  }

  // Enhancement score destroy (e.g. diamond crack); Moonshine overrides diamond odds
  console.log('  [postScore] Enhancement crack pass');
  for (const scoredDie of handResult.scoringDice) {
    const destroyChance = resolveScoreDestroyChance(scoredDie, equipment, trailRound);
    if (!destroyChance) continue;
    if (!checkLoadedChance(destroyChance, equipment, 'diamondDice')) continue;

    if (!removeRunDie(scoredDie.id)) continue;

    animEvents.push({ target: { kind: 'die', dieId: scoredDie.id }, popupType: 'crack', value: 0 });

    const wasDiamond = scoredDie.enhancement === 'diamond';
    console.log(`  [postScore] crack (${scoredDie.enhancement}): destroyed ${scoredDie.id}`);
    if (wasDiamond) {
      walkEquipmentLifecycle(equipment, ({ equip }) => {
        dispatchLifecycle('on-diamond-destroyed', equip);
      });
    }
  }

  // Trail: chance to destroy each scored die (blood moon)
  const destroyChance = trailRound.scoredDiceDestroyChance;
  if (destroyChance > 0) {
    console.log(`  [postScore] Trail destroy pass (chance ${destroyChance})`);
    for (const scoredDie of handResult.scoringDice) {
      if (rngFloat('dice') >= destroyChance) continue;
      if (!removeRunDie(scoredDie.id)) continue;
      animEvents.push({ target: { kind: 'die', dieId: scoredDie.id }, popupType: 'crack', value: 0 });
      console.log(`  [postScore] trail curse: destroyed ${scoredDie.id}`);
    }
  }

  // ENHANCED_RETRIGGER: Moonshine — enhanced dice have chance of being destroyed after scoring
  console.log('  [postScore] Moonshine enhanced-destroy pass');
  walkEquipmentPerSlot(equipment, ({ equip }) => {
    if (equip.def.effectType !== 'ENHANCED_RETRIGGER') return;

    const p = equip.def.effectParams as Record<string, unknown>;

    for (const scoredDie of handResult.scoringDice) {
      if (scoredDie.enhancement === null) continue;
      // Diamond crack is handled in the unified diamond crack pass above
      if (scoredDie.enhancement === 'diamond') continue;

      const chanceTuple = p.destroyChance as [number, number];
      if (!checkLoadedChance(chanceTuple, equipment)) continue;

      if (!removeRunDie(scoredDie.id)) continue;

      animEvents.push({ target: { kind: 'die', dieId: scoredDie.id }, popupType: 'crack', value: 0 });
      console.log(`  [postScore] ${equip.def.name}: destroyed ${scoredDie.id} (${scoredDie.enhancement})`);
    }
  });

  // FIRST_DAY_NONSCORING_DESTROY: Skullwing — day 1 played dice that do not score
  if (scoreContext?.currentDay === 1 && scoreContext.selectedForScoreDice) {
    const scoringIds = new Set(handResult.scoringDice.map((die) => die.id));
    walkEquipmentPerSlot(equipment, (slot) => {
      if (slot.equip.def.effectType !== 'FIRST_DAY_NONSCORING_DESTROY') return;
      const moneyPerDie = (slot.equip.def.effectParams.value as number) ?? 1;
      for (const die of scoreContext.selectedForScoreDice!) {
        if (scoringIds.has(die.id)) continue;
        if (!removeRunDie(die.id)) continue;
        pipelineCtx.mutations.moneyEarned += moneyPerDie;
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'crack', value: 0 });
        animEvents.push({
          target: { kind: 'equip', equipIndex: slot.index },
          popupType: 'money',
          value: moneyPerDie,
        });
        console.log(`  [postScore] ${slot.equip.def.name}: destroyed non-scoring ${die.id}, earned $${moneyPerDie}`);
      }
    });
  }

  // CURSED_DICE: loaded dice can shatter and grant a frontier encounter when scored
  console.log('  [postScore] Cursed dice (loaded shatter) pass');
  walkEquipmentPerSlot(equipment, (slot) => {
    if (slot.equip.def.effectType !== 'CURSED_DICE') return;

    const chanceTuple = ((slot.equip.def.effectParams as Record<string, unknown>).chance as [number, number]) ?? [1, 7];
    const triggeredViaEquipmentCopy = slot.isCopy;
    for (const scoredDie of handResult.scoringDice) {
      if (scoredDie.enhancement !== 'loaded') continue;
      if (!checkLoadedChance(chanceTuple, equipment, 'loadedDice', { triggeredViaEquipmentCopy })) continue;
      if (!removeRunDie(scoredDie.id)) continue;
      const frontierDef = getRandomFrontierDef();
      pipelineCtx.mutations.consumablesGranted.push(frontierDef.id);
      animEvents.push({ target: { kind: 'die', dieId: scoredDie.id }, popupType: 'crack', value: 0 });
      animEvents.push({
        target: { kind: 'equip', equipIndex: slot.index },
        popupType: 'supply',
        value: 0,
        consumableId: frontierDef.id,
      });
    }
  });

  const mult = multiplyScore(addScore(handResult.baseMult, bonusMult), xMult);
  const miles = multiplyScore(addScore(handResult.baseMiles, totalValue), mult);
  console.log(
    `[SCORE] scoreHand subtotal (${handResult.name}): (${handResult.baseMiles} baseMiles + ${totalValue} value) × (${handResult.baseMult} baseMult + ${bonusMult} bonusMult) × ${xMult} dieXMult = ${miles} mi (mult ${mult}) — next: held, then equipment`,
  );
  return { handResult, totalValue, miles, mult, animEvents, mutations: pipelineCtx.mutations };
}
