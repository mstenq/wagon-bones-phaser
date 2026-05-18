// ─── Equipment Effects (No Phaser imports) ───
// Applies owned equipment effects to scoring and config.

import { Die, HandType, HandResult, HandDefinition, HandUpgradeInfo, ScoreResult, ScoreAnimEvent } from './types';
import { EquipmentInstance } from './ItemsSystem';
import { getPlayerState } from './PlayerState';
import { getRandomSupplyDef } from './ConsumablesSystem';
import { resolveCopyTarget, checkLoadedChance } from './Constants';
import handsData from '../data/hands.json';

const HAND_TABLE: HandDefinition[] = handsData as HandDefinition[];

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
  let bonusMiles = 0;
  let bonusMult = 0;

  // Max copy resolution depth = number of equipped items (prevents infinite loops)
  const maxCopyDepth = equipment.length;

  for (let i = 0; i < equipment.length; i++) {
    const originalEquip = equipment[i];
    let equip = originalEquip;

    // Resolve copy items (Mirror Lake / Echo Chamber)
    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, i, maxCopyDepth);
      if (!resolved) {
        console.log(`  [equip] ${equip.def.name}: nothing to copy`);
        // Still apply own aura below
        equip = { ...originalEquip, def: { ...originalEquip.def, effectType: 'NONE' } } as EquipmentInstance;
      } else {
        console.log(`  [equip] ${equip.def.name}: copying ${resolved.def.name}`);
        // Use the resolved equipment's def but keep the original's position for anim events
        equip = resolved;
      }
    }

    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;

    switch (effectType) {
      case 'ADD_MULT':
      case 'NEGATE_WAGON_DAMAGE':
        bonusMult += p.value as number;
        animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: p.value as number });
        console.log(`  [equip] ${equip.def.name}: ADD_MULT +${p.value} (bonusMult: ${bonusMult})`);
        break;

      case 'ADD_MULT_RISKY':
        bonusMult += p.value as number;
        animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: p.value as number });
        break;

      case 'HAND_MULT':
        if (handTypeMatches(context.handResult.type, p.handType as string)) {
          bonusMult += p.value as number;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: p.value as number });
        }
        break;

      case 'HAND_MILES':
        if (handTypeMatches(context.handResult.type, p.handType as string)) {
          bonusMiles += p.value as number;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: p.value as number });
        }
        break;

      case 'MILES_PER_UNUSED_REROLL': {
        const total = (p.value as number) * context.rerollsRemaining;
        if (total > 0) {
          bonusMiles += total;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: total });
        }
        break;
      }

      case 'CONDITIONAL_MULT': {
        const condition = p.condition as string;
        let met = false;
        if (condition === 'SCORED_DICE_LTE') {
          met = context.scoringDice.length <= (p.threshold as number);
        } else if (condition === 'NO_REROLLS') {
          met = context.rerollsRemaining === 0;
        }
        if (met) {
          bonusMult += p.value as number;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: p.value as number });
        }
        break;
      }

      case 'MULT_PER_EQUIPMENT': {
        const total = (p.value as number) * context.equipmentCount;
        if (total > 0) {
          bonusMult += total;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: total });
        }
        break;
      }

      case 'MILES_PER_DOLLAR': {
        const milesGain = (p.value as number) * context.playerBalance;
        if (milesGain > 0) {
          bonusMiles += milesGain;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: milesGain });
        }
        console.log(
          `  [equip] ${equip.def.name}: +${milesGain} miles ($${context.playerBalance} × ${p.value}) (bonusMiles: ${bonusMiles})`,
        );
        break;
      }

      case 'SELL_VALUE_AS_MULT': {
        let totalSellValue = 0;
        for (const other of equipment) {
          if (other !== equip) totalSellValue += other.sellValue;
        }
        if (totalSellValue > 0) {
          bonusMult += totalSellValue;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: totalSellValue });
        }
        console.log(`  [equip] ${equip.def.name}: +${totalSellValue} mult (sell values) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'STATEFUL_ADD_MULT': {
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(`  [equip] ${equip.def.name}: +${val} mult (stateful) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'DECAYING_MULT': {
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(`  [equip] ${equip.def.name}: +${val} mult (decaying) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'HAND_MULT_GAIN': {
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(
          `  [equip] ${equip.def.name}: +${val} mult (accumulated) (bonusMult: ${bonusMult})`,
        );
        break;
      }

      case 'SHOP_REROLL_MULT_GAIN': {
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(
          `  [equip] ${equip.def.name}: +${val} mult (reroll gains) (bonusMult: ${bonusMult})`,
        );
        break;
      }

      case 'ENHANCED_SPENT_MILES_GAIN': {
        const val = equip.state.miles ?? 0;
        if (val > 0) {
          bonusMiles += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: val });
        }
        console.log(
          `  [equip] ${equip.def.name}: +${val} miles (accumulated) (bonusMiles: ${bonusMiles})`,
        );
        break;
      }

      case 'RANDOM_MULT': {
        const min = p.min as number;
        const max = p.max as number;
        const roll = Math.floor(Math.random() * (max - min + 1)) + min;
        bonusMult += roll;
        animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: roll });
        console.log(`  [equip] ${equip.def.name}: +${roll} mult (random ${min}-${max}) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'ROUND_START_DESTROY_RIGHT': {
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(`  [equip] ${equip.def.name}: +${val} mult (accumulated) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'HAND_TIMES_PLAYED_MULT': {
        // Trail Journal: add times this hand type has been played as mult
        if (context.handType) {
          const player = getPlayerState();
          const stats = player.getHandStats(context.handType);
          const val = stats.timesPlayed;
          if (val > 0) {
            bonusMult += val;
            animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
          }
          console.log(`  [equip] ${equip.def.name}: +${val} mult (${context.handType} played ${val} times)`);
        }
        break;
      }

      case 'MARKED_NO_SIX_MULT': {
        // Marked: accumulated mult (resets when a 6 is scored)
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(`  [equip] ${equip.def.name}: +${val} mult (no 6s streak) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'STATEFUL_ADD_MILES': {
        // Steam Engine: add current miles value
        const val = equip.state.miles ?? 0;
        if (val > 0) {
          bonusMiles += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: val });
        }
        console.log(`  [equip] ${equip.def.name}: +${val} miles (stateful) (bonusMiles: ${bonusMiles})`);
        break;
      }

      case 'TRAIL_TAX': {
        // Trail Tax: accumulated mult from days travelled minus rerolls
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        console.log(`  [equip] ${equip.def.name}: +${val} mult (trail tax) (bonusMult: ${bonusMult})`);
        break;
      }

      case 'WANTED_HAND_MONEY': {
        // Wanted Poster: earn money if hand matches target
        const handTypes = Object.values(HandType);
        const targetIdx = equip.state.targetHand ?? 0;
        const targetHand = handTypes[targetIdx % handTypes.length];
        if (context.handType === targetHand) {
          const val = p.value as number;
          const player = getPlayerState();
          player.economy.earn(val);
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'money', value: val });
          console.log(`  [equip] ${equip.def.name}: +$${val} (hand matched ${targetHand})`);
        }
        break;
      }

      case 'TRAIL_GUIDE_XMULT':
      case 'LUCKY_TRIGGER_XMULT':
      case 'SELL_XMULT_GAIN':
      case 'XMULT_RISKY':
      case 'REPEAT_HAND_XMULT':
      case 'ROUND_START_XMULT_DESTROY':
      case 'EMPTY_SLOT_XMULT':
      case 'ROUNDS_SKIPPED_XMULT':
      case 'DIAMOND_DESTROYED_XMULT':
      case 'RAINBOW_TRAIL_XMULT':
        // These are xMult effects, handled in the xMult pass below
        break;

      case 'EXACT_DICE_COUNT_MILES': {
        // Square Dance: accumulated miles apply during scoring
        const val = equip.state.miles ?? 0;
        if (val > 0) {
          bonusMiles += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: val });
        }
        break;
      }

      case 'SUPPLY_USED_MULT': {
        // Campfire Stories: accumulated mult applies during scoring
        const val = equip.state.mult ?? 0;
        if (val > 0) {
          bonusMult += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: val });
        }
        break;
      }

      case 'ENHANCEMENT_COUNT_MILES': {
        // Quarry Mine: +miles per matching enhancement in collection
        const enhancement = p.enhancement as string;
        const perValue = p.value as number;
        const allDice = context.allDice ?? [];
        const enhCount = allDice.filter((d) => d.enhancement === enhancement).length;
        if (enhCount > 0) {
          const total = enhCount * perValue;
          bonusMiles += total;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: total });
        }
        break;
      }

      case 'HAND_MILES_GAIN': {
        // Manifest Destiny: accumulated miles apply during scoring
        const val = equip.state.miles ?? 0;
        if (val > 0) {
          bonusMiles += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: val });
        }
        break;
      }

      case 'ENHANCEMENT_SCORED_MILES': {
        // Covered Wagon: accumulated miles apply during scoring
        const val = equip.state.miles ?? 0;
        if (val > 0) {
          bonusMiles += val;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: val });
        }
        break;
      }
    }

    // Apply item aura bonuses (always from the ORIGINAL item, not the copied target)
    if (originalEquip.def.aura) {
      switch (originalEquip.def.aura.id) {
        case 'fire':
          bonusMult += 10;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: 10 });
          console.log(`  [equip] ${originalEquip.def.name} FIRE aura: +10 mult (bonusMult: ${bonusMult})`);
          break;
        case 'icy':
          bonusMiles += 50;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: 50 });
          console.log(`  [equip] ${originalEquip.def.name} ICY aura: +50 miles (bonusMiles: ${bonusMiles})`);
          break;
      }
    }
  }

  console.log(`  [equip] Step 4 totals: bonusMiles: ${bonusMiles}, bonusMult: ${bonusMult}`);

  const totalValue = baseResult.totalValue;
  const baseMiles = baseResult.handResult.baseMiles;
  let finalMult = baseResult.mult + bonusMult;

  // Apply holy aura xMult (multiplicative, applied last)
  for (let i = 0; i < equipment.length; i++) {
    const equip = equipment[i];
    if (equip.def.aura?.id === 'holy') {
      finalMult = finalMult * 1.5;
      animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: 1.5 });
      console.log(`  [equip] ${equip.def.name} HOLY aura: x1.5 mult (finalMult: ${finalMult})`);
    }
  }

  // Apply equipment xMult effects (multiplicative, after additives + auras)
  for (let i = 0; i < equipment.length; i++) {
    let equip = equipment[i];

    // Resolve copy items (Mirror Lake / Echo Chamber) for xMult pass
    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, i, maxCopyDepth);
      if (!resolved) continue;
      equip = resolved;
    }

    const { effectType } = equip.def;

    switch (effectType) {
      case 'UNCOMMON_EQUIP_XMULT': {
        const uncommonCount = equipment.filter((e) => e.def.rarity === 'uncommon').length;
        if (uncommonCount > 0) {
          const xVal = Math.pow(1.5, uncommonCount);
          finalMult *= xVal;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(`  [equip] ${equip.def.name}: x1.5 × ${uncommonCount} uncommon items (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'FINAL_DAY_XMULT': {
        const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
        if (context.currentDay >= context.maxDays) {
          finalMult *= xVal;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(
            `  [equip] ${equip.def.name}: x${xVal} (final day ${context.currentDay}/${context.maxDays}) (finalMult: ${finalMult})`,
          );
        } else {
          console.log(`  [equip] ${equip.def.name}: inactive (day ${context.currentDay}/${context.maxDays})`);
        }
        break;
      }
      case 'STATEFUL_XMULT': {
        const xm = equip.state.xMult ?? 1;
        if (xm !== 1) {
          finalMult *= xm;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xm });
          console.log(`  [equip] ${equip.def.name}: x${xm} (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'LUCKY_TRIGGER_XMULT':
      case 'SELL_XMULT_GAIN': {
        const xm = equip.state.xMult ?? 1;
        if (xm !== 1) {
          finalMult *= xm;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xm });
          console.log(`  [equip] ${equip.def.name}: x${xm} (finalMult: ${finalMult})`);
        } else {
          console.log(`  [equip] ${equip.def.name}: x1 (no bonus yet)`);
        }
        break;
      }
      case 'TRAIL_GUIDE_XMULT': {
        const xm = equip.state.xMult ?? 1;
        if (xm > 1) {
          finalMult *= xm;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xm });
          console.log(`  [equip] ${equip.def.name}: x${xm} (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'DECAYING_XMULT': {
        const xm = equip.state.xMult ?? 1;
        if (xm > 0 && xm !== 1) {
          finalMult *= xm;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xm });
          console.log(`  [equip] ${equip.def.name}: x${xm} (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'EVERY_NTH_HAND_XMULT': {
        const n = (equip.def.effectParams as Record<string, unknown>).n as number;
        const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
        const hands = equip.state.handsPlayed ?? 0;
        if (hands > 0 && hands % n === 0) {
          finalMult *= xVal;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(`  [equip] ${equip.def.name}: x${xVal} (hand #${hands}, every ${n}th) (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'ENHANCEMENT_COUNT_XMULT': {
        const enhancement = (equip.def.effectParams as Record<string, unknown>).enhancement as string;
        const perValue = (equip.def.effectParams as Record<string, unknown>).value as number;
        const allDice = context.allDice ?? [];
        const enhCount = allDice.filter((d) => d.enhancement === enhancement).length;
        if (enhCount > 0) {
          const xVal = 1 + enhCount * perValue;
          finalMult *= xVal;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(`  [equip] ${equip.def.name}: x${xVal.toFixed(1)} (${enhCount} ${enhancement} dice) (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'XMULT_RISKY': {
        // Nitro: flat xMult (destroy chance handled in processEndOfRound)
        const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
        finalMult *= xVal;
        animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
        console.log(`  [equip] ${equip.def.name}: x${xVal} (finalMult: ${finalMult})`);
        break;
      }
      case 'REPEAT_HAND_XMULT': {
        // Repeat Offender: x3 if hand type was already played this round
        const xVal = (equip.def.effectParams as Record<string, unknown>).value as number;
        // Check if this hand type has been played before this scoring (state key is the hand type name)
        const handKey = `round_${context.handType}`;
        if (context.handType && (equip.state[handKey] ?? 0) > 0) {
          finalMult *= xVal;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(`  [equip] ${equip.def.name}: x${xVal} (repeat hand ${context.handType}) (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'ROUND_START_XMULT_DESTROY': {
        // Haunted Totem: accumulated xMult applies
        const xm = equip.state.xMult ?? 1;
        if (xm > 1) {
          finalMult *= xm;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xm });
          console.log(`  [equip] ${equip.def.name}: x${xm} (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'EMPTY_SLOT_XMULT': {
        // One-Man Posse: x1 per empty equipment slot
        const player = getPlayerState();
        const emptySlots = player.maxEquipmentSlots - player.usedEquipmentSlots;
        if (emptySlots > 0) {
          const xVal = 1 + emptySlots * ((equip.def.effectParams as Record<string, unknown>).value as number);
          finalMult *= xVal;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(`  [equip] ${equip.def.name}: x${xVal} (${emptySlots} empty slots) (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'ROUNDS_SKIPPED_XMULT': {
        // Shortcut Trail: x0.25 per round of journey skipped (tracked in state)
        const skipped = equip.state.roundsSkipped ?? 0;
        if (skipped > 0) {
          const xVal = 1 + skipped * ((equip.def.effectParams as Record<string, unknown>).value as number);
          finalMult *= xVal;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(`  [equip] ${equip.def.name}: x${xVal} (${skipped} rounds skipped) (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'DIAMOND_DESTROYED_XMULT': {
        // Diamond Coffin: accumulated xMult from diamond destruction
        const xm = equip.state.xMult ?? 1;
        if (xm > 1) {
          finalMult *= xm;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xm });
          console.log(`  [equip] ${equip.def.name}: x${xm} (finalMult: ${finalMult})`);
        }
        break;
      }
      case 'RAINBOW_TRAIL_XMULT': {
        // Rainbow Trail: xN based on number of different enhancement types scored
        const enhTypes = new Set(
          context.scoringDice
            .filter((d) => d.enhancement !== null)
            .map((d) => d.enhancement),
        );
        if (enhTypes.size >= 2) {
          const xVal = enhTypes.size;
          finalMult *= xVal;
          animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: xVal });
          console.log(`  [equip] ${equip.def.name}: x${xVal} (${enhTypes.size} enhancement types) (finalMult: ${finalMult})`);
        }
        break;
      }
    }
  }

  const finalMiles = (baseMiles + totalValue + bonusMiles) * finalMult;
  console.log(
    `  [equip] Final: (${baseMiles} base + ${totalValue} value + ${bonusMiles} bonusMiles) * ${finalMult} = ${finalMiles} miles`,
  );

  return {
    handResult: baseResult.handResult,
    totalValue,
    miles: finalMiles,
    mult: finalMult,
    animEvents: baseResult.animEvents.concat(animEvents),
  };
}

/**
 * Get config modifications from equipment (hand size, rerolls).
 */
export function getConfigModifiers(equipment: EquipmentInstance[]): {
  rerollsBonus: number;
  freeShopRerolls: number;
} {
  let rerollsBonus = 0;
  let freeShopRerolls = 0;

  for (const equip of equipment) {
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;

    if (effectType === 'MODIFY_REROLLS') {
      rerollsBonus += p.value as number;
    }
    if (effectType === 'FREE_SHOP_REROLL') {
      freeShopRerolls += p.value as number;
    }
  }

  return { rerollsBonus, freeShopRerolls };
}

/**
 * Process end-of-round effects. Returns money earned and equipment to destroy.
 */
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
      moneyEarned += p.value as number;
    }

    if (effectType === 'END_ROUND_MONEY_SCALING') {
      // Railroad Bonds: $1 base + $2 per boss defeated while equipped
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
  }

  return { moneyEarned, destroyedIndices };
}

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
  let moneyEarned = 0;
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
    if (equip.def.effectType === 'HELD_RETRIGGER') doubleDownCount++;
  }

  // Find the lowest held die value for Bottom Dollar
  const lowestValue = heldDice.length > 0 ? Math.min(...heldDice.map((d) => d.value)) : 0;

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
        xMult *= 1.5;
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'xmult', value: 1.5 });
        console.log(`  [held] Die ${die.id}${triggerLabel}: STEEL x1.5 mult (xMult: ${xMult})`);
      }

      // Sticker effects on held dice
      if (die.sticker === 'blue_moon') {
        trailGuidesForHand++;
        console.log(`  [held] Die ${die.id}${triggerLabel}: BLUE_MOON +1 trail guide for scored hand`);
      }

      // Equipment triggers on held dice
      for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
        const equip = equipment[eIdx];
        const { effectType, effectParams } = equip.def;
        const p = effectParams as Record<string, unknown>;

        switch (effectType) {
          case 'HELD_LOWEST_MULT':
            if (die.value === lowestValue && die === heldDice.find((d) => d.value === lowestValue)) {
              bonusMult += lowestValue * 2;
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'mult', value: lowestValue * 2 });
              console.log(
                `  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: +${lowestValue * 2} mult (bonusMult: ${bonusMult})`,
              );
            }
            break;

          case 'HELD_PIP_XMULT':
            if (die.value === (p.pip as number)) {
              xMult *= p.value as number;
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'xmult', value: p.value as number });
              console.log(
                `  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: x${p.value} mult (xMult: ${xMult})`,
              );
            }
            break;

          case 'HELD_PIP_MULT':
            if (die.value === (p.pip as number)) {
              bonusMult += p.value as number;
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'mult', value: p.value as number });
              console.log(
                `  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} mult (bonusMult: ${bonusMult})`,
              );
            }
            break;

          case 'HELD_ENHANCED_MONEY':
            if (die.enhancement !== null) {
              const [num, den] = p.chance as [number, number];
              if (Math.random() < num / den) {
                moneyEarned += p.value as number;
                animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'money', value: p.value as number });
                console.log(
                  `  [held] Die ${die.id}${triggerLabel} → ${equip.def.name}: +$${p.value} (total: $${moneyEarned})`,
                );
              }
            }
            break;
        }
      }
    }
  }

  console.log(
    `  [held] Totals: bonusMult: ${bonusMult}, xMult: ${xMult}, money: $${moneyEarned}, trailGuides: ${trailGuidesForHand}`,
  );
  return { bonusMult, xMult, moneyEarned, trailGuidesForHand, animEvents };
}

// ─── Helpers ───

/** Check if the played hand type matches or contains the required type.
 *  e.g. FULL_HOUSE contains PAIR and THREE_OF_A_KIND */
function handTypeMatches(played: HandType, required: string): boolean {
  if (played === required) return true;

  // A full house contains pair, three of a kind, and two pair
  if (played === HandType.FULL_HOUSE) {
    if (required === HandType.PAIR || required === HandType.THREE_OF_A_KIND || required === HandType.TWO_PAIR)
      return true;
  }
  // Two pair contains pair
  if (played === HandType.TWO_PAIR && required === HandType.PAIR) return true;
  // Three of a kind contains pair
  if (played === HandType.THREE_OF_A_KIND && required === HandType.PAIR) return true;
  // Four of a kind contains three of a kind, pair, and two pair
  if (played === HandType.FOUR_OF_A_KIND) {
    if (required === HandType.THREE_OF_A_KIND || required === HandType.PAIR) return true;
  }
  // Five of a kind contains four, three, pair, two pair, full house
  if (played === HandType.FIVE_OF_A_KIND) {
    if (
      required === HandType.FOUR_OF_A_KIND ||
      required === HandType.THREE_OF_A_KIND ||
      required === HandType.PAIR ||
      required === HandType.TWO_PAIR ||
      required === HandType.FULL_HOUSE
    )
      return true;
  }
  // Five straight contains four straight and three straight
  if (played === HandType.FIVE_STRAIGHT) {
    if (required === HandType.FOUR_STRAIGHT) return true;
  }

  return false;
}

// ─── Equipment State Update Functions ───

/** Step 2: "On Played" items that activate BEFORE scoring.
 *  These update equipment state so their bonuses apply to the current hand. */
export function processEquipmentOnHandPlayed(equipment: EquipmentInstance[], handType: HandType, scoringDice?: Die[]): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'HAND_MULT_GAIN':
        // Card Counter: gains +mult if hand contains required type
        if (handTypeMatches(handType, equip.def.effectParams.handType as string)) {
          equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.value as number);
        }
        break;
      case 'EVERY_NTH_HAND_XMULT':
        // Six Shooter: track hands played
        equip.state.handsPlayed = (equip.state.handsPlayed ?? 0) + 1;
        break;
      case 'MARKED_NO_SIX_MULT': {
        // Marked: +1 mult per hand without a 6, reset on 6
        const hasSix = scoringDice ? scoringDice.some((d) => d.value === 6) : false;
        if (hasSix) {
          equip.state.mult = 0;
        } else {
          equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.multPerHand as number);
        }
        break;
      }
      case 'EXACT_DICE_COUNT_MILES': {
        // Square Dance: gains miles if exactly N dice are played
        const count = equip.def.effectParams.count as number;
        const diceCount = scoringDice?.length ?? 0;
        if (diceCount === count) {
          equip.state.miles = (equip.state.miles ?? 0) + (equip.def.effectParams.value as number);
        }
        break;
      }
      case 'HAND_MILES_GAIN': {
        // Manifest Destiny: gains miles if hand contains required type
        if (handTypeMatches(handType, equip.def.effectParams.handType as string)) {
          equip.state.miles = (equip.state.miles ?? 0) + (equip.def.effectParams.value as number);
        }
        break;
      }
    }
  }
}

/** Called AFTER a hand is scored. Updates equipment that should not affect current hand's score.
 *  Returns any hand upgrades that occurred (e.g. Surveyor's Transit). */
export function processEquipmentAfterHandScored(equipment: EquipmentInstance[], handType: HandType, scoringDice?: Die[]): HandUpgradeInfo[] {
  const upgrades: HandUpgradeInfo[] = [];
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'STATEFUL_ADD_MILES': {
        // Steam Engine: -5 miles per hand played
        const decay = equip.def.effectParams.decayPerHand as number;
        equip.state.miles = Math.max(0, (equip.state.miles ?? 0) - decay);
        break;
      }
      case 'HAND_UPGRADE_CHANCE': {
        // Surveyor's Transit: chance to upgrade hand knowledge
        if (checkLoadedChance(equip.def.effectParams.chance as [number, number], equipment)) {
          const player = getPlayerState();
          const stats = player.getHandStats(handType);
          const handDef = HAND_TABLE.find((h) => h.type === handType)!;
          const oldLevel = stats.level;
          const oldBaseMiles = handDef.baseMiles + stats.milesPerLevel * (oldLevel - 1);
          const oldBaseMult = handDef.baseMult + stats.multPerLevel * (oldLevel - 1);

          player.upgradeHandLevel(handType);

          const newLevel = stats.level;
          const newBaseMiles = handDef.baseMiles + stats.milesPerLevel * (newLevel - 1);
          const newBaseMult = handDef.baseMult + stats.multPerLevel * (newLevel - 1);

          upgrades.push({
            handType,
            handName: handDef.name,
            oldLevel,
            newLevel,
            oldBaseMiles,
            newBaseMiles,
            oldBaseMult,
            newBaseMult,
          });
        }
        break;
      }
      case 'REPEAT_HAND_XMULT': {
        // Repeat Offender: track hands played this round using state keys
        const handKey = `round_${handType}`;
        equip.state[handKey] = (equip.state[handKey] ?? 0) + 1;
        break;
      }
      case 'LOW_MONEY_SUPPLY': {
        // Emergency Supplies: create supply card if balance <= threshold
        const threshold = equip.def.effectParams.threshold as number;
        const player = getPlayerState();
        if (player.economy.balance <= threshold) {
          const supplyDef = getRandomSupplyDef();
          player.addConsumable(supplyDef);
        }
        break;
      }
    }
  }
  return upgrades;
}

/** Called when the player rerolls dice. Updates stateful equipment. */
export function processEquipmentOnReroll(equipment: EquipmentInstance[], diceCount: number): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'DECAYING_XMULT':
        // Worn Deck: loses xMult per die rerolled
        equip.state.xMult = Math.max(
          0,
          (equip.state.xMult ?? 1) - (equip.def.effectParams.decayPerDie as number) * diceCount,
        );
        break;
      case 'TRAIL_TAX': {
        // Trail Tax: -1 mult per re-roll used
        const loss = (equip.def.effectParams as Record<string, unknown>).multLostPerReroll as number;
        equip.state.mult = Math.max(0, (equip.state.mult ?? 0) - loss);
        break;
      }
    }
  }
}

/** Called when the player rerolls the shop. */
export function processEquipmentOnShopReroll(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'SHOP_REROLL_MULT_GAIN':
        // Bargain Bin: gains +mult per shop reroll
        equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.value as number);
        break;
    }
  }
}

/** Called when the player sells equipment. */
export function processEquipmentOnSell(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'SELL_XMULT_GAIN':
        // Snake Oil Ledger: gains xMult per card sold
        equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.value as number);
        break;
    }
  }
}

/** Called when a boss is defeated. Resets specific equipment state. */
export function processEquipmentOnBossDefeat(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'SELL_XMULT_GAIN':
        // Snake Oil Ledger: resets on boss defeat
        equip.state.xMult = 1;
        break;
      case 'END_ROUND_MONEY_SCALING':
        // Railroad Bonds: track bosses defeated while equipped
        equip.state.bossesDefeated = (equip.state.bossesDefeated ?? 0) + 1;
        break;
    }
  }
}

/** Called when enhanced dice are spent. Updates Bone Collector. */
export function processEquipmentOnDiceSpent(equipment: EquipmentInstance[], spentDice: Die[]): void {
  const enhancedCount = spentDice.filter((d) => d.enhancement !== null).length;
  if (enhancedCount === 0) return;
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'ENHANCED_SPENT_MILES_GAIN':
        // Bone Collector: gains miles per enhanced dice spent
        equip.state.miles = (equip.state.miles ?? 0) + (equip.def.effectParams.value as number) * enhancedCount;
        break;
    }
  }
}

/** Called when a lucky die triggers (mult or money). Updates Rabbit's Foot. */
export function processEquipmentOnLuckyTrigger(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    switch (equip.def.effectType) {
      case 'LUCKY_TRIGGER_XMULT':
        // Rabbit's Foot: gains xMult per lucky trigger
        equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.value as number);
        break;
    }
  }
}

/** A single animated equipment destruction: source triggered victim's removal */
export interface AnimatedDestruction {
  sourceIdx: number;
  victimIdx: number;
}

/** Called at the start of each round. Updates/removes decaying equipment.
 *  Returns indices of equipment to remove. Equipment is processed left-to-right;
 *  if one item destroys another that hasn't triggered yet, the destroyed item is skipped. */
export function processEquipmentOnRoundStart(equipment: EquipmentInstance[], isBossRound: boolean = false): { destroyedIndices: number[]; animatedDestructions: AnimatedDestruction[]; equipmentToCreate: number; equipmentCreateRarity: string; stoneDiceToAdd: number; daysBonus: number; loseAllRerolls: boolean; burnBarrelMoney: number; burnBarrelTriggered: boolean } {
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
    }
  }
  return { destroyedIndices, animatedDestructions, equipmentToCreate, equipmentCreateRarity, stoneDiceToAdd, daysBonus, loseAllRerolls, burnBarrelMoney, burnBarrelTriggered };
}

/** Called at the end of each day. Updates War Drums counter and Trail Tax. */
export function processEquipmentOnDayEnd(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    if (equip.def.effectType === 'SCORED_RETRIGGER_TIMED') {
      if ((equip.state.daysRemaining ?? 0) > 0) {
        equip.state.daysRemaining--;
      }
    }
    if (equip.def.effectType === 'TRAIL_TAX') {
      const multPerDay = (equip.def.effectParams as Record<string, unknown>).multPerDay as number;
      equip.state.mult = (equip.state.mult ?? 0) + multPerDay;
    }
  }
}

/** Check if any equipment has active scored-dice retrigger effect. */
export function getScoredRetriggerCount(equipment: EquipmentInstance[], context?: { currentDay: number; maxDays: number }): number {
  let count = 0;
  const maxCopyDepth = equipment.length;
  for (let i = 0; i < equipment.length; i++) {
    let equip = equipment[i];
    // Resolve copy items
    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, i, maxCopyDepth);
      if (!resolved) continue;
      equip = resolved;
    }
    if (equip.def.effectType === 'SCORED_RETRIGGER_TIMED' && (equip.state.daysRemaining ?? 0) > 0) {
      count++;
    }
    if (equip.def.effectType === 'SCORED_RETRIGGER_FINAL_DAY' && context && context.currentDay >= context.maxDays) {
      count++;
    }
  }
  return count;
}

/** Check if any equipment prevents death. Returns the index of the first one found, or -1. */
export function findDeathPrevention(equipment: EquipmentInstance[], totalMiles: number, targetMiles: number): number {
  for (let i = 0; i < equipment.length; i++) {
    if (equipment[i].def.effectType === 'PREVENT_DEATH') {
      const threshold = (equipment[i].def.effectParams.threshold as number) ?? 0.25;
      if (totalMiles >= targetMiles * threshold) {
        return i;
      }
    }
  }
  return -1;
}

/** Get config modifiers that affect days (e.g. Stagecoach -1 day). */
export function getDayModifiers(equipment: EquipmentInstance[]): { daysPenalty: number } {
  let daysPenalty = 0;
  for (const equip of equipment) {
    if (equip.def.effectType === 'AUTO_REFRESH_REDUCE_DAYS') {
      daysPenalty += (equip.def.effectParams.daysPenalty as number) ?? 1;
    }
  }
  return { daysPenalty };
}

/** Called when a new leg starts. Processes leg-specific transitions (permits, etc.).
 *  Most equipment effects have moved to processEquipmentOnRoundStart. */
export function processEquipmentOnLegStart(_equipment: EquipmentInstance[]): void {
  // All effects previously here (Haunted Totem, Antique Revolver, Hardtack, Wanted Poster)
  // have been moved to processEquipmentOnRoundStart.
}

/** Called when a new die is added to the collection. Updates New Blood. */
export function processEquipmentOnDiceAdded(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    if (equip.def.effectType === 'STATEFUL_XMULT' && equip.def.effectParams.gainOnDiceAdded) {
      equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.gainOnDiceAdded as number);
    }
  }
}

/** Called when a supply card is used. Updates Campfire Stories. */
export function processEquipmentOnSupplyUsed(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    if (equip.def.effectType === 'SUPPLY_USED_MULT') {
      equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.value as number);
    }
  }
}

/** Called when a booster pack is skipped. Updates Tight Fist. */
export function processEquipmentOnPackSkipped(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    if (equip.def.effectType === 'STATEFUL_ADD_MULT' && equip.def.effectParams.gainOnPackSkip) {
      equip.state.mult = (equip.state.mult ?? 0) + (equip.def.effectParams.gainOnPackSkip as number);
    }
  }
}

/** Called when a booster pack is opened. Returns true if a supply card should be granted (Leftovers). */
export function processEquipmentOnPackOpened(equipment: EquipmentInstance[]): boolean {
  for (const equip of equipment) {
    if (equip.def.effectType === 'PACK_OPEN_SUPPLY_CHANCE') {
      if (checkLoadedChance(equip.def.effectParams.chance as [number, number], equipment)) {
        return true;
      }
    }
  }
  return false;
}

/** Called when a diamond die is destroyed. Updates Diamond Coffin. */
export function processEquipmentOnDiamondDestroyed(equipment: EquipmentInstance[]): void {
  for (const equip of equipment) {
    if (equip.def.effectType === 'DIAMOND_DESTROYED_XMULT') {
      equip.state.xMult = (equip.state.xMult ?? 1) + (equip.def.effectParams.value as number);
    }
  }
}
