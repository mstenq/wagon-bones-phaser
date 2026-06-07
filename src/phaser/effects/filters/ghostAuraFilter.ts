import * as Phaser from 'phaser';
import type { FilterableImage } from '../types';

export const GHOST_AURA_FILTER_NODE = 'FilterGhostAura';

/** Spectral green tint — rgb(0, 255, 208) ≈ #00ffd0 */
const GHOST_TINT_COLOR = new Float32Array([0, 1, 208 / 255, 1]);

const GHOST_AURA_FRAGMENT = [
  '#pragma phaserTemplate(shaderName)',
  'precision mediump float;',
  'uniform sampler2D uMainSampler;',
  'varying vec2 outTexCoord;',
  'uniform float uInvertAmount;',
  'uniform float uTintAmount;',
  'uniform float uSaturation;',
  'uniform float uBrightness;',
  'uniform float uPulse;',
  'uniform vec4 uTintColor;',
  'void main ()',
  '{',
  '    vec4 src = texture2D(uMainSampler, outTexCoord);',
  '    vec3 rgb = mix(src.rgb, vec3(1.0) - src.rgb, uInvertAmount);',
  '    float luma = dot(rgb, vec3(0.299, 0.587, 0.114));',
  '    vec3 gray = vec3(luma);',
  '    vec3 saturated = mix(gray, rgb, uSaturation);',
  '    vec3 tinted = mix(saturated, saturated * uTintColor.rgb * 1.15, uTintAmount);',
  '    tinted += uTintColor.rgb * 0.06 * uTintAmount;',
  '    float breathe = 1.0 + uPulse * 0.08;',
  '    vec3 outRgb = tinted * uBrightness * breathe;',
  '    float alpha = src.a;',
  '    gl_FragColor = vec4(outRgb * alpha, alpha);',
  '}',
].join('\n');

export type GhostAuraUniforms = {
  invertAmount: number;
  tintAmount: number;
  saturation: number;
  brightness: number;
  pulse: number;
};

export class GhostAuraController extends Phaser.Filters.Controller {
  invertAmount = 1;
  tintAmount = 0.72;
  saturation = 0.35;
  brightness = 1.02;
  pulse = 0;
  readonly tintColor = GHOST_TINT_COLOR;

  constructor(camera: Phaser.Cameras.Scene2D.Camera) {
    super(camera, GHOST_AURA_FILTER_NODE);
    this.setPaddingOverride(2, 2, 2, 2);
  }

  setUniforms(values: GhostAuraUniforms): void {
    this.invertAmount = values.invertAmount;
    this.tintAmount = values.tintAmount;
    this.saturation = values.saturation;
    this.brightness = values.brightness;
    this.pulse = values.pulse;
  }
}

class FilterGhostAura extends Phaser.Renderer.WebGL.RenderNodes.BaseFilterShader {
  constructor(manager: Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager) {
    super(GHOST_AURA_FILTER_NODE, manager, undefined, GHOST_AURA_FRAGMENT);
  }

  setupUniforms(controller: GhostAuraController): void {
    const programManager = this.programManager;
    programManager.setUniform('uInvertAmount', controller.invertAmount);
    programManager.setUniform('uTintAmount', controller.tintAmount);
    programManager.setUniform('uSaturation', controller.saturation);
    programManager.setUniform('uBrightness', controller.brightness);
    programManager.setUniform('uPulse', controller.pulse);
    programManager.setUniform('uTintColor', controller.tintColor);
  }
}

export function ensureGhostAuraFilterRegistered(game: Phaser.Game): void {
  const renderer = game.renderer;
  if (!('renderNodes' in renderer)) {
    return;
  }
  const renderNodes = renderer.renderNodes as Phaser.Renderer.WebGL.RenderNodes.RenderNodeManager;
  if (!renderNodes.hasNode(GHOST_AURA_FILTER_NODE)) {
    renderNodes.addNodeConstructor(GHOST_AURA_FILTER_NODE, FilterGhostAura);
  }
}

export type GhostArtFilterState = {
  controller: GhostAuraController;
  setUniforms: (values: GhostAuraUniforms) => void;
};

export function createGhostArtFilter(img: FilterableImage): GhostArtFilterState | null {
  ensureGhostAuraFilterRegistered(img.scene.game);
  img.enableFilters?.();
  const filterCamera = img.filterCamera;
  if (!filterCamera || !img.filters) {
    return null;
  }

  const controller = img.filters.internal.add(new GhostAuraController(filterCamera)) as GhostAuraController;
  return {
    controller,
    setUniforms(values) {
      controller.setUniforms(values);
    },
  };
}
