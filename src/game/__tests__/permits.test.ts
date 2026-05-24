import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import { resetDieIds, setupGame, die, diceWithValue, calculateTestScore, item } from './testHelpers';
import { resetPlayerState, getPlayerState } from '../PlayerState';
import {
  getAllPermits,
  getPermitById,
  getAvailablePermits,
  generateShopPermit,
  applyPermitEffect,
  getPermitShopDiscount,
  getPermitShopRerollDiscount,
  getPermitAuraMultiplier,
  getPermitSupplyWeightMultiplier,
  getPermitTrailGuideWeightMultiplier,
  getPermitFrontierInPacksChance,
  hasPermitTrailGuideTargeting,
  getPermitTrailGuideMult,
  hasPermitDiceInShop,
  getPermitBossRerollLimit,
  PermitDef,
} from '../PermitsSystem';
import { GAMEPLAY } from '../Constants';
import { lt } from '../scoreMath';
import { devGrantPermit } from '../DevMode';

beforeEach(() => {
  resetDieIds();
});

// ─── Reroll Overhaul ───

describe('Reroll overhaul (per-round, not per-day)', () => {
  test('rerolls start at N per round', () => {
    const { game } = setupGame();
    game.startRound();
    expect(game.state.rerollsRemaining).toBe(GAMEPLAY.MAX_REROLLS);
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS);
  });

  test('reroll keeps stone dice at zero', () => {
    const { game, player } = setupGame({
      dice: [die({ enhancement: 'stone', value: 0 }), ...diceWithValue(5, 10)],
    });

    game.startRound();
    const stoneDie = player.dice.find((d) => d.enhancement === 'stone');
    expect(stoneDie).toBeDefined();

    game.state.phase = 'ROLL';
    game.state.rolledDice = [stoneDie!];
    game.state.rerollsRemaining = GAMEPLAY.MAX_REROLLS;

    expect(game.reroll([stoneDie!.id])).toBe(true);
    expect(game.state.rolledDice[0].enhancement).toBe('stone');
    expect(game.state.rolledDice[0].value).toBe(0);
  });

  test('rerolls are NOT reset between days', () => {
    const { game, player } = setupGame({ dice: diceWithValue(5, 50) });
    game.startRound();

    // Use some rerolls
    game.selectForRoll(game.state.hand.slice(0, 5).map((d) => d.id));
    game.reroll([game.state.rolledDice[0].id]);
    game.reroll([game.state.rolledDice[1].id]);
    expect(game.state.rerollsRemaining).toBe(GAMEPLAY.MAX_REROLLS - 2);

    // Score and end day
    game.selectForScore(game.state.rolledDice.slice(0, 2).map((d) => d.id));
    game.calculateScore();
    game.endDay();

    // Rerolls should persist (not reset to 6)
    expect(game.state.rerollsRemaining).toBe(GAMEPLAY.MAX_REROLLS - 2);
  });

  test('rerolls reset at the start of a new round', () => {
    const { game } = setupGame();
    game.startRound();
    expect(game.state.rerollsRemaining).toBe(GAMEPLAY.MAX_REROLLS);
  });
});

// ─── Permit Data ───

describe('Permit data', () => {
  test('getAllPermits returns all permits', () => {
    const permits = getAllPermits();
    expect(permits.length).toBeGreaterThan(0);
    // Should have pairs of stage 1 & 2
    const stage1 = permits.filter((p) => p.stage === 1);
    const stage2 = permits.filter((p) => p.stage === 2);
    expect(stage1.length).toBe(stage2.length);
  });

  test('getPermitById returns correct permit', () => {
    const permit = getPermitById('supply_wagon');
    expect(permit).not.toBeNull();
    expect(permit!.name).toBe('Supply Wagon');
    expect(permit!.stage).toBe(1);
  });

  test('getPermitById returns null for unknown id', () => {
    expect(getPermitById('nonexistent')).toBeNull();
  });

  test('all permits cost $10', () => {
    const permits = getAllPermits();
    for (const p of permits) {
      expect(p.cost).toBe(10);
    }
  });

  test('all stage 2 permits have a valid prerequisiteId', () => {
    const permits = getAllPermits();
    const ids = new Set(permits.map((p) => p.id));
    for (const p of permits.filter((x) => x.stage === 2)) {
      expect(p.prerequisiteId).not.toBeNull();
      expect(ids.has(p.prerequisiteId!)).toBe(true);
    }
  });
});

// ─── Permit Availability ───

describe('Permit availability', () => {
  test('all stage 1 permits available when none purchased', () => {
    const available = getAvailablePermits([]);
    const stage1Count = getAllPermits().filter((p) => p.stage === 1).length;
    // Only stage 1 should be available
    expect(available.every((p) => p.stage === 1)).toBe(true);
    expect(available.length).toBe(stage1Count);
  });

  test('stage 2 appears after stage 1 is purchased', () => {
    const available = getAvailablePermits(['supply_wagon']);
    // Should include freight_caravan (stage 2)
    expect(available.some((p) => p.id === 'freight_caravan')).toBe(true);
    // Should NOT include supply_wagon (already purchased)
    expect(available.some((p) => p.id === 'supply_wagon')).toBe(false);
  });

  test('purchased permits are excluded', () => {
    const available = getAvailablePermits(['supply_wagon', 'freight_caravan']);
    expect(available.some((p) => p.id === 'supply_wagon')).toBe(false);
    expect(available.some((p) => p.id === 'freight_caravan')).toBe(false);
  });

  test('stage 2 not available without stage 1', () => {
    const available = getAvailablePermits([]);
    expect(available.some((p) => p.id === 'freight_caravan')).toBe(false);
  });

  test('generateShopPermit returns null when all purchased', () => {
    const allIds = getAllPermits().map((p) => p.id);
    expect(generateShopPermit(allIds)).toBeNull();
  });

  test('generateShopPermit returns an available permit', () => {
    const permit = generateShopPermit([]);
    expect(permit).not.toBeNull();
    expect(permit!.stage).toBe(1);
  });
});

// ─── Purchase Flow ───

describe('Permit purchase flow', () => {
  test('buyPermit deducts cost and records purchase', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const permit = getPermitById('supply_wagon')!;

    const success = player.buyPermit(permit);
    expect(success).toBe(true);
    expect(player.economy.balance).toBe(10); // 20 - 10
    expect(player.purchasedPermits).toContain('supply_wagon');
  });

  test('buyPermit fails when cannot afford', () => {
    const player = resetPlayerState();
    player.economy.setBalance(5);
    const permit = getPermitById('supply_wagon')!;

    const success = player.buyPermit(permit);
    expect(success).toBe(false);
    expect(player.economy.balance).toBe(5);
    expect(player.purchasedPermits).not.toContain('supply_wagon');
  });

  test('cannot re-purchase same permit', () => {
    const player = resetPlayerState();
    player.economy.setBalance(30);
    const permit = getPermitById('supply_wagon')!;

    player.buyPermit(permit);
    const success = player.buyPermit(permit);
    expect(success).toBe(false);
    expect(player.economy.balance).toBe(20); // only charged once
  });

  test('buyPermit clears currentLegPermit', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const permit = getPermitById('supply_wagon')!;
    player.currentLegPermit = permit;

    player.buyPermit(permit);
    expect(player.currentLegPermit).toBeNull();
  });

  test('hasPermit returns correct value', () => {
    const player = resetPlayerState();
    expect(player.hasPermit('supply_wagon')).toBe(false);
    player.economy.setBalance(20);
    player.buyPermit(getPermitById('supply_wagon')!);
    expect(player.hasPermit('supply_wagon')).toBe(true);
  });
});

// ─── Leg Persistence ───

describe('Permit leg persistence', () => {
  test('currentLegPermit clears on new leg', () => {
    const player = resetPlayerState();
    player.currentLegPermit = getPermitById('supply_wagon')!;
    player.round = 3; // last round of leg
    player.advanceRound(); // advances to next leg
    expect(player.currentLegPermit).toBeNull();
  });

  test('currentLegPermit persists within same leg', () => {
    const player = resetPlayerState();
    player.currentLegPermit = getPermitById('supply_wagon')!;
    player.round = 1;
    player.advanceRound(); // round 1 → 2, same leg
    expect(player.currentLegPermit).not.toBeNull();
  });
});

// ─── Permit Effects: Immediate ───

describe('Permit effects: SHOP_SLOTS', () => {
  test('Supply Wagon adds +1 shop slot', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const baseSLots = player.shopSlots;
    player.buyPermit(getPermitById('supply_wagon')!);
    expect(player.shopSlots).toBe(baseSLots + 1);
  });

  test('Freight Caravan adds another +1 shop slot', () => {
    const player = resetPlayerState();
    player.economy.setBalance(30);
    player.buyPermit(getPermitById('supply_wagon')!);
    const afterFirst = player.shopSlots;
    player.buyPermit(getPermitById('freight_caravan')!);
    expect(player.shopSlots).toBe(afterFirst + 1);
  });
});

describe('Permit effects: CONSUMABLE_SLOTS', () => {
  test("Devil's Eye adds +1 consumable slot", () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const baseSlots = player.maxConsumableSlots;
    player.buyPermit(getPermitById('devils_eye')!);
    expect(player.maxConsumableSlots).toBe(baseSlots + 1);
  });
});

describe('Permit effects: EQUIPMENT_SLOTS', () => {
  test('Bottomless Satchel adds +1 equipment slot', () => {
    const player = resetPlayerState();
    player.economy.setBalance(30);
    player.buyPermit(getPermitById('strange_coin')!); // prerequisite
    const baseSlots = player.maxEquipmentSlots;
    player.buyPermit(getPermitById('bottomless_satchel')!);
    expect(player.maxEquipmentSlots).toBe(baseSlots + 1);
  });
});

describe('Permit effects: DAY_BONUS', () => {
  test('Extra Rations adds +1 day per round', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    player.buyPermit(getPermitById('extra_rations')!);
    expect(player.permitDayBonus).toBe(1);

    // setupGame resets PlayerState, so we set permitDayBonus after
    const { game } = setupGame();
    game.state; // access state
    const p = getPlayerState();
    p.permitDayBonus = 1;
    game.startRound();
    expect(game.config.maxDays).toBe(GAMEPLAY.MAX_DAYS + 1);
  });

  test('Supply Cache permit adds another +1 day', () => {
    const player = resetPlayerState();
    player.economy.setBalance(30);
    player.buyPermit(getPermitById('extra_rations')!);
    player.buyPermit(getPermitById('supply_cache')!);
    expect(player.permitDayBonus).toBe(2);
  });
});

describe('Permit effects: REROLL_BONUS', () => {
  test('Second Chance adds +1 reroll per round', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    player.buyPermit(getPermitById('second_chance')!);
    expect(player.permitRerollBonus).toBe(1);

    // setupGame resets PlayerState, so we set permitRerollBonus after
    const { game } = setupGame();
    const p = getPlayerState();
    p.permitRerollBonus = 1;
    game.startRound();
    expect(game.config.maxRerolls).toBe(GAMEPLAY.MAX_REROLLS + 1);
  });

  test("Third Time's Charm adds another +1 reroll", () => {
    const player = resetPlayerState();
    player.economy.setBalance(30);
    player.buyPermit(getPermitById('second_chance')!);
    player.buyPermit(getPermitById('third_times_charm')!);
    expect(player.permitRerollBonus).toBe(2);
  });
});

describe('Permit effects: INTEREST_CAP', () => {
  test('Savings Bond raises interest cap to $50', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    player.buyPermit(getPermitById('savings_bond')!);
    expect(player.interestCap).toBe(50);
  });

  test('Railroad Investment raises interest cap to $100', () => {
    const player = resetPlayerState();
    player.economy.setBalance(30);
    player.buyPermit(getPermitById('savings_bond')!);
    player.buyPermit(getPermitById('railroad_investment')!);
    expect(player.interestCap).toBe(100);
  });
});

describe('Permit effects: HAND_SIZE', () => {
  test('Supply Pouch adds +1 hand size', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const baseSize = player.handSize;
    player.buyPermit(getPermitById('supply_pouch')!);
    expect(player.handSize).toBe(baseSize + 1);
  });

  test('Pack Mule adds another +1 hand size', () => {
    const player = resetPlayerState();
    player.economy.setBalance(30);
    player.buyPermit(getPermitById('supply_pouch')!);
    const afterFirst = player.handSize;
    player.buyPermit(getPermitById('pack_mule')!);
    expect(player.handSize).toBe(afterFirst + 1);
  });
});

describe('Permit effects: SHORTCUT', () => {
  test('Shortcut Trail reduces score and adds day penalty', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    player.buyPermit(getPermitById('shortcut_trail')!);
    expect(player.permitScoreReduction).toBe(1);
    expect(player.permitDayPenalty).toBe(1);
  });

  test('Hidden Pass adds more reduction and reroll penalty', () => {
    const player = resetPlayerState();
    player.economy.setBalance(30);
    player.buyPermit(getPermitById('shortcut_trail')!);
    player.buyPermit(getPermitById('hidden_pass')!);
    expect(player.permitScoreReduction).toBe(2);
    expect(player.permitRerollPenalty).toBe(1);
  });

  test('Shortcut Trail reduces target miles (uses lower leg index)', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    player.leg = 3;
    const baseMiles = player.targetMiles;
    player.buyPermit(getPermitById('shortcut_trail')!);
    const reducedMiles = player.targetMiles;
    expect(lt(reducedMiles, baseMiles)).toBe(true);
  });
});

describe('Permit effects: NONE (Strange Coin)', () => {
  test('Strange Coin does nothing', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    const before = { ...player };
    player.buyPermit(getPermitById('strange_coin')!);
    // Only balance and purchasedPermits/currentLegPermit should change
    expect(player.economy.balance).toBe(10);
    expect(player.purchasedPermits).toContain('strange_coin');
  });
});

// ─── Permit Effects: Query-based ───

describe('Permit queries: SHOP_DISCOUNT', () => {
  test('no discount by default', () => {
    expect(getPermitShopDiscount([])).toBe(0);
  });

  test('Bargain Bin gives 25% discount', () => {
    expect(getPermitShopDiscount(['bargain_bin'])).toBe(0.25);
  });

  test('Estate Auction gives 50% discount (overrides)', () => {
    expect(getPermitShopDiscount(['bargain_bin', 'estate_auction'])).toBe(0.5);
  });
});

describe('Permit queries: SHOP_REROLL_DISCOUNT', () => {
  test('no discount by default', () => {
    expect(getPermitShopRerollDiscount([])).toBe(0);
  });

  test('Lucky Streak gives $2 discount', () => {
    expect(getPermitShopRerollDiscount(['lucky_streak'])).toBe(2);
  });

  test("Devil's Luck stacks for $4 total", () => {
    expect(getPermitShopRerollDiscount(['lucky_streak', 'devils_luck'])).toBe(4);
  });

  test('shop reroll cost is reduced on PlayerState', () => {
    const player = resetPlayerState();
    player.economy.setBalance(30);
    const baseCost = player.shopRerollCost;
    player.buyPermit(getPermitById('lucky_streak')!);
    expect(player.shopRerollCost).toBe(Math.max(0, baseCost - 2));
  });
});

describe('Permit queries: AURA_MULTIPLIER', () => {
  test('default is 1x', () => {
    expect(getPermitAuraMultiplier([])).toBe(1);
  });

  test('Spirit Ritual gives 2x', () => {
    expect(getPermitAuraMultiplier(['spirit_ritual'])).toBe(2);
  });

  test('Sacred Ceremony gives 4x (overrides)', () => {
    expect(getPermitAuraMultiplier(['spirit_ritual', 'sacred_ceremony'])).toBe(4);
  });
});

describe('Permit queries: SHOP_WEIGHT_SUPPLY', () => {
  test('default is 1x', () => {
    expect(getPermitSupplyWeightMultiplier([])).toBe(1);
  });

  test('Camp Merchant gives 2x', () => {
    expect(getPermitSupplyWeightMultiplier(['camp_merchant'])).toBe(2);
  });

  test('Supply Baron gives 4x (overrides)', () => {
    expect(getPermitSupplyWeightMultiplier(['camp_merchant', 'supply_baron'])).toBe(4);
  });
});

describe('Permit queries: SHOP_WEIGHT_TRAIL_GUIDE', () => {
  test('default is 1x', () => {
    expect(getPermitTrailGuideWeightMultiplier([])).toBe(1);
  });

  test('Trail Cartographer gives 2x', () => {
    expect(getPermitTrailGuideWeightMultiplier(['trail_cartographer'])).toBe(2);
  });

  test('Frontier Pathfinder gives 4x (overrides)', () => {
    expect(getPermitTrailGuideWeightMultiplier(['trail_cartographer', 'frontier_pathfinder'])).toBe(4);
  });
});

describe('Permit queries: FRONTIER_IN_PACKS', () => {
  test('default is 0', () => {
    expect(getPermitFrontierInPacksChance([])).toBe(0);
  });

  test('Infernal Vision gives 20%', () => {
    expect(getPermitFrontierInPacksChance(['infernal_vision'])).toBe(0.2);
  });
});

describe('Permit queries: TRAIL_GUIDE_TARGETING', () => {
  test('default is false', () => {
    expect(hasPermitTrailGuideTargeting([])).toBe(false);
  });

  test('Binoculars enables targeting', () => {
    expect(hasPermitTrailGuideTargeting(['binoculars'])).toBe(true);
  });
});

describe('Permit queries: TRAIL_GUIDE_MULT', () => {
  test('default is 0', () => {
    expect(getPermitTrailGuideMult([])).toBe(0);
  });

  test("Surveyor's Scope gives x1.5", () => {
    expect(getPermitTrailGuideMult(['surveyors_scope'])).toBe(1.5);
  });
});

describe('Permit queries: DICE_IN_SHOP', () => {
  test('default is none', () => {
    expect(hasPermitDiceInShop([])).toBe('none');
  });

  test('Dice Carver enables enhanced', () => {
    expect(hasPermitDiceInShop(['dice_carver'])).toBe('enhanced');
  });

  test('Master Engraver enables stickered (overrides)', () => {
    expect(hasPermitDiceInShop(['dice_carver', 'master_engraver'])).toBe('stickered');
  });

  test('purchasing dice_carver permit enables dice in shop via player state', () => {
    const player = resetPlayerState();
    player.economy.setBalance(20);
    expect(hasPermitDiceInShop(player.purchasedPermits)).toBe('none');
    player.buyPermit(getPermitById('dice_carver')!);
    expect(hasPermitDiceInShop(player.purchasedPermits)).toBe('enhanced');
  });

  test('purchasing master_engraver upgrades to stickered', () => {
    const player = resetPlayerState();
    player.economy.setBalance(30);
    player.buyPermit(getPermitById('dice_carver')!);
    player.buyPermit(getPermitById('master_engraver')!);
    expect(hasPermitDiceInShop(player.purchasedPermits)).toBe('stickered');
  });
});

describe('Permit queries: BOSS_REROLL', () => {
  test('default is 0', () => {
    expect(getPermitBossRerollLimit([])).toBe(0);
  });

  test('Bounty Board gives 1 reroll', () => {
    expect(getPermitBossRerollLimit(['bounty_board'])).toBe(1);
  });

  test('Wanted Dead or Alive gives unlimited (-1)', () => {
    expect(getPermitBossRerollLimit(['bounty_board', 'wanted_dead_or_alive'])).toBe(-1);
  });
});

describe('Permit boss reroll', () => {
  test('Bounty Board: one $10 reroll per leg', () => {
    const player = resetPlayerState();
    player.economy.setBalance(30);
    player.buyPermit(getPermitById('bounty_board')!);
    const before = player.getBossForLeg(player.leg)!.id;

    expect(player.tryBossPermitReroll()).toBe(true);
    expect(player.getBossForLeg(player.leg)!.id).not.toBe(before);
    expect(player.economy.balance).toBe(10);
    expect(player.bossRerollsUsedThisLeg).toBe(1);
    expect(player.tryBossPermitReroll()).toBe(false);
  });

  test('Wanted Dead or Alive: unlimited rerolls for $10 each', () => {
    const player = resetPlayerState();
    player.economy.setBalance(50);
    player.buyPermit(getPermitById('bounty_board')!);
    player.buyPermit(getPermitById('wanted_dead_or_alive')!);

    expect(player.tryBossPermitReroll()).toBe(true);
    expect(player.tryBossPermitReroll()).toBe(true);
    expect(player.economy.balance).toBe(10);
    expect(player.bossRerollsUsedThisLeg).toBe(0);
  });

  test('boss reroll count resets on new leg', () => {
    const player = resetPlayerState();
    player.economy.setBalance(50);
    player.buyPermit(getPermitById('bounty_board')!);
    player.tryBossPermitReroll();
    expect(player.bossRerollsUsedThisLeg).toBe(1);

    player.round = 3;
    player.advanceRound();
    expect(player.leg).toBe(2);
    expect(player.bossRerollsUsedThisLeg).toBe(0);
    expect(player.canBossPermitReroll()).toBe(true);
  });

  test('bank note: boss reroll at $0 spends into debt', () => {
    const player = resetPlayerState();
    player.equipment.push(item('bank_note'));
    player.economy.setBalance(20);
    player.buyPermit(getPermitById('bounty_board')!);
    player.economy.setBalance(0);

    expect(player.tryBossPermitReroll()).toBe(true);
    expect(player.economy.balance).toBe(-10);
  });
});

describe('devGrantPermit', () => {
  test('stage 2 permit also grants stage 1 prerequisite', () => {
    const player = resetPlayerState();
    player.applyProfession('developer');

    const result = devGrantPermit('wanted_dead_or_alive');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.added).toEqual(['bounty_board', 'wanted_dead_or_alive']);
    }
    expect(player.hasPermit('bounty_board')).toBe(true);
    expect(player.hasPermit('wanted_dead_or_alive')).toBe(true);
  });
});

// ─── Reset ───

describe('Permit reset', () => {
  test('reset() clears all permit state', () => {
    const player = resetPlayerState();
    player.economy.setBalance(50);
    player.buyPermit(getPermitById('supply_wagon')!);
    player.buyPermit(getPermitById('extra_rations')!);
    player.permitRerollBonus = 2;
    player.permitDayPenalty = 1;
    player.permitRerollPenalty = 1;
    player.permitScoreReduction = 1;

    player.reset();

    expect(player.purchasedPermits).toHaveLength(0);
    expect(player.currentLegPermit).toBeNull();
    expect(player.permitDayBonus).toBe(0);
    expect(player.permitRerollBonus).toBe(0);
    expect(player.permitDayPenalty).toBe(0);
    expect(player.permitRerollPenalty).toBe(0);
    expect(player.permitScoreReduction).toBe(0);
    expect(player.shopSlots).toBe(GAMEPLAY.SHOP_SLOTS);
    expect(player.interestCap).toBe(GAMEPLAY.INTEREST_CAP);
  });
});
