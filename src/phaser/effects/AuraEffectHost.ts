import * as Phaser from 'phaser';
import type { GameObjects, Scene } from 'phaser';
import { registerAuraEffectHost } from './AuraEffectUpdateBus';
import { CARD_EFFECT_PADDING, DIE_EFFECT_PADDING, createDefaultEffectFrame } from './context';
import { createEffectArtTarget } from './effectHelpers';
import { createEffectRuntime, destroyEffect } from './runtime';
import type {
  EffectArtTarget,
  EffectFrameContext,
  EffectHostKind,
  EffectId,
  EffectLayers,
  EffectMountContext,
  EffectRuntime,
} from './types';
import { EFFECT_LAYER_DEPTH } from './types';

export type AuraEffectHostOptions = {
  scene: Scene;
  parent: GameObjects.Container;
  effectId: EffectId;
  hostKind: EffectHostKind;
  width: number;
  height: number;
  padding?: number;
  phase?: number;
  getArtImage: () => GameObjects.Image | null;
};

export class AuraEffectHost {
  private readonly scene: Scene;
  private readonly parent: GameObjects.Container;
  private readonly mount: EffectMountContext;
  private readonly art: EffectArtTarget;
  private readonly layers: EffectLayers;
  private readonly frame: EffectFrameContext;
  private runtime: EffectRuntime | null = null;
  private unregisterBus: (() => void) | null = null;
  private unbindPointer: (() => void) | null = null;
  private effectId: EffectId;

  constructor(options: AuraEffectHostOptions) {
    this.scene = options.scene;
    this.parent = options.parent;
    this.effectId = options.effectId;

    const padding = options.padding ?? (options.hostKind === 'die' ? DIE_EFFECT_PADDING : CARD_EFFECT_PADDING);

    this.mount = {
      hostKind: options.hostKind,
      width: options.width,
      height: options.height,
      padding,
    };

    this.frame = createDefaultEffectFrame(options.hostKind, options.width, options.height, options.phase ?? 0);

    this.layers = {
      back: this.scene.add.container(0, 0),
      front: this.scene.add.container(0, 0),
    };
    this.layers.back.setDepth(EFFECT_LAYER_DEPTH.back);
    this.layers.front.setDepth(EFFECT_LAYER_DEPTH.front);

    this.insertLayersAroundArt(options.getArtImage());

    this.art = createEffectArtTarget(options.getArtImage);
    this.attachRuntime(options.effectId);
  }

  private insertLayersAroundArt(artImage: GameObjects.Image | null): void {
    if (artImage && this.parent.getIndex(artImage) >= 0) {
      const artIndex = this.parent.getIndex(artImage);
      this.parent.addAt(this.layers.back, artIndex);
      this.parent.addAt(this.layers.front, artIndex + 2);
      return;
    }
    this.parent.add(this.layers.back);
    this.parent.add(this.layers.front);
  }

  private attachRuntime(effectId: EffectId): void {
    this.detachRuntime();
    this.effectId = effectId;
    if (effectId === 'none') {
      return;
    }
    this.runtime = createEffectRuntime(effectId, this.layers, this.mount, this.art);
    if (!this.runtime) {
      return;
    }
    this.unregisterBus = registerAuraEffectHost(this.scene, this.runtime, () => this.frame);
  }

  /** Wire hover + pointer position into the shared frame. Call once after construction. */
  bindPointer(target: GameObjects.Container): void {
    this.unbindPointer?.();

    const onOver = () => {
      this.setFrame({ hovered: true });
    };
    const onOut = () => {
      this.setFrame({ hovered: false, pointerNormX: 0.5, pointerNormY: 0.5 });
    };
    const onMove = (pointer: Phaser.Input.Pointer) => {
      // Cards and dice draw center-anchored at (0,0); norm 0.5 = center (matches Pixi ARCANE/FIRE hosts).
      const local = target.getLocalPoint(pointer.worldX, pointer.worldY);
      const normX = local.x / this.mount.width + 0.5;
      const normY = local.y / this.mount.height + 0.5;
      this.setFrame({
        pointerNormX: Phaser.Math.Clamp(normX, 0, 1),
        pointerNormY: Phaser.Math.Clamp(normY, 0, 1),
      });
    };

    target.on('pointerover', onOver);
    target.on('pointerout', onOut);
    target.on('pointermove', onMove);
    this.unbindPointer = () => {
      target.off('pointerover', onOver);
      target.off('pointerout', onOut);
      target.off('pointermove', onMove);
    };
  }

  setEffect(effectId: EffectId): void {
    if (effectId === this.effectId) {
      return;
    }
    this.attachRuntime(effectId);
  }

  setFrame(partial: Partial<EffectFrameContext>): void {
    Object.assign(this.frame, partial);
  }

  getFrame(): EffectFrameContext {
    return this.frame;
  }

  private detachRuntime(): void {
    if (this.unregisterBus) {
      this.unregisterBus();
      this.unregisterBus = null;
    }
    if (this.runtime) {
      destroyEffect(this.runtime);
      this.runtime = null;
    }
    this.art.applyArtFilters(null);
  }

  destroy(): void {
    this.unbindPointer?.();
    this.unbindPointer = null;
    this.detachRuntime();
    this.layers.back.destroy(true);
    this.layers.front.destroy(true);
  }
}
