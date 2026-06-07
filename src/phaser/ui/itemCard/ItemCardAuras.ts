// ─── ItemCard aura VFX ───

import { GameObjects, Scene } from 'phaser';
import type { ItemAura } from '../../../game/ItemsSystem';
import { AuraEffectHost } from '../../effects/AuraEffectHost';
import { effectPhaseFromSeed } from '../../effects/context';
import { isRegistryAura } from '../../effects/registry';
import { setupLegacyCardAura, type LegacyAuraHandle } from '../AuraFX';
import type { ItemCardLayout } from './itemCardTypes';

export class ItemCardAuras {
  private readonly scene: Scene;
  private readonly card: GameObjects.Container;
  private readonly layout: ItemCardLayout;
  private getCardBg: () => GameObjects.Graphics;
  private getCardImage: () => GameObjects.Image | null;
  private effectHost: AuraEffectHost | null = null;
  private legacyAura: LegacyAuraHandle | null = null;
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

    if (isRegistryAura(aura.id)) {
      this.effectHost = new AuraEffectHost({
        scene: this.scene,
        parent: this.card,
        effectId: aura.id,
        hostKind: 'card',
        width: this.layout.cardW,
        height: this.layout.cardH,
        phase: effectPhaseFromSeed(aura.id + (this.getCardImage()?.name ?? '')),
        getArtImage: () => this.getCardImage(),
      });
      this.effectHost.bindPointer(this.card);
      return;
    }

    const hw = this.layout.cardW / 2;
    const hh = this.layout.cardH / 2;
    this.legacyAura = setupLegacyCardAura(
      this.scene,
      this.card,
      aura.id,
      hw,
      hh,
      this.getCardBg() as GameObjects.GameObject & { enableFilters?: () => void; filters?: unknown },
    );
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
    if (this.effectHost) {
      this.effectHost.destroy();
      this.effectHost = null;
    }
    if (this.legacyAura) {
      this.legacyAura.destroy();
      this.legacyAura = null;
    }
  }

  destroy(): void {
    this.clear();
  }
}
