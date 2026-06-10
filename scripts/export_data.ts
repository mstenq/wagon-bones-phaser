/**
 * Export src/data modules to CSV files under scripts/output/.
 * Run: bun scripts/export_data.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import bosses from '../src/data/bosses';
import diceAuras from '../src/data/dice_auras';
import diceEnhancements from '../src/data/dice_enhancements';
import frontierEncounters from '../src/data/frontier_encounters';
import itemAuras from '../src/data/item_auras';
import items, { type HintSegment } from '../src/data/items';
import packs from '../src/data/packs';
import permits from '../src/data/permits';
import diceStickers from '../src/data/dice_stickers';
import professions from '../src/data/professions';
import supplyCards from '../src/data/supply_cards';
import trailEvents from '../src/data/trail_events';
import type {
  TrailEventChoice,
  TrailEventCondition,
  TrailEventDef,
  TrailEventEffect,
  TrailEventOutcome,
} from '../src/data/trail_events';
import trailGuides from '../src/data/trail_guides';
import trailTags, { resolveTagDescription } from '../src/data/trail_tags';
import type { ItemDisplayContext } from '../src/game/displayContextTypes';
import { createDefaultHandStats } from '../src/game/store/types';

const OUTPUT_DIR = join(import.meta.dir, 'output');

/** Choice / outcome pairs flattened into CSV columns (max observed choices per event is 3). */
const TRAIL_EVENT_CHOICE_COLUMNS = 4;

type CsvRow = Record<string, string | number | null | undefined | boolean>;

function formatTrailEventCondition(condition: TrailEventCondition): string {
  const parts: string[] = [condition.type];
  if (condition.id !== undefined) parts.push(`id=${condition.id}`);
  if (condition.amount !== undefined) parts.push(`amount=${condition.amount}`);
  return parts.join(' ');
}

function formatTrailEventEffect(effect: TrailEventEffect): string {
  const params: string[] = [];
  if (effect.amount !== undefined) params.push(`amount=${effect.amount}`);
  if (effect.count !== undefined) params.push(`count=${effect.count}`);
  if (effect.percent !== undefined) params.push(`percent=${effect.percent}`);
  if (effect.enhancement !== undefined && effect.enhancement !== null) {
    params.push(`enhancement=${effect.enhancement}`);
  }
  if (effect.aura !== undefined && effect.aura !== null) {
    params.push(`aura=${effect.aura}`);
  }
  if (effect.sticker !== undefined && effect.sticker !== null) {
    params.push(`sticker=${effect.sticker}`);
  }
  if (effect.id !== undefined) params.push(`id=${effect.id}`);
  if (effect.rarity !== undefined) params.push(`rarity=${effect.rarity}`);
  if (effect.multiplier !== undefined) params.push(`multiplier=${effect.multiplier}`);
  if (effect.chance !== undefined) params.push(`chance=${effect.chance}`);
  if (params.length === 0) return effect.type;
  return `${effect.type}(${params.join(', ')})`;
}

function formatTrailEventOutcomes(outcomes: TrailEventOutcome[]): string {
  return outcomes
    .map((outcome) => {
      const parts: string[] = [];
      if (outcome.probability !== 1) {
        parts.push(`p=${outcome.probability}`);
      }
      if (outcome.message) {
        parts.push(outcome.message);
      }
      if (outcome.effects.length > 0) {
        parts.push(outcome.effects.map(formatTrailEventEffect).join('; '));
      }
      return parts.join(' — ');
    })
    .join(' | ');
}

function formatTrailEventChoice(choice: TrailEventChoice): string {
  const condition = choice.condition
    ? ` [${formatTrailEventCondition(choice.condition)}]`
    : '';
  return `${choice.id}: ${choice.label}${condition}`;
}

function trailEventToCsvRow(event: TrailEventDef): CsvRow {
  const row: CsvRow = {
    id: event.id,
    name: event.name,
    description: event.description,
    category: event.category,
    weight: event.weight,
    demonHunterOnly: event.demonHunterOnly,
    minimumLeg: event.minimumLeg ?? '',
  };

  for (let i = 0; i < TRAIL_EVENT_CHOICE_COLUMNS; i++) {
    const slot = i + 1;
    const choice = event.choices[i];
    row[`choice${slot}`] = choice ? formatTrailEventChoice(choice) : '';
    row[`outcome${slot}`] = choice ? formatTrailEventOutcomes(choice.outcomes) : '';
  }

  return row;
}

function segmentsToText(segments: HintSegment[][]): string {
  return segments
    .map((row) => row.map((seg) => seg.text).join(' '))
    .join('\n');
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowsToCsv(rows: CsvRow[]): string {
  if (rows.length === 0) return '';
  const columns = Object.keys(rows[0]!);
  const header = columns.map(escapeCsvField).join(',');
  const body = rows.map((row) =>
    columns.map((col) => escapeCsvField(String(row[col] ?? ''))).join(','),
  );
  return [header, ...body].join('\n') + '\n';
}

function writeCsv(filename: string, rows: CsvRow[]): void {
  const path = join(OUTPUT_DIR, filename);
  writeFileSync(path, rowsToCsv(rows), 'utf8');
  console.log(`Wrote ${rows.length} rows → ${path}`);
}

const itemDisplayContext: ItemDisplayContext = {
  balance: 0,
  roundsSkipped: 0,
  equipment: [],
  dice: [],
  handStats: createDefaultHandStats(),
  purchasedPermits: [],
  professionId: null,
  debtLimit: 0,
  shopRerollCount: 0,
  maxEquipmentSlots: 5,
  usedEquipmentSlots: 0,
  startingDiceCount: 8,
  interestCap: 25,
  getHandStats: (handType) => createDefaultHandStats()[handType],
};

mkdirSync(OUTPUT_DIR, { recursive: true });

writeCsv(
  'bosses.csv',
  bosses.map((b) => ({
    id: b.id,
    name: b.name,
    description: b.description,
  })),
);

writeCsv(
  'items.csv',
  items.map((item) => {
    const { tooltip } = item.display(null, itemDisplayContext);
    return {
      id: item.id,
      name: item.name,
      cost: item.cost,
      rarity: item.rarity,
      description: segmentsToText(tooltip),
    };
  }),
);

writeCsv(
  'packs.csv',
  packs.map((p) => ({
    id: p.id,
    name: p.name,
    description: '',
    category: p.category,
    tier: p.tier,
  })),
);

writeCsv(
  'permits.csv',
  permits.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    stage: p.stage,
    pairId: p.pairId,
    prerequisiteId: p.prerequisiteId ?? '',
  })),
);

writeCsv(
  'professions.csv',
  professions.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    title: p.title,
  })),
);

writeCsv(
  'trail_guides.csv',
  trailGuides.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
  })),
);

writeCsv('trail_events.csv', trailEvents.map(trailEventToCsvRow));

writeCsv(
  'trail_tags.csv',
  trailTags.map((t) => ({
    id: t.id,
    name: t.name,
    description: resolveTagDescription(t),
  })),
);

writeCsv(
  'supply_cards.csv',
  supplyCards.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
  })),
);

writeCsv(
  'frontier_encounters.csv',
  frontierEncounters.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
  })),
);

writeCsv(
  'dice_enhancements.csv',
  diceEnhancements.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
  })),
);

writeCsv(
  'dice_stickers.csv',
  diceStickers.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
  })),
);

writeCsv(
  'dice_auras.csv',
  diceAuras.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
  })),
);

writeCsv(
  'item_auras.csv',
  itemAuras.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
  })),
);
