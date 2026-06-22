import { describe, test, expect, beforeEach } from 'bun:test';
import './setup';
import {
  resetDieIds,
  setupGame,
  setBoss,
  die,
  diceWithValue,
  item,
  equipWithModifiers,
  calculateTestScore,
} from './testHelpers';
import { resetPlayerState } from './testRunPlayer';
import {
  createFrontierConsumableDef,
  createSupplyConsumableDef,
  createTrailGuideConsumableDef,
  createConsumableInstance,
  getSupplyDefById,
  getFrontierDefById,
  getTrailGuideDefById,
  getRandomTrailGuideDef,
  getTrailGuideDefForHand,
  generateShopConsumables,
  executeConsumableEffect,
  useConsumableDirectly,
  finalizeConsumableEquipmentEvents,
  isSecondHelpingsCloneTarget,
  grantGhostMedicine,
  bumpAllSellValues,
} from '../ConsumablesSystem';
import {
  canBuyAndUseConsumableInShop,
  canUseConsumable,
  canUseConsumableInShop,
} from '../consumables/consumableUseContext';
import type { ConsumableUseMode } from '../../data/consumableTypes';
import { getRunState } from '../store/runStore';
import { getEquipmentPackExcludeIds } from '../BoosterPackSystem';
import { sceneActions } from '../store/sceneStore';
import { equipmentActions } from '../store/actions/equipmentActions';
import { selectRunStatusTraits } from '../runStatusTraits';
import { shouldPromptRoundModifications } from '../store/selectors/uiSelectors';
import { initRunRng } from '../RunRng';
import { isEquipmentCursed } from '../ItemsSystem';
import { shopBuyActions } from '../store/actions/shopBuyActions';
import { progressionActions } from '../store/actions/progressionActions';
import {
  applyDiceSelectionEffect,
  DiceSelectionConfig,
  getDiceSelectionMinPicks,
  insertDiceAfterInOrder,
  isDiceSelectionReady,
  orderSelectedDieIdsByRow,
  refreshLineupDiceFromRun,
  shouldUpdateDisplayedDiceValue,
  syncLineupAfterDiceEffect,
} from '../DiceSelectionSystem';
import { syncRolledDiceFromFaces } from '../store/roundWrites';
import { selectRolledDice } from '../store/selectors/roundSelectors';
import { applyCopyAfterSelection } from '../visibleDiceRow';
import { DiceEnhancement, HandType } from '../types';
import { getItemDisplayContext } from '../displayContext';
import supplyCardsData from '../../data/supply_cards';
import trailGuidesData from '../../data/trail_guides';
import { getHandByType } from '../../data/hands';
import { filterSpawnableTrailGuides } from '../trailGuideSpawn';
import frontierEncountersData from '../../data/frontier_encounters';

beforeEach(() => {
  resetDieIds();
});

// ─── ConsumableDef Creation ───

describe('ConsumableDef creation', () => {
  test('createSupplyConsumableDef creates a valid def from JSON', () => {
    const card = supplyCardsData.find((c) => c.id === 'coffee_tin')!;
    const def = createSupplyConsumableDef(card);
    expect(def.id).toBe('coffee_tin');
    expect(def.name).toBe('Coffee Tin');
    expect(def.category).toBe('supply');
    expect(def.diceSelection).toBeDefined();
    expect(def.diceSelection!.effectType).toBe('ENHANCE');
  });

  test('createSupplyConsumableDef with diceSelection', () => {
    const card = supplyCardsData.find((c) => c.id === 'shallow_grave')!;
    const def = createSupplyConsumableDef(card);
    expect(def.diceSelection).toBeDefined();
    expect(def.diceSelection!.drawCount).toBe(0);
    expect(def.diceSelection!.pickCount).toBe(2);
    expect(getDiceSelectionMinPicks(def.diceSelection!)).toBe(2);
  });

  test('enhance supply cards can apply to fewer than their max picks', () => {
    const card = supplyCardsData.find((c) => c.id === 'coffee_tin')!;
    const def = createSupplyConsumableDef(card);
    expect(def.diceSelection!.pickCount).toBe(2);
    expect(def.diceSelection!.minPickCount).toBe(1);
    expect(isDiceSelectionReady(def.diceSelection!, 1)).toBe(true);
    expect(isDiceSelectionReady(def.diceSelection!, 0)).toBe(false);
    expect(isDiceSelectionReady(def.diceSelection!, 2)).toBe(true);
  });

  test('createTrailGuideConsumableDef creates a valid def', () => {
    const tg = trailGuidesData[0];
    const def = createTrailGuideConsumableDef(tg);
    expect(def.category).toBe('trail_guide');
    expect(def.handType).toBe(tg.handType);
  });

  test('createConsumableInstance sets correct sellValue', () => {
    const card = supplyCardsData[0];
    const def = createSupplyConsumableDef(card);
    const inst = createConsumableInstance(def);
    expect(inst.sellValue).toBe(Math.max(1, Math.floor(def.cost / 2)));
  });

  test('getSupplyDefById returns null for unknown id', () => {
    expect(getSupplyDefById('nonexistent')).toBeNull();
  });

  test('getSupplyDefById returns valid def for known id', () => {
    const def = getSupplyDefById('treasure_map');
    expect(def).not.toBeNull();
    expect(def!.name).toBe('Treasure Map');
  });
});

// ─── PlayerState Consumable Management ───

describe('PlayerState consumable management', () => {
  test('starts with empty consumables', () => {
    const player = resetPlayerState();
    expect(player.consumables).toHaveLength(0);
    expect(player.usedConsumableSlots).toBe(0);
    expect(player.consumableSlotsFree).toBe(2);
  });

  test('addConsumable adds to inventory', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    const result = player.addConsumable(def);
    expect(result).toBe(true);
    expect(player.consumables).toHaveLength(1);
    expect(player.usedConsumableSlots).toBe(1);
  });

  test('addConsumable respects max slots', () => {
    const player = resetPlayerState();
    const def1 = getSupplyDefById('coffee_tin')!;
    const def2 = getSupplyDefById('treasure_map')!;
    const def3 = getSupplyDefById('buzzards')!;

    expect(player.addConsumable(def1)).toBe(true);
    expect(player.addConsumable(def2)).toBe(true);
    expect(player.addConsumable(def3)).toBe(false); // full
    expect(player.consumables).toHaveLength(2);
  });

  test('compass creates two distinct trail guides', () => {
    const compassDef = getSupplyDefById('compass')!;

    for (let seed = 0; seed < 100; seed++) {
      const player = resetPlayerState();
      player.maxConsumableSlots = 5;
      initRunRng(`compass-distinct-${seed}`);

      const result = executeConsumableEffect(createConsumableInstance(compassDef));
      expect(result.success).toBe(true);
      expect(result.consumablesCreated).toBe(2);

      const ids = player.consumables.map((c) => c.def.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  test('ghost aura consumable does not count against max slots', () => {
    const player = resetPlayerState();
    const def1 = getSupplyDefById('coffee_tin')!;
    const def2 = getSupplyDefById('treasure_map')!;

    player.addConsumable(def1);
    player.addConsumable(def2);

    // Ghost aura bypasses slot limit
    const ghostDef = getSupplyDefById('buzzards')!;
    (ghostDef as any).aura = {
      id: 'ghost',
      name: 'Ghost',
      description: 'test',
      costIncrease: 0,
      equipmentChance: 0,
    };
    expect(player.addConsumable(ghostDef)).toBe(true);
    expect(player.consumables).toHaveLength(3);
    expect(player.usedConsumableSlots).toBe(2); // ghost doesn't count
  });

  test('shop buy consumable allows ghost aura when non-ghost slots are full', () => {
    const { player } = setupGame({ money: 100 });
    const ghostAura = {
      id: 'ghost' as const,
      name: 'Ghost',
      description: 'test',
      costIncrease: 0,
      equipmentChance: 0,
    };
    player.maxConsumableSlots = 2;
    player.addConsumable(getSupplyDefById('coffee_tin')!);
    player.addConsumable(getSupplyDefById('treasure_map')!);
    expect(player.usedConsumableSlots).toBe(2);

    const ghostDef = getSupplyDefById('medicine', ghostAura)!;
    const result = shopBuyActions.buyConsumable(ghostDef, 3);
    expect(result).toEqual({ ok: true });
    expect(player.consumables).toHaveLength(3);
    expect(player.usedConsumableSlots).toBe(2);
  });

  test('sellConsumable earns money and removes card', () => {
    const player = resetPlayerState();
    player.economy.setBalance(0);
    const def = getSupplyDefById('coffee_tin')!;
    player.addConsumable(def);

    const sellValue = player.consumables[0].sellValue;
    expect(player.sellConsumable(0)).toBe(true);
    expect(player.consumables).toHaveLength(0);
    expect(player.economy.balance).toBe(sellValue);
  });

  test('sellConsumable returns false for invalid index', () => {
    const player = resetPlayerState();
    expect(player.sellConsumable(-1)).toBe(false);
    expect(player.sellConsumable(0)).toBe(false);
  });

  test('useConsumable removes and returns the instance', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('treasure_map')!;
    player.addConsumable(def);

    const balanceBefore = player.economy.balance;
    const consumed = player.useConsumable(0);
    expect(consumed).not.toBeNull();
    expect(consumed!.def.id).toBe('treasure_map');
    expect(player.consumables).toHaveLength(0);
    // Using does NOT earn money
    expect(player.economy.balance).toBe(balanceBefore);
  });

  test('useConsumable tracks lastUsedConsumable', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.addConsumable(def);
    player.useConsumable(0);
    expect(player.lastUsedConsumable).not.toBeNull();
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');
  });

  test('second_helpings duplicates last used consumable', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const coffeeDef = getSupplyDefById('coffee_tin')!;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;

    // Use a coffee tin first to set lastUsedConsumable
    player.addConsumable(coffeeDef);
    player.useConsumable(0);
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');

    // Now add and use second_helpings
    player.addConsumable(secondHelpingsDef);
    const secondHelpings = player.useConsumable(0)!;
    expect(secondHelpings.def.id).toBe('second_helpings');
    // second_helpings becomes most recent used card
    expect(player.lastUsedConsumable!.id).toBe('second_helpings');

    const result = executeConsumableEffect(secondHelpings);
    expect(result.success).toBe(true);
    expect(result.consumablesCreated).toBe(1);
    expect(player.consumables).toHaveLength(1);
    expect(player.consumables[0].def.id).toBe('coffee_tin');
  });

  test('second_helpings fails when no previous consumable used', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;
    player.addConsumable(secondHelpingsDef);
    const secondHelpings = player.useConsumable(0);
    expect(secondHelpings).toBeNull();
    expect(player.consumables).toHaveLength(1);
  });

  test('useConsumableDirectly sets lastUsedConsumable for normal cards', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const coffeeDef = getSupplyDefById('coffee_tin')!;
    useConsumableDirectly(coffeeDef);
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');
  });

  test('useConsumableDirectly does NOT overwrite lastUsedConsumable for second_helpings', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const coffeeDef = getSupplyDefById('coffee_tin')!;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;

    // Use coffee first
    useConsumableDirectly(coffeeDef);
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');

    // Use second_helpings — should clone coffee, then become most recent used card
    const result = useConsumableDirectly(secondHelpingsDef);
    expect(result.success).toBe(true);
    expect(result.consumablesCreated).toBe(1);
    expect(player.consumables[0].def.id).toBe('coffee_tin');
    expect(player.lastUsedConsumable!.id).toBe('second_helpings');
  });

  test('useConsumableDirectly second_helpings fails without prior use', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;
    const result = useConsumableDirectly(secondHelpingsDef);
    expect(result.success).toBe(false);
  });

  test('frontier encounters do not update lastUsedConsumable', () => {
    const player = resetPlayerState();
    const coffeeDef = getSupplyDefById('coffee_tin')!;
    const frontierDef = getFrontierDefById('blood_moon')!;

    player.addConsumable(coffeeDef);
    player.useConsumable(0);
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');

    player.addConsumable(frontierDef);
    player.useConsumable(0);
    expect(player.lastUsedConsumable!.id).toBe('coffee_tin');
    expect(isSecondHelpingsCloneTarget(frontierDef)).toBe(false);
  });

  test('second_helpings clones last supply/trail guide after frontier use', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const coffeeDef = getSupplyDefById('coffee_tin')!;
    const frontierDef = getFrontierDefById('blood_moon')!;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;

    player.addConsumable(coffeeDef);
    player.useConsumable(0);
    player.addConsumable(frontierDef);
    player.useConsumable(0);
    player.addConsumable(secondHelpingsDef);
    const secondHelpings = player.useConsumable(0)!;

    const result = executeConsumableEffect(secondHelpings);
    expect(result.success).toBe(true);
    expect(player.consumables[0].def.id).toBe('coffee_tin');
  });

  test('second_helpings clones trail guide after frontier use', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const tgDef = getTrailGuideDefById('tg_high_value')!;
    const frontierDef = getFrontierDefById('blood_moon')!;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;

    player.addConsumable(tgDef);
    player.useConsumable(0);
    expect(player.lastUsedConsumable!.id).toBe('tg_high_value');

    player.addConsumable(frontierDef);
    player.useConsumable(0);
    // Frontier must not replace the trail guide clone target
    expect(player.lastUsedConsumable!.id).toBe('tg_high_value');

    player.addConsumable(secondHelpingsDef);
    const secondHelpings = player.useConsumable(0)!;
    const result = executeConsumableEffect(secondHelpings);

    expect(result.success).toBe(true);
    expect(result.consumablesCreated).toBe(1);
    expect(player.consumables).toHaveLength(1);
    expect(player.consumables[0].def.id).toBe('tg_high_value');
    expect(player.consumables[0].def.category).toBe('trail_guide');
  });

  test('second_helpings fails when only frontier encounter was used', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const frontierDef = getFrontierDefById('blood_moon')!;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;

    player.addConsumable(frontierDef);
    player.useConsumable(0);
    expect(player.lastUsedConsumable).toBeNull();

    player.addConsumable(secondHelpingsDef);
    const secondHelpings = player.useConsumable(0);
    expect(secondHelpings).toBeNull();
    expect(player.consumables).toHaveLength(1);
  });

  test('cannot use second_helpings from pouch without valid target', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;
    player.addConsumable(secondHelpingsDef);

    const consumed = player.useConsumable(0);
    expect(consumed).toBeNull();
    expect(player.consumables).toHaveLength(1);
    expect(player.consumables[0].def.id).toBe('second_helpings');
    expect(player.lastUsedConsumable).toBeNull();
  });

  test('second_helpings cannot be used twice in a row', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const coffeeDef = getSupplyDefById('coffee_tin')!;
    const secondHelpingsDef = getSupplyDefById('second_helpings')!;

    useConsumableDirectly(coffeeDef);
    const first = useConsumableDirectly(secondHelpingsDef);
    expect(first.success).toBe(true);
    expect(player.lastUsedConsumable!.id).toBe('second_helpings');

    const second = useConsumableDirectly(secondHelpingsDef);
    expect(second.success).toBe(false);
  });

  test('trail guides update lastUsedConsumable for second_helpings', () => {
    const player = resetPlayerState();
    const tgDef = getTrailGuideDefById(trailGuidesData[0].id)!;
    player.addConsumable(tgDef);
    player.useConsumable(0);
    expect(player.lastUsedConsumable!.category).toBe('trail_guide');
    expect(isSecondHelpingsCloneTarget(player.lastUsedConsumable)).toBe(true);
  });

  test('useConsumable returns null for invalid index', () => {
    const player = resetPlayerState();
    expect(player.useConsumable(5)).toBeNull();
  });

  test('reorderConsumable swaps positions', () => {
    const player = resetPlayerState();
    player.maxConsumableSlots = 4;
    const def1 = getSupplyDefById('coffee_tin')!;
    const def2 = getSupplyDefById('treasure_map')!;
    const def3 = getSupplyDefById('buzzards')!;
    player.addConsumable(def1);
    player.addConsumable(def2);
    player.addConsumable(def3);

    player.reorderConsumable(0, 2);
    expect(player.consumables[0].def.id).toBe('treasure_map');
    expect(player.consumables[1].def.id).toBe('buzzards');
    expect(player.consumables[2].def.id).toBe('coffee_tin');
  });

  test('reorderConsumable ignores invalid indices', () => {
    const player = resetPlayerState();
    const def = getSupplyDefById('coffee_tin')!;
    player.addConsumable(def);
    player.reorderConsumable(-1, 0); // should not throw
    player.reorderConsumable(0, 5); // should not throw
    expect(player.consumables).toHaveLength(1);
  });
});

// ─── Profession Starting Consumables ───

describe('profession starting consumables', () => {
  test('cook starts with 2x second_helpings', () => {
    const { player } = setupGame({ profession: 'cook' });
    expect(player.consumables).toHaveLength(2);
    expect(player.consumables[0].def.id).toBe('second_helpings');
    expect(player.consumables[1].def.id).toBe('second_helpings');
  });

  test('doctor starts with 2x ghost medicine', () => {
    const { player } = setupGame({ profession: 'doctor' });
    expect(player.consumables).toHaveLength(2);
    expect(player.consumables.every((c) => c.def.id === 'medicine')).toBe(true);
    expect(player.consumables.every((c) => c.def.aura?.id === 'ghost')).toBe(true);
  });

  test('demon_hunter starts with priests_blessing frontier encounter', () => {
    const { player } = setupGame({ profession: 'demon_hunter' });
    expect(player.consumables).toHaveLength(1);
    expect(player.consumables[0].def.id).toBe('priests_blessing');
    expect(player.consumables[0].def.category).toBe('frontier');
  });

  test('grantGhostMedicine adds one ghost medicine consumable', () => {
    const { player } = setupGame({ profession: 'farmer' });
    expect(grantGhostMedicine()).toBe(true);
    expect(player.consumables).toHaveLength(1);
    expect(player.consumables[0].def.id).toBe('medicine');
    expect(player.consumables[0].def.aura?.id).toBe('ghost');
  });

  test('scout has -1 consumable slot', () => {
    const { player } = setupGame({ profession: 'scout' });
    expect(player.maxConsumableSlots).toBe(1);
  });
});

// ─── Profession Starting Dice ───

describe('profession starting dice', () => {
  test(`farmer starts with 5 profession dice and standard dice to ${GAMEPLAY.STARTING_DICE} total`, () => {
    const { player } = setupGame({ profession: 'farmer' });
    expect(player.dice).toHaveLength(GAMEPLAY.STARTING_DICE);
    expect(player.startingDiceCount).toBe(GAMEPLAY.STARTING_DICE);
    expect(player.dice.filter((d) => d.enhancement === 'wooden')).toHaveLength(3);
    expect(player.dice.filter((d) => d.enhancement === 'steel')).toHaveLength(2);
    expect(player.dice.filter((d) => d.enhancement === null)).toHaveLength(GAMEPLAY.STARTING_DICE - 5);
  });

  test('banker starts with gold and diamond dice plus standard fill', () => {
    const { player } = setupGame({ profession: 'banker' });
    expect(player.dice).toHaveLength(GAMEPLAY.STARTING_DICE);
    expect(player.dice.filter((d) => d.enhancement === 'gold')).toHaveLength(3);
    expect(player.dice.filter((d) => d.enhancement === 'diamond')).toHaveLength(2);
    expect(player.dice.filter((d) => d.enhancement === null)).toHaveLength(GAMEPLAY.STARTING_DICE - 5);
  });

  test('developer starts with one of each enhancement type plus standard fill', () => {
    const { player } = setupGame({ profession: 'developer' });
    expect(player.dice).toHaveLength(GAMEPLAY.STARTING_DICE);
    expect(player.startingDiceCount).toBe(GAMEPLAY.STARTING_DICE);
    const enhanced = player.dice.filter((d) => d.enhancement !== null);
    expect(enhanced).toHaveLength(8);
    const types = enhanced.map((d) => d.enhancement).sort();
    expect(types).toEqual(
      (['bone', 'diamond', 'gold', 'loaded', 'lucky', 'steel', 'stone', 'wooden'] as DiceEnhancement[]).sort(),
    );
    expect(player.dice.filter((d) => d.enhancement === null)).toHaveLength(GAMEPLAY.STARTING_DICE - 8);
  });

  test('setup without profession gets plain fallback pouch', () => {
    const { player } = setupGame();
    expect(player.dice).toHaveLength(GAMEPLAY.STARTING_DICE);
    expect(player.dice.every((d) => d.enhancement === null)).toBe(true);
    expect(player.startingDiceCount).toBe(GAMEPLAY.STARTING_DICE);
  });
});

// ─── Mirage (CLONE) ───

describe('Mirage CLONE effect', () => {
  test('orderSelectedDieIdsByRow sorts picks by visible row left to right', () => {
    const row = ['die-a', 'die-b', 'die-c'];
    expect(orderSelectedDieIdsByRow(['die-c', 'die-a'], row)).toEqual(['die-a', 'die-c']);
  });

  test('left die copies enhancement, sticker, aura from right die', () => {
    const player = resetPlayerState();
    const leftDie = die({ enhancement: 'wooden', aura: null, sticker: null, value: 3 });
    const rightDie = die({ enhancement: 'gold', aura: 'holy', sticker: 'red_bullet', value: 10 });
    player.dice = [leftDie, rightDie];

    const config: DiceSelectionConfig = {
      drawCount: 2,
      pickCount: 2,
      effectType: 'CLONE',
      effectParams: {},
      cardName: 'Mirage',
      description: '',
      skippable: false,
    };

    applyDiceSelectionEffect(config, [leftDie, rightDie]);

    const updated = player.dice.find((d) => d.id === leftDie.id)!;
    expect(updated.enhancement).toBe('gold');
    expect(updated.aura).toBe('holy');
    expect(updated.sticker).toBe('red_bullet');
  });

  test('left die keeps its own value (not copied from right)', () => {
    const player = resetPlayerState();
    const leftDie = die({ enhancement: 'wooden', value: 3 });
    const rightDie = die({ enhancement: 'gold', value: 10 });
    player.dice = [leftDie, rightDie];

    const config: DiceSelectionConfig = {
      drawCount: 2,
      pickCount: 2,
      effectType: 'CLONE',
      effectParams: {},
      cardName: 'Mirage',
      description: '',
      skippable: false,
    };

    applyDiceSelectionEffect(config, [leftDie, rightDie]);

    const updated = player.dice.find((d) => d.id === leftDie.id)!;
    expect(updated.value).toBe(3); // value should NOT change
    expect(updated.enhancement).toBe('gold');
  });

  test('right die is unchanged after clone', () => {
    const player = resetPlayerState();
    const leftDie = die({ enhancement: 'wooden', aura: 'fire' });
    const rightDie = die({ enhancement: 'gold', aura: 'holy' });
    player.dice = [leftDie, rightDie];

    const config: DiceSelectionConfig = {
      drawCount: 2,
      pickCount: 2,
      effectType: 'CLONE',
      effectParams: {},
      cardName: 'Mirage',
      description: '',
      skippable: false,
    };

    applyDiceSelectionEffect(config, [leftDie, rightDie]);

    const right = player.dice.find((d) => d.id === rightDie.id)!;
    expect(right.enhancement).toBe('gold');
    expect(right.aura).toBe('holy');
  });
});

describe('pre-roll consumable targeting regression', () => {
  test('loaded can enhance a drawn hand die before first roll', () => {
    const { game, player } = setupGame({
      dice: [
        die({ value: 2 }),
        die({ value: 4 }),
        die({ value: 6 }),
        die({ value: 8 }),
        die({ value: 10 }),
        die({ value: 12 }),
      ],
      handSize: 5,
    });
    game.startRound();

    const loadedDef = getSupplyDefById('loaded');
    expect(loadedDef).not.toBeNull();

    expect(loadedDef!.diceSelection).toBeDefined();

    const target = game.state.hand[0];
    const applyMessage = applyDiceSelectionEffect(loadedDef!.diceSelection!, [target]);

    expect(applyMessage.message).toContain('Enhanced 1 dice');
    const updated = player.dice.find((d) => d.id === target.id);
    expect(updated?.enhancement).toBe('loaded');
  });

  test('two-die enhance cards apply to only the dice selected', () => {
    const player = resetPlayerState();
    const d1 = die({ enhancement: null });
    const d2 = die({ enhancement: null });
    player.dice = [d1, d2];

    const buzzards = supplyCardsData.find((c) => c.id === 'buzzards')!;
    const config = createSupplyConsumableDef(buzzards).diceSelection!;

    const msg = applyDiceSelectionEffect(config, [d1]);
    expect(msg.message).toBe('Enhanced 1 dice to bone');
    expect(player.dice.find((d) => d.id === d1.id)?.enhancement).toBe('bone');
    expect(player.dice.find((d) => d.id === d2.id)?.enhancement).toBeNull();
  });

  test('seeing_double inserts copies immediately after the source die', () => {
    const player = resetPlayerState();
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2, enhancement: 'lucky' });
    const d3 = die({ value: 3 });
    player.dice = [d1, d2, d3];

    const seeingDouble = frontierEncountersData.find((encounter) => encounter.id === 'seeing_double')!;
    const config = createFrontierConsumableDef(seeingDouble).diceSelection!;

    const result = applyDiceSelectionEffect(config, [d2]);
    expect(result.message).toBe('Created 2 copies');
    expect(result.addedDice).toHaveLength(2);

    const ids = player.dice.map((d) => d.id);
    expect(ids).toEqual([d1.id, d2.id, result.addedDice![0]!.id, result.addedDice![1]!.id, d3.id]);
    expect(player.dice[2]?.enhancement).toBe('lucky');
    expect(player.dice[3]?.enhancement).toBe('lucky');
  });

  test('insertDiceAfterInOrder respects visible row order after reordering', () => {
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2 });
    const d3 = die({ value: 3 });
    const d4 = die({ value: 4 });
    const reordered = [d1, d4, d2, d3];
    const copy1 = die({ value: 4 });
    const copy2 = die({ value: 4 });

    const next = insertDiceAfterInOrder(reordered, d4.id, [copy1, copy2]);
    expect(next.map((d) => d.id)).toEqual([d1.id, d4.id, copy1.id, copy2.id, d2.id, d3.id]);
  });

  test('seeing_double copies keep the selected face value in the collection', () => {
    const player = resetPlayerState();
    const source = die({ value: 3 });
    player.dice = [source];

    const seeingDouble = frontierEncountersData.find((encounter) => encounter.id === 'seeing_double')!;
    const config = createFrontierConsumableDef(seeingDouble).diceSelection!;
    applyDiceSelectionEffect(config, [{ ...source, value: 9 }]);

    expect(player.dice[1]?.value).toBe(9);
    expect(player.dice[2]?.value).toBe(9);
  });

  test('seeing_double inserts copies into rolled row state beside the source die', () => {
    const player = resetPlayerState();
    const dice = Array.from({ length: 5 }, (_, i) => die({ value: i + 1 }));
    player.dice = dice;

    const { game } = setupGame({ dice });
    game.startRound();
    game.selectForRoll(dice.map((d) => d.id));

    const reordered = [dice[0]!, dice[4]!, dice[1]!, dice[2]!, dice[3]!];
    syncRolledDiceFromFaces(reordered);

    const seeingDouble = frontierEncountersData.find((encounter) => encounter.id === 'seeing_double')!;
    const config = createFrontierConsumableDef(seeingDouble).diceSelection!;
    const target = { ...reordered[1]!, value: 12 };
    const result = applyDiceSelectionEffect(config, [target]);
    applyCopyAfterSelection(result, target);

    const rolledIds = selectRolledDice().map((d) => d.id);
    expect(rolledIds).toHaveLength(7);
    expect(rolledIds[0]).toBe(dice[0]!.id);
    expect(rolledIds[1]).toBe(dice[4]!.id);
    expect(rolledIds[2]).toBe(result.addedDice![0]!.id);
    expect(rolledIds[3]).toBe(result.addedDice![1]!.id);
    expect(rolledIds[4]).toBe(dice[1]!.id);
    expect(selectRolledDice()[2]?.value).toBe(12);
  });

  test('refreshLineupDiceFromRun updates lineup dice without pulling in pouch dice', () => {
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2, aura: 'fire' });
    const d3 = die({ value: 3 });
    const pouchOnly = die({ value: 12 });

    const lineup = [d1, d2, d3];
    const runDice = [d1, d2, d3, pouchOnly, die({ value: 5 }), die({ value: 6 })];
    const refreshed = refreshLineupDiceFromRun(lineup, runDice);

    expect(refreshed.map((d) => d.id)).toEqual([d1.id, d2.id, d3.id]);
    expect(refreshed[1]?.aura).toBe('fire');
  });

  test('syncLineupAfterDiceEffect inserts explicit copies beside their source die', () => {
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2 });
    const copy1 = die({ value: 2 });
    const copy2 = die({ value: 2 });
    const d3 = die({ value: 3 });
    const pouchOnly = die({ value: 12 });

    const lineup = [d1, d2, d3];
    const runDice = [d1, d2, copy1, copy2, d3, pouchOnly];
    const merged = syncLineupAfterDiceEffect(lineup, runDice, {
      addedDice: [copy1, copy2],
      insertAfterDieId: d2.id,
    });

    expect(merged.map((d) => d.id)).toEqual([d1.id, d2.id, copy1.id, copy2.id, d3.id]);
  });

  test('enhancing stone dice assigns a random face value', () => {
    const player = resetPlayerState();
    const stoneDie = die({ enhancement: 'stone', value: 0 });
    player.dice = [stoneDie];

    const config: DiceSelectionConfig = {
      drawCount: 1,
      pickCount: 1,
      effectType: 'ENHANCE',
      effectParams: { enhancement: 'loaded' },
      cardName: 'Loaded',
      description: 'test',
      skippable: false,
    };

    applyDiceSelectionEffect(config, [stoneDie]);

    expect(stoneDie.enhancement).toBe('loaded');
    expect(stoneDie.value).toBeGreaterThanOrEqual(1);
    expect(stoneDie.value).toBeLessThanOrEqual(12);
  });
});

// ─── Bless Aura Weighting ───

import itemAuras from '../../data/item_auras';
import { GAMEPLAY } from '../Constants';

describe('Bless supply card aura weighting', () => {
  test('bless applies weighted aura distribution matching item_auras data', () => {
    const blessableIds = ['fire', 'arcane', 'holy'] as const;
    const blessableAuras = blessableIds.map((id) => itemAuras.find((a) => a.id === id)!);
    const totalWeight = blessableAuras.reduce((sum, a) => sum + a.equipmentChance, 0);
    const expectedRates = Object.fromEntries(blessableAuras.map((a) => [a.id, a.equipmentChance / totalWeight]));

    const counts: Record<string, number> = { fire: 0, arcane: 0, holy: 0 };
    const runs = 10000;

    for (let i = 0; i < runs; i++) {
      const { player } = setupGame({
        equipment: [item('horseshoe'), item('loaded_dice'), item('loaded_dice')],
        money: 10,
      });

      const blessDef = getSupplyDefById('bless');
      if (!blessDef) throw new Error('bless not found');
      const consumed = createConsumableInstance(blessDef);
      executeConsumableEffect(consumed);

      const aura = player.equipment[0].def.aura;
      if (aura) {
        counts[aura.id]++;
      }
    }

    const total = counts.fire + counts.arcane + counts.holy;
    const tolerance = 0.07; // ±7% tolerance for RNG

    for (const id of blessableIds) {
      const actualRate = counts[id] / total;
      expect(actualRate).toBeGreaterThan(expectedRates[id] - tolerance);
      expect(actualRate).toBeLessThan(expectedRates[id] + tolerance);
    }

    // Verify ordering matches weight ordering (highest weight = most common)
    const sorted = [...blessableAuras].sort((a, b) => b.equipmentChance - a.equipmentChance);
    for (let i = 0; i < sorted.length - 1; i++) {
      expect(counts[sorted[i].id]).toBeGreaterThan(counts[sorted[i + 1].id]);
    }
  });
});

describe('frontier cards and cursed equipment', () => {
  test("priest's blessing keeps cursed equipment when destroying others", () => {
    const player = resetPlayerState();
    player.equipment.push(equipWithModifiers('horseshoe', []));
    player.equipment.push(equipWithModifiers('war_drums', ['cursed']));

    const def = getFrontierDefById('priests_blessing')!;
    const original = Math.random;
    Math.random = () => 0; // bless horseshoe (index 0), not the cursed war_drums
    try {
      const result = useConsumableDirectly(def);
      finalizeConsumableEquipmentEvents(result.consumableAnimEvents);

      expect(result.success).toBe(true);
      expect(player.equipment).toHaveLength(2);
      expect(player.equipment.some((e) => isEquipmentCursed(e))).toBe(true);
      expect(player.equipment.some((e) => e.def.aura?.id === 'holy')).toBe(true);
    } finally {
      Math.random = original;
    }
  });

  test("priest's blessing destroys non-cursed others with deferred equipment removal", () => {
    const player = resetPlayerState();
    player.equipment.push(equipWithModifiers('horseshoe', []));
    player.equipment.push(equipWithModifiers('war_drums', []));

    const def = getFrontierDefById('priests_blessing')!;
    const original = Math.random;
    Math.random = () => 0;
    try {
      const result = useConsumableDirectly(def);
      finalizeConsumableEquipmentEvents(result.consumableAnimEvents);

      expect(result.success).toBe(true);
      expect(result.consumableAnimEvents?.[0]?.type).toBe('destroy_equipment');
      expect(player.equipment).toHaveLength(1);
      expect(player.equipment[0].def.id).toBe('horseshoe');
      expect(player.equipment[0].def.aura?.id).toBe('holy');
    } finally {
      Math.random = original;
    }
  });

  test('skin walker copies random item and keeps cursed equipment', () => {
    const player = resetPlayerState();
    player.equipment.push(equipWithModifiers('horseshoe', []));
    player.equipment.push(equipWithModifiers('war_drums', ['cursed']));

    const def = getFrontierDefById('skin_walker')!;
    const result = useConsumableDirectly(def);
    finalizeConsumableEquipmentEvents(result.consumableAnimEvents);

    expect(result.success).toBe(true);
    expect(player.equipment.some((e) => isEquipmentCursed(e))).toBe(true);
    // Non-cursed horseshoe destroyed; cursed lucky_coin + copy remain
    expect(player.equipment.length).toBeGreaterThanOrEqual(2);
  });

  test('skin walker copy retains curse when source is cursed', () => {
    const player = resetPlayerState();
    player.equipment.push(equipWithModifiers('horseshoe', ['cursed']));

    const def = getFrontierDefById('skin_walker')!;
    const result = useConsumableDirectly(def);
    finalizeConsumableEquipmentEvents(result.consumableAnimEvents);

    expect(player.equipment.length).toBe(2);
    expect(player.equipment.every((e) => isEquipmentCursed(e))).toBe(true);
  });

  test('skin walker keeps chosen item and adds a copy when other items are destroyed', () => {
    const player = resetPlayerState();
    player.maxEquipmentSlots = 2;
    player.equipment.push(equipWithModifiers('horseshoe', []));
    player.equipment.push(equipWithModifiers('war_drums', []));

    const def = getFrontierDefById('skin_walker')!;
    const original = Math.random;
    Math.random = () => 0; // choose horseshoe (index 0)
    try {
      const result = useConsumableDirectly(def);
      finalizeConsumableEquipmentEvents(result.consumableAnimEvents);

      expect(result.success).toBe(true);
      expect(result.consumableAnimEvents?.[0]?.type).toBe('destroy_equipment');
      expect(player.equipment).toHaveLength(2);
      expect(player.equipment.every((e) => e.def.id === 'horseshoe')).toBe(true);
    } finally {
      Math.random = original;
    }
  });
});

describe('frontier encounter wiring and raid rules', () => {
  test('raid fails when no dice are visible', () => {
    const player = resetPlayerState();
    player.dice = [die({ value: 2 }), die({ value: 4 }), die({ value: 6 })];
    player.economy.setBalance(0);
    const def = getFrontierDefById('raid')!;

    const result = executeConsumableEffect(createConsumableInstance(def));

    expect(result.success).toBe(false);
    expect(result.failReason).toContain('visible');
    expect(player.dice).toHaveLength(3);
    expect(player.economy.balance).toBe(0);
  });

  test('raid destroys 5 random dice from the visible pool only and grants $20', () => {
    const player = resetPlayerState();
    player.economy.setBalance(0);
    const visible = [
      die({ value: 1 }),
      die({ value: 2, enhancement: 'loaded' }),
      die({ value: 3 }),
      die({ value: 4 }),
      die({ value: 5, enhancement: 'gold' }),
      die({ value: 6 }),
      die({ value: 7 }),
      die({ value: 8 }),
    ];
    const hidden = [die({ value: 9 }), die({ value: 10 })];
    player.dice = [...visible, ...hidden];
    player.equipment = [item('book_of_the_dead')];

    const def = getFrontierDefById('raid')!;
    const result = executeConsumableEffect(createConsumableInstance(def), {
      visibleDiceIds: visible.map((d) => d.id),
    });

    const remainingIds = new Set(player.dice.map((d) => d.id));
    const removedVisibleCount = visible.filter((d) => !remainingIds.has(d.id)).length;
    const removedEnhancedCount = visible.filter((d) => !remainingIds.has(d.id) && d.enhancement !== null).length;
    const removedHiddenCount = hidden.filter((d) => !remainingIds.has(d.id)).length;
    const bookOfTheDead = player.equipment.find((e) => e.def.id === 'book_of_the_dead');

    expect(result.success).toBe(true);
    expect(result.consumableAnimEvents).toBeDefined();
    expect(result.consumableAnimEvents?.[0]?.type).toBe('destroy_dice');
    const destroyEvent = result.consumableAnimEvents?.[0];
    if (destroyEvent?.type === 'destroy_dice') {
      expect(destroyEvent.diceIds.length).toBe(5);
    }
    expect(removedVisibleCount).toBe(5);
    expect(removedHiddenCount).toBe(0);
    expect(player.economy.balance).toBe(20);
    expect(bookOfTheDead?.state.xMult).toBe(1 + removedEnhancedCount);
  });

  test('blood moon fails with no equipment', () => {
    resetPlayerState();
    const def = getFrontierDefById('blood_moon')!;

    const result = executeConsumableEffect(createConsumableInstance(def));

    expect(result.success).toBe(false);
    expect(result.failReason).toBe('No equipment!');
  });

  test('blood moon applies ghost aura and hand size penalty', () => {
    const player = resetPlayerState();
    player.equipment = [item('horseshoe'), item('war_drums')];
    player.trailEventModifiers.handSizePenalty = 0;
    const def = getFrontierDefById('blood_moon')!;
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const result = executeConsumableEffect(createConsumableInstance(def));
      expect(result.success).toBe(true);
      expect(player.equipment[0].def.aura?.id).toBe('ghost');
      expect(player.trailEventModifiers.handSizePenalty).toBe(1);
    } finally {
      Math.random = originalRandom;
    }
  });

  test('blood moon hand size penalty applies on next round start', () => {
    const { game, player } = setupGame({ equipment: [item('horseshoe')], dice: diceWithValue(6, 20) });
    player.trailEventModifiers.handSizePenalty = 1;
    const baseRollSize = game.config.rollSize;
    game.startRound();
    expect(game.config.rollSize).toBe(baseRollSize - 1);
    expect(player.trailEventModifiers.handSizePenalty).toBe(0);
  });

  test('spiritual journey upgrades all hands via consumable execution path', () => {
    const player = resetPlayerState();
    const beforeLevels = new Map(
      Object.values(HandType).map((handType) => [handType, player.getHandStats(handType).level]),
    );
    const def = getFrontierDefById('spiritual_journey')!;

    const result = executeConsumableEffect(createConsumableInstance(def));

    expect(result.success).toBe(true);
    expect(result.handUpgrades?.length).toBe(Object.values(HandType).length);
    for (const handType of Object.values(HandType)) {
      expect(player.getHandStats(handType).level).toBe((beforeLevels.get(handType) ?? 0) + 1);
    }
  });

  test('all frontier cards are wired to diceSelection, instantEffect, or explicit handlers', () => {
    const explicitHandlers = new Set([
      'priests_blessing',
      'skin_walker',
      'blood_moon',
      'raid',
      'all_in',
      'echo_of_the_damned',
    ]);
    const supportedInstantEffects = new Set([
      'CREATE_DICE',
      'DOUBLE_MONEY',
      'TRADE_EQUIPMENT',
      'CREATE_EQUIPMENT',
      'UPGRADE_ALL_HANDS',
    ]);

    for (const encounter of frontierEncountersData) {
      const hasDiceSelection = 'diceSelection' in encounter && Boolean(encounter.diceSelection);
      const hasInstantEffect = 'instantEffect' in encounter && Boolean(encounter.instantEffect);
      const isExplicit = explicitHandlers.has(encounter.id);
      expect(hasDiceSelection || hasInstantEffect || isExplicit).toBe(true);

      if (hasInstantEffect) {
        const instantType = (encounter.instantEffect as { type?: string }).type;
        expect(supportedInstantEffects.has(instantType ?? '')).toBe(true);
      }
    }
  });
});

describe('supply/frontier execution parity for shared effect engines', () => {
  test('both supply and frontier diceSelection cards expose targeting configs on the def', () => {
    const player = resetPlayerState();
    player.dice = [die({ value: 2 }), die({ value: 4 }), die({ value: 6 }), die({ value: 8 }), die({ value: 10 })];
    const supplyDef = getSupplyDefById('shallow_grave')!;
    const frontierDef = getFrontierDefById('gold_rush')!;

    expect(supplyDef.diceSelection).toBeDefined();
    expect(frontierDef.diceSelection).toBeDefined();
    expect(player.dice).toHaveLength(5);
  });

  test('supply instant effects resolve through core consumable execution', () => {
    const player = resetPlayerState();
    player.economy.setBalance(10);
    const supplyDef = getSupplyDefById('treasure_map')!;

    const supplyResult = executeConsumableEffect(createConsumableInstance(supplyDef));

    expect(supplyResult.success).toBe(true);
    expect(player.economy.balance).toBe(20);
  });

  test('frontier instant effects resolve through core consumable execution', () => {
    const player = resetPlayerState();
    player.economy.setBalance(10);
    const frontierDef = getFrontierDefById('magic_beans')!;

    const frontierResult = executeConsumableEffect(createConsumableInstance(frontierDef));

    expect(frontierResult.success).toBe(true);
    expect(player.economy.balance).toBe(0);
  });

  test('magic_beans avoids owned rare equipment without counterfeit_goods', () => {
    initRunRng('magic-beans-no-dupes');
    const player = resetPlayerState();
    player.equipment = [item('ace_in_the_hole')];

    for (let i = 0; i < 50; i++) {
      player.equipment = [item('ace_in_the_hole')];
      const frontierDef = getFrontierDefById('magic_beans')!;
      executeConsumableEffect(createConsumableInstance(frontierDef));

      const created = player.equipment.slice(1);
      expect(created.length).toBe(1);
      expect(created[0]!.def.id).not.toBe('ace_in_the_hole');
      expect(created[0]!.def.rarity).toBe('rare');
    }
  });

  test('magic_beans respects counterfeit_goods duplicate allowance', () => {
    const player = resetPlayerState();
    player.equipment = [item('ace_in_the_hole'), item('counterfeit_goods')];
    expect(getEquipmentPackExcludeIds(getRunState())).toBeUndefined();
  });

  test('ingenuity avoids visible shop equipment without counterfeit_goods', () => {
    initRunRng('ingenuity-shop-visible');
    const player = resetPlayerState();
    player.maxEquipmentSlots = 5;
    sceneActions.enterShop({
      stock: [
        {
          type: 'equipment',
          defId: 'fresh_trail',
          sold: false,
          preview: { defId: 'fresh_trail', sellValue: 5, state: {}, modifiers: [] },
        },
      ],
      packs: [],
      shopRerollCount: 0,
    });

    for (let i = 0; i < 500; i++) {
      equipmentActions.setEquipment([]);
      useConsumableDirectly(getSupplyDefById('ingenuity')!);
      const created = player.equipment[player.equipment.length - 1];
      expect(created).toBeDefined();
      expect(created!.def.id).not.toBe('fresh_trail');
    }
  });
});

const EXPECTED_USE_MODES: Record<string, ConsumableUseMode> = {
  coffee_tin: 'visible_dice',
  buzzards: 'visible_dice',
  rabbits_foot: 'visible_dice',
  firewood: 'visible_dice',
  loaded: 'visible_dice',
  pick_axe: 'visible_dice',
  pan_for_gold: 'visible_dice',
  chisel: 'visible_dice',
  shallow_grave: 'visible_dice',
  mirage: 'visible_dice',
  medicine: 'scored_dice',
  treasure_map: 'any_time',
  trade: 'any_time',
  doctor: 'any_time',
  compass: 'any_time',
  supply_cache: 'any_time',
  ingenuity: 'any_time',
  bless: 'any_time',
  second_helpings: 'any_time',
  omen_stone: 'any_time',
  shop_pass: 'any_time',
  fools_gold: 'any_time',
  trading_post: 'any_time',
  gold_rush: 'visible_dice',
  snake_oil_salesman: 'visible_dice',
  spirit_guide: 'visible_dice',
  deputize: 'visible_dice',
  swamp_fever: 'visible_dice',
  spirit_shaman: 'visible_dice',
  raid: 'visible_dice',
  seeing_double: 'visible_dice',
  blood_moon: 'any_time',
  skin_walker: 'any_time',
  priests_blessing: 'any_time',
  magic_beans: 'any_time',
  pandoras_box: 'any_time',
  spiritual_journey: 'any_time',
  all_in: 'any_time',
  echo_of_the_damned: 'any_time',
};

for (const tg of trailGuidesData) {
  EXPECTED_USE_MODES[tg.id] = 'any_time';
}

const shopContext = { scene: 'shop' as const, source: 'bar' as const };
const gameRollContext = (visibleDieIds: string[], scoreableDieIds: string[], isScoreActionVisible: boolean) => ({
  scene: 'game' as const,
  source: 'bar' as const,
  phase: 'ROLL' as const,
  visibleDieIds,
  scoreableDieIds,
  isScoreActionVisible,
});
const gameSelectContext = (visibleDieIds: string[]) => ({
  scene: 'game' as const,
  source: 'bar' as const,
  phase: 'SELECT' as const,
  visibleDieIds,
  scoreableDieIds: [] as string[],
  isScoreActionVisible: false,
});
const packContext = (visibleDieIds: string[]) => ({
  scene: 'booster_pack' as const,
  source: 'pack_card' as const,
  visibleDieIds,
});

describe('consumable use mode manifest', () => {
  test('every consumable has exactly one use mode matching GAME_CONSUMABLES_OVERVIEW', () => {
    const allDefs = [
      ...supplyCardsData.map((card) => createSupplyConsumableDef(card)),
      ...trailGuidesData.map((tg) => createTrailGuideConsumableDef(tg)),
      ...frontierEncountersData.map((fe) => createFrontierConsumableDef(fe)),
    ];
    expect(allDefs).toHaveLength(52);
    for (const def of allDefs) {
      expect(def.useMode).toBeDefined();
      expect(EXPECTED_USE_MODES[def.id]).toBe(def.useMode);
    }
    expect(Object.keys(EXPECTED_USE_MODES)).toHaveLength(52);
  });

  test('shallow_grave and mirage metadata fixes', () => {
    const shallowGrave = supplyCardsData.find((c) => c.id === 'shallow_grave')!;
    const mirage = supplyCardsData.find((c) => c.id === 'mirage')!;
    expect(shallowGrave.description).toBe('Choose 2 dice to destroy');
    expect(shallowGrave.diceSelection!.drawCount).toBe(0);
    expect(mirage.description).toBe('Pick 2 dice - left becomes a copy of right');
    expect(mirage.diceSelection!.drawCount).toBe(0);
  });
});

describe('shop consumable use gating', () => {
  test('shop blocks visible_dice and scored_dice cards', () => {
    const visibleDiceIds = [
      'loaded',
      'shallow_grave',
      'mirage',
      'gold_rush',
      'spirit_shaman',
      'raid',
      'seeing_double',
    ] as const;
    for (const id of visibleDiceIds) {
      const def =
        id === 'loaded' || id === 'shallow_grave' || id === 'mirage' ? getSupplyDefById(id)! : getFrontierDefById(id)!;
      expect(canUseConsumableInShop(def)).toBe(false);
      expect(canUseConsumable(def, shopContext).allowed).toBe(false);
    }
    expect(canUseConsumableInShop(getSupplyDefById('medicine')!)).toBe(false);
  });

  test('shop allows any_time cards', () => {
    expect(canUseConsumableInShop(getSupplyDefById('treasure_map')!)).toBe(true);
    expect(canUseConsumableInShop(getFrontierDefById('skin_walker')!)).toBe(true);
    expect(canUseConsumableInShop(getTrailGuideDefById('tg_pair')!)).toBe(true);
  });

  test('shop buy-and-use eligibility is use-mode driven for any_time cards', () => {
    expect(canBuyAndUseConsumableInShop(getSupplyDefById('doctor')!)).toBe(true);
    expect(canBuyAndUseConsumableInShop(getSupplyDefById('trading_post')!)).toBe(true);
    expect(canBuyAndUseConsumableInShop(getSupplyDefById('treasure_map')!)).toBe(true);
    expect(canBuyAndUseConsumableInShop(getFrontierDefById('all_in')!)).toBe(true);
    expect(canBuyAndUseConsumableInShop(getFrontierDefById('echo_of_the_damned')!)).toBe(true);
    expect(canBuyAndUseConsumableInShop(getFrontierDefById('magic_beans')!)).toBe(true);
    expect(canBuyAndUseConsumableInShop(getFrontierDefById('blood_moon')!)).toBe(true);
    expect(canBuyAndUseConsumableInShop(getFrontierDefById('skin_walker')!)).toBe(true);
    expect(canBuyAndUseConsumableInShop(getFrontierDefById('priests_blessing')!)).toBe(true);
    expect(canBuyAndUseConsumableInShop(getTrailGuideDefById('tg_pair')!)).toBe(true);
  });

  test('shop buy-and-use requires shopBuyAndUse flag', () => {
    const treasureMap = getSupplyDefById('treasure_map')!;
    expect(treasureMap.shopBuyAndUse).toBe(true);
    expect(canBuyAndUseConsumableInShop(treasureMap)).toBe(true);

    const withoutFlag = { ...treasureMap, shopBuyAndUse: false };
    expect(canBuyAndUseConsumableInShop(withoutFlag)).toBe(false);
  });

  test('shop buy-and-use blocks visible_dice and scored_dice cards', () => {
    expect(canBuyAndUseConsumableInShop(getSupplyDefById('loaded')!)).toBe(false);
    expect(canBuyAndUseConsumableInShop(getSupplyDefById('shallow_grave')!)).toBe(false);
    expect(canBuyAndUseConsumableInShop(getSupplyDefById('medicine')!)).toBe(false);
    expect(canBuyAndUseConsumableInShop(getFrontierDefById('raid')!)).toBe(false);
    expect(canBuyAndUseConsumableInShop(getFrontierDefById('seeing_double')!)).toBe(false);
  });
});

describe('medicine scored-dice eligibility', () => {
  const medicineDef = () => getSupplyDefById('medicine')!;
  const dieIds = ['d1', 'd2', 'd3'];

  test('blocked in shop and booster packs', () => {
    expect(canUseConsumable(medicineDef(), shopContext).allowed).toBe(false);
    expect(canUseConsumable(medicineDef(), packContext(dieIds)).allowed).toBe(false);
  });

  test('blocked in game SELECT phase and when score action is hidden', () => {
    expect(canUseConsumable(medicineDef(), gameSelectContext(dieIds)).allowed).toBe(false);
    expect(canUseConsumable(medicineDef(), gameRollContext(dieIds, dieIds, false)).allowed).toBe(false);
  });

  test('allowed in game ROLL when score action is visible and scored dice exist', () => {
    expect(canUseConsumable(medicineDef(), gameRollContext(dieIds, ['d1', 'd2'], true)).allowed).toBe(true);
  });

  test('visible_dice cards work in game and packs but not shop', () => {
    const buzzards = getSupplyDefById('buzzards')!;
    expect(canUseConsumable(buzzards, shopContext).allowed).toBe(false);
    expect(canUseConsumable(buzzards, gameSelectContext(dieIds)).allowed).toBe(true);
    expect(canUseConsumable(buzzards, packContext(dieIds)).allowed).toBe(true);
    expect(canUseConsumable(buzzards, packContext([])).allowed).toBe(false);
  });
});

describe('shop consumable buy-and-use integration', () => {
  test('shop buy-and-use works with full consumable slots for non-targeting supply/frontier cards', () => {
    const { player } = setupGame({ money: 100, equipment: [item('horseshoe')] });
    player.maxConsumableSlots = 0;
    const supplyIds = ['omen_stone', 'shop_pass', 'fools_gold', 'trading_post'] as const;
    const frontierIds = ['all_in', 'echo_of_the_damned', 'blood_moon'] as const;

    // Seed one consumable so Trading Post has a consumable sell value target
    player.maxConsumableSlots = 1;
    player.addConsumable(getSupplyDefById('treasure_map')!);
    player.maxConsumableSlots = 0;

    const eqBefore = player.equipment[0]!.sellValue;
    const conBefore = player.consumables[0]!.sellValue;
    const usedBefore = player.usedConsumableSlots;

    for (const id of supplyIds) {
      const def = getSupplyDefById(id)!;
      const result = shopBuyActions.buyAndUseConsumable(def, 0);
      expect(result.success).toBe(true);
    }
    for (const id of frontierIds) {
      const def = getFrontierDefById(id)!;
      const result = shopBuyActions.buyAndUseConsumable(def, 0);
      expect(result.success).toBe(true);
    }

    // Used directly from shop despite maxConsumableSlots=0 (no new cards added to bar)
    expect(player.usedConsumableSlots).toBe(usedBefore);

    // Token-based effects were applied.
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'omen_stone')?.copies).toBe(1);
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'shop_pass')?.copies).toBe(1);
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'all_in')?.copies).toBe(1);
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'echo_of_the_damned')?.copies).toBe(1);
    expect(player.equipment.some((e) => e.def.aura?.id === 'ghost')).toBe(true);
    expect(getRunState().trailEventModifiers.handSizePenalty).toBe(1);

    // Trading Post still executes via buy-and-use path.
    expect(player.equipment[0]!.sellValue).toBe(eqBefore + 1);
    expect(player.consumables[0]!.sellValue).toBe(conBefore + 1);

    // Keep this test isolated from subsequent suites.
    resetPlayerState();
  });

  test('shop buy-and-use does not spend if second_helpings has no valid target', () => {
    const { player } = setupGame({ money: 20 });
    const def = getSupplyDefById('second_helpings')!;
    const before = player.economy.balance;

    const result = shopBuyActions.buyAndUseConsumable(def, 3);
    expect(result.success).toBe(false);
    expect(player.economy.balance).toBe(before);
    expect(player.consumables).toHaveLength(0);
  });
});

describe('new supply cards', () => {
  test('omen_stone activates omen flag', () => {
    resetPlayerState();
    const def = getSupplyDefById('omen_stone')!;
    executeConsumableEffect(createConsumableInstance(def));
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'omen_stone')?.copies).toBe(1);
    expect(selectRunStatusTraits(getRunState()).some((t) => t.id === 'omen_stone')).toBe(true);
  });

  test('shop_pass grants free reroll for next shop visit', () => {
    resetPlayerState();
    const def = getSupplyDefById('shop_pass')!;
    executeConsumableEffect(createConsumableInstance(def));
    executeConsumableEffect(createConsumableInstance(def));
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'shop_pass')?.copies).toBe(2);
    expect(selectRunStatusTraits(getRunState()).find((t) => t.id === 'shop_pass')?.label).toBe('Shop Pass x2');
  });

  test('fools_gold wins $30 on lucky roll', () => {
    resetPlayerState();
    initRunRng('test-0');
    const player = resetPlayerState();
    player.economy.setBalance(100);
    initRunRng('test-0');
    const def = getSupplyDefById('fools_gold')!;
    executeConsumableEffect(createConsumableInstance(def));
    expect(player.economy.balance).toBe(130);
    expect(getRunState().playbackQueue).toContainEqual({
      kind: 'toast',
      message: 'Success! Gained $30',
      tone: 'success',
    });
  });

  test('fools_gold loses half money on unlucky roll', () => {
    resetPlayerState();
    initRunRng('test-6');
    const player = resetPlayerState();
    player.economy.setBalance(100);
    initRunRng('test-6');
    const def = getSupplyDefById('fools_gold')!;
    executeConsumableEffect(createConsumableInstance(def));
    expect(player.economy.balance).toBe(50);
    expect(getRunState().playbackQueue).toContainEqual({
      kind: 'toast',
      message: 'Too bad. Lost $50',
      tone: 'failure',
    });
  });

  test('fools_gold does not change balance when <= $0', () => {
    resetPlayerState();
    initRunRng('test-6');
    const player = resetPlayerState();
    player.economy.setBalance(-40);
    initRunRng('test-6'); // unlucky branch in current RNG mapping
    const def = getSupplyDefById('fools_gold')!;
    executeConsumableEffect(createConsumableInstance(def));
    expect(player.economy.balance).toBe(-40);
  });

  test('fools_gold can still win $30 at negative balance', () => {
    resetPlayerState();
    initRunRng('test-0');
    const player = resetPlayerState();
    player.economy.setBalance(-40);
    initRunRng('test-0'); // lucky branch in current RNG mapping
    const def = getSupplyDefById('fools_gold')!;
    executeConsumableEffect(createConsumableInstance(def));
    expect(player.economy.balance).toBe(-10);
  });

  test('trading_post bumps equipment and consumable sell values', () => {
    const { player } = setupGame({ equipment: [item('horseshoe')] });
    player.addConsumable(getSupplyDefById('treasure_map')!);
    const eqBefore = player.equipment[0]!.sellValue;
    const conBefore = player.consumables[0]!.sellValue;
    const def = getSupplyDefById('trading_post')!;
    executeConsumableEffect(createConsumableInstance(def));
    expect(player.equipment[0]!.sellValue).toBe(eqBefore + 1);
    expect(player.consumables[0]!.sellValue).toBe(conBefore + 1);
  });

  test('trade card respects trading post sell bump', () => {
    const { player } = setupGame({ equipment: [item('horseshoe')] });
    bumpAllSellValues(1);
    const total = player.equipment.reduce((s, e) => s + e.sellValue, 0);
    const def = getSupplyDefById('trade')!;
    const before = player.economy.balance;
    executeConsumableEffect(createConsumableInstance(def));
    expect(player.economy.balance - before).toBe(Math.min(total, 50));
  });

  test('trade card payout includes cursed equipment sell value', () => {
    const { player } = setupGame({
      equipment: [equipWithModifiers('horseshoe', ['cursed']), item('war_drums')],
    });
    const total = player.equipment.reduce((s, e) => s + e.sellValue, 0);
    expect(total).toBeGreaterThan(player.equipment[1]!.sellValue);
    const def = getSupplyDefById('trade')!;
    const before = player.economy.balance;
    executeConsumableEffect(createConsumableInstance(def));
    expect(player.equipment).toHaveLength(2);
    expect(player.sellEquipment(0)).toBe(false);
    expect(player.economy.balance - before).toBe(Math.min(total, 50));
  });

  test('bless tooltip odds account for loaded dice', () => {
    const { player } = setupGame({ equipment: [item('loaded_dice')] });
    const def = getSupplyDefById('bless')!;
    const rows = def.display(null, getItemDisplayContext());
    expect(rows.tooltip[0]?.[0]?.text).toContain('2 in 4');
    expect(player.equipment[0]?.def.id).toBe('loaded_dice');
  });

  test('fools_gold tooltip odds account for loaded dice', () => {
    setupGame({ equipment: [item('loaded_dice')] });
    const def = getSupplyDefById('fools_gold')!;
    const rows = def.display(null, getItemDisplayContext());
    expect(rows.tooltip[0]?.[0]?.text).toContain('2 in 2');
  });

  test('fools_gold uses loaded odds in execution', () => {
    resetPlayerState();
    initRunRng('test-6');
    const { player } = setupGame({ money: 100, equipment: [item('loaded_dice')] });
    const def = getSupplyDefById('fools_gold')!;
    executeConsumableEffect(createConsumableInstance(def));
    expect(player.economy.balance).toBe(130);
  });
});

describe('secret trail guides', () => {
  const secretGuideIds = () =>
    new Set(trailGuidesData.filter((tg) => getHandByType(tg.handType)?.secret).map((tg) => tg.id));

  const nonSecretGuideIds = () =>
    trailGuidesData.filter((tg) => !getHandByType(tg.handType)?.secret).map((tg) => tg.id);

  beforeEach(() => {
    setupGame();
  });

  test('spawn policy derives from hands.ts secret flag', () => {
    expect(getHandByType(HandType.FLUSH)?.secret).toBe(true);
    const spawnable = filterSpawnableTrailGuides(trailGuidesData, getRunState());
    expect(spawnable.some((tg) => tg.id === 'tg_flush')).toBe(false);
    expect(spawnable.some((tg) => tg.id === 'tg_pair')).toBe(true);
  });

  test('undiscovered secret guides are excluded from spawn pool', () => {
    const spawnable = filterSpawnableTrailGuides(trailGuidesData, getRunState());
    expect(spawnable.some((tg) => tg.id === 'tg_flush')).toBe(false);
    expect(spawnable.some((tg) => tg.id === 'tg_pair')).toBe(true);
  });

  test('discovered secret hand unlocks its trail guide', () => {
    progressionActions.recordHandPlayed(HandType.FLUSH);
    const spawnable = filterSpawnableTrailGuides(trailGuidesData, getRunState());
    expect(spawnable.some((tg) => tg.id === 'tg_flush')).toBe(true);
  });

  test('getTrailGuideDefForHand returns matching secret guide before discovery (Blue Moon)', () => {
    const def = getTrailGuideDefForHand(HandType.FLUSH);
    expect(def.id).toBe('tg_flush');
  });

  test('generateShopConsumables never includes undiscovered secret guides', () => {
    initRunRng('shop-secret-trail-guide-seed');
    for (let i = 0; i < 20; i++) {
      const stock = generateShopConsumables(20);
      const trailGuideIds = stock.filter((c) => c.category === 'trail_guide').map((c) => c.id);
      for (const id of trailGuideIds) {
        expect(secretGuideIds().has(id)).toBe(false);
      }
    }
  });

  test('getRandomTrailGuideDef never picks undiscovered secret guides', () => {
    initRunRng('secret-trail-guide-seed');
    const secretIds = secretGuideIds();
    for (let i = 0; i < 50; i++) {
      const def = getRandomTrailGuideDef();
      expect(secretIds.has(def.id)).toBe(false);
    }
  });

  test('getRandomTrailGuideDef falls back when all non-secret guides are excluded', () => {
    initRunRng('secret-trail-guide-fallback-seed');
    const def = getRandomTrailGuideDef(undefined, nonSecretGuideIds());
    expect(nonSecretGuideIds()).toContain(def.id);
    expect(secretGuideIds().has(def.id)).toBe(false);
  });
});

describe('trail guide direct use', () => {
  test('useConsumableDirectly upgrades hand level on each call', () => {
    setupGame();
    const def = getTrailGuideDefById('tg_pair')!;
    useConsumableDirectly(def);
    expect(getRunState().handStats[HandType.PAIR]?.level).toBe(2);
    useConsumableDirectly(def);
    expect(getRunState().handStats[HandType.PAIR]?.level).toBe(3);
  });
});

describe('consumable display context', () => {
  test('trail guide tooltip shows current hand level', () => {
    setupGame();
    const def = getTrailGuideDefById('tg_pair')!;
    const rows = def.display(null, getItemDisplayContext());
    expect(rows.tooltip[1]?.[0]?.text).toBe('Current level: 1');
  });

  test('second_helpings tooltip shows no target when unavailable', () => {
    setupGame();
    const def = getSupplyDefById('second_helpings')!;
    const rows = def.display(null, getItemDisplayContext());
    expect(rows.tooltip[0]?.[0]?.text).toBe('No valid clone target');
  });

  test('second_helpings tooltip shows clone target when available', () => {
    resetPlayerState();
    useConsumableDirectly(getSupplyDefById('coffee_tin')!);
    const def = getSupplyDefById('second_helpings')!;
    const rows = def.display(null, getItemDisplayContext());
    expect(rows.tooltip[0]?.[0]?.text).toContain('Coffee Tin');
  });

  test('trade tooltip previews capped payout', () => {
    setupGame({ equipment: [item('horseshoe'), item('war_drums'), item('loaded_dice')] });
    bumpAllSellValues(19);
    const def = getSupplyDefById('trade')!;
    const rows = def.display(null, getItemDisplayContext());
    expect(rows.tooltip[0]?.[0]?.text).toBe('Current payout: $50');
    expect(rows.tooltip[1]?.[0]?.text).toContain('cap $50');
  });

  test('trade tooltip includes cursed equipment sell value', () => {
    setupGame({ equipment: [equipWithModifiers('horseshoe', ['cursed']), item('war_drums')] });
    const total = getItemDisplayContext().equipment.reduce((sum, equip) => sum + equip.sellValue, 0);
    const def = getSupplyDefById('trade')!;
    const rows = def.display(null, getItemDisplayContext());
    expect(rows.tooltip[0]?.[0]?.text).toBe(`Current payout: $${Math.min(total, 50)}`);
    expect(total).toBeGreaterThan(getItemDisplayContext().equipment[1]!.sellValue);
  });
});

describe('new frontier encounter cards', () => {
  test('all_in doubles money and sets lose rerolls once', () => {
    const player = resetPlayerState();
    player.economy.setBalance(40);
    const def = getFrontierDefById('all_in')!;
    executeConsumableEffect(createConsumableInstance(def));
    expect(player.economy.balance).toBe(80);
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'all_in')?.copies).toBe(1);
    expect(getRunState().trailEventModifiers.loseAllRerolls).toBe(true);

    executeConsumableEffect(createConsumableInstance(def));
    expect(player.economy.balance).toBe(160);
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'all_in')?.copies).toBe(2);
  });

  test('echo_of_the_damned stacks retrigger bonus', () => {
    const def = getFrontierDefById('echo_of_the_damned')!;
    executeConsumableEffect(createConsumableInstance(def));
    executeConsumableEffect(createConsumableInstance(def));
    executeConsumableEffect(createConsumableInstance(def));
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'echo_of_the_damned')?.copies).toBe(3);
  });

  test('echo stacks add to red_bullet triggers per die', () => {
    const dice = [die({ value: 6, sticker: 'red_bullet' }), die({ value: 6 })];
    const { result } = calculateTestScore({
      scoredDice: dice,
      equipment: [],
      echoOfTheDamnedStacks: 3,
    });
    const milesForBullet = result.animEvents.filter((e) => e.dieId === dice[0]!.id && e.popupType === 'miles');
    expect(milesForBullet.length).toBe(5);
    expect(getRunState().statusTraitTokens.find((t) => t.id === 'echo_of_the_damned')).toBeUndefined();
  });
});

describe('roll phase value preservation policy', () => {
  test('ENHANCE and ADD_STICKER do not change displayed rolled face value', () => {
    expect(shouldUpdateDisplayedDiceValue('ENHANCE')).toBe(false);
    expect(shouldUpdateDisplayedDiceValue('ADD_STICKER')).toBe(false);
  });

  test('BUMP_VALUE is allowed to change displayed rolled face value', () => {
    expect(shouldUpdateDisplayedDiceValue('BUMP_VALUE')).toBe(true);
  });
});

describe('shouldPromptRoundModifications', () => {
  test('false when only positive traits like omen_stone', () => {
    resetPlayerState();
    const def = getSupplyDefById('omen_stone')!;
    executeConsumableEffect(createConsumableInstance(def));
    expect(shouldPromptRoundModifications()).toBe(false);
  });

  test('true when a negative trait is active', () => {
    resetPlayerState();
    const def = getFrontierDefById('all_in')!;
    executeConsumableEffect(createConsumableInstance(def));
    expect(shouldPromptRoundModifications()).toBe(true);
  });

  test('true on boss round even without negative traits', () => {
    const { run } = setupGame({ profession: 'farmer' });
    setBoss(run, 'the_land_slide');
    expect(shouldPromptRoundModifications()).toBe(true);
  });
});
