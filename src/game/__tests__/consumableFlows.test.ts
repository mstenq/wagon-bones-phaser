import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import { die, resetDieIds, seedTestRoll, setupGame } from './testHelpers';
import { getPlayerState, resetPlayerState } from './testRunPlayer';
import { createSupplyConsumableDef, getFrontierDefById, getSupplyDefById } from '../ConsumablesSystem';
import { roundActions } from '../store';
import { resolveConsumableList } from '../store/resolve';
import { sceneActions } from '../store/sceneStore';
import { selectHandDice, selectRolledDice } from '../store/selectors/roundSelectors';
import { initPackLineup, selectPackLineupDice } from '../visibleDiceRow';
import {
  armBarConsumableTargeting,
  armPackCardTargeting,
  commitConsumableTargetingFlow,
  runConsumableFlow,
} from '../consumables/consumableFlowHarness';
import {
  beginConsumableTargeting,
  getActiveConsumableTargeting,
  getConsumableTargetingSnapshot,
  toggleTargetDie,
} from '../consumables/consumableTargetingSession';
import { getPackLineupSelectedDieIds, setPackLineupSelectedDieIds } from '../consumables/packLineupSelection';
import {
  canBuyAndUseConsumableInShop,
  canUseConsumable,
  canUseConsumableInShop,
} from '../consumables/consumableUseContext';
import type { ConsumableEligibilityContext } from '../consumables/consumableTypes';
import supplyCardsData from '../../data/supply_cards';

function gameSelectContext(visibleDieIds: string[]): ConsumableEligibilityContext {
  return {
    scene: 'game',
    source: 'bar',
    phase: 'SELECT',
    visibleDieIds,
    scoreableDieIds: [],
    isScoreActionVisible: false,
  };
}

function gameRollContext(
  visibleDieIds: string[],
  scoreableDieIds: string[],
  isScoreActionVisible: boolean,
): ConsumableEligibilityContext {
  return {
    scene: 'game',
    source: 'bar',
    phase: 'ROLL',
    visibleDieIds,
    scoreableDieIds,
    isScoreActionVisible,
  };
}

function packBarContext(visibleDieIds: string[]): ConsumableEligibilityContext {
  return {
    scene: 'booster_pack',
    source: 'pack_bar',
    visibleDieIds,
  };
}

function packCardContext(visibleDieIds: string[]): ConsumableEligibilityContext {
  return {
    scene: 'booster_pack',
    source: 'pack_card',
    visibleDieIds,
  };
}

function enterTestBoosterPack(): void {
  sceneActions.enterBoosterPack({
    packDefId: 'supply_standard',
    returnScene: 'Shop',
    queuedPackDefIds: [],
    contents: [],
    picksRemaining: 2,
    effectivePickCount: 2,
    usedCardIndices: [],
    lineupDieIds: [],
  });
}

function packDiceSelection(defId: string) {
  const cardData = supplyCardsData.find((c) => c.id === defId)!;
  const def = createSupplyConsumableDef(cardData);
  return def.diceSelection!;
}

beforeEach(() => {
  resetDieIds();
  sceneActions.reset();
});

describe('consumableFlowHarness — game bar flows', () => {
  test('SELECT: shallow_grave with two pre-seeded dice auto-commits', () => {
    const { game, player } = setupGame({
      dice: [die({ value: 1 }), die({ value: 2 }), die({ value: 3 })],
      handSize: 3,
    });
    game.startRound();
    const handIds = selectHandDice().map((d) => d.id);
    const def = getSupplyDefById('shallow_grave')!;
    player.addConsumable(def);

    const result = runConsumableFlow(
      [
        { action: 'set_seed', dieIds: [handIds[0]!, handIds[1]!] },
        { action: 'arm_bar', consumableIndex: 0 },
      ],
      { eligibilityContext: gameSelectContext(handIds), surface: 'game' },
    );

    expect(result.ok).toBe(true);
    expect(result.phase).toBe('auto_committed');
    expect(resolveConsumableList()).toHaveLength(0);
    expect(player.dice).toHaveLength(1);
    expect(player.dice[0]!.id).toBe(handIds[2]);
  });

  test('SELECT: buzzards arm → toggle one die → commit', () => {
    const { game, player } = setupGame({
      dice: [die({ value: 1 }), die({ value: 2 })],
      handSize: 2,
    });
    game.startRound();
    const handIds = selectHandDice().map((d) => d.id);
    player.addConsumable(getSupplyDefById('buzzards')!);

    const armed = runConsumableFlow([{ action: 'arm_bar', consumableIndex: 0 }], {
      eligibilityContext: gameSelectContext(handIds),
      surface: 'game',
    });
    expect(armed.ok).toBe(true);
    expect(armed.phase).toBe('armed');

    const result = runConsumableFlow([{ action: 'toggle', dieId: handIds[0]! }, { action: 'commit' }], {
      eligibilityContext: gameSelectContext(handIds),
      surface: 'game',
    });

    expect(result.ok).toBe(true);
    expect(result.phase).toBe('committed');
    expect(resolveConsumableList()).toHaveLength(0);
    expect(player.dice.find((d) => d.id === handIds[0]!)?.enhancement).toBe('bone');
  });

  test('ROLL: medicine requires bump then commits on scored die', () => {
    const d1 = die({ value: 5 });
    const d2 = die({ value: 8 });
    const { player } = setupGame({ dice: [d1, d2], handSize: 2 });
    seedTestRoll([d1, d2]);
    player.addConsumable(getSupplyDefById('medicine')!);

    const rolledIds = selectRolledDice().map((d) => d.id);
    const ctx = gameRollContext(rolledIds, rolledIds, true);

    const armed = runConsumableFlow([{ action: 'arm_bar', consumableIndex: 0 }], {
      eligibilityContext: ctx,
      surface: 'game',
    });
    expect(armed.phase).toBe('armed');

    const result = runConsumableFlow(
      [{ action: 'toggle', dieId: rolledIds[0]! }, { action: 'bump', direction: 'up' }, { action: 'commit' }],
      { eligibilityContext: ctx, surface: 'game' },
    );

    expect(result.ok).toBe(true);
    expect(resolveConsumableList()).toHaveLength(0);
    expect(player.dice.find((d) => d.id === rolledIds[0]!)?.value).toBe(6);
  });

  test('bar arm rejects more pre-selected dice than max picks', () => {
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2 });
    const d3 = die({ value: 3 });
    const { player } = setupGame({ dice: [d1, d2, d3], handSize: 3 });
    seedTestRoll([d1, d2, d3]);
    player.addConsumable(getSupplyDefById('medicine')!);

    const rolledIds = selectRolledDice().map((d) => d.id);
    const ctx = gameRollContext(rolledIds, rolledIds, true);

    const result = armBarConsumableTargeting(0, { eligibilityContext: ctx, surface: 'game' }, rolledIds);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Select at most 1 dice');
    expect(getActiveConsumableTargeting()).toBeNull();
    expect(resolveConsumableList()).toHaveLength(1);
  });

  test('cancel mid-flow keeps consumable in bar', () => {
    const { game, player } = setupGame({
      dice: [die({ value: 1 }), die({ value: 2 })],
      handSize: 2,
    });
    game.startRound();
    const handIds = selectHandDice().map((d) => d.id);
    player.addConsumable(getSupplyDefById('shallow_grave')!);

    runConsumableFlow(
      [{ action: 'arm_bar', consumableIndex: 0 }, { action: 'toggle', dieId: handIds[0]! }, { action: 'cancel' }],
      { eligibilityContext: gameSelectContext(handIds), surface: 'game' },
    );

    expect(getActiveConsumableTargeting()).toBeNull();
    expect(resolveConsumableList()).toHaveLength(1);
  });

  test('mirage clone applies right die enhancement to left die when toggled in order', () => {
    resetPlayerState();
    const left = die({ value: 1 });
    const right = die({ value: 2, enhancement: 'lucky' });
    const { player } = setupGame({ dice: [left, right], handSize: 2 });
    roundActions.patch({ phase: 'SELECT', handDiceIds: [left.id, right.id] });
    const handIds = selectHandDice().map((d) => d.id);
    expect(handIds).toEqual([left.id, right.id]);
    player.addConsumable(getSupplyDefById('mirage')!);

    const result = runConsumableFlow(
      [
        { action: 'arm_bar', consumableIndex: 0 },
        { action: 'toggle', dieId: left.id },
        { action: 'toggle', dieId: right.id },
        { action: 'commit' },
      ],
      { eligibilityContext: gameSelectContext(handIds), surface: 'game' },
    );

    expect(result.ok).toBe(true);
    expect(player.dice.find((d) => d.id === left.id)?.enhancement).toBe('lucky');
    expect(player.dice.find((d) => d.id === right.id)?.enhancement).toBe('lucky');
  });

  test('commit fails when selection is incomplete', () => {
    const { game, player } = setupGame({
      dice: [die({ value: 1 }), die({ value: 2 })],
      handSize: 2,
    });
    game.startRound();
    const handIds = selectHandDice().map((d) => d.id);
    player.addConsumable(getSupplyDefById('shallow_grave')!);

    runConsumableFlow(
      [
        { action: 'arm_bar', consumableIndex: 0 },
        { action: 'toggle', dieId: handIds[0]! },
      ],
      {
        eligibilityContext: gameSelectContext(handIds),
        surface: 'game',
      },
    );

    const result = commitConsumableTargetingFlow({
      eligibilityContext: gameSelectContext(handIds),
      surface: 'game',
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Select');
    expect(getActiveConsumableTargeting()).not.toBeNull();
    expect(resolveConsumableList()).toHaveLength(1);
  });
});

describe('consumableFlowHarness — booster pack flows', () => {
  test('pack bar: preselect two dice then shallow_grave auto-commits', () => {
    const { player } = setupGame();
    const dice = [die({ value: 1 }), die({ value: 2 }), die({ value: 3 })];
    player.dice = dice;
    player.addConsumable(getSupplyDefById('shallow_grave')!);

    enterTestBoosterPack();
    const lineup = initPackLineup();
    const lineupIds = lineup.map((d) => d.id);
    const ctx = packBarContext(lineupIds);

    const result = runConsumableFlow(
      [
        { action: 'preselect_pack', dieIds: [lineupIds[0]!, lineupIds[1]!] },
        { action: 'arm_bar', consumableIndex: 0 },
      ],
      { eligibilityContext: ctx, surface: 'pack_lineup' },
    );

    expect(result.ok).toBe(true);
    expect(result.phase).toBe('auto_committed');
    expect(resolveConsumableList()).toHaveLength(0);
    expect(player.dice.map((d) => d.id)).toEqual([lineupIds[2]!]);
    expect(selectPackLineupDice().map((d) => d.id)).toEqual([lineupIds[2]!]);
  });

  test('pack bar: rejects too many pre-selected dice', () => {
    const { player } = setupGame();
    player.dice = [die({ value: 1 }), die({ value: 2 }), die({ value: 3 })];
    player.addConsumable(getFrontierDefById('seeing_double')!);

    enterTestBoosterPack();
    const lineup = initPackLineup();
    const lineupIds = lineup.map((d) => d.id);

    const result = runConsumableFlow(
      [
        { action: 'preselect_pack', dieIds: lineupIds },
        { action: 'arm_bar', consumableIndex: 0 },
      ],
      { eligibilityContext: packBarContext(lineupIds), surface: 'pack_lineup' },
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Select at most 1 dice');
  });

  test('pack card: pan_for_gold arm → pick two → commit', () => {
    resetPlayerState();
    const player = getPlayerState();
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2 });
    player.dice = [d1, d2];

    enterTestBoosterPack();
    const lineup = initPackLineup();
    const lineupIds = lineup.map((d) => d.id);
    const ctx = packCardContext(lineupIds);
    const diceSelection = packDiceSelection('pan_for_gold');

    runConsumableFlow([{ action: 'arm_pack_card', cardIndex: 0, defId: 'pan_for_gold', diceSelection }], {
      eligibilityContext: ctx,
      surface: 'pack_lineup',
    });

    const result = runConsumableFlow(
      [{ action: 'toggle', dieId: lineupIds[0]! }, { action: 'toggle', dieId: lineupIds[1]! }, { action: 'commit' }],
      { eligibilityContext: ctx, surface: 'pack_lineup' },
    );

    expect(result.ok).toBe(true);
    expect(getActiveConsumableTargeting()).toBeNull();
    expect(player.lastUsedConsumable?.id).toBe('pan_for_gold');
  });

  test('pack card: rejects too many pre-selected dice', () => {
    const { player } = setupGame();
    const dice = [die({ value: 1 }), die({ value: 2 }), die({ value: 3 })];
    player.dice = dice;

    enterTestBoosterPack();
    const lineup = initPackLineup();
    const lineupIds = lineup.map((d) => d.id);
    setPackLineupSelectedDieIds(lineupIds);

    const ctx = packCardContext(lineupIds);
    const diceSelection = packDiceSelection('shallow_grave');

    const result = armPackCardTargeting(0, 'shallow_grave', diceSelection, {
      eligibilityContext: ctx,
      surface: 'pack_lineup',
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Select at most');
    expect(getActiveConsumableTargeting()).toBeNull();
  });

  test('pack mirage clone respects preselect order not lineup order', () => {
    const { player } = setupGame();
    const left = die({ value: 1, enhancement: 'lucky' });
    const right = die({ value: 2 });
    const extra = die({ value: 3 });
    player.dice = [left, right, extra];

    enterTestBoosterPack();
    const lineup = initPackLineup();
    const lineupIds = lineup.map((d) => d.id);
    // Pick right before left — row order would clone lucky onto left; pick order clones onto right.
    setPackLineupSelectedDieIds([right.id, left.id]);

    const ctx = packCardContext(lineupIds);
    const diceSelection = packDiceSelection('mirage');

    const armResult = armPackCardTargeting(0, 'mirage', diceSelection, {
      eligibilityContext: ctx,
      surface: 'pack_lineup',
    });
    expect(armResult.ok).toBe(true);

    const commitResult = commitConsumableTargetingFlow({
      eligibilityContext: ctx,
      surface: 'pack_lineup',
    });
    expect(commitResult.ok).toBe(true);
    expect(player.dice.find((d) => d.id === right.id)?.enhancement).toBe('lucky');
    expect(player.dice.find((d) => d.id === left.id)?.enhancement).toBe('lucky');
  });

  test('cancel pack session writes session selection back to ambient lineup store', () => {
    const { player } = setupGame();
    player.dice = [die({ value: 1 }), die({ value: 2 })];

    enterTestBoosterPack();
    const lineup = initPackLineup();
    const lineupIds = lineup.map((d) => d.id);
    setPackLineupSelectedDieIds([lineupIds[0]!]);

    const ctx = packCardContext(lineupIds);
    const diceSelection = packDiceSelection('buzzards');

    runConsumableFlow(
      [
        { action: 'arm_pack_card', cardIndex: 0, defId: 'buzzards', diceSelection },
        { action: 'toggle', dieId: lineupIds[1]! },
        { action: 'cancel' },
      ],
      { eligibilityContext: ctx, surface: 'pack_lineup' },
    );

    expect(getActiveConsumableTargeting()).toBeNull();
    expect(getPackLineupSelectedDieIds()).toEqual([lineupIds[0]!, lineupIds[1]!]);
  });
});

describe('consumableFlowHarness — eligibility gates (shop / scene)', () => {
  const shopContext = { scene: 'shop' as const, source: 'bar' as const };

  test('visible_dice and scored_dice cards blocked from shop bar use', () => {
    for (const id of ['shallow_grave', 'mirage', 'loaded', 'medicine'] as const) {
      const def = getSupplyDefById(id)!;
      expect(canUseConsumableInShop(def)).toBe(false);
      expect(canUseConsumable(def, shopContext).allowed).toBe(false);
    }
  });

  test('any_time shopBuyAndUse cards allowed in shop', () => {
    expect(canBuyAndUseConsumableInShop(getSupplyDefById('treasure_map')!)).toBe(true);
    expect(canBuyAndUseConsumableInShop(getSupplyDefById('doctor')!)).toBe(true);
  });

  test('medicine blocked in pack and game SELECT', () => {
    const medicine = getSupplyDefById('medicine')!;
    const dieIds = ['d1', 'd2'];
    expect(canUseConsumable(medicine, packCardContext(dieIds)).allowed).toBe(false);
    expect(canUseConsumable(medicine, gameSelectContext(dieIds)).allowed).toBe(false);
  });

  test('visible_dice allowed in game SELECT and pack when dice exist', () => {
    const buzzards = getSupplyDefById('buzzards')!;
    const dieIds = ['d1', 'd2'];
    expect(canUseConsumable(buzzards, gameSelectContext(dieIds)).allowed).toBe(true);
    expect(canUseConsumable(buzzards, packBarContext(dieIds)).allowed).toBe(true);
    expect(canUseConsumable(buzzards, packBarContext([])).allowed).toBe(false);
  });
});

describe('consumableFlowHarness — session invariants', () => {
  test('cannot begin a second session while one is active', () => {
    const def = getSupplyDefById('shallow_grave')!;
    const visible = ['die-a', 'die-b'];

    beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameSelectContext(visible),
      def.diceSelection!,
    );

    const second = beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameSelectContext(visible),
      def.diceSelection!,
    );

    expect(second.ok).toBe(false);
  });

  test('snapshot validation tracks bump direction for medicine', () => {
    const medicine = getSupplyDefById('medicine')!;
    const visible = ['die-a'];

    beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: medicine.id },
      gameRollContext(visible, visible, true),
      medicine.diceSelection!,
    );
    toggleTargetDie('die-a');

    let snap = getConsumableTargetingSnapshot();
    expect(snap.needsBumpDirection).toBe(true);
    expect(snap.ready).toBe(false);
    expect(snap.validationReason).toBe('Choose bump direction');
  });
});
