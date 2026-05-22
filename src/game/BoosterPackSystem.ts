// ─── Booster Pack System (No Phaser imports) ───
// Defines pack types, tiers, weighted selection, and content generation.

import { Die, DiceSticker } from './types';
import { createDie } from './DiceSystem';
import { generateShopStock, EquipmentDef, EquipmentInstance } from './ItemsSystem';
import { rollShopEquipmentPreview } from './EquipmentModifiers';
import { getPlayerState } from './PlayerState';
import {
  DiceSelectionConfig,
  DiceSelectionEffectType,
  DiceSelectionEffectParams,
  pickRandomAura,
} from './DiceSelectionSystem';
import { CHANCES, PACK_WEIGHTS, PACK_ONLY_FRONTIER_IDS } from './Constants';
import packsData, {
  type PackCategory,
  type PackDef,
  type PackTier,
} from '../data/packs';
import supplyCardsData, { type SupplyCardDef } from '../data/supply_cards';
import trailGuidesData from '../data/trail_guides';
import frontierEncountersData, { type FrontierEncounterDef } from '../data/frontier_encounters';
import diceEnhancements from '../data/dice_enhancements';
import pipEnhancements from '../data/pip_enhancements';

const ENHANCEMENT_INFO = new Map(diceEnhancements.map((e) => [e.id, e]));
const STICKER_INFO = new Map(pipEnhancements.map((s) => [s.id, s]));

// ─── Sticker Definitions ───

const ALL_STICKERS: DiceSticker[] = ['purple_flower', 'red_bullet', 'golden_dollar', 'blue_moon'];

/** Randomly apply a sticker to a die (small chance) */
function applyRandomSticker(die: Die): void {
  if (die.sticker) return; // already has one
  if (Math.random() >= CHANCES.STICKER_EFFECT) return;
  die.sticker = ALL_STICKERS[Math.floor(Math.random() * ALL_STICKERS.length)];
}

// ─── Types ───

export type { PackCategory, PackTier };
export type PackDefinition = PackDef;

export interface InstantEffect {
  type: string; // CREATE_DICE, DOUBLE_MONEY, TRADE_EQUIPMENT, CREATE_EQUIPMENT, etc.
  enhancement?: string; // for CREATE_DICE
  count?: number; // for CREATE_DICE
  maxGain?: number; // for DOUBLE_MONEY, TRADE_EQUIPMENT
  rarity?: string; // for CREATE_EQUIPMENT (target rarity)
  excludeRarity?: string; // for CREATE_EQUIPMENT (exclude rarity)
  setMoneyZero?: boolean; // for CREATE_EQUIPMENT (magic beans)
  /** When true, granted equipment ignores difficulty modifiers (ingenuity, magic beans). */
  noModifiers?: boolean;
}

/** A generated item inside an opened pack */
export interface PackItem {
  id: string;
  name: string;
  description: string;
  category: PackCategory;
  // Actual content payload
  die?: Die;
  equipmentDef?: EquipmentDef;
  /** Pre-rolled modifiers for equipment pack cards (shop/pack preview). */
  equipmentPreview?: EquipmentInstance;
  supplyCardId?: string;
  trailGuideId?: string;
  frontierEncounterId?: string;
  diceSelection?: DiceSelectionConfig; // if present, using this card launches dice selection
  instantEffect?: InstantEffect; // if present, effect is applied immediately on confirm
}

/** A pack instance ready to buy in the shop */
export interface PackInstance {
  def: PackDefinition;
  id: string;
}

// ─── Pack Definitions ───

const PACK_DEFS: PackDefinition[] = packsData;

let nextPackId = 0;

/** Look up a pack definition by id (e.g. tag-granted mega packs). */
export function getPackDefById(id: string): PackDefinition | undefined {
  return PACK_DEFS.find((p) => p.id === id);
}

// ─── Shop Generation ───

/** Get effective weight for a pack def, applying category & tier multipliers */
function getEffectiveWeight(def: PackDefinition): number {
  const catMult = PACK_WEIGHTS[def.category] ?? 1;
  const tierMult = PACK_WEIGHTS[def.tier] ?? 1;
  return def.weight * catMult * tierMult;
}

export interface GenerateShopPacksOptions {
  /** Force at least one shop pack slot to use this pack id (e.g. first-shop equipment pack). */
  guaranteePackId?: string;
}

/** Pick N random packs using weighted selection */
export function generateShopPacks(count: number = 2, options?: GenerateShopPacksOptions): PackInstance[] {
  const effectiveWeights = PACK_DEFS.map((d) => getEffectiveWeight(d));
  const totalWeight = effectiveWeights.reduce((sum, w) => sum + w, 0);
  const packs: PackInstance[] = [];

  for (let i = 0; i < count; i++) {
    let roll = Math.random() * totalWeight;
    let picked = PACK_DEFS[0];
    for (let j = 0; j < PACK_DEFS.length; j++) {
      roll -= effectiveWeights[j];
      if (roll <= 0) {
        picked = PACK_DEFS[j];
        break;
      }
    }
    packs.push({ def: picked, id: `pack_${nextPackId++}` });
  }

  const guaranteeId = options?.guaranteePackId;
  if (guaranteeId) {
    const guaranteed = PACK_DEFS.find((p) => p.id === guaranteeId);
    if (guaranteed && !packs.some((p) => p.def.id === guaranteeId)) {
      packs[0] = { def: guaranteed, id: `pack_${nextPackId++}` };
    }
  }

  return packs;
}

// ─── Content Generation ───

// Card data loaded from JSON
const SUPPLY_CARDS = supplyCardsData;
const TRAIL_GUIDES = trailGuidesData;
const FRONTIER_ENCOUNTERS = frontierEncountersData;

type FrontierEntry = FrontierEncounterDef;

/** Ultra-rare cards excluded from normal pools; only appear via RARE_PACK_CARD rolls. */
const RARE_PACK_CARDS: { id: string; packs: PackCategory[] }[] = [
  { id: 'pandoras_box', packs: ['frontier', 'supply'] },
  { id: 'spiritual_journey', packs: ['frontier', 'trail_guide'] },
];

export const RARE_PACK_CARD_IDS = PACK_ONLY_FRONTIER_IDS;

const STANDARD_FRONTIER_POOL = FRONTIER_ENCOUNTERS.filter((fe) => !PACK_ONLY_FRONTIER_IDS.has(fe.id));

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, arr.length));
}

function rollRarePackCard(packCategory: PackCategory): FrontierEntry | null {
  for (const rare of RARE_PACK_CARDS) {
    if (!rare.packs.includes(packCategory)) continue;
    if (Math.random() < CHANCES.RARE_PACK_CARD) {
      const fe = FRONTIER_ENCOUNTERS.find((f) => f.id === rare.id);
      if (fe) return fe;
    }
  }
  return null;
}

/** Exported for tests — rolls a single rare pack card slot. */
export function tryRollRarePackCard(packCategory: PackCategory): FrontierEntry | null {
  return rollRarePackCard(packCategory);
}

function buildSupplyPackItem(s: SupplyCardDef): PackItem {
  const item: PackItem = {
    id: s.id + '_' + Math.random().toString(36).slice(2, 6),
    name: s.name,
    description: s.description,
    category: 'supply' as PackCategory,
    supplyCardId: s.id,
  };
  if (s.diceSelection) {
    const ds = s.diceSelection;
    item.diceSelection = {
      drawCount: ds.drawCount,
      pickCount: ds.pickCount,
      effectType: ds.effectType,
      effectParams: ds.effectParams,
      cardName: s.name,
      description: s.description,
      skippable: true,
    };
  }
  if (s.instantEffect) {
    item.instantEffect = s.instantEffect as InstantEffect;
  }
  return item;
}

function buildFrontierPackItem(fe: FrontierEntry): PackItem {
  const item: PackItem = {
    id: fe.id + '_' + Math.random().toString(36).slice(2, 6),
    name: fe.name,
    description: fe.description,
    category: 'frontier' as PackCategory,
    frontierEncounterId: fe.id,
  };
  if (fe.diceSelection) {
    const ds = fe.diceSelection;
    item.diceSelection = {
      drawCount: ds.drawCount,
      pickCount: ds.pickCount,
      effectType: ds.effectType,
      effectParams: ds.effectParams,
      cardName: fe.name,
      description: fe.description,
      skippable: true,
    };
  }
  if (fe.instantEffect) {
    item.instantEffect = fe.instantEffect as InstantEffect;
  }
  return item;
}

/** Generate the contents of a pack when it's opened */
export function generatePackContents(def: PackDefinition): PackItem[] {
  switch (def.category) {
    case 'dice':
      return generateDicePackContents(def.totalCards);
    case 'supply':
      return generateSupplyPackContents(def.totalCards);
    case 'trail_guide':
      return generateTrailGuidePackContents(def.totalCards);
    case 'frontier':
      return generateFrontierPackContents(def.totalCards);
    case 'equipment':
      return generateEquipmentPackContents(def.totalCards);
  }
}

function generateDicePackContents(count: number): PackItem[] {
  const items: PackItem[] = [];
  const enhancements = diceEnhancements.map((e) => e.id);

  for (let i = 0; i < count; i++) {
    const enhancement = enhancements[Math.floor(Math.random() * enhancements.length)];
    const die = createDie({ enhancement: enhancement as Die['enhancement'] });
    applyRandomSticker(die);

    // Random aura chance
    if (Math.random() < CHANCES.DICE_AURA) {
      die.aura = pickRandomAura();
    }

    const enhInfo = enhancement ? ENHANCEMENT_INFO.get(enhancement) : null;
    const enhName = enhInfo ? enhInfo.name : 'Standard';
    const descParts = [enhInfo ? enhInfo.description : 'Standard dice'];
    if (die.sticker) {
      const stickerInfo = STICKER_INFO.get(die.sticker);
      if (stickerInfo) descParts.push(stickerInfo.name);
    }

    items.push({
      id: die.id,
      name: enhName,
      description: descParts.join('\n'),
      category: 'dice',
      die,
    });
  }
  return items;
}

function generateSupplyPackContents(count: number): PackItem[] {
  const items: PackItem[] = [];
  const normalCards = pickRandom(SUPPLY_CARDS, count);
  let normalIdx = 0;

  for (let i = 0; i < count; i++) {
    const rare = rollRarePackCard('supply');
    if (rare) {
      items.push(buildFrontierPackItem(rare));
      continue;
    }
    items.push(buildSupplyPackItem(normalCards[normalIdx++]));
  }
  return items;
}

function generateTrailGuidePackContents(count: number): PackItem[] {
  const items: PackItem[] = [];
  const normalCards = pickRandom(TRAIL_GUIDES, count);
  let normalIdx = 0;

  for (let i = 0; i < count; i++) {
    const rare = rollRarePackCard('trail_guide');
    if (rare) {
      items.push(buildFrontierPackItem(rare));
      continue;
    }
    const tg = normalCards[normalIdx++];
    items.push({
      id: tg.id + '_' + Math.random().toString(36).slice(2, 6),
      name: tg.name,
      description: tg.description,
      category: 'trail_guide' as PackCategory,
      trailGuideId: tg.id,
    });
  }
  return items;
}

function generateFrontierPackContents(count: number): PackItem[] {
  const items: PackItem[] = [];
  const normalCards = pickRandom(STANDARD_FRONTIER_POOL, count);
  let normalIdx = 0;

  for (let i = 0; i < count; i++) {
    const rare = rollRarePackCard('frontier');
    if (rare) {
      items.push(buildFrontierPackItem(rare));
      continue;
    }
    items.push(buildFrontierPackItem(normalCards[normalIdx++]));
  }
  return items;
}

function generateEquipmentPackContents(count: number): PackItem[] {
  const player = getPlayerState();
  const defs = generateShopStock(count);
  return defs.map((def) => ({
    id: def.id + '_' + Math.random().toString(36).slice(2, 6),
    name: def.name,
    description: def.description,
    category: 'equipment' as PackCategory,
    equipmentDef: def,
    equipmentPreview: rollShopEquipmentPreview(def, player.purchasedPermits),
  }));
}
