// ─── on-pre-scoring lifecycle handlers ───
// Effects that apply before per-die scoring, in strict equipment-bar order (with copy resolution).
// Each slot's dice changes are visible to later slots immediately.

import type { Die, ScoreAnimEvent } from '../../types';
import type { EquipmentInstance } from '../../ItemsSystem';
import type { ScoringMutations } from '../types';
import { dispatchLifecycle } from './dispatch';
import { effectRegistry } from '../registry';
import { forEachEquipmentResolved } from '../helpers';
import { checkLoadedChance } from '../../equipmentUtils';
import { rngPick } from '../../RunRng';
import { setDieEnhancement } from '../../DiceSystem';
import { getRunState, runStore } from '../../store/runStore';

interface PreScoringContext {
  scoringDice: Die[];
  currentDay: number;
  maxDays: number;
  equipment: EquipmentInstance[];
  mutations: ScoringMutations;
  animEvents: ScoreAnimEvent[];
}

/** Apply one enhancement patch to scored dice and run collection immediately (also records mutation). */
function applyPreScoringEnhancementImmediate(
  scoringDice: Die[],
  mutations: ScoringMutations,
  dieId: string,
  enhancement: Die['enhancement'],
): void {
  const existing = mutations.diceEnhanced.find((e) => e.id === dieId);
  if (!existing) {
    mutations.diceEnhanced.push({ id: dieId, enhancement });
  } else {
    existing.enhancement = enhancement;
  }

  const scored = scoringDice.find((d) => d.id === dieId);
  if (scored) setDieEnhancement(scored, enhancement);

  const run = getRunState();
  const dice = [...run.dice];
  let changed = false;
  const idx = dice.findIndex((d) => d.id === dieId);
  if (idx >= 0) {
    setDieEnhancement(dice[idx], enhancement);
    changed = true;
  }
  if (changed) runStore.setState({ dice });
}

/** Strip enhancement from scored die and run collection immediately. */
function stripPreScoringEnhancementImmediate(scoringDice: Die[], dieId: string): void {
  const scored = scoringDice.find((d) => d.id === dieId);
  if (scored) setDieEnhancement(scored, null);

  const run = getRunState();
  const pouchDie = run.dice.find((d) => d.id === dieId);
  if (pouchDie && pouchDie !== scored) {
    setDieEnhancement(pouchDie, null);
  }
}

effectRegistry.registerLifecycle('on-pre-scoring', (equip, ctx, equipIndex) => {
  const { scoringDice, currentDay, equipment, mutations, animEvents } = ctx as PreScoringContext;
  const eIdx = equipIndex as number;

  switch (equip.def.effectType) {
    case 'SCORED_GOLD_CHANCE': {
      const goldChance = (equip.def.effectParams as Record<string, unknown>).chance as [number, number];
      for (const die of scoringDice) {
        if (die.enhancement === 'gold') continue;
        if (checkLoadedChance(goldChance, equipment)) {
          applyPreScoringEnhancementImmediate(scoringDice, mutations, die.id, 'gold');
          animEvents.push({
            target: { kind: 'both', dieId: die.id, equipIndex: eIdx },
            popupType: 'enhance',
            value: 0,
            dieId: die.id,
            enhancement: 'gold',
          });
          console.log(`  [preScoring] ${equip.def.name}: die ${die.id} → gold`);
        }
      }
      break;
    }
    case 'SOLO_FIRST_DAY_ENHANCE': {
      if (currentDay !== 1 || scoringDice.length !== 1) break;
      const target = scoringDice[0];
      const enhancements: Die['enhancement'][] = ['bone', 'lucky', 'wooden', 'steel', 'gold', 'loaded', 'diamond'];
      const enhancement = rngPick('equipment', enhancements);
      applyPreScoringEnhancementImmediate(scoringDice, mutations, target.id, enhancement);
      animEvents.push({
        target: { kind: 'both', dieId: target.id, equipIndex: eIdx },
        popupType: 'enhance',
        value: 0,
        dieId: target.id,
        enhancement,
      });
      console.log(`  [preScoring] ${equip.def.name}: die ${target.id} → ${enhancement}`);
      break;
    }
    case 'GRAVEROBBER_XMULT': {
      const p = equip.def.effectParams as Record<string, unknown>;
      const increment = p.value as number;
      for (const die of scoringDice) {
        if (die.enhancement === null) continue;
        equip.state.xMult = (equip.state.xMult ?? 1) + increment;
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'strip', value: 0, dieId: die.id });
        animEvents.push({
          target: { kind: 'equip', equipIndex: eIdx },
          popupType: 'xmult',
          value: increment,
          dieId: die.id,
        });
        console.log(
          `  [preScoring] ${equip.def.name}: die ${die.id} stripped (was ${die.enhancement}), xMult → ${equip.state.xMult}`,
        );
        stripPreScoringEnhancementImmediate(scoringDice, die.id);
      }
      break;
    }
  }
});

export function processEquipmentPreScoring(
  equipment: EquipmentInstance[],
  scoringDice: Die[],
  scoreContext: { currentDay: number; maxDays: number },
  mutations: ScoringMutations,
  animEvents: ScoreAnimEvent[],
): void {
  console.log('[SCORE] Step 1 — Pre-scoring equipment (bar order, left → right)');
  const ctx: PreScoringContext = {
    scoringDice,
    currentDay: scoreContext.currentDay,
    maxDays: scoreContext.maxDays,
    equipment,
    mutations,
    animEvents,
  };
  forEachEquipmentResolved(
    equipment,
    (equip, _original, index) => {
      dispatchLifecycle('on-pre-scoring', equip, ctx, index);
    },
    'skip',
  );
}
