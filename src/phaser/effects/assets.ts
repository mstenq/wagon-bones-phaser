export const EFFECT_TEXTURE_KEYS = {
  ember: 'effect_ember',
  displacementHeat: 'effect_displacement_heat',
} as const;

export type EffectTextureKey = keyof typeof EFFECT_TEXTURE_KEYS;
