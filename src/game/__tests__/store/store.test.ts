import '../setup';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { GameState } from '../testGameState';
import { PlayerState, getPlayerState } from '../testRunPlayer';
import { resetGameStores } from '../testHelpers';
import { getConsumableDefById } from '../../ConsumablesSystem';
import {
  createInitialRunState,
  createInitialRoundState,
  createInitialSceneState,
  runActions,
  runStore,
  roundActions,
  roundStore,
  sceneActions,
  sceneStore,
  shopBuyActions,
  selectBalance,
  subscribeRunSelector,
  resetAllGameStores,
} from '../../store';

describe('game stores', () => {
  beforeEach(() => {
    resetGameStores();
    roundActions.reset();
    sceneActions.reset();
  });

  afterEach(() => {
    resetGameStores();
    roundActions.reset();
    sceneActions.reset();
  });

  test('run store initializes with plain data', () => {
    const state = runStore.getState();
    expect(state.balance).toBe(createInitialRunState().balance);
    expect(state.dice).toEqual([]);
    expect(state.equipment).toEqual([]);
    expect(state.handStats).toBeTruthy();
    expect(Array.isArray(state.spentDiceIds)).toBe(true);
    expect(Array.isArray(state.seenTrailEventIds)).toBe(true);
    expect(state.playbackQueue).toEqual([]);
  });

  test('round store starts null until a round begins', () => {
    expect(roundStore.getState()).toBeNull();
    roundActions.startFresh();
    const round = roundStore.getState();
    expect(round).not.toBeNull();
    expect(round!.phase).toBe('SELECT');
    expect(Array.isArray(round!.handDiceIds)).toBe(true);
    expect(Array.isArray(round!.rolledDice)).toBe(true);
  });

  test('scene store initializes with no active scene payload', () => {
    const scene = sceneStore.getState();
    expect(scene.activeScene).toBe('none');
    expect(scene.shop).toBeNull();
    expect(scene.boosterPack).toBeNull();
    expect(scene.trailEvent).toBeNull();
  });

  test('resetAllGameStores clears scene store (new game from main menu)', () => {
    sceneActions.enterShop({ stock: [], packs: [], shopRerollCount: 2 });
    resetAllGameStores();
    expect(sceneStore.getState()).toEqual(createInitialSceneState());
  });

  test('reset returns initial plain state', () => {
    runActions.setBalance(99);
    runActions.patch({ leg: 3, dynamiteSelfDestructed: true });
    runActions.reset();

    expect(runStore.getState()).toEqual(createInitialRunState());

    roundActions.startFresh();
    roundActions.patch({ day: 2 });
    roundActions.reset();
    expect(roundStore.getState()).toBeNull();

    sceneActions.setActiveScene('Shop');
    sceneActions.patch({ shop: { stock: [], packs: [], shopRerollCount: 1 } });
    sceneActions.reset();
    expect(sceneStore.getState()).toEqual(createInitialSceneState());
  });

  test('hydrate replaces store state', () => {
    const custom = createInitialRunState();
    custom.balance = 42;
    custom.leg = 5;
    custom.bossAssignmentIds = ['boss_1', 'boss_2'];
    runActions.hydrate(custom);
    expect(runStore.getState().balance).toBe(42);
    expect(runStore.getState().leg).toBe(5);
    expect(runStore.getState().bossAssignmentIds).toEqual(['boss_1', 'boss_2']);

    const round = createInitialRoundState();
    round.day = 3;
    roundActions.hydrate(round);
    expect(roundStore.getState()?.day).toBe(3);

    const scene = createInitialSceneState();
    scene.activeScene = 'TrailEvent';
    scene.trailEvent = { eventId: 'river_crossing', resolved: false, spyglassRevealed: true };
    sceneActions.hydrate(scene);
    expect(sceneStore.getState().activeScene).toBe('TrailEvent');
    expect(sceneStore.getState().trailEvent?.eventId).toBe('river_crossing');
  });

  test('selector subscription fires on action updates', () => {
    const values: number[] = [];
    const initialBalance = createInitialRunState().balance;
    const unsub = subscribeRunSelector(selectBalance, (balance) => {
      values.push(balance);
    });

    runActions.setBalance(15);
    runActions.setBalance(20);
    unsub();

    expect(values).toEqual([initialBalance, 15, 20]);
  });

  test('state contains no PlayerState or GameState instances', () => {
    const run = runStore.getState();
    expect(run).not.toBeInstanceOf(PlayerState);
    for (const value of Object.values(run)) {
      expect(value).not.toBeInstanceOf(PlayerState);
      expect(value).not.toBeInstanceOf(GameState);
    }

    roundActions.startFresh();
    const round = roundStore.getState();
    if (round) {
      expect(round).not.toBeInstanceOf(GameState);
      for (const value of Object.values(round)) {
        expect(value).not.toBeInstanceOf(GameState);
        expect(value).not.toBeInstanceOf(PlayerState);
      }
    }

    // Legacy singletons still exist elsewhere; stores must not embed them.
    resetGameStores();
    expect(getPlayerState()).toBeInstanceOf(PlayerState);
    expect(new GameState()).toBeInstanceOf(GameState);
  });

  test('playback queue enqueue preserves order', () => {
    runActions.enqueuePlayback({ kind: 'dice-added', dieIds: ['die_1'] });
    runActions.enqueuePlayback({ kind: 'tag-earned', tagId: 'tag_uncommon', category: 'shop', round: 1 });
    expect(runStore.getState().playbackQueue).toEqual([
      { kind: 'dice-added', dieIds: ['die_1'] },
      { kind: 'tag-earned', tagId: 'tag_uncommon', category: 'shop', round: 1 },
    ]);
    runActions.clearPlayback();
    expect(runStore.getState().playbackQueue).toEqual([]);
  });

  test('takePlayback removes only matching commands', () => {
    runActions.enqueuePlayback({ kind: 'dice-added', dieIds: ['die_1'] });
    runActions.enqueuePlayback({ kind: 'tag-earned', tagId: 'tag_uncommon', category: 'shop', round: 1 });
    const taken = runActions.takePlayback((cmd) => cmd.kind === 'dice-added');
    expect(taken).toEqual([{ kind: 'dice-added', dieIds: ['die_1'] }]);
    expect(runStore.getState().playbackQueue).toEqual([
      { kind: 'tag-earned', tagId: 'tag_uncommon', category: 'shop', round: 1 },
    ]);
  });

  test('takePlayback is atomic when nothing matches', () => {
    runActions.enqueuePlayback({ kind: 'tag-earned', tagId: 'tag_uncommon', category: 'shop', round: 1 });
    const taken = runActions.takePlayback((cmd) => cmd.kind === 'dice-added');
    expect(taken).toEqual([]);
    expect(runStore.getState().playbackQueue).toEqual([
      { kind: 'tag-earned', tagId: 'tag_uncommon', category: 'shop', round: 1 },
    ]);
  });

  test('shopBuyActions.buyConsumable does not spend when consumable slots are full', () => {
    const def = getConsumableDefById('coffee_tin');
    expect(def).toBeTruthy();
    if (!def) return;
    runActions.patch({
      balance: 99,
      maxConsumableSlots: 0,
      consumables: [],
    });
    const result = shopBuyActions.buyConsumable(def, 5);
    expect(result).toEqual({ ok: false, reason: 'no_space' });
    expect(runStore.getState().balance).toBe(99);
  });
});
