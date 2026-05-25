import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import {
  die,
  diceFromValues,
  diceWithValue,
  item,
  itemWithState,
  calculateTestScore,
  resetDieIds,
} from './testHelpers';
import type { ScoreAnimEvent } from '../types';

/** Per-die miles popup sequence (excludes again/equip-only events). */
function milesDieIds(events: ScoreAnimEvent[]): string[] {
  return events.filter((e) => e.popupType === 'miles' && e.dieId).map((e) => e.dieId!);
}

function findLastAnimIndex(events: ScoreAnimEvent[], pred: (event: ScoreAnimEvent) => boolean): number {
  for (let i = events.length - 1; i >= 0; i--) {
    if (pred(events[i])) return i;
  }
  return -1;
}

beforeEach(() => {
  resetDieIds();
});

// ─── Animation Event Order Tests ───

describe('animEvents order: per-die scoring', () => {
  test('events follow input dice order for two pair', () => {
    // Two pair: [5,12,5,12] — all 4 dice score
    const dice = [die({ value: 5 }), die({ value: 12 }), die({ value: 5 }), die({ value: 12 })];
    const { result } = calculateTestScore({ scoredDice: dice });

    const dieIds = result.animEvents.map((e) => e.dieId);
    // Should be in original order: die0, die1, die2, die3
    expect(dieIds).toEqual([dice[0].id, dice[1].id, dice[2].id, dice[3].id]);
  });

  test('each die gets a miles event with its value', () => {
    // Three of a kind: all 3 dice score
    const dice = [die({ value: 7 }), die({ value: 7 }), die({ value: 7 })];
    const { result } = calculateTestScore({ scoredDice: dice });

    expect(result.animEvents).toEqual([
      expect.objectContaining({ popupType: 'miles', value: 7, dieId: dice[0].id }),
      expect.objectContaining({ popupType: 'miles', value: 7, dieId: dice[1].id }),
      expect.objectContaining({ popupType: 'miles', value: 7, dieId: dice[2].id }),
    ]);
  });

  test('five straight preserves input order', () => {
    const dice = diceFromValues([3, 1, 4, 2, 5]);
    const { result } = calculateTestScore({ scoredDice: dice });

    const dieIds = result.animEvents.map((e) => e.dieId);
    expect(dieIds).toEqual([dice[0].id, dice[1].id, dice[2].id, dice[3].id, dice[4].id]);
  });
});

describe('animEvents order: retriggers (red_bullet)', () => {
  test('retrigger events are consecutive for same die', () => {
    // Pair with one having red_bullet
    const dice = [die({ value: 6 }), die({ value: 6, sticker: 'red_bullet' })];
    const { result } = calculateTestScore({ scoredDice: dice });

    const dieIds = milesDieIds(result.animEvents);
    // die0 once, die1 twice (retrigger)
    expect(dieIds).toEqual([dice[0].id, dice[1].id, dice[1].id]);
  });

  test('retrigger with enhancement fires enhancement on each trigger', () => {
    // Single die scored (HIGH_VALUE)
    const dice = [die({ value: 5, sticker: 'red_bullet', enhancement: 'bone' })];
    const { result } = calculateTestScore({ scoredDice: dice });

    // Each trigger: miles + mult (bone). Two triggers total.
    expect(result.animEvents).toEqual([
      expect.objectContaining({ popupType: 'miles', value: 5 }),
      expect.objectContaining({ popupType: 'mult', value: 4 }),
      expect.objectContaining({ popupType: 'miles', value: 5 }),
      expect.objectContaining({ popupType: 'mult', value: 4 }),
    ]);
  });
});

describe('animEvents: again popup on retrigger equipment', () => {
  test('War Drums emits again on war_drums slot before second trigger', () => {
    const dice = [die({ value: 5 }), die({ value: 5 })];
    const warDrums = item('war_drums');
    const { result } = calculateTestScore({ scoredDice: dice, equipment: [warDrums] });

    const againEvents = result.animEvents.filter((e) => e.popupType === 'again');
    expect(againEvents).toHaveLength(2);
    expect(againEvents[0]).toEqual(
      expect.objectContaining({
        popupType: 'again',
        target: { kind: 'equip', equipIndex: 0 },
        dieId: dice[0].id,
      }),
    );
    expect(againEvents[1].dieId).toBe(dice[1].id);

    const firstAgainIdx = result.animEvents.findIndex((e) => e.popupType === 'again');
    const secondMilesForDie0 = result.animEvents.findIndex(
      (e, i) => i > firstAgainIdx && e.dieId === dice[0].id && e.popupType === 'miles',
    );
    expect(secondMilesForDie0).toBeGreaterThan(firstAgainIdx);
  });

  test('One-Eyed Jack emits again only on matching pip dice', () => {
    const dice = diceWithValue(1, 2);
    const jack = item('one_eyed_jack');
    const { result } = calculateTestScore({ scoredDice: dice, equipment: [jack] });

    const againEvents = result.animEvents.filter((e) => e.popupType === 'again');
    expect(againEvents).toHaveLength(2);
    expect(againEvents.every((e) => e.dieId === dice[0].id || e.dieId === dice[1].id)).toBe(true);
  });

  test('Silver Bullets held retrigger emits again on equipment', () => {
    const scoredDice = [die({ value: 6 })];
    const heldDice = [die({ value: 4, enhancement: 'steel' })];
    const { result } = calculateTestScore({
      scoredDice,
      heldDice,
      equipment: [item('silver_bullets')],
    });

    const againEvents = result.animEvents.filter((e) => e.popupType === 'again');
    expect(againEvents.length).toBeGreaterThanOrEqual(1);
    expect(againEvents[0]).toEqual(
      expect.objectContaining({
        popupType: 'again',
        target: { kind: 'equip', equipIndex: 0 },
      }),
    );
  });

  test('Silver Bullets does not emit again for held dice with no held effects', () => {
    const scoredDice = diceWithValue(5, 2);
    const heldDice = [die({ value: 3 }), die({ value: 7 })];
    const { result } = calculateTestScore({
      scoredDice,
      heldDice,
      equipment: [item('silver_bullets')],
    });

    expect(result.animEvents.filter((e) => e.popupType === 'again')).toHaveLength(0);
  });
});

describe('animEvents order: War Drums retrigger', () => {
  test('War Drums retriggers each die consecutively (1,1,2,2 not 1,2,1,2)', () => {
    // Five straight so all 5 dice score
    const dice = diceFromValues([1, 2, 3, 4, 5]);
    const warDrums = item('war_drums');

    const { result } = calculateTestScore({
      scoredDice: dice,
      equipment: [warDrums],
    });

    const dieIds = milesDieIds(result.animEvents);
    // Each die triggers twice consecutively
    expect(dieIds).toEqual([
      dice[0].id,
      dice[0].id,
      dice[1].id,
      dice[1].id,
      dice[2].id,
      dice[2].id,
      dice[3].id,
      dice[3].id,
      dice[4].id,
      dice[4].id,
    ]);
  });

  test('War Drums + red_bullet stacks (3 triggers for stickered die)', () => {
    // Pair so both dice score
    const dice = [die({ value: 4, sticker: 'red_bullet' }), die({ value: 4 })];
    const warDrums = item('war_drums');

    const { result } = calculateTestScore({
      scoredDice: dice,
      equipment: [warDrums],
    });

    const dieIds = milesDieIds(result.animEvents);
    // die0: 3 triggers (base + red_bullet + war_drums), die1: 2 triggers (base + war_drums)
    expect(dieIds).toEqual([dice[0].id, dice[0].id, dice[0].id, dice[1].id, dice[1].id]);
  });

  test('expired War Drums does not retrigger', () => {
    const dice = [die({ value: 5 }), die({ value: 5 })];
    const warDrums = itemWithState('war_drums', { daysRemaining: 0 });

    const { result } = calculateTestScore({
      scoredDice: dice,
      equipment: [warDrums],
    });

    const dieIds = milesDieIds(result.animEvents);
    // No retrigger — each die fires once
    expect(dieIds).toEqual([dice[0].id, dice[1].id]);
  });
});

describe('animEvents order: PIP_RETRIGGER (One-Eyed Jack)', () => {
  test('retriggers matching pip die consecutively', () => {
    // Two pair: [1,1,5,5] — all score, jack retriggers 1s
    const dice = [die({ value: 1 }), die({ value: 5 }), die({ value: 1 }), die({ value: 5 })];
    const jack = item('one_eyed_jack');

    const { result } = calculateTestScore({
      scoredDice: dice,
      equipment: [jack],
    });

    const dieIds = milesDieIds(result.animEvents);
    // die0 (value 1): 2 triggers, die1 (value 5): 1 trigger, die2 (value 1): 2 triggers, die3 (value 5): 1 trigger
    expect(dieIds[0]).toBe(dice[0].id);
    expect(dieIds[1]).toBe(dice[0].id); // retrigger
    expect(dieIds[2]).toBe(dice[1].id);
    expect(dieIds[3]).toBe(dice[2].id);
    expect(dieIds[4]).toBe(dice[2].id); // retrigger
    expect(dieIds[5]).toBe(dice[3].id);
  });
});

describe('animEvents order: equipment effects per-die', () => {
  test('equipment popup fires on same dieId as the triggering die', () => {
    // Three of a kind with odd dice + odd_fellow (PARITY_MILES: odd → +31 miles)
    const dice = [die({ value: 3 }), die({ value: 3 }), die({ value: 3 })];
    const oddFellow = item('odd_fellow');

    const { result } = calculateTestScore({
      scoredDice: dice,
      equipment: [oddFellow],
    });

    // Each die should have: miles(die value) + miles(equipment bonus)
    const eventsForDie0 = result.animEvents.filter((e) => e.dieId === dice[0].id);
    const eventsForDie1 = result.animEvents.filter((e) => e.dieId === dice[1].id);
    const eventsForDie2 = result.animEvents.filter((e) => e.dieId === dice[2].id);

    // Each odd die: base miles + equipment miles
    expect(eventsForDie0.length).toBe(2);
    expect(eventsForDie0[0].popupType).toBe('miles');
    expect(eventsForDie0[0].value).toBe(3);
    expect(eventsForDie0[1]).toEqual(
      expect.objectContaining({ popupType: 'miles', value: 31, target: expect.objectContaining({ kind: 'both' }) }),
    );

    expect(eventsForDie1.length).toBe(2);
    expect(eventsForDie2.length).toBe(2);

    // Verify sequential order: die0 events, then die1 events, then die2 events
    const allDieIds = result.animEvents.map((e) => e.dieId);
    const firstDie1Idx = allDieIds.indexOf(dice[1].id);
    const lastDie0Idx = allDieIds.lastIndexOf(dice[0].id);
    expect(firstDie1Idx).toBeGreaterThan(lastDie0Idx);
  });
});

describe('animEvents: ordering', () => {
  test('held die events come after scored die events', () => {
    // Steel die in hand triggers held-in-hand xmult
    const scoredDice = [die({ value: 6 })];
    const heldDice = [die({ value: 4, enhancement: 'steel' })];

    const { result } = calculateTestScore({
      scoredDice,
      heldDice,
    });

    // Per-die events target scored dice (dieId set), held events target held dice
    const scoredDieIds = new Set(scoredDice.map((d) => d.id));
    const lastScoredIdx = findLastAnimIndex(result.animEvents, (e) => !!e.dieId && scoredDieIds.has(e.dieId));
    const heldDieIds = new Set(heldDice.map((d) => d.id));
    const firstHeldIdx = result.animEvents.findIndex((e) => e.target.kind === 'die' && heldDieIds.has(e.target.dieId));

    if (firstHeldIdx !== -1) {
      expect(firstHeldIdx).toBeGreaterThan(lastScoredIdx);
    }
  });

  test('equipment-only events come after held events', () => {
    const scoredDice = [die({ value: 5 }), die({ value: 5 })];
    const heldDice = [die({ value: 4, enhancement: 'steel' })];
    // Horseshoe is RANDOM_MULT (equipment-only event)
    const { result } = calculateTestScore({
      scoredDice,
      heldDice,
      equipment: [item('horseshoe')],
    });

    const heldDieIds = new Set(heldDice.map((d) => d.id));
    const lastHeldIdx = findLastAnimIndex(
      result.animEvents,
      (e) => e.target.kind === 'die' && heldDieIds.has(e.target.dieId),
    );
    const firstEquipOnlyIdx = result.animEvents.findIndex((e) => e.target.kind === 'equip');

    if (lastHeldIdx !== -1 && firstEquipOnlyIdx !== -1) {
      expect(firstEquipOnlyIdx).toBeGreaterThan(lastHeldIdx);
    }
  });
});

describe('animEvents: enhance popup', () => {
  test('lucky_find emits enhance event when solo scoring on day 1', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const scoredDie = die({ value: 7 });
      const { result } = calculateTestScore({
        scoredDice: [scoredDie],
        equipment: [item('lucky_find')],
        currentDay: 1,
      });
      const enhanceEvt = result.animEvents.find((e) => e.popupType === 'enhance');
      expect(enhanceEvt).toEqual(
        expect.objectContaining({
          popupType: 'enhance',
          dieId: scoredDie.id,
          enhancement: 'bone',
        }),
      );
      expect(result.handResult.scoringDice[0].enhancement).toBe('bone');
    } finally {
      Math.random = original;
    }
  });

  test('golden_spike emits enhance event when gold proc hits', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const scoredDie = die({ value: 5 });
      const { result } = calculateTestScore({
        scoredDice: [scoredDie, die({ value: 5 })],
        equipment: [item('stacked_deck'), item('golden_spike')],
      });
      const enhanceEvt = result.animEvents.find((e) => e.popupType === 'enhance');
      expect(enhanceEvt).toEqual(
        expect.objectContaining({
          popupType: 'enhance',
          dieId: scoredDie.id,
          enhancement: 'gold',
        }),
      );
      // Enhancement is applied directly (pre-scoring pass), not via mutations
      expect(scoredDie.enhancement).toBe('gold');
    } finally {
      Math.random = original;
    }
  });

  test('golden_spike on stone die rolls a face when turned gold', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const stoneDie = die({ value: 0, enhancement: 'stone' });
      calculateTestScore({
        scoredDice: [stoneDie, die({ value: 5 })],
        equipment: [item('stacked_deck'), item('golden_spike')],
      });
      expect(stoneDie.enhancement).toBe('gold');
      expect(stoneDie.value).toBeGreaterThanOrEqual(1);
      expect(stoneDie.value).toBeLessThanOrEqual(12);
    } finally {
      Math.random = original;
    }
  });

  test('lucky_find enhances solo stone die on day 1', () => {
    const original = Math.random;
    Math.random = () => 0;
    try {
      const stoneDie = die({ value: 0, enhancement: 'stone' });
      const { result } = calculateTestScore({
        scoredDice: [stoneDie],
        equipment: [item('lucky_find')],
        currentDay: 1,
      });
      expect(result.handResult.scoringDice[0].enhancement).toBe('bone');
      expect(stoneDie.value).toBeGreaterThanOrEqual(1);
      expect(stoneDie.value).toBeLessThanOrEqual(12);
    } finally {
      Math.random = original;
    }
  });
});
