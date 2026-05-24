import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import { resetPlayerState } from '../__tests__/testRunPlayer';
import { createDie } from '../DiceSystem';

const d6 = () => createDie({ value: 6 });

describe('Die ID uniqueness', () => {
  beforeEach(() => resetPlayerState());

  test('addDie generates unique IDs after destroying dice', () => {
    const player = resetPlayerState();

    // Add 3 dice
    player.addDie(d6());
    player.addDie(d6());
    player.addDie(d6());

    // Destroy the middle die (simulates player destroying a die)
    const destroyId = player.dice[player.dice.length - 2].id;
    player.dice = player.dice.filter((d) => d.id !== destroyId);

    // Add a new die — its ID must not collide with any existing ID
    player.addDie(d6());
    const allIds = player.dice.map((d) => d.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  test('addDie IDs always increase monotonically', () => {
    const player = resetPlayerState();

    // Add, destroy, add pattern multiple times
    player.addDie(d6());
    const id1 = player.dice[player.dice.length - 1].id;

    // Destroy it
    player.dice = player.dice.filter((d) => d.id !== id1);

    // Add two more
    player.addDie(d6());
    const id2 = player.dice[player.dice.length - 1].id;
    player.addDie(d6());
    const id3 = player.dice[player.dice.length - 1].id;

    // Extract numeric suffixes — they should be strictly increasing
    const num = (id: string) => parseInt(id.replace('die_player_', ''), 10);
    expect(num(id2)).toBeGreaterThan(num(id1));
    expect(num(id3)).toBeGreaterThan(num(id2));
  });

  test('no duplicate IDs after bulk destroy and re-add', () => {
    const player = resetPlayerState();

    // Add 5 dice
    for (let i = 0; i < 5; i++) player.addDie(d6());

    // Destroy 3
    const toRemove = player.dice.slice(-3).map((d) => d.id);
    player.dice = player.dice.filter((d) => !toRemove.includes(d.id));

    // Add 5 more
    for (let i = 0; i < 5; i++) player.addDie(d6());

    const allIds = player.dice.map((d) => d.id);
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });
});
