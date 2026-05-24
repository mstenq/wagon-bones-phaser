// ─── Dice System (No Phaser imports) ───
// Handles dice creation, rolling, pouch management, hand detection, and scoring.

import { Die, DiceEnhancement, HandType, HandResult, HandDefinition, ScoreResult, ScoreAnimEvent } from './types';
import hands from '../data/hands';
import { getPlayerState } from './PlayerState';
import type { EquipmentInstance } from './ItemsSystem';
import { effectRegistry, getScoredRetriggerCount, type ScoringPipelineContext } from './effects';
import { processEquipmentOnDiceDestroyed, processEquipmentPreScoring } from './EquipmentEffects';
import { dispatchLifecycle } from './effects/lifecycle/dispatch';
import { getRandomSupplyDef, createConsumableInstance, getRandomFrontierDef } from './ConsumablesSystem';
import { GAMEPLAY } from './Constants';
import { resolveCopyTarget, checkLoadedChance, getLoadedDiceMultiplier } from './equipmentUtils';
import { getEnhancementScoreDestroyChance } from '../data/dice_enhancements';
import { dieMatchesPip, hasStackedDeck, multiplyCtxXMult } from './effects/helpers';
import { multiplyScore, addScore, D, ZERO, ONE, floorScore, ceilScore, gte } from './scoreMath';
import { isDiceScoringDisabledByBoss, isEquipmentDisabledByBoss } from './BossEffectsSystem';
import { createEmptyScoringMutations, applyDiceEnhancementMutations } from './effects/applyMutations';
import type { TrailRoundEffects } from './TrailEventsSystem';
import { rngFloat, rngInt, rngPick, rngShuffle } from './RunRng';

const HAND_TABLE: HandDefinition[] = hands;

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
    for (const equip of equipment) {
      if (equip.def.effectType !== 'ENHANCED_RETRIGGER') continue;
      const p = equip.def.effectParams as Record<string, unknown>;
      const fromEquip = p.diamondDestroyChance as [number, number] | undefined;
      if (fromEquip) {
        const [num, den] = fromEquip;
        return trailRound.diamondCrackDoubled ? [num * 2, den] : [num, den];
      }
    }
  }

  const [num, den] = getEnhancementScoreDestroyChance(die.enhancement);
  if (num <= 0) return null;

  if (die.enhancement === 'diamond' && trailRound.diamondCrackDoubled) {
    return [num * 2, den];
  }
  return [num, den];
}

let nextDieId = 0;

// ─── Dice Creation ───

export function createDie(overrides?: Partial<Die>): Die {
  const die: Die = {
    id: `die_${nextDieId++}`,
    value: rngInt('dice', 1, 12),
    enhancement: null,
    sticker: null,
    aura: null,
    bonusMiles: 0,
    ...overrides,
  };
  if (die.enhancement === 'stone') die.value = 0;
  return die;
}

export function createPouch(count: number): Die[] {
  return Array.from({ length: count }, () => createDie());
}

/** Create profession-enhanced dice (non-null enhancements only). */
export function createStartingDice(enhancements: Exclude<DiceEnhancement, null>[]): Die[] {
  return enhancements.map((enhancement) => createDie({ enhancement }));
}

/** Profession dice plus standard (unenhanced) dice up to total collection size. */
export function createRunStartingPouch(
  professionEnhancements: Exclude<DiceEnhancement, null>[],
  totalCount: number = GAMEPLAY.STARTING_DICE,
): Die[] {
  const professionDice = createStartingDice(professionEnhancements);
  const standardCount = Math.max(0, totalCount - professionDice.length);
  return [...professionDice, ...createPouch(standardCount)];
}

// ─── Rolling ───

export function rollDie(die: Die): Die {
  // Stone dice never get a numeric value
  if (die.enhancement === 'stone') return { ...die, value: 0 };
  const player = getPlayerState();
  const loadedTarget = player.getResolvedLoadedDieTarget();
  if (die.enhancement === 'loaded' && loadedTarget !== null) {
    const loadedChance = Math.min(1, getLoadedDiceMultiplier(player.equipment) / 6);
    const otherFaces = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((face) => face !== loadedTarget);
    if (rngFloat('loadedDice') < loadedChance) return { ...die, value: loadedTarget };
    return { ...die, value: rngPick('loadedDice', otherFaces) };
  }
  return { ...die, value: rngInt('dice', 1, 12) };
}

export function rollDice(dice: Die[]): Die[] {
  return dice.map(rollDie);
}

// ─── Pouch Management ───

export function drawFromPouch(pouch: Die[], count: number): { drawn: Die[]; remaining: Die[] } {
  const shuffled = rngShuffle('dice', pouch);
  return {
    drawn: shuffled.slice(0, count),
    remaining: shuffled.slice(count),
  };
}

export function returnToPouch(pouch: Die[], dice: Die[]): Die[] {
  return [...pouch, ...dice];
}

// ─── Hand Detection ───

function getFrequencies(dice: Die[]): Map<number, number> {
  const freq = new Map<number, number>();
  for (const d of dice) {
    freq.set(d.value, (freq.get(d.value) || 0) + 1);
  }
  return freq;
}

function findLongestStraight(dice: Die[]): number[] {
  const unique = [...new Set(dice.map((d) => d.value))].sort((a, b) => a - b);
  let best: number[] = [];
  let current: number[] = [unique[0]];

  for (let i = 1; i < unique.length; i++) {
    if (unique[i] === unique[i - 1] + 1) {
      current.push(unique[i]);
    } else {
      if (current.length > best.length) best = current;
      current = [unique[i]];
    }
  }
  if (current.length > best.length) best = current;
  return best;
}

export function getHandDef(type: HandType): HandDefinition {
  return HAND_TABLE.find((h) => h.type === type)!;
}

export function buildHandResult(type: HandType, scoringDice: Die[]): HandResult {
  const def = getHandDef(type);
  return { type, name: def.name, baseMiles: D(def.baseMiles), baseMult: D(def.baseMult), rank: def.rank, scoringDice };
}

function buildResult(type: HandType, scoringDice: Die[]): HandResult {
  return buildHandResult(type, scoringDice);
}

/**
 * Detect the best hand from 1-5 dice.
 * Stone dice are excluded from hand pattern detection but always scored.
 */
export function detectBestHand(dice: Die[]): HandResult {
  // Separate stone dice — they don't participate in hand detection
  const stoneDice = dice.filter((d) => d.enhancement === 'stone');
  const normalDice = dice.filter((d) => d.enhancement !== 'stone');

  if (normalDice.length === 0) {
    // Only stone dice — no hand pattern, just score them all
    return buildResult(HandType.HIGH_VALUE, [...stoneDice]);
  }

  const result = detectBestHandFromDice(normalDice);
  // Append stone dice to scoring — they're always scored
  if (stoneDice.length > 0) {
    result.scoringDice = [...result.scoringDice, ...stoneDice];
  }
  return result;
}

/**
 * Internal: detect best hand from non-stone dice only.
 */
function detectBestHandFromDice(dice: Die[]): HandResult {
  if (dice.length === 0) {
    return buildResult(HandType.HIGH_VALUE, []);
  }

  const freq = getFrequencies(dice);
  const counts = [...freq.values()].sort((a, b) => b - a);
  const straight = findLongestStraight(dice);

  // Five of a kind
  if (counts[0] >= 5) {
    return buildResult(HandType.FIVE_OF_A_KIND, dice.slice(0, 5));
  }

  // Five straight
  if (straight.length >= 5) {
    const straightSet = new Set(straight.slice(0, 5));
    const scoringDice = dice.filter((d) => straightSet.has(d.value));
    // Take only one die per value
    const used = new Set<number>();
    const uniqueDice = scoringDice.filter((d) => {
      if (used.has(d.value)) return false;
      used.add(d.value);
      return true;
    });
    return buildResult(HandType.FIVE_STRAIGHT, uniqueDice.slice(0, 5));
  }

  // Four of a kind
  if (counts[0] >= 4) {
    const pip = [...freq.entries()].find(([, c]) => c >= 4)![0];
    const scoring = dice.filter((d) => d.value === pip).slice(0, 4);
    return buildResult(HandType.FOUR_OF_A_KIND, scoring);
  }

  // Full house (3 + 2)
  if (counts[0] >= 3 && counts[1] >= 2) {
    const threePip = [...freq.entries()].find(([, c]) => c >= 3)![0];
    const twoPip = [...freq.entries()].find(([p, c]) => c >= 2 && p !== threePip)![0];
    const pairPips = new Set([threePip, twoPip]);
    const scoring: Die[] = [];
    const used = new Map<number, number>(); // pip → count used
    for (const d of dice) {
      if (!pairPips.has(d.value)) continue;
      const limit = d.value === threePip ? 3 : 2;
      const count = used.get(d.value) ?? 0;
      if (count < limit) {
        scoring.push(d);
        used.set(d.value, count + 1);
      }
    }
    return buildResult(HandType.FULL_HOUSE, scoring);
  }

  // Four straight
  if (straight.length >= 4) {
    const straightSet = new Set(straight.slice(0, 4));
    const used = new Set<number>();
    const scoringDice = dice.filter((d) => {
      if (!straightSet.has(d.value) || used.has(d.value)) return false;
      used.add(d.value);
      return true;
    });
    return buildResult(HandType.FOUR_STRAIGHT, scoringDice.slice(0, 4));
  }

  // Three of a kind
  if (counts[0] >= 3) {
    const pip = [...freq.entries()].find(([, c]) => c >= 3)![0];
    return buildResult(HandType.THREE_OF_A_KIND, dice.filter((d) => d.value === pip).slice(0, 3));
  }

  // Two pair
  if (counts[0] >= 2 && counts[1] >= 2) {
    const pairs = [...freq.entries()].filter(([, c]) => c >= 2).map(([p]) => p);
    const pairPips = new Set(pairs);
    const scoring: Die[] = [];
    const used = new Map<number, number>(); // pip → count used
    for (const d of dice) {
      if (!pairPips.has(d.value)) continue;
      const count = used.get(d.value) ?? 0;
      if (count < 2) {
        scoring.push(d);
        used.set(d.value, count + 1);
      }
    }
    return buildResult(HandType.TWO_PAIR, scoring);
  }

  // Pair
  if (counts[0] >= 2) {
    const pip = [...freq.entries()].find(([, c]) => c >= 2)![0];
    return buildResult(HandType.PAIR, dice.filter((d) => d.value === pip).slice(0, 2));
  }

  // High value — best single die
  const best = [...dice].sort((a, b) => b.value - a.value);
  return buildResult(HandType.HIGH_VALUE, [best[0]]);
}

// ─── Scoring ───

/**
 * Calculate score for a played hand.
 * miles = (handBaseMiles + sum of scoring dice values) × handBaseMult
 */
export function scoreHand(
  handResult: HandResult,
  equipment: EquipmentInstance[],
  scoreContext?: { currentDay: number; maxDays: number; rerollsRemaining?: number; allDice?: Die[] },
): ScoreResult {
  let totalValue = 0;
  let bonusMult = ZERO;
  let xMult = ONE;
  const player = getPlayerState();
  const animEvents: ScoreAnimEvent[] = [];

  // ─── Pre-scoring pass: Graverobber strips enhancements before dice score ───
  const maxCopyDepthGrave = equipment.length;
  for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
    let equip = equipment[eIdx];
    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, eIdx, maxCopyDepthGrave);
      if (!resolved) continue;
      equip = resolved;
    }
    if (equip.def.effectType !== 'GRAVEROBBER_XMULT') continue;
    const p = equip.def.effectParams as Record<string, unknown>;
    for (const die of handResult.scoringDice) {
      if (die.enhancement !== null) {
        equip.state.xMult = (equip.state.xMult ?? 1) + (p.value as number);
        // Emit strip event on die (visual: turn white) then xMult popup on equip card
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'strip', value: 0, dieId: die.id });
        animEvents.push({
          target: { kind: 'equip', equipIndex: eIdx },
          popupType: 'xmult',
          value: p.value as number,
          dieId: die.id,
        });
        console.log(
          `  [scoreHand] Graverobber: stripped ${die.enhancement} from die ${die.id}, xMult now ${equip.state.xMult}`,
        );
        // Strip from the scored die (rolled copy)
        die.enhancement = null;
        // Strip from the actual pouch die
        const pouchDie = player.dice.find((d) => d.id === die.id);
        if (pouchDie) pouchDie.enhancement = null;
      }
    }
  }

  // ─── Pre-scoring pass: Golden Spike, Lucky Find, etc. ───
  const preScoringMutations = createEmptyScoringMutations();
  if (scoreContext) {
    processEquipmentPreScoring(
      equipment,
      handResult.scoringDice,
      { currentDay: scoreContext.currentDay, maxDays: scoreContext.maxDays },
      preScoringMutations,
      animEvents,
    );
    applyDiceEnhancementMutations(preScoringMutations, handResult.scoringDice);
  }

  console.log('  [scoreHand] Step 3: Per-die scoring');

  const trailRound = player.trailRoundEffects;
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
    playerBalance: player.economy.balance,
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
  // Step 3: Per-die scoring (left to right)
  // Calculate global retrigger count (War Drums, Last Stand) once
  const globalRetriggerCount = getScoredRetriggerCount(equipment, scoreContext);
  const firstDieId = handResult.scoringDice.length > 0 ? handResult.scoringDice[0].id : null;
  const lastDieId =
    handResult.scoringDice.length > 0 ? handResult.scoringDice[handResult.scoringDice.length - 1].id : null;
  for (const die of handResult.scoringDice) {
    const bossDisabled = isDiceScoringDisabledByBoss(die);
    // Calculate how many times this die triggers (disabled dice: no retriggers/stickers)
    let triggers = 1;
    if (!bossDisabled) {
      triggers = die.sticker === 'red_bullet' ? 2 : 1;
      const maxCopyDepth = equipment.length;
      for (let ei = 0; ei < equipment.length; ei++) {
        let equip = equipment[ei];
        if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
          const resolved = resolveCopyTarget(equipment, ei, maxCopyDepth);
          if (!resolved) continue;
          equip = resolved;
        }
        if (
          equip.def.effectType === 'PIP_RETRIGGER' &&
          dieMatchesPip(die, equip.def.effectParams.pip as number, equipment, stackedDeck)
        ) {
          triggers++;
        }
        if (equip.def.effectType === 'FIRST_DICE_RETRIGGER' && die.id === firstDieId) {
          triggers += equip.def.effectParams.value as number;
        }
        if (equip.def.effectType === 'LAST_DICE_RETRIGGER' && die.id === lastDieId) {
          triggers += equip.def.effectParams.value as number;
        }
        if (equip.def.effectType === 'ENHANCED_RETRIGGER' && scoringEnhancement(die) !== null) {
          triggers++;
        }
      }
      triggers += globalRetriggerCount;
    }
    for (let t = 0; t < triggers; t++) {
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
          `  [scoreHand]   Die ${die.id}${triggerLabel}: +${dieMiles} ${scoringEnhancement(die) === 'stone' ? 'miles (STONE)' : 'value'} (total: ${totalValue})`,
        );
      } else {
        console.log(`  [scoreHand]   Die ${die.id}${triggerLabel}: DISABLED by boss (skipped)`);
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
        console.log(
          `  [scoreHand]   Die ${die.id}${triggerLabel}: +${die.bonusMiles} bonus miles (total: ${totalValue})`,
        );
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
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} BONE: +4 mult (bonusMult: ${bonusMult})`);
          break;
        case 'wooden':
          totalValue += 30;
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'miles', value: 30, dieId: die.id });
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} WOODEN: +30 miles (totalValue: ${totalValue})`);
          break;
        case 'diamond':
          xMult = multiplyScore(xMult, 2);
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'xmult', value: 2, dieId: die.id });
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} DIAMOND: x2 mult (xMult: ${xMult})`);
          break;
        case 'lucky': {
          const luckyMultChance: [number, number] = trailRound.luckyOddsHalved ? [1, 10] : [1, 5];
          const luckyMoneyChance: [number, number] = trailRound.luckyOddsHalved ? [1, 30] : [1, 15];
          if (checkLoadedChance(luckyMultChance, equipment, 'luckyDice')) {
            bonusMult = addScore(bonusMult, 20);
            animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'mult', value: 20, dieId: die.id });
            console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} LUCKY: hit +20 mult! (bonusMult: ${bonusMult})`);
            for (const e of equipment) dispatchLifecycle('on-lucky-trigger', e);
          }
          if (checkLoadedChance(luckyMoneyChance, equipment, 'luckyDice')) {
            player.economy.earn(20);
            animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'money', value: 20, dieId: die.id });
            console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} LUCKY: hit $20!`);
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
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} FIRE aura: +10 mult (bonusMult: ${bonusMult})`);
          break;
        case 'icy':
          totalValue += 50;
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'miles', value: 50, dieId: die.id });
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} ICY aura: +50 miles (totalValue: ${totalValue})`);
          break;
        case 'holy':
          xMult = multiplyScore(xMult, 1.5);
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'xmult', value: 1.5, dieId: die.id });
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} HOLY aura: x1.5 (xMult: ${xMult})`);
          break;
      }

      // Sticker effects (scored dice)
      if (die.sticker === 'purple_flower') {
        const supplyDef = getRandomSupplyDef();
        if (player.addConsumable(supplyDef)) {
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'supply', value: 0, dieId: die.id });
          console.log(
            `  [scoreHand]   Die ${die.id}${triggerLabel} STICKER purple_flower: granted supply card '${supplyDef.name}'`,
          );
        }
      }

      if (die.sticker === 'golden_dollar') {
        player.economy.earn(3);
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'money', value: 3, dieId: die.id });
        console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} STICKER golden_dollar: +$3`);
      }

      // 'On scored' equipment — items that trigger per matching die (left to right)
      for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
        if (isEquipmentDisabledByBoss(eIdx)) continue;
        const originalEquip = equipment[eIdx];
        let equip = originalEquip;

        if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
          const resolved = resolveCopyTarget(equipment, eIdx, equipment.length);
          if (!resolved) {
            console.log(`  [scoreHand]   ${originalEquip.def.name}: nothing to copy for per-die trigger`);
            continue;
          }
          equip = resolved;
        }

        const handler = effectRegistry.getPerDie(equip.def.effectType);
        if (handler) {
          handler(pipelineCtx, equip, eIdx, die, t);
        }
      }

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

  // FIRST_DAY_SOLO_COPY: Bloodline — copy the solo die if scored alone on day 1
  if (scoreContext && scoreContext.currentDay === 1 && handResult.scoringDice.length === 1) {
    const maxCopyDepthSolo = equipment.length;
    for (let ei = 0; ei < equipment.length; ei++) {
      let equip = equipment[ei];
      // Resolve copy items
      if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
        const resolved = resolveCopyTarget(equipment, ei, maxCopyDepthSolo);
        if (!resolved) continue;
        equip = resolved;
      }
      if (equip.def.effectType === 'FIRST_DAY_SOLO_COPY') {
        // Bloodline: copy the solo die into the collection
        const target = handResult.scoringDice[0];
        const copy = createDie({
          value: target.value,
          enhancement: target.enhancement,
          sticker: target.sticker,
          aura: target.aura,
          bonusMiles: target.bonusMiles,
        });
        player.dice.push(copy);
        console.log(`  [scoreHand] ${equip.def.name}: copied die ${target.id} → ${copy.id}`);
      }
    }
  }

  // FIRST_HAND_ENHANCED_SIX: Hellfire Round — destroy enhanced 6 on first hand, gain frontier card
  if (scoreContext && scoreContext.currentDay === 1) {
    for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
      const equip = equipment[eIdx];
      if (equip.def.effectType === 'FIRST_HAND_ENHANCED_SIX') {
        const target = handResult.scoringDice.find((d) => d.value === 6 && d.enhancement !== null);
        if (target) {
          // Mark die for destruction by removing from player's collection
          const idx = player.dice.findIndex((d) => d.id === target.id);
          if (idx >= 0) {
            const wasEnhanced = player.dice[idx].enhancement !== null;
            player.dice.splice(idx, 1);
            processEquipmentOnDiceDestroyed(player.equipment, 1, wasEnhanced ? 1 : 0);
            console.log(`  [scoreHand] ${equip.def.name}: destroyed enhanced 6 (${target.id}), granting frontier card`);
            // Grant frontier encounter card
            const frontierDef = getRandomFrontierDef();
            if (frontierDef) {
              player.consumables.push(createConsumableInstance(frontierDef));
              animEvents.push({ target: { kind: 'equip', equipIndex: eIdx }, popupType: 'supply', value: 0 });
            }
          }
        }
      }
    }
  }

  // Enhancement score destroy (e.g. diamond crack); Moonshine overrides diamond odds
  for (const scoredDie of handResult.scoringDice) {
    const destroyChance = resolveScoreDestroyChance(scoredDie, equipment, trailRound);
    if (!destroyChance) continue;
    if (!checkLoadedChance(destroyChance, equipment, 'diamondDice')) continue;

    const idx = player.dice.findIndex((d) => d.id === scoredDie.id);
    if (idx < 0) continue;

    animEvents.push({ target: { kind: 'die', dieId: scoredDie.id }, popupType: 'crack', value: 0 });

    const wasDiamond = player.dice[idx].enhancement === 'diamond';
    const wasEnhanced = player.dice[idx].enhancement !== null;
    player.dice.splice(idx, 1);
    processEquipmentOnDiceDestroyed(player.equipment, 1, wasEnhanced ? 1 : 0);
    console.log(`  [scoreHand] Score destroy (${scoredDie.enhancement}): destroyed die ${scoredDie.id}`);
    if (wasDiamond) {
      for (const e of equipment) dispatchLifecycle('on-diamond-destroyed', e);
    }
  }

  // Trail: chance to destroy each scored die (blood moon)
  const destroyChance = trailRound.scoredDiceDestroyChance;
  if (destroyChance > 0) {
    for (const scoredDie of handResult.scoringDice) {
      if (rngFloat('dice') >= destroyChance) continue;
      const idx = player.dice.findIndex((d) => d.id === scoredDie.id);
      if (idx < 0) continue;
      animEvents.push({ target: { kind: 'die', dieId: scoredDie.id }, popupType: 'crack', value: 0 });
      const wasEnhanced = player.dice[idx].enhancement !== null;
      player.dice.splice(idx, 1);
      processEquipmentOnDiceDestroyed(player.equipment, 1, wasEnhanced ? 1 : 0);
      console.log(`  [scoreHand] Trail curse: destroyed scored die ${scoredDie.id}`);
    }
  }

  // ENHANCED_RETRIGGER: Moonshine — enhanced dice have chance of being destroyed after scoring
  for (const equip of equipment) {
    if (equip.def.effectType !== 'ENHANCED_RETRIGGER') continue;

    const p = equip.def.effectParams as Record<string, unknown>;

    for (const scoredDie of handResult.scoringDice) {
      if (scoredDie.enhancement === null) continue;
      // Diamond crack is handled in the unified diamond crack pass above
      if (scoredDie.enhancement === 'diamond') continue;

      const chanceTuple = p.destroyChance as [number, number];
      if (!checkLoadedChance(chanceTuple, equipment)) continue;

      const idx = player.dice.findIndex((d) => d.id === scoredDie.id);
      if (idx < 0) continue;

      animEvents.push({ target: { kind: 'die', dieId: scoredDie.id }, popupType: 'crack', value: 0 });

      const wasEnhanced = player.dice[idx].enhancement !== null;
      player.dice.splice(idx, 1);
      processEquipmentOnDiceDestroyed(player.equipment, 1, wasEnhanced ? 1 : 0);
      console.log(`  [scoreHand] ${equip.def.name}: destroyed enhanced die ${scoredDie.id} (${scoredDie.enhancement})`);
    }
  }

  const mult = multiplyScore(addScore(handResult.baseMult, bonusMult), xMult);
  const miles = multiplyScore(addScore(handResult.baseMiles, totalValue), mult);
  console.log(
    `  [scoreHand] Result: (${handResult.baseMiles} baseMiles + ${totalValue} value) * (${handResult.baseMult} baseMult + ${bonusMult} bonus) * ${xMult} xMult = ${miles} miles (mult: ${mult})`,
  );
  return { handResult, totalValue, miles, mult, animEvents, mutations: pipelineCtx.mutations };
}
