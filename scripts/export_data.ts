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
import pipEnhancements from '../src/data/pip_enhancements';
import professions from '../src/data/professions';
import supplyCards from '../src/data/supply_cards';
import trailGuides from '../src/data/trail_guides';
import trailTags, { resolveTagDescription } from '../src/data/trail_tags';
import type { ItemDisplayContext } from '../src/game/displayContextTypes';
import { createDefaultHandStats } from '../src/game/store/types';

const OUTPUT_DIR = join(import.meta.dir, 'output');

type CsvRow = Record<string, string | number | null | undefined>;

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
  'pip_enhancements.csv',
  pipEnhancements.map((e) => ({
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
