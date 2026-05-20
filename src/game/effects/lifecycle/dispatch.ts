// ─── Lifecycle Dispatch ───

import { effectRegistry } from '../registry';
import type { LifecyclePhase, LifecycleHandler } from '../types';

/**
 * Dispatch a lifecycle event to all registered handlers.
 * This is the public API used by game logic to trigger equipment effects.
 */
export function dispatchLifecycle(phase: LifecyclePhase, equip: Parameters<LifecycleHandler>[0], ...args: unknown[]): void {
  effectRegistry.dispatchLifecycle(phase, equip, ...args);
}
