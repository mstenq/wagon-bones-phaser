// ─── Effects Barrel ───

export { effectRegistry, EffectRegistry } from './registry';
export {
  getConfigModifiers,
  findDeathPrevention,
  forEachEquipmentScoring,
  applyEquipmentAuras,
  applyEquipmentAuraForSlot,
  applyHolyAuraForSlot,
  applyHolyAuraXMult,
  dieMatchesPip,
  dieMatchesParity,
  scoredHandHasBothParities,
  hasStackedDeck,
  isBossEffectNegated,
} from './helpers';
export {
  computeScoredDieRetriggers,
  getGlobalScoredRetriggerCount,
  getGlobalScoredRetriggerCount as getScoredRetriggerCount,
  type ScoredDieRetriggerOptions,
  type ScoredDieRetriggerResult,
  type ScoredRetriggerScoreContext,
} from './scoredRetrigger';
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
