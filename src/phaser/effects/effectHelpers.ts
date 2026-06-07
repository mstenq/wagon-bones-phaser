import * as Phaser from 'phaser';
import type { GameObjects } from 'phaser';
import type {
  ArtFilterCleanup,
  EffectArtTarget,
  EffectDefinition,
  EffectFrameContext,
  EffectMountContext,
  EffectRuntime,
  FilterableImage,
} from './types';
import { effectRadius, isDieMount } from './dieTuning';
import { effectVisualBounds, borderBoundsFromSize, type BorderBounds } from './shared/borderFrame';

export { effectRadius };

export function boundsFromCtx(ctx: EffectMountContext): BorderBounds {
  return effectVisualBounds(ctx);
}

export function artBoundsFromMount(mount: EffectMountContext, cornerRadius?: number): BorderBounds {
  return borderBoundsFromSize(mount.width, mount.height, cornerRadius);
}

export function backdropBounds(mount: EffectMountContext): BorderBounds {
  return isDieMount(mount) ? effectVisualBounds(mount) : artBoundsFromMount(mount);
}

export function makeRuntime(
  id: EffectDefinition['id'],
  step: (frame: EffectFrameContext) => void,
  destroy: () => void,
): EffectRuntime {
  return { id, step, destroy };
}

export function addGlowLayer(parent: GameObjects.Container, depth = 0): GameObjects.Graphics {
  const g = parent.scene.add.graphics();
  g.setBlendMode(Phaser.BlendModes.ADD);
  g.setDepth(depth);
  parent.add(g);
  return g;
}

export function addSpriteLayer(
  parent: GameObjects.Container,
  textureKey: string | null,
  depth = 1,
): GameObjects.Image | null {
  if (!textureKey || !parent.scene.textures.exists(textureKey)) {
    return null;
  }
  const s = parent.scene.add.image(0, 0, textureKey).setOrigin(0.5);
  s.setBlendMode(Phaser.BlendModes.ADD);
  s.setDepth(depth);
  parent.add(s);
  return s;
}

export function applyArtFilters(
  art: EffectArtTarget,
  setup: ((img: FilterableImage) => ArtFilterCleanup) | null,
): void {
  art.applyArtFilters(setup);
}

export function noopDestroy(...disposers: (() => void)[]): () => void {
  return () => {
    for (const d of disposers) {
      d();
    }
  };
}

export function createEffectArtTarget(getImage: () => GameObjects.Image | null): EffectArtTarget {
  let cleanup: ArtFilterCleanup | null = null;

  return {
    getImage,
    applyArtFilters(setup) {
      if (cleanup) {
        cleanup();
        cleanup = null;
      }
      if (!setup) {
        return;
      }
      const img = getImage();
      if (!img) {
        return;
      }
      cleanup = setup(img as FilterableImage);
    },
  };
}
