import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const GAME_ROOT = join(import.meta.dir, '..');

/** Production entry points that walk equipment and must resolve copy slots. */
const COPY_WIRED_SOURCES: { label: string; path: string }[] = [
  { label: 'onDayEnd', path: 'effects/lifecycle/onDayEnd.ts' },
  { label: 'onReroll', path: 'effects/lifecycle/onReroll.ts' },
  { label: 'onHandPlayed', path: 'effects/lifecycle/onHandPlayed.ts' },
  { label: 'onDiceDestroyed', path: 'effects/lifecycle/onDiceDestroyed.ts' },
  { label: 'onShopReroll', path: 'effects/lifecycle/onShopReroll.ts' },
  { label: 'onDiceAdded', path: 'effects/lifecycle/onDiceAdded.ts' },
  { label: 'onSell', path: 'effects/lifecycle/onSell.ts' },
  { label: 'onPackOpened', path: 'effects/lifecycle/onPackOpened.ts' },
  { label: 'onPackSkipped', path: 'effects/lifecycle/onPackSkipped.ts' },
  { label: 'onRoundEnd', path: 'effects/lifecycle/onRoundEnd.ts' },
  { label: 'onRoundStart', path: 'effects/lifecycle/onRoundStart.ts' },
  { label: 'onShopEnd', path: 'effects/lifecycle/onShopEnd.ts' },
  { label: 'afterHandScored', path: 'effects/lifecycle/afterHandScored.ts' },
  { label: 'onPreScoring', path: 'effects/lifecycle/onPreScoring.ts' },
  { label: 'preScoreHandUpgrades', path: 'effects/lifecycle/preScoreHandUpgrades.ts' },
  { label: 'economyActions', path: 'store/actions/economyActions.ts' },
  { label: 'runProgression', path: 'runProgression.ts' },
  { label: 'scoreHand', path: 'scoring/scoreHand.ts' },
  { label: 'EquipmentEffects', path: 'EquipmentEffects.ts' },
  { label: 'scoredRetrigger', path: 'effects/scoredRetrigger.ts' },
  { label: 'retriggerAnim', path: 'effects/retriggerAnim.ts' },
];

const COPY_RESOLUTION_IMPORT =
  /walkEquipment(?:PerSlot|Lifecycle|Scoring)|forEachEquipmentScoring|resolveEquipmentSlotAtIndex/;

/** Lifecycle orchestrators that must dedupe copy/source slot dispatch. */
const LIFECYCLE_ORCHESTRATORS = [
  'effects/lifecycle/onDayEnd.ts',
  'effects/lifecycle/onReroll.ts',
  'effects/lifecycle/onHandPlayed.ts',
  'effects/lifecycle/onDiceDestroyed.ts',
  'effects/lifecycle/onShopReroll.ts',
  'effects/lifecycle/onDiceAdded.ts',
  'effects/lifecycle/onSell.ts',
  'effects/lifecycle/afterHandScored.ts',
] as const;

/** Round boundaries use perSlot policy — see equipmentUtils EquipmentWalkPolicy. */
const ROUND_BOUNDARY_ORCHESTRATORS = ['effects/lifecycle/onRoundStart.ts', 'effects/lifecycle/onRoundEnd.ts'] as const;

/** Raw bar walks that bypass boss/copy resolution in orchestrators. */
const RAW_EQUIP_LOOP = /for\s*\(\s*const\s+equip\s+of\s+equipment\s*\)/;
const RAW_EQUIP_INDEX_LOOP = /for\s*\(\s*let\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*equipment\.length/;

function readGameSource(relativePath: string): string {
  return readFileSync(join(GAME_ROOT, relativePath), 'utf8');
}

describe('Mirror Lake copy resolution wiring', () => {
  test('every equipment orchestrator imports and uses copy slot resolution', () => {
    const violations: string[] = [];

    for (const { label, path } of COPY_WIRED_SOURCES) {
      const source = readGameSource(path);
      if (!COPY_RESOLUTION_IMPORT.test(source)) {
        violations.push(`${label}: missing copy-resolution import/usage (${path})`);
      }
      if (RAW_EQUIP_LOOP.test(source)) {
        violations.push(`${label}: still uses raw "for (const equip of equipment)" (${path})`);
      }
    }

    if (violations.length > 0) {
      throw new Error(['Copy resolution wiring gaps:', ...violations.map((v) => `  ${v}`)].join('\n'));
    }
  });

  test('lifecycle orchestrators use lifecycleDedupe walk policy', () => {
    const violations: string[] = [];
    for (const relativePath of LIFECYCLE_ORCHESTRATORS) {
      const source = readGameSource(relativePath);
      if (!source.includes('walkEquipmentLifecycle')) {
        violations.push(`${relativePath}: expected walkEquipmentLifecycle`);
      }
    }
    if (violations.length > 0) {
      throw new Error(['Lifecycle copy dedupe wiring gaps:', ...violations.map((v) => `  ${v}`)].join('\n'));
    }
  });

  test('round boundary orchestrators use perSlot walk policy', () => {
    const violations: string[] = [];
    for (const relativePath of ROUND_BOUNDARY_ORCHESTRATORS) {
      const source = readGameSource(relativePath);
      if (!source.includes('walkEquipmentPerSlot')) {
        violations.push(`${relativePath}: expected walkEquipmentPerSlot`);
      }
    }
    if (violations.length > 0) {
      throw new Error(['Round boundary walk policy gaps:', ...violations.map((v) => `  ${v}`)].join('\n'));
    }
  });

  test('scoreHand and EquipmentEffects do not inline resolveCopyTarget', () => {
    for (const path of ['scoring/scoreHand.ts', 'EquipmentEffects.ts']) {
      const source = readGameSource(path);
      expect(source.includes('resolveCopyTarget')).toBe(false);
    }
  });

  test('scoreHand does not use raw equipment index loops', () => {
    const source = readGameSource('scoring/scoreHand.ts');
    expect(RAW_EQUIP_INDEX_LOOP.test(source)).toBe(false);
  });
});
