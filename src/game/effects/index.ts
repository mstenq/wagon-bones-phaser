// ─── Effects Barrel ───

export { effectRegistry, EffectRegistry } from './registry';
export {
  getConfigModifiers,
  findDeathPrevention,
  getScoredRetriggerCount,
  forEachEquipmentResolved,
  applyEquipmentAuras,
  applyHolyAuraXMult,
  dieMatchesPip,
  dieMatchesParity,
  hasStackedDeck,
  isBossEffectNegated,
} from './helpers';
export { applyScoringMutations, createEmptyScoringMutations, mergeMutations } from './applyMutations';
export type {
  ScoringPipelineContext,
  ScoringMutations,
  AdditiveEffectHandler,
  XMultEffectHandler,
  PerDieEffectHandler,
  HeldDieEffectHandler,
  LifecyclePhase,
  LifecycleHandler,
} from './types';

// Import all handler modules to register them
import './additive';
import './xmult';
import './perDie';
import './heldDie';
import './lifecycle';
