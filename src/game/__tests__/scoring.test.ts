import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import {
  die,
  diceFromValues,
  diceWithValue,
  item,
  itemWithAura,
  calculateTestScore,
  setupGame,
  resetDieIds,
} from './testHelpers';
import { HandType } from '../types';
import { eq, gt, balanceMilesAndMult } from '../scoreMath';
import { resolveScoreDestroyChance } from '../DiceSystem';
import { createEmptyTrailRoundEffects } from '../TrailEventsSystem';
import { getEnhancementScoreDestroyChance } from '../../data/dice_enhancements';
import { resetPlayerState } from '../PlayerState';
import { detectBestHand, rollDie, setDieEnhancement } from '../DiceSystem';
import { initRunRng } from '../RunRng';
import { GAMEPLAY } from '../Constants';

beforeEach(() => {
  resetDieIds();
});

// ─── Basic Hand Detection & Scoring ───

describe('basic scoring (no equipment)', () => {
  test('high value — single die', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 10 })],
    });
    // HIGH_VALUE: baseMiles=5, baseMult=1
    // miles = (5 + 10) * 1 = 15
    expect(result.handResult.type).toBe(HandType.HIGH_VALUE);
    expect(result.miles).toBeMiles(15);
    expect(result.mult).toBeMult(1);
  });

  test('pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(7, 2),
    });
    // PAIR: baseMiles=10, baseMult=1
    // miles = (10 + 14) * 1 = 24
    expect(result.handResult.type).toBe(HandType.PAIR);
    expect(result.miles).toBeMiles(24);
  });

  test('three of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 3),
    });
    // THREE_OF_A_KIND: baseMiles=20, baseMult=3
    // miles = (20 + 12) * 3 = 96
    expect(result.handResult.type).toBe(HandType.THREE_OF_A_KIND);
    expect(result.miles).toBeMiles(96);
  });

  test('full house', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(5, 3), ...diceWithValue(8, 2)],
    });
    // FULL_HOUSE: baseMiles=25, baseMult=4
    // totalValue = 5*3 + 8*2 = 31
    // miles = (25 + 31) * 4 = 224
    expect(result.handResult.type).toBe(HandType.FULL_HOUSE);
    expect(result.miles).toBeMiles(224);
  });

  test('five of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(12, 5),
    });
    // FIVE_OF_A_KIND: baseMiles=50, baseMult=6
    // totalValue = 60
    // miles = (50 + 60) * 6 = 660
    expect(result.handResult.type).toBe(HandType.FIVE_OF_A_KIND);
    expect(result.miles).toBeMiles(660);
  });

  test('five straight', () => {
    const { result } = calculateTestScore({
      scoredDice: diceFromValues([8, 9, 10, 11, 12]),
    });
    // FIVE_STRAIGHT: baseMiles=30, baseMult=4
    // totalValue = 50
    // miles = (30 + 50) * 4 = 320
    expect(result.handResult.type).toBe(HandType.FIVE_STRAIGHT);
    expect(result.miles).toBeMiles(320);
  });
});

// ─── Equipment Effects ───

describe('equipment: ADD_MULT', () => {
  test('horseshoe adds +4 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 3),
      equipment: [item('horseshoe')],
    });
    // THREE_OF_A_KIND: baseMiles=20, baseMult=3
    // Equipment: +4 mult → totalMult = 7
    // totalValue = 18
    // miles = (20 + 18) * 7 = 266
    expect(result.mult).toBeMult(7);
    expect(result.miles).toBeMiles(266);
  });

  test('two horseshoes stack', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 3),
      equipment: [item('horseshoe'), item('horseshoe')],
    });
    // baseMult=3, +4+4=8, totalMult=11
    // (20 + 18) * 11 = 418
    expect(result.mult).toBeMult(11);
    expect(result.miles).toBeMiles(418);
  });
});

// PIP_MULT tests removed — deprecated items (snake_eyes, etc.) replaced in Phase 3

describe('equipment: HAND_MULT', () => {
  test('wedding_ring adds mult on pair', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(6, 2),
      equipment: [item('wedding_ring')],
    });
    // PAIR: baseMult=1
    // wedding_ring: +8 mult when hand contains pair → mult = 9
    expect(result.mult).toBeMult(9);
  });

  test('wedding_ring activates on full house (contains pair)', () => {
    const { result } = calculateTestScore({
      scoredDice: [...diceWithValue(3, 3), ...diceWithValue(7, 2)],
      equipment: [item('wedding_ring')],
    });
    // FULL_HOUSE contains PAIR → wedding ring triggers
    // baseMult=4, +8 = 12
    expect(result.mult).toBeMult(12);
  });

  test('wedding_ring does not activate on high value', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 10 })],
      equipment: [item('wedding_ring')],
    });
    expect(result.mult).toBeMult(1);
  });
});

// ─── Dice Enhancements ───

describe('dice enhancements', () => {
  test('bone dice add +4 mult per die', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5, enhancement: 'bone' })],
    });
    // PAIR: baseMult=1
    // 2 bone dice: +4 * 2 = +8 → mult = 9
    // totalValue = 10
    // miles = (10 + 10) * 9 = 180
    expect(result.mult).toBeMult(9);
    expect(result.miles).toBeMiles(180);
  });

  test('wooden dice add +30 miles per die', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 3, enhancement: 'wooden' }), die({ value: 3, enhancement: 'wooden' })],
    });
    // PAIR: baseMiles=10, baseMult=1
    // totalValue = 3 + 3 + 30 + 30 = 66 (each wooden adds +30 value)
    // miles = (10 + 66) * 1 = 76
    expect(result.totalValue).toBe(66);
    expect(result.miles).toBeMiles(76);
  });

  test('diamond dice apply x2 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 6, enhancement: 'diamond' }), die({ value: 6 })],
    });
    // PAIR: baseMult=1
    // 1 diamond → xMult = 2
    // mult = 1 * 2 = 2
    expect(result.mult).toBeMult(2);
  });

  test('stone dice contribute 50 miles instead of face value', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 0, enhancement: 'stone' })],
    });
    // HIGH_VALUE: baseMiles=5, baseMult=1
    // stone: +50 miles instead of value
    // miles = (5 + 50) * 1 = 55
    expect(result.totalValue).toBe(50);
    expect(result.miles).toBeMiles(55);
  });
});

// ─── Dice Auras ───

describe('dice auras', () => {
  test('fire aura adds +10 mult per die', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, aura: 'fire' }), die({ value: 5 })],
    });
    // PAIR: baseMult=1
    // fire aura on 1 die: +10 → mult = 11
    expect(result.mult).toBeMult(11);
  });

  test('icy aura adds +50 to totalValue', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, aura: 'icy' }), die({ value: 5 })],
    });
    // PAIR: baseMiles=10, baseMult=1
    // totalValue = 5 + 5 + 50 = 60
    // miles = (10 + 60) * 1 = 70
    expect(result.totalValue).toBe(60);
  });

  test('holy aura applies x1.5 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, aura: 'holy' }), die({ value: 5 })],
    });
    // PAIR: baseMult=1
    // holy: xMult * 1.5 → mult = 1.5
    expect(result.mult).toBeMult(1.5);
  });
});

// ─── Item Auras ───

describe('item auras', () => {
  test('fire aura on equipment adds +10 mult', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [itemWithAura('horseshoe', 'fire')],
    });
    // PAIR: baseMult=1
    // horseshoe: +4, fire aura: +10 → 1 + 4 + 10 = 15
    expect(result.mult).toBeMult(15);
  });

  test('holy aura on equipment applies x1.5', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [itemWithAura('horseshoe', 'holy')],
    });
    // PAIR: baseMult=1
    // horseshoe: +4 → 5, then holy x1.5 → 7.5
    expect(result.mult).toBeMult(7.5);
  });

  test('icy aura on equipment adds +50 miles', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [itemWithAura('horseshoe', 'icy')],
    });
    // PAIR: baseMiles=10, baseMult=1
    // horseshoe: +4 mult → mult=5
    // icy aura: +50 miles → totalValue = 4+4+50 = 58 ... wait
    // icy aura on ITEMS adds +50 to bonusMiles in applyEquipmentEffects
    // miles = (baseMiles + totalValue + bonusMiles) * mult
    // = (10 + 8 + 50) * 5 = 340
    expect(result.miles).toBeMiles(340);
  });

  test('ghost aura on equipment does not take an inventory slot', () => {
    const { player } = setupGame({ maxEquipmentSlots: 2 });
    // Fill both slots with normal items
    player.equipment = [item('horseshoe'), item('dynamite')];
    expect(player.equipmentSlotsFree).toBe(0);
    expect(player.usedEquipmentSlots).toBe(2);

    // Can't buy a normal item when full
    const normalDef = item('horseshoe').def;
    player.economy.setBalance(100);
    expect(player.canBuy(normalDef)).toBe(false);

    // Replace one with a ghost-aura item — frees a slot
    player.equipment = [item('horseshoe'), itemWithAura('dynamite', 'ghost')];
    expect(player.usedEquipmentSlots).toBe(1);
    expect(player.equipmentSlotsFree).toBe(1);
    expect(player.canBuy(normalDef)).toBe(true);
  });

  test('ghost aura item can be added even when slots are full', () => {
    const { player } = setupGame({ maxEquipmentSlots: 2 });
    player.equipment = [item('horseshoe'), item('dynamite')];
    player.economy.setBalance(100);

    // Can't buy normal item
    expect(player.canBuy(item('horseshoe').def)).toBe(false);

    // CAN buy ghost-aura item
    const ghostDef = itemWithAura('horseshoe', 'ghost').def;
    expect(player.canBuy(ghostDef)).toBe(true);

    // After buying, we have 3 items but only 2 used slots
    player.buyEquipment(ghostDef);
    expect(player.equipment.length).toBe(3);
    expect(player.usedEquipmentSlots).toBe(2);
    expect(player.equipmentSlotsFree).toBe(0);
  });

  test('ghost aura does not affect scoring', () => {
    const { result: withGhost } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [itemWithAura('horseshoe', 'ghost')],
    });
    const { result: withoutAura } = calculateTestScore({
      scoredDice: diceWithValue(4, 2),
      equipment: [item('horseshoe')],
    });
    // Ghost aura should not change mult or miles vs no aura
    expect(eq(withGhost.mult, withoutAura.mult)).toBe(true);
    expect(eq(withGhost.miles, withoutAura.miles)).toBe(true);
  });
});

// ─── Held-in-Hand Dice ───

describe('held-in-hand effects', () => {
  test('steel dice held in hand apply x1.5 mult each', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'steel' })],
    });
    // PAIR: baseMult=1
    // held steel: xMult=1.5
    // afterHeldMult = (1 + 0) * 1.5 = 1.5
    expect(result.mult).toBeMult(1.5);
  });

  test('two steel dice held multiply together', () => {
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      heldDice: [die({ value: 3, enhancement: 'steel' }), die({ value: 4, enhancement: 'steel' })],
    });
    // xMult = 1.5 * 1.5 = 2.25
    expect(result.mult).toBeMult(2.25);
  });
});

// ─── Hand Levels ───

describe('hand levels', () => {
  test('level 2 pair adds milesPerLevel and multPerLevel', () => {
    const { result: lvl1 } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
    });
    const { result: lvl2 } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      handLevels: { [HandType.PAIR]: 2 },
    });

    // Level 2 should give more miles than level 1
    expect(gt(lvl2.miles, lvl1.miles)).toBe(true);
  });
});

// ─── Combined Scenarios ───

describe('combined scenarios', () => {
  test('bone dice + horseshoe on three of a kind', () => {
    const { result } = calculateTestScore({
      scoredDice: [
        die({ value: 8, enhancement: 'bone' }),
        die({ value: 8, enhancement: 'bone' }),
        die({ value: 8, enhancement: 'bone' }),
      ],
      equipment: [item('horseshoe')],
    });
    // THREE_OF_A_KIND: baseMiles=20, baseMult=3
    // 3 bone: +12 mult
    // horseshoe: +4 mult
    // totalMult = 3 + 12 + 4 = 19
    // totalValue = 24
    // miles = (20 + 24) * 19 = 836
    expect(result.mult).toBeMult(19);
    expect(result.miles).toBeMiles(836);
  });

  test('steel held + equipment + scored bone dice', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 5, enhancement: 'bone' }), die({ value: 5 })],
      heldDice: [die({ value: 2, enhancement: 'steel' })],
      equipment: [item('horseshoe')],
    });
    // PAIR: baseMiles=10, baseMult=1
    // bone: +4 mult in scoreHand → scoreHand mult = (1 + 4) * 1 = 5
    // horseshoe: +4 mult (applied in applyEquipmentEffects step)
    // held steel: xMult=1.5 → applied before equipment step
    //
    // scoreHand: totalValue=10, mult=5, miles=(10+10)*5=100
    // afterHeld: mult=(5+0)*1.5=7.5, miles=(10+10)*7.5=150
    // equipment: +4 mult → finalMult=7.5+4=11.5
    // finalMiles = (10+10+0)*11.5 = 230... wait let me re-check the flow

    // Actually the flow in calculateScore:
    // 1. scoreHand → baseMult=1, bonusMult from bone=+4, xMult=1 → mult=(1+4)*1=5
    //    totalValue=10, miles=(10+10)*5=100
    // 2. processHeldInHand → bonusMult=0, xMult=1.5
    // 3. afterHeld: heldMult = (5 + 0) * 1.5 = 7.5
    //    miles = (10 + 10) * 7.5 = 150
    // 4. applyEquipmentEffects on afterHeldResult:
    //    horseshoe ADD_MULT: bonusMult=+4
    //    finalMult = 7.5 + 4 = 11.5
    //    finalMiles = (10 + 10 + 0) * 11.5 = 230

    expect(result.mult).toBeMult(11.5);
    expect(result.miles).toBeMiles(230);
  });
});

// ─── Payout / Interest ───

describe('calculatePayout', () => {
  test('normal profession earns interest', () => {
    const player = resetPlayerState();
    player.economy.setBalance(25);
    const payout = player.calculatePayout(2, 0);
    // $25 / $5 = $5 interest
    expect(payout.interest).toBe(5);
    expect(payout.dayBonus).toBe(2);
    expect(payout.rerollBonus).toBe(0);
  });

  test('outlaw earns no interest', () => {
    const player = resetPlayerState();
    player.applyProfession('outlaw');
    player.economy.setBalance(25);
    const payout = player.calculatePayout(2, 3);
    expect(payout.interest).toBe(0);
  });

  test('outlaw earns $1 per unused reroll', () => {
    const player = resetPlayerState();
    player.applyProfession('outlaw');
    player.economy.setBalance(0);
    const payout = player.calculatePayout(0, 5);
    expect(payout.rerollBonus).toBe(5);
    expect(payout.interest).toBe(0);
  });

  test('outlaw total includes days + rerolls', () => {
    const player = resetPlayerState();
    player.applyProfession('outlaw');
    player.economy.setBalance(0);
    // round 1 reward = $3, 2 days remaining, 3 rerolls remaining
    const payout = player.calculatePayout(2, 3);
    expect(payout.roundReward).toBe(3);
    expect(payout.dayBonus).toBe(2);
    expect(payout.rerollBonus).toBe(3);
    expect(payout.interest).toBe(0);
    expect(payout.total).toBe(3 + 2 + 3);
  });

  test('non-outlaw has 0 rerollBonus even with rerolls remaining', () => {
    const player = resetPlayerState();
    player.economy.setBalance(10);
    const payout = player.calculatePayout(1, 4);
    expect(payout.rerollBonus).toBe(0);
    // interest: $10 / $5 = $2
    expect(payout.interest).toBe(2);
  });
});

// ─── Effective Days / Rerolls ───

describe('effectiveDays / effectiveRerolls', () => {
  test('base values with no modifiers', () => {
    const player = resetPlayerState();
    expect(player.effectiveDays).toBe(GAMEPLAY.MAX_DAYS);
    expect(player.effectiveRerolls).toBe(GAMEPLAY.MAX_REROLLS);
  });

  test('farmer profession adds +1 reroll', () => {
    const player = resetPlayerState();
    player.applyProfession('farmer');
    expect(player.effectiveRerolls).toBe(GAMEPLAY.MAX_REROLLS + 1);
    expect(player.effectiveDays).toBe(GAMEPLAY.MAX_DAYS);
  });

  test('surveyor profession adds +1 day', () => {
    const player = resetPlayerState();
    player.applyProfession('surveyor');
    expect(player.effectiveDays).toBe(GAMEPLAY.MAX_DAYS + 1);
    expect(player.effectiveRerolls).toBe(GAMEPLAY.MAX_REROLLS);
  });

  test('permit day bonus increases effectiveDays', () => {
    const player = resetPlayerState();
    player.permitDayBonus = 2;
    expect(player.effectiveDays).toBe(GAMEPLAY.MAX_DAYS + 2);
  });

  test('permit reroll bonus increases effectiveRerolls', () => {
    const player = resetPlayerState();
    player.permitRerollBonus = 3;
    expect(player.effectiveRerolls).toBe(GAMEPLAY.MAX_REROLLS + 3);
  });

  test('permit penalties reduce values', () => {
    const player = resetPlayerState();
    player.permitDayPenalty = 1;
    player.permitRerollPenalty = 2;
    expect(player.effectiveDays).toBe(GAMEPLAY.MAX_DAYS - 1);
    expect(player.effectiveRerolls).toBe(GAMEPLAY.MAX_REROLLS - 2);
  });

  test('trail event day penalty reduces effectiveDays', () => {
    const player = resetPlayerState();
    player.trailEventModifiers.dayPenalty = 2;
    expect(player.effectiveDays).toBe(GAMEPLAY.MAX_DAYS - 2);
  });

  test('trail event reroll penalty reduces effectiveRerolls', () => {
    const player = resetPlayerState();
    player.trailEventModifiers.rerollPenalty = 3;
    expect(player.effectiveRerolls).toBe(GAMEPLAY.MAX_REROLLS - 3);
  });

  test('trail event loseAllRerolls overrides to 0', () => {
    const player = resetPlayerState();
    player.applyProfession('farmer');
    player.permitRerollBonus = 5;
    player.trailEventModifiers.loseAllRerolls = true;
    expect(player.effectiveRerolls).toBe(0);
  });

  test('combined: profession + permits + trail penalties', () => {
    const player = resetPlayerState();
    player.applyProfession('surveyor'); // +1 day
    player.permitDayBonus = 1;
    player.permitRerollPenalty = 1;
    player.trailEventModifiers.dayPenalty = 1;
    // days: 4 + 1(prof) + 1(permit) - 1(trail) = 5
    expect(player.effectiveDays).toBe(GAMEPLAY.MAX_DAYS + 1 + 1 - 1);
    // rerolls: 6 - 1(permit penalty) = 5
    expect(player.effectiveRerolls).toBe(GAMEPLAY.MAX_REROLLS - 1);
  });
});

// ─── Stone Dice ───

describe('Stone dice', () => {
  test('stone dice are excluded from hand detection', () => {
    // A pair of 6s + a stone die should still detect as a pair, not affected by stone
    const dice = [die({ value: 6 }), die({ value: 6 }), die({ enhancement: 'stone', value: 0 })];
    const result = detectBestHand(dice);
    expect(result.type).toBe(HandType.PAIR);
  });

  test('stone dice are always included in scoringDice', () => {
    const dice = [die({ value: 6 }), die({ value: 6 }), die({ enhancement: 'stone', value: 0 })];
    const result = detectBestHand(dice);
    // Pair scoring has 2 dice + 1 stone = 3
    expect(result.scoringDice.length).toBe(3);
    expect(result.scoringDice.some((d) => d.enhancement === 'stone')).toBe(true);
  });

  test('stone dice do not form pairs with each other', () => {
    // Two stone dice should not create a pair (both have value 0)
    const dice = [die({ enhancement: 'stone', value: 0 }), die({ enhancement: 'stone', value: 0 }), die({ value: 3 })];
    const result = detectBestHand(dice);
    // Should be HIGH_VALUE (just the 3), not a pair
    expect(result.type).toBe(HandType.HIGH_VALUE);
  });

  test('only stone dice scores as HIGH_VALUE with all as scoring', () => {
    const dice = [die({ enhancement: 'stone', value: 0 }), die({ enhancement: 'stone', value: 0 })];
    const result = detectBestHand(dice);
    expect(result.type).toBe(HandType.HIGH_VALUE);
    expect(result.scoringDice.length).toBe(2);
  });

  test('stone dice contribute +50 miles each when scored', () => {
    const { result } = calculateTestScore({
      scoredDice: [die({ value: 6 }), die({ value: 6 }), die({ enhancement: 'stone', value: 0 })],
    });
    // Pair: baseMiles=10, baseMult=1, values=6+6+50(stone)=62
    // miles = (10 + 62) * 1 = 72
    expect(result.miles).toBeMiles(72);
  });

  test('rollDie does not assign value to stone dice', () => {
    const stone = die({ enhancement: 'stone', value: 0 });
    const rolled = rollDie(stone);
    expect(rolled.value).toBe(0);
    expect(rolled.enhancement).toBe('stone');
  });

  test('rollDie assigns value to non-stone dice', () => {
    const normal = die({ value: 0 });
    const rolled = rollDie(normal);
    expect(rolled.value).toBeGreaterThan(0);
    expect(rolled.value).toBeLessThanOrEqual(12);
  });

  test('setDieEnhancement rolls face when leaving stone', () => {
    initRunRng('stone-leave-seed');
    const d = die({ enhancement: 'stone', value: 0 });
    setDieEnhancement(d, 'gold');
    expect(d.enhancement).toBe('gold');
    expect(d.value).toBeGreaterThanOrEqual(1);
    expect(d.value).toBeLessThanOrEqual(12);
  });

  test('setDieEnhancement sets value 0 when becoming stone', () => {
    const d = die({ value: 8 });
    setDieEnhancement(d, 'stone');
    expect(d.enhancement).toBe('stone');
    expect(d.value).toBe(0);
  });

  test('setDieEnhancement does not change face when swapping non-stone types', () => {
    const d = die({ value: 8, enhancement: 'wooden' });
    setDieEnhancement(d, 'gold');
    expect(d.value).toBe(8);
  });
});

// ─── Enhancement score destroy (crack) ───

describe('resolveScoreDestroyChance', () => {
  const trail = createEmptyTrailRoundEffects();

  test('diamond defaults to [1, 4] from dice_enhancements', () => {
    expect(getEnhancementScoreDestroyChance('diamond')).toEqual([1, 4]);
    expect(getEnhancementScoreDestroyChance('bone')).toEqual([0, 1]);
  });

  test('bone dice have no score destroy chance', () => {
    expect(resolveScoreDestroyChance(die({ enhancement: 'bone' }), [], trail)).toBeNull();
  });

  test('diamond without equipment uses enhancement odds', () => {
    expect(resolveScoreDestroyChance(die({ enhancement: 'diamond' }), [], trail)).toEqual([1, 4]);
  });

  test('moonshine overrides diamond with diamondDestroyChance', () => {
    const moonshine = item('moonshine');
    expect(resolveScoreDestroyChance(die({ enhancement: 'diamond' }), [moonshine], trail)).toEqual([1, 3]);
  });

  test('diamondCrackDoubled doubles diamond enhancement numerator', () => {
    const doubled = { ...trail, diamondCrackDoubled: true };
    expect(resolveScoreDestroyChance(die({ enhancement: 'diamond' }), [], doubled)).toEqual([2, 4]);
  });
});

describe('score crack animation events', () => {
  test('emits crack event when a diamond die cracks during scoring', () => {
    const diamond = die({ value: 8, enhancement: 'diamond' });
    const { result, player } = calculateTestScore({
      scoredDice: [diamond, die({ value: 8 })],
      equipment: [item('loaded_dice'), item('loaded_dice')],
    });

    expect(result.animEvents.some((evt) => evt.popupType === 'crack' && evt.target.kind === 'die')).toBe(true);
    expect(player.dice.some((d) => d.id === diamond.id)).toBe(false);
  });

  test('emits crack event when moonshine destroys a non-diamond enhanced die', () => {
    const enhanced = die({ value: 9, enhancement: 'bone' });
    const { result, player } = calculateTestScore({
      scoredDice: [enhanced, die({ value: 9 })],
      equipment: [item('moonshine'), item('loaded_dice'), item('loaded_dice'), item('loaded_dice')],
    });

    expect(
      result.animEvents.some(
        (evt) => evt.popupType === 'crack' && evt.target.kind === 'die' && evt.target.dieId === enhanced.id,
      ),
    ).toBe(true);
    expect(player.dice.some((d) => d.id === enhanced.id)).toBe(false);
  });
});

describe('accountant profession', () => {
  test('balanceMilesAndMult averages miles and mult before multiplying', () => {
    const { balanced, miles } = balanceMilesAndMult(10, 4);
    expect(balanced).toBeMiles(7);
    expect(miles).toBeMiles(49);
  });

  test('applies balance during full scoring pipeline', () => {
    const { result: normal } = calculateTestScore({
      scoredDice: [die({ value: 5 })],
      equipment: [item('horseshoe')],
    });
    const { result: balanced } = calculateTestScore({
      profession: 'accountant',
      scoredDice: [die({ value: 5 })],
      equipment: [item('horseshoe')],
    });

    // HIGH_VALUE: (5 base + 5 value) × (1 + 4 horseshoe) = 50
    expect(normal.miles).toBeMiles(50);
    expect(normal.mult).toBeMult(5);

    // Accountant: average(10, 5) = 7.5 → 7.5 × 7.5 = 56.25
    expect(balanced.miles).toBeMiles(56.25);
    expect(balanced.mult).toBeMult(7.5);
    expect(balanced.animEvents.some((evt) => evt.popupType === 'balance')).toBe(true);
    expect(gt(balanced.miles, normal.miles)).toBe(true);
  });
});
