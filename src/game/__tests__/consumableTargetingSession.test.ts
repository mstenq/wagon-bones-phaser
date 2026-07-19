import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import { die, resetDieIds, setupGame } from './testHelpers';
import { getSupplyDefById } from '../ConsumablesSystem';
import { resolveConsumableList } from '../store/resolve';
import { sceneActions } from '../store/sceneStore';
import { applyConsumableTargetingCommit } from '../consumables/applyConsumableTargeting';
import {
  beginConsumableTargeting,
  cancelConsumableTargeting,
  commitConsumableTargeting,
  getActiveConsumableTargeting,
  getConsumableTargetingSnapshot,
  isTargetingCommitReady,
  setBumpDirection,
  toggleTargetDie,
} from '../consumables/consumableTargetingSession';
import { initPackLineup, selectPackLineupDice } from '../visibleDiceRow';
import type { ConsumableEligibilityContext } from '../consumables/consumableUseContext';

function gameVisibleDiceContext(visibleDieIds: string[]): ConsumableEligibilityContext {
  return {
    scene: 'game',
    source: 'bar',
    phase: 'SELECT',
    visibleDieIds,
    scoreableDieIds: [],
    isScoreActionVisible: false,
  };
}

beforeEach(() => {
  resetDieIds();
  sceneActions.reset();
});

describe('ConsumableTargetingSession — bar lifecycle', () => {
  test('begin does not remove the bar card', () => {
    const { player } = setupGame();
    const def = getSupplyDefById('shallow_grave')!;
    player.addConsumable(def);
    expect(resolveConsumableList()).toHaveLength(1);

    const diceSelection = def.diceSelection!;
    const result = beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameVisibleDiceContext(['die-a', 'die-b', 'die-c']),
      diceSelection,
    );

    expect(result.ok).toBe(true);
    expect(getActiveConsumableTargeting()).not.toBeNull();
    expect(resolveConsumableList()).toHaveLength(1);
    expect(resolveConsumableList()[0]!.def.id).toBe('shallow_grave');
  });

  test('toggle updates selected dice within min/max', () => {
    const def = getSupplyDefById('shallow_grave')!;
    const diceSelection = def.diceSelection!;
    const visible = ['die-a', 'die-b', 'die-c', 'die-d'];

    beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameVisibleDiceContext(visible),
      diceSelection,
    );

    expect(toggleTargetDie('die-a').ok).toBe(true);
    expect(getActiveConsumableTargeting()!.selectedDieIds).toEqual(['die-a']);

    expect(toggleTargetDie('die-b').ok).toBe(true);
    expect(getActiveConsumableTargeting()!.selectedDieIds).toEqual(['die-a', 'die-b']);

    expect(toggleTargetDie('die-a').ok).toBe(true);
    expect(getActiveConsumableTargeting()!.selectedDieIds).toEqual(['die-b']);
  });

  test('rejects toggling a die outside the visible target set', () => {
    const def = getSupplyDefById('shallow_grave')!;
    beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameVisibleDiceContext(['die-a']),
      def.diceSelection!,
    );

    const result = toggleTargetDie('die-z');
    expect(result.ok).toBe(false);
    expect(getActiveConsumableTargeting()!.selectedDieIds).toEqual([]);
  });

  test('snapshot reflects readiness from DiceSelectionSystem rules', () => {
    const def = getSupplyDefById('shallow_grave')!;
    const visible = ['die-a', 'die-b', 'die-c'];

    beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameVisibleDiceContext(visible),
      def.diceSelection!,
    );

    let snap = getConsumableTargetingSnapshot();
    expect(snap.active).toBe(true);
    expect(snap.minPicks).toBe(1);
    expect(snap.maxPicks).toBe(3);
    expect(snap.ready).toBe(false);
    expect(snap.validationReason).toContain('Select');

    toggleTargetDie('die-a');
    snap = getConsumableTargetingSnapshot();
    expect(snap.selectedCount).toBe(1);
    expect(snap.ready).toBe(true);
    expect(snap.validationReason).toBeNull();

    toggleTargetDie('die-b');
    snap = getConsumableTargetingSnapshot();
    expect(snap.selectedCount).toBe(2);
    expect(snap.ready).toBe(true);
    expect(snap.validationReason).toBeNull();

    toggleTargetDie('die-c');
    snap = getConsumableTargetingSnapshot();
    expect(snap.selectedCount).toBe(3);
    expect(snap.ready).toBe(true);
    expect(snap.validationReason).toBeNull();
    expect(isTargetingCommitReady(getActiveConsumableTargeting()!)).toBe(true);
  });

  test('cancel clears session without mutating the bar', () => {
    const { player } = setupGame();
    const def = getSupplyDefById('shallow_grave')!;
    player.addConsumable(def);

    beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameVisibleDiceContext(['die-a', 'die-b']),
      def.diceSelection!,
    );
    toggleTargetDie('die-a');
    toggleTargetDie('die-b');

    cancelConsumableTargeting();

    expect(getActiveConsumableTargeting()).toBeNull();
    expect(resolveConsumableList()).toHaveLength(1);
  });

  test('commit fails until selection is valid', () => {
    const def = getSupplyDefById('shallow_grave')!;
    beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameVisibleDiceContext(['die-a', 'die-b', 'die-c']),
      def.diceSelection!,
    );

    const tooFew = commitConsumableTargeting();
    expect(tooFew.ok).toBe(false);
    if (!tooFew.ok) expect(tooFew.reason).toContain('Select');
    expect(getActiveConsumableTargeting()).not.toBeNull();

    toggleTargetDie('die-a');
    const oneDie = commitConsumableTargeting();
    expect(oneDie.ok).toBe(true);
    expect(getActiveConsumableTargeting()).toBeNull();
  });

  test('commit succeeds when ready and clears the session', () => {
    const def = getSupplyDefById('shallow_grave')!;
    beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameVisibleDiceContext(['die-a', 'die-b']),
      def.diceSelection!,
    );
    toggleTargetDie('die-a');
    toggleTargetDie('die-b');

    const result = commitConsumableTargeting();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.commit.source).toEqual({ kind: 'bar', consumableIndex: 0, defId: 'shallow_grave' });
      expect(result.commit.selectedDieIds).toEqual(['die-a', 'die-b']);
    }
    expect(getActiveConsumableTargeting()).toBeNull();
  });

  test('medicine requires bump direction before commit', () => {
    const def = getSupplyDefById('medicine')!;
    const context: ConsumableEligibilityContext = {
      scene: 'game',
      source: 'bar',
      phase: 'ROLL',
      visibleDieIds: ['die-a'],
      scoreableDieIds: ['die-a'],
      isScoreActionVisible: true,
    };

    beginConsumableTargeting({ kind: 'bar', consumableIndex: 0, defId: def.id }, context, def.diceSelection!);
    toggleTargetDie('die-a');

    let snap = getConsumableTargetingSnapshot();
    expect(snap.needsBumpDirection).toBe(true);
    expect(snap.ready).toBe(false);
    expect(snap.validationReason).toBe('Choose bump direction');

    const blocked = commitConsumableTargeting();
    expect(blocked.ok).toBe(false);

    setBumpDirection('up');
    snap = getConsumableTargetingSnapshot();
    expect(snap.ready).toBe(true);
    expect(snap.bumpDirection).toBe('up');

    const committed = commitConsumableTargeting();
    expect(committed.ok).toBe(true);
    if (committed.ok) {
      expect(committed.commit.bumpDirection).toBe('up');
      expect(committed.commit.selectedDieIds).toEqual(['die-a']);
    }
  });

  test('blocks a second begin while a session is active', () => {
    const def = getSupplyDefById('shallow_grave')!;
    beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameVisibleDiceContext(['die-a', 'die-b']),
      def.diceSelection!,
    );

    const second = beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameVisibleDiceContext(['die-a', 'die-b']),
      def.diceSelection!,
    );
    expect(second.ok).toBe(false);
  });

  test('apply commit applies dice effect before consuming bar card', () => {
    const { game, player } = setupGame({
      dice: [die({ value: 1 }), die({ value: 2 }), die({ value: 3 })],
      handSize: 3,
    });
    game.startRound();
    const handIds = game.state.hand.map((d) => d.id);
    const def = getSupplyDefById('shallow_grave')!;
    player.addConsumable(def);

    beginConsumableTargeting(
      { kind: 'bar', consumableIndex: 0, defId: def.id },
      gameVisibleDiceContext(handIds),
      def.diceSelection!,
    );
    toggleTargetDie(handIds[0]!);
    toggleTargetDie(handIds[1]!);
    const committed = commitConsumableTargeting();
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    expect(resolveConsumableList()).toHaveLength(1);
    const applied = applyConsumableTargetingCommit(committed.commit, { surface: 'game' });
    expect(applied.ok).toBe(true);
    expect(resolveConsumableList()).toHaveLength(0);
    expect(player.dice).toHaveLength(1);
  });

  test('apply commit consumes bar card and applies pack-lineup dice effect', () => {
    const { player } = setupGame();
    const dice = [die({ value: 1 }), die({ value: 2 }), die({ value: 3 })];
    player.dice = dice;
    const def = getSupplyDefById('shallow_grave')!;
    player.addConsumable(def);
    sceneActions.enterBoosterPack({
      packDefId: 'supply_standard',
      returnScene: 'Shop',
      queuedPackDefIds: [],
      contents: [],
      picksRemaining: 1,
      effectivePickCount: 1,
      usedCardIndices: [],
      lineupDieIds: [],
    });
    const lineup = initPackLineup();

    const context: ConsumableEligibilityContext = {
      scene: 'booster_pack',
      source: 'pack_bar',
      visibleDieIds: lineup.map((d) => d.id),
    };
    beginConsumableTargeting({ kind: 'bar', consumableIndex: 0, defId: def.id }, context, def.diceSelection!);
    toggleTargetDie(lineup[0]!.id);
    toggleTargetDie(lineup[1]!.id);
    const committed = commitConsumableTargeting();
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    const applied = applyConsumableTargetingCommit(committed.commit, { surface: 'pack_lineup' });

    expect(applied.ok).toBe(true);
    expect(resolveConsumableList()).toHaveLength(0);
    expect(player.dice.map((d) => d.id)).toEqual([lineup[2]!.id]);
    expect(selectPackLineupDice().map((d) => d.id)).toEqual([lineup[2]!.id]);
  });
});
