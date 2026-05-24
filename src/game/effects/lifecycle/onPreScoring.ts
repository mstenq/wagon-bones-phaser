// ─── on-pre-scoring lifecycle handlers ───
// Effects that must apply before per-die scoring (e.g. enhancement changes).

import type { Die, ScoreAnimEvent } from '../../types';
import type { EquipmentInstance } from '../../ItemsSystem';
import type { ScoringMutations } from '../types';
import { dispatchLifecycle } from './dispatch';
import { effectRegistry } from '../registry';
import { forEachEquipmentResolved } from '../helpers';
import { checkLoadedChance } from '../../equipmentUtils';
import { rngPick } from '../../RunRng';

interface PreScoringContext {
  scoringDice: Die[];
  currentDay: number;
  maxDays: number;
  equipment: EquipmentInstance[];
  mutations: ScoringMutations;
  animEvents: ScoreAnimEvent[];
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
          mutations.diceEnhanced.push({ id: die.id, enhancement: 'gold' });
          animEvents.push({
            target: { kind: 'both', dieId: die.id, equipIndex: eIdx },
            popupType: 'enhance',
            value: 0,
            dieId: die.id,
            enhancement: 'gold',
          });
          console.log(`  [preScoring] ${equip.def.name}: turned die ${die.id} gold before scoring`);
        }
      }
      break;
    }
    case 'SOLO_FIRST_DAY_ENHANCE': {
      if (currentDay !== 1 || scoringDice.length !== 1) break;
      const target = scoringDice[0];
      const enhancements: Die['enhancement'][] = ['bone', 'lucky', 'wooden', 'steel', 'gold', 'loaded', 'diamond'];
      const enhancement = rngPick('equipment', enhancements);
      mutations.diceEnhanced.push({ id: target.id, enhancement });
      animEvents.push({
        target: { kind: 'both', dieId: target.id, equipIndex: eIdx },
        popupType: 'enhance',
        value: 0,
        dieId: target.id,
        enhancement,
      });
      console.log(`  [preScoring] ${equip.def.name}: enhanced die ${target.id} → ${enhancement} before scoring`);
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
