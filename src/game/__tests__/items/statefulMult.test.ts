import { describe, test, expect, beforeEach } from 'bun:test';
import '../setup';
import {
  die,
  diceWithValue,
  diceFromValues,
  item,
  itemWithState,
  calculateTestScore,
  setupGame,
  resetDieIds,
} from '../testHelpers';
import {
  processEquipmentOnHandPlayed,
  processEquipmentAfterHandScored,
  processEquipmentOnPackSkipped,
  processEquipmentOnSupplyUsed,
} from '../../EquipmentEffects';
import { executeConsumableEffect, getRandomSupplyDef, getRandomTrailGuideDef } from '../../ConsumablesSystem';
import { HandType } from '../../types';

beforeEach(() => resetDieIds());

// ─── MARKED_NO_SIX_MULT: Marked ───

describe('MARKED_NO_SIX_MULT: Marked', () => {
  test('starts at 0 mult', () => {
    const inst = item('marked');
    expect(inst.state.mult).toBe(0);
  });

  test('gains +1 mult per hand played without a 6', () => {
    const inst = item('marked');
    const { player } = setupGame({ equipment: [inst] });
    const scoringDice = [die({ value: 5 }), die({ value: 5 })];
    processEquipmentOnHandPlayed([inst], HandType.PAIR, scoringDice);
    expect(inst.state.mult).toBe(1);
    processEquipmentOnHandPlayed([inst], HandType.PAIR, scoringDice);
    expect(inst.state.mult).toBe(2);
  });

  test('resets to 0 if a 6 is scored', () => {
    const inst = item('marked');
    inst.state.mult = 5;
    const { player } = setupGame({ equipment: [inst] });
    const scoringDice = [die({ value: 6 }), die({ value: 6 })];
    processEquipmentOnHandPlayed([inst], HandType.PAIR, scoringDice);
    expect(inst.state.mult).toBe(0);
  });

  test('accumulated mult applies during scoring (gains +1 before scoring if no 6)', () => {
    const inst = item('marked');
    inst.state.mult = 4;
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // No 6 scored → gains +1 before scoring → 5 mult applied
    // PAIR: baseMult=1, +5 from marked = 6
    expect(result.mult).toBeMult(6);
  });

  test('demon hunter gains +2 per hand without a 6', () => {
    const inst = item('marked');
    const { player } = setupGame({ equipment: [inst], profession: 'demon_hunter' });
    const scoringDice = [die({ value: 5 }), die({ value: 5 })];
    processEquipmentOnHandPlayed([inst], HandType.PAIR, scoringDice);
    expect(inst.state.mult).toBe(2);
  });

  test('scoring popup shows accumulated bank applied to mult', () => {
    const inst = itemWithState('marked', { mult: 4 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
      profession: 'demon_hunter',
    });
    expect(inst.state.mult).toBe(6);
    const markedAnim = result.animEvents.find((e) => e.popupType === 'mult' && e.target.kind === 'equip');
    expect(markedAnim?.value).toBe(6);
    expect(result.mult).toBeMult(7);
  });

  test('developer profession: one hand adds +1 to bank and popup', () => {
    const inst = item('marked');
    const { result, player } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
      profession: 'developer',
    });
    expect(inst.state.mult).toBe(1);
    const markedAnim = result.animEvents.find((e) => e.popupType === 'mult' && e.target.kind === 'equip');
    expect(markedAnim?.value).toBe(1);
    expect(result.mult).toBeMult(2);
    expect(player.profession?.id).toBe('developer');
  });

  test('mirror lake applies marked bank and marked applies it again', () => {
    const marked = itemWithState('marked', { mult: 2 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [item('mirror_lake'), marked],
      profession: 'demon_hunter',
    });
    expect(marked.state.mult).toBe(4);
    // PAIR base 1 + mirror(+4) + marked(+4)
    expect(result.mult).toBeMult(9);
  });
});

// ─── STATEFUL_ADD_MILES: Steam Engine ───

describe('STATEFUL_ADD_MILES: Steam Engine', () => {
  test('starts at 100 miles', () => {
    const inst = item('steam_engine');
    expect(inst.state.miles).toBe(100);
  });

  test('loses 5 miles per hand played', () => {
    const inst = item('steam_engine');
    const { player } = setupGame({ equipment: [inst] });
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(inst.state.miles).toBe(95);
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(inst.state.miles).toBe(90);
  });

  test('does not go below 0', () => {
    const inst = item('steam_engine');
    inst.state.miles = 3;
    const { player } = setupGame({ equipment: [inst] });
    processEquipmentAfterHandScored([inst], HandType.PAIR);
    expect(inst.state.miles).toBe(0);
  });

  test('current miles apply during scoring', () => {
    const inst = item('steam_engine');
    inst.state.miles = 50;
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMiles = 10+10 = 20, +50 from steam engine = 70
    expect(result.miles).toBeMiles(70);
  });
});

// ─── STATEFUL_ADD_MULT (gainOnPackSkip): Tight Fist ───

describe('STATEFUL_ADD_MULT: Tight Fist', () => {
  test('starts at 0 mult', () => {
    const inst = item('tight_fist');
    expect(inst.state.mult).toBe(0);
  });

  test('gains +3 mult when a booster pack is skipped', () => {
    const inst = item('tight_fist');
    processEquipmentOnPackSkipped([inst]);
    expect(inst.state.mult).toBe(3);
  });

  test('accumulates across multiple skips', () => {
    const inst = item('tight_fist');
    processEquipmentOnPackSkipped([inst]);
    processEquipmentOnPackSkipped([inst]);
    processEquipmentOnPackSkipped([inst]);
    expect(inst.state.mult).toBe(9);
  });

  test('accumulated mult applies during scoring', () => {
    const inst = itemWithState('tight_fist', { mult: 6 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, +6 from tight fist = 7
    expect(result.mult).toBeMult(7);
  });

  test('integration: gains mult when pack is skipped with equipment present', () => {
    // This tests the same flow BoosterPackScene.onSkip() should follow:
    // call processEquipmentOnPackSkipped(player.equipment)
    const tightFist = item('tight_fist');
    const { player } = setupGame({ equipment: [tightFist] });

    // Simulate skipping a pack (what BoosterPackScene.onSkip does)
    processEquipmentOnPackSkipped(player.equipment);

    expect(tightFist.state.mult).toBe(3);

    // Verify accumulated mult affects scoring
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: player.equipment,
    });
    // PAIR: baseMult=1, +3 from tight fist = 4
    expect(result.mult).toBeMult(4);
  });
});

// ─── EXACT_DICE_COUNT_MILES: Square Dance ───

describe('EXACT_DICE_COUNT_MILES: Square Dance', () => {
  test('starts at 0 miles', () => {
    const inst = item('square_dance');
    expect(inst.state.miles).toBe(0);
  });

  test('gains +4 miles when exactly 4 dice are played', () => {
    const inst = item('square_dance');
    const { player } = setupGame({ equipment: [inst] });
    const fourDice = diceWithValue(3, 4);
    processEquipmentOnHandPlayed([inst], HandType.FOUR_OF_A_KIND, fourDice);
    expect(inst.state.miles).toBe(4);
  });

  test('does NOT gain miles when fewer than 4 dice played', () => {
    const inst = item('square_dance');
    const { player } = setupGame({ equipment: [inst] });
    const threeDice = diceWithValue(5, 3);
    processEquipmentOnHandPlayed([inst], HandType.THREE_OF_A_KIND, threeDice);
    expect(inst.state.miles).toBe(0);
  });

  test('does NOT gain miles when more than 4 dice played', () => {
    const inst = item('square_dance');
    const { player } = setupGame({ equipment: [inst] });
    const fiveDice = diceWithValue(5, 5);
    processEquipmentOnHandPlayed([inst], HandType.FIVE_OF_A_KIND, fiveDice);
    expect(inst.state.miles).toBe(0);
  });

  test('accumulated miles apply during scoring', () => {
    const inst = itemWithState('square_dance', { miles: 12 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMiles=10, totalValue=10 (5+5), +12 from square_dance = 32 * mult(1)
    expect(result.miles).toBeMiles(32);
  });

  test('accumulates across multiple hands', () => {
    const inst = item('square_dance');
    const { player } = setupGame({ equipment: [inst] });
    const fourDice = diceWithValue(3, 4);
    processEquipmentOnHandPlayed([inst], HandType.FOUR_OF_A_KIND, fourDice);
    processEquipmentOnHandPlayed([inst], HandType.FOUR_OF_A_KIND, fourDice);
    expect(inst.state.miles).toBe(8);
  });

  test('bonus miles from playing 4 dice apply to the CURRENT hand scored', () => {
    const inst = item('square_dance');
    const { game } = setupGame({ equipment: [inst] });
    const fourDice = diceWithValue(3, 4);

    // Score a 4-dice hand via full game flow
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.rolledDice = fourDice;
    game.state.selectedForRoll = fourDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(fourDice.map((d) => d.id));
    const firstResult = game.calculateScore()!;

    // First hand: square dance gains +4 miles BEFORE scoring, so bonus applies
    // FOUR_OF_A_KIND: baseMiles=40, totalValue=12 (3×4), +4 from square_dance = 56 * mult(5)
    expect(firstResult.miles).toBeMiles(56 * 5);

    // After scoring, square dance should have +4 miles stored
    expect(inst.state.miles).toBe(4);

    // Score another 4-dice hand — now the stored 4 + new 4 = 8 applies
    game.state.phase = 'ROLL';
    game.state.day = 2;
    game.state.rolledDice = fourDice;
    game.state.selectedForRoll = fourDice;
    game.state.rerollsRemaining = 6;
    game.selectForScore(fourDice.map((d) => d.id));
    const secondResult = game.calculateScore()!;

    // Second hand: square dance had 4, gains another +4 = 8 before scoring
    // FOUR_OF_A_KIND: baseMiles=40, totalValue=12, +8 from square_dance = 60 * mult(5)
    expect(secondResult.miles).toBeMiles(60 * 5);
    expect(inst.state.miles).toBe(8);
  });
});

// ─── HAND_MILES_GAIN: Manifest Destiny ───

describe('HAND_MILES_GAIN: Manifest Destiny', () => {
  test('starts at 0 miles', () => {
    const inst = item('manifest_destiny');
    expect(inst.state.miles).toBe(0);
  });

  test('gains +15 miles when 5 straight is played', () => {
    const inst = item('manifest_destiny');
    const { player } = setupGame({ equipment: [inst] });
    const straightDice = diceFromValues([1, 2, 3, 4, 5]);
    processEquipmentOnHandPlayed([inst], HandType.FIVE_STRAIGHT, straightDice);
    expect(inst.state.miles).toBe(15);
  });

  test('does NOT gain miles for other hand types', () => {
    const inst = item('manifest_destiny');
    const { player } = setupGame({ equipment: [inst] });
    const pairDice = diceWithValue(5, 2);
    processEquipmentOnHandPlayed([inst], HandType.PAIR, pairDice);
    expect(inst.state.miles).toBe(0);
  });

  test('does NOT activate on 4 straight', () => {
    const inst = item('manifest_destiny');
    const { player } = setupGame({ equipment: [inst] });
    const fourStraight = diceFromValues([2, 3, 4, 5]);
    processEquipmentOnHandPlayed([inst], HandType.FOUR_STRAIGHT, fourStraight);
    expect(inst.state.miles).toBe(0);
  });

  test('accumulated miles apply during scoring', () => {
    const inst = itemWithState('manifest_destiny', { miles: 30 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMiles=10, totalValue=10 (5+5), +30 from manifest = 50 * mult(1)
    expect(result.miles).toBeMiles(50);
  });

  test('accumulates across multiple 5 straights', () => {
    const inst = item('manifest_destiny');
    const { player } = setupGame({ equipment: [inst] });
    const straightDice = diceFromValues([1, 2, 3, 4, 5]);
    processEquipmentOnHandPlayed([inst], HandType.FIVE_STRAIGHT, straightDice);
    processEquipmentOnHandPlayed([inst], HandType.FIVE_STRAIGHT, straightDice);
    processEquipmentOnHandPlayed([inst], HandType.FIVE_STRAIGHT, straightDice);
    expect(inst.state.miles).toBe(45);
  });
});

// ─── SUPPLY_USED_MULT: Campfire Stories ───

describe('SUPPLY_USED_MULT: Campfire Stories', () => {
  test('starts at 0 mult', () => {
    const inst = item('campfire_stories');
    expect(inst.state.mult).toBeUndefined();
  });

  test('gains +1 mult when processEquipmentOnSupplyUsed is called', () => {
    const inst = item('campfire_stories');
    processEquipmentOnSupplyUsed([inst]);
    expect(inst.state.mult).toBe(1);
  });

  test('accumulates across multiple supply uses', () => {
    const inst = item('campfire_stories');
    processEquipmentOnSupplyUsed([inst]);
    processEquipmentOnSupplyUsed([inst]);
    processEquipmentOnSupplyUsed([inst]);
    expect(inst.state.mult).toBe(3);
  });

  test('accumulated mult applies during scoring', () => {
    const inst = itemWithState('campfire_stories', { mult: 5 });
    const { result } = calculateTestScore({
      scoredDice: diceWithValue(5, 2),
      equipment: [inst],
    });
    // PAIR: baseMult=1, +5 from campfire stories = 6
    expect(result.mult).toBeMult(6);
  });
});

// ─── Campfire Stories: supply card use integration ───

// Supply cards that create other consumables and fill slots — exclude from tests
const SLOT_CREATING_SUPPLIES = ['compass', 'doctor', 'supply_cache'];

describe('Campfire Stories: supply card use integration', () => {
  test('gains +1 mult when a supply card is used via executeConsumableEffect', () => {
    const campfire = item('campfire_stories');
    const { player } = setupGame({ equipment: [campfire] });

    // Create and use a supply card (exclude ones that create other consumables)
    const supplyDef = getRandomSupplyDef(null, SLOT_CREATING_SUPPLIES);
    player.addConsumable(supplyDef);
    const consumed = player.useConsumable(0)!;
    executeConsumableEffect(consumed, player);

    expect(campfire.state.mult).toBe(1);
  });

  test('does NOT gain mult when a trail guide is used', () => {
    const campfire = item('campfire_stories');
    const { player } = setupGame({ equipment: [campfire] });

    const tgDef = getRandomTrailGuideDef();
    player.addConsumable(tgDef);
    const consumed = player.useConsumable(0)!;
    executeConsumableEffect(consumed, player);

    // Trail guides are NOT supply cards
    expect(campfire.state.mult ?? 0).toBe(0);
  });

  test('accumulates mult across multiple supply uses', () => {
    const campfire = item('campfire_stories');
    const { player } = setupGame({ equipment: [campfire] });
    const history = [];

    for (let i = 0; i < 3; i++) {
      const supplyDef = getRandomSupplyDef(null, SLOT_CREATING_SUPPLIES);
      history.push(supplyDef);
      player.addConsumable(supplyDef);
      const consumed = player.useConsumable(0)!;
      executeConsumableEffect(consumed, player);
    }

    expect(campfire.state.mult).toBe(3);
  });
});
