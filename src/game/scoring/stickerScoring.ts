// ─── Post-score sticker effects (no Phaser imports) ───

import type { Die, ScoreAnimEvent } from '../types';
import type { ScoringMutations } from '../effects/types';
import { getRandomSupplyDef } from '../ConsumablesSystem';
import { rngFloat } from '../RunRng';

const GREEN_CONTAGION_CHANCE = 0.5;

export function applyPurpleFlowerNonScoring(
  playedDice: Die[],
  scoringIds: Set<string>,
  mutations: ScoringMutations,
  animEvents: ScoreAnimEvent[],
): void {
  for (const die of playedDice) {
    if (die.sticker !== 'purple_flower') continue;
    if (scoringIds.has(die.id)) continue;

    const supplyDef = getRandomSupplyDef();
    mutations.consumablesGranted.push(supplyDef.id);
    animEvents.push({
      target: { kind: 'die', dieId: die.id },
      popupType: 'supply',
      value: 0,
      dieId: die.id,
      consumableId: supplyDef.id,
    });
    console.log(`  [postScore] ${die.id}: sticker purple_flower (non-scoring) → supply '${supplyDef.name}'`);
  }
}

export function applyGreenContagionSpread(
  playedDice: Die[],
  mutations: ScoringMutations,
  animEvents: ScoreAnimEvent[],
): void {
  for (let i = 0; i < playedDice.length; i++) {
    const source = playedDice[i]!;
    if (source.sticker !== 'green_contagion') continue;

    const neighbors: Die[] = [];
    if (i > 0) neighbors.push(playedDice[i - 1]!);
    if (i < playedDice.length - 1) neighbors.push(playedDice[i + 1]!);

    for (const neighbor of neighbors) {
      if (rngFloat('dice') >= GREEN_CONTAGION_CHANCE) continue;

      const patch: ScoringMutations['diceEnhanced'][number] = {
        id: neighbor.id,
        sticker: 'green_contagion',
      };
      if (source.enhancement !== null) {
        patch.enhancement = source.enhancement;
      }

      mutations.diceEnhanced.push(patch);
      animEvents.push({
        target: { kind: 'die', dieId: neighbor.id },
        popupType: 'enhance',
        value: 0,
        dieId: neighbor.id,
        enhancement: patch.enhancement,
        sticker: 'green_contagion',
      });
      console.log(
        `  [postScore] ${source.id}: green_contagion spread → ${neighbor.id} (enh: ${source.enhancement ?? '—'})`,
      );
    }
  }
}
