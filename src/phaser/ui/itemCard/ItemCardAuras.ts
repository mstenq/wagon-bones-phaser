// ─── ItemCard aura VFX ───

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import type { ItemAura } from '../../../game/ItemsSystem';
import { applyAuraGlow, createAuraParticles } from '../AuraFX';
import type { ItemCardLayout } from './itemCardTypes';

export class ItemCardAuras {
  private readonly scene: Scene;
  private readonly card: GameObjects.Container;
  private readonly layout: ItemCardLayout;
  private getCardBg: () => GameObjects.Graphics;
  private getCardImage: () => GameObjects.Image | null;
  private auraEmitters: GameObjects.Particles.ParticleEmitter[] = [];
  private auraTweens: Phaser.Tweens.Tween[] = [];
  private auraGlowCleanup: (() => void) | null = null;
  private ghostTintOverlay: GameObjects.Graphics | null = null;
  private auraImageFilterCleanup: (() => void) | null = null;
  private auraSuppressed = false;

  constructor(
    scene: Scene,
    card: GameObjects.Container,
    layout: ItemCardLayout,
    getCardBg: () => GameObjects.Graphics,
    getCardImage: () => GameObjects.Image | null,
  ) {
    this.scene = scene;
    this.card = card;
    this.layout = layout;
    this.getCardBg = getCardBg;
    this.getCardImage = getCardImage;
  }

  setup(aura: ItemAura | null | undefined): void {
    if (!aura) return;

    const hw = this.layout.cardW / 2;
    const hh = this.layout.cardH / 2;
    const cardBg = this.getCardBg();

    const glowResult = applyAuraGlow(
      this.scene,
      cardBg as GameObjects.GameObject & { enableFilters?: () => void; filters?: unknown },
      aura.id,
      {
        strength: 8,
        pulseMin: 0.3,
        pulseMax: 1,
      },
    );
    this.auraTweens.push(...glowResult.tweens);
    this.auraGlowCleanup = glowResult.destroy;

    if (aura.id === 'ghost') {
      this.card.setAlpha(0.8);
      const cardImage = this.getCardImage();
      if (cardImage) {
        const img = cardImage as GameObjects.Image & {
          enableFilters?: () => void;
          filters?: {
            internal: { addColorMatrix: () => { colorMatrix: { negative: () => void } } };
            remove: (f: unknown) => void;
          };
        };
        if (img.enableFilters) {
          img.enableFilters();
          const cm = img.filters!.internal.addColorMatrix();
          cm.colorMatrix.negative();
          this.auraImageFilterCleanup = () => {
            if (img.filters) img.filters.internal.remove(cm);
          };
        }
      }
      const tintOverlay = this.scene.add.graphics();
      tintOverlay.fillStyle(0x44dd88, 0.3);
      tintOverlay.fillRoundedRect(-hw, -hh, this.layout.cardW, this.layout.cardH, 8);
      this.ghostTintOverlay = tintOverlay;
      this.card.add(tintOverlay);
    }

    const particleResult = createAuraParticles(this.scene, aura.id, hw, hh);
    for (const em of particleResult.emitters) {
      this.card.add(em);
    }
    this.auraEmitters.push(...particleResult.emitters);
    this.auraTweens.push(...particleResult.tweens);
  }

  syncFromEquipment(aura: ItemAura | null | undefined, prevAuraId: string): void {
    const nextAuraId = aura?.id ?? '';
    if (prevAuraId === nextAuraId) return;
    this.clear();
    if (aura) this.setup(aura);
  }

  setSuppressed(suppressed: boolean, aura: ItemAura | null | undefined): void {
    if (this.auraSuppressed === suppressed) return;
    this.auraSuppressed = suppressed;
    if (suppressed) {
      this.clear();
      return;
    }
    if (aura) this.setup(aura);
  }

  clear(): void {
    for (const tw of this.auraTweens) tw.destroy();
    this.auraTweens = [];
    for (const em of this.auraEmitters) em.destroy();
    this.auraEmitters = [];
    if (this.auraGlowCleanup) {
      this.auraGlowCleanup();
      this.auraGlowCleanup = null;
    }
    if (this.ghostTintOverlay) {
      this.ghostTintOverlay.destroy();
      this.ghostTintOverlay = null;
    }
    if (this.auraImageFilterCleanup) {
      this.auraImageFilterCleanup();
      this.auraImageFilterCleanup = null;
    }
    const cardImage = this.getCardImage();
    if (cardImage) {
      cardImage.setAlpha(1);
    }
    this.card.setAlpha(1);
  }

  destroy(): void {
    this.clear();
  }
}
