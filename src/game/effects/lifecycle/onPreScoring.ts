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
import { pickDiceAuraWeighted } from '../../auraRng';
import { pickRandomSticker } from '../../BoosterPackSystem';
import { rngPick } from '../../RunRng';
import { setDieEnhancement } from '../../DiceSystem';
import { getRunState } from '../../store/runStore';

interface PreScoringContext {
  scoringDice: Die[];
  currentDay: number;
  maxDays: number;
  equipment: EquipmentInstance[];
  mutations: ScoringMutations;
  animEvents: ScoreAnimEvent[];
}

type DieScoringPatch = {
  enhancement?: Die['enhancement'];
  aura?: Die['aura'];
  sticker?: Die['sticker'];
};

/** Apply die patches to scored dice and run collection immediately (also records mutation). */
function applyPreScoringDiePatchImmediate(
  scoringDice: Die[],
  mutations: ScoringMutations,
  dieId: string,
  patch: DieScoringPatch,
): void {
  const existing = mutations.diceEnhanced.find((e) => e.id === dieId);
  if (!existing) {
    mutations.diceEnhanced.push({ id: dieId, ...patch });
  } else {
    if (patch.enhancement !== undefined) existing.enhancement = patch.enhancement;
    if (patch.aura !== undefined) existing.aura = patch.aura;
    if (patch.sticker !== undefined) existing.sticker = patch.sticker;
  }

  const scored = scoringDice.find((d) => d.id === dieId);
  if (scored) {
    if (patch.enhancement !== undefined) setDieEnhancement(scored, patch.enhancement);
    if (patch.aura !== undefined) scored.aura = patch.aura;
    if (patch.sticker !== undefined) scored.sticker = patch.sticker;
  }

  const run = getRunState();
  const pouchDie = run.dice.find((d) => d.id === dieId);
  if (pouchDie && pouchDie !== scored) {
    if (patch.enhancement !== undefined) setDieEnhancement(pouchDie, patch.enhancement);
    if (patch.aura !== undefined) pouchDie.aura = patch.aura;
    if (patch.sticker !== undefined) pouchDie.sticker = patch.sticker;
  }
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
          applyPreScoringDiePatchImmediate(scoringDice, mutations, die.id, { enhancement: 'gold' });
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
      const aura = pickDiceAuraWeighted(1, 'equipment');
      const sticker = pickRandomSticker('equipment');
      applyPreScoringDiePatchImmediate(scoringDice, mutations, target.id, { enhancement, aura, sticker });
      animEvents.push({
        target: { kind: 'both', dieId: target.id, equipIndex: eIdx },
        popupType: 'enhance',
        value: 0,
        dieId: target.id,
        enhancement,
        aura,
        sticker,
      });
      console.log(
        `  [preScoring] ${equip.def.name}: die ${target.id} → ${enhancement}, ${aura} aura, ${sticker} sticker`,
      );
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
