import type { EffectArtTarget, EffectId, EffectLayers, EffectMountContext, EffectRuntime } from './types';
import { getEffectDefinition } from './registry';

export function createEffectRuntime(
  id: EffectId,
  layers: EffectLayers,
  ctx: EffectMountContext,
  art: EffectArtTarget,
): EffectRuntime | null {
  if (id === 'none') {
    return null;
  }
  const def = getEffectDefinition(id);
  if (!def) {
    return null;
  }
  return def.create(layers, ctx, art);
}

export function destroyEffect(runtime: EffectRuntime): void {
  runtime.destroy();
}
