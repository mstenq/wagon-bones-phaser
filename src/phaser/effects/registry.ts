import { arcaneEffect } from './definitions/arcane';
import { fireEffect } from './definitions/fire';
import { ghostEffect } from './definitions/ghost';
import type { EffectDefinition, EffectId } from './types';

export const EFFECT_DEFINITIONS: EffectDefinition[] = [fireEffect, arcaneEffect, ghostEffect];

const byId = new Map(EFFECT_DEFINITIONS.map((d) => [d.id, d]));

export function getEffectDefinition(id: EffectId): EffectDefinition | undefined {
  if (id === 'none') {
    return undefined;
  }
  return byId.get(id);
}

export function isRegistryAura(id: string): id is EffectDefinition['id'] {
  return byId.has(id as EffectDefinition['id']);
}
