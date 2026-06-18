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
  private pointerTarget: GameObjects.Container | null = null;
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
    this.unregisterBus = registerAuraEffectHost(this.scene, this.runtime, () => {
      this.refreshPointerHover();
      return this.frame;
    });
  }

  /** Wire hover + pointer position into the shared frame. Call once after construction. */
  bindPointer(target: GameObjects.Container): void {
    this.unbindPointer?.();
    this.pointerTarget = target;

    const onOver = (pointer: Phaser.Input.Pointer) => {
      this.syncPointer(pointer);
    };
    const onOut = () => {
      this.clearPointerHover();
    };
    const onMove = (pointer: Phaser.Input.Pointer) => {
      if (!this.frame.hovered) {
        return;
      }
      this.syncPointer(pointer);
    };
    const onSceneMove = (pointer: Phaser.Input.Pointer) => {
      if (!this.frame.hovered) {
        return;
      }
      this.syncPointer(pointer);
    };

    target.on('pointerover', onOver);
    target.on('pointerout', onOut);
    target.on('pointermove', onMove);
    this.scene.input.on('pointermove', onSceneMove);
    this.unbindPointer = () => {
      target.off('pointerover', onOver);
      target.off('pointerout', onOut);
      target.off('pointermove', onMove);
      this.scene.input.off('pointermove', onSceneMove);
      this.pointerTarget = null;
    };
  }

  /** Re-check pointer each tick so strikes stay aligned after layout moves without a pointermove. */
  private refreshPointerHover(): void {
    if (!this.frame.hovered || !this.pointerTarget) {
      return;
    }
    this.syncPointer(this.scene.input.activePointer);
  }

  private clearPointerHover(): void {
    this.setFrame({ hovered: false, pointerNormX: 0.5, pointerNormY: 0.5 });
  }

  private isPointerInside(target: GameObjects.Container, pointer: Phaser.Input.Pointer): boolean {
    if (!target.active || !target.scene) {
      return false;
    }
    const bounds = target.getBounds();
    return bounds.contains(pointer.worldX, pointer.worldY);
  }

  private syncPointer(pointer: Phaser.Input.Pointer): void {
    const target = this.pointerTarget;
    if (!target) {
      return;
    }
    if (!target.active || !target.scene) {
      this.clearPointerHover();
      return;
    }
    if (!this.isPointerInside(target, pointer)) {
      this.clearPointerHover();
      return;
    }

    // Cards and dice draw center-anchored at (0,0); norm 0.5 = center (matches Pixi ARCANE/FIRE hosts).
    const local = target.getLocalPoint(pointer.worldX, pointer.worldY);
    if (!Number.isFinite(local.x) || !Number.isFinite(local.y) || this.mount.width <= 0 || this.mount.height <= 0) {
      this.clearPointerHover();
      return;
    }

    const normX = local.x / this.mount.width + 0.5;
    const normY = local.y / this.mount.height + 0.5;
    this.setFrame({
      hovered: true,
      pointerNormX: Phaser.Math.Clamp(normX, 0, 1),
      pointerNormY: Phaser.Math.Clamp(normY, 0, 1),
    });
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
