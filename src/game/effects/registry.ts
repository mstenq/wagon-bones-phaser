// ─── Effect Handler Registry ───

import {
  AdditiveEffectHandler,
  XMultEffectHandler,
  PerDieEffectHandler,
  HeldDieEffectHandler,
  LifecyclePhase,
  LifecycleHandler,
} from './types';

/**
 * Central registry for equipment effect handlers.
 * Handlers are registered by effectType string and dispatched by the scoring pipeline.
 */
export class EffectRegistry {
  private additiveHandlers: Map<string, AdditiveEffectHandler> = new Map();
  private xmultHandlers: Map<string, XMultEffectHandler> = new Map();
  private perDieHandlers: Map<string, PerDieEffectHandler> = new Map();
  private heldDieHandlers: Map<string, HeldDieEffectHandler> = new Map();
  private lifecycleHandlers: Map<LifecyclePhase, LifecycleHandler[]> = new Map();

  registerAdditive(effectType: string, handler: AdditiveEffectHandler): void {
    this.additiveHandlers.set(effectType, handler);
  }

  registerXMult(effectType: string, handler: XMultEffectHandler): void {
    this.xmultHandlers.set(effectType, handler);
  }

  registerPerDie(effectType: string, handler: PerDieEffectHandler): void {
    this.perDieHandlers.set(effectType, handler);
  }

  getPerDie(effectType: string): PerDieEffectHandler | undefined {
    return this.perDieHandlers.get(effectType);
  }

  registerHeldDie(effectType: string, handler: HeldDieEffectHandler): void {
    this.heldDieHandlers.set(effectType, handler);
  }

  getHeldDie(effectType: string): HeldDieEffectHandler | undefined {
    return this.heldDieHandlers.get(effectType);
  }

  registerLifecycle(phase: LifecyclePhase, handler: LifecycleHandler): void {
    // One handler per phase (re-importing effect modules during dev must not stack duplicates).
    this.lifecycleHandlers.set(phase, [handler]);
  }

  dispatchAdditive(
    effectType: string,
    ctx: Parameters<AdditiveEffectHandler>[0],
    equip: Parameters<AdditiveEffectHandler>[1],
    index: Parameters<AdditiveEffectHandler>[2],
  ): void {
    const handler = this.additiveHandlers.get(effectType);
    if (handler) handler(ctx, equip, index);
  }

  dispatchXMult(
    effectType: string,
    ctx: Parameters<XMultEffectHandler>[0],
    equip: Parameters<XMultEffectHandler>[1],
    index: Parameters<XMultEffectHandler>[2],
  ): void {
    const handler = this.xmultHandlers.get(effectType);
    if (handler) handler(ctx, equip, index);
  }

  dispatchPerDie(
    effectType: string,
    ctx: Parameters<PerDieEffectHandler>[0],
    equip: Parameters<PerDieEffectHandler>[1],
    index: Parameters<PerDieEffectHandler>[2],
    die: Parameters<PerDieEffectHandler>[3],
    triggerIdx: Parameters<PerDieEffectHandler>[4],
  ): void {
    const handler = this.perDieHandlers.get(effectType);
    if (handler) handler(ctx, equip, index, die, triggerIdx);
  }

  dispatchHeldDie(
    effectType: string,
    ctx: Parameters<HeldDieEffectHandler>[0],
    equip: Parameters<HeldDieEffectHandler>[1],
    index: Parameters<HeldDieEffectHandler>[2],
    die: Parameters<HeldDieEffectHandler>[3],
    triggerIdx: Parameters<HeldDieEffectHandler>[4],
  ): void {
    const handler = this.heldDieHandlers.get(effectType);
    if (handler) handler(ctx, equip, index, die, triggerIdx);
  }

  dispatchLifecycle(phase: LifecyclePhase, equip: Parameters<LifecycleHandler>[0], ...args: unknown[]): void {
    const handlers = this.lifecycleHandlers.get(phase);
    if (!handlers) return;
    for (const handler of handlers) {
      handler(equip, ...args);
    }
  }
}

/** Global singleton registry */
const registry = new EffectRegistry();
export { registry as effectRegistry };
