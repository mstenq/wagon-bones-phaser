// ─── Effects Barrel ───

export { effectRegistry, EffectRegistry } from './registry';
export { getScoredRetriggerCount } from './helpers';
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
console.error("[effects/index.ts] loaded");

// Import all handler modules to register them
import './additive';
import './xmult';
import './perDie';
import './heldDie';
import './lifecycle';
