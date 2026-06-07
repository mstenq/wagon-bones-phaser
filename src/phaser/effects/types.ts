import type * as Phaser from 'phaser';
import type { GameObjects } from 'phaser';

export const EFFECT_IDS = ['none', 'holy', 'fire', 'arcane', 'ghost'] as const;

export type EffectId = (typeof EFFECT_IDS)[number];

export type EffectHostKind = 'card' | 'die';

export type EffectFrameContext = {
  dt: number;
  time: number;
  width: number;
  height: number;
  hostKind: EffectHostKind;
  hovered: boolean;
  dragging: boolean;
  activated: boolean;
  pointerNormX: number;
  pointerNormY: number;
  phase: number;
};

export type EffectMountContext = {
  hostKind: EffectHostKind;
  width: number;
  height: number;
  padding: number;
};

export type EffectLayers = {
  back: GameObjects.Container;
  front: GameObjects.Container;
};

export type FilterableImage = GameObjects.Image & {
  filterCamera?: Phaser.Cameras.Scene2D.Camera;
  enableFilters?: () => void;
  filters?: {
    internal: {
      add: (filter: Phaser.Filters.Controller) => Phaser.Filters.Controller;
      addColorMatrix: () => { colorMatrix: Phaser.Display.ColorMatrix };
      addDisplacement: (texture: string, x?: number, y?: number) => { x: number; y: number };
      remove: (f: unknown) => void;
    };
  };
};

export type ArtFilterCleanup = () => void;

export type EffectArtTarget = {
  getImage: () => GameObjects.Image | null;
  applyArtFilters: (setup: ((img: FilterableImage) => ArtFilterCleanup) | null) => void;
};

export type EffectRuntime = {
  id: EffectId;
  step: (frame: EffectFrameContext) => void;
  destroy: () => void;
};

export type EffectDefinition = {
  id: Exclude<EffectId, 'none'>;
  label: string;
  create: (layers: EffectLayers, ctx: EffectMountContext, art: EffectArtTarget) => EffectRuntime;
};

/** Standard depth offsets within the host container */
export const EFFECT_LAYER_DEPTH = {
  back: -2,
  front: 2,
} as const;
