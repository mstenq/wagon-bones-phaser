// ─── ItemCard modifier and profession badges ───

import { GameObjects, Scene } from 'phaser';
import { UI } from '../../../game/Constants';
import type { EquipmentInstance } from '../../../game/ItemsSystem';
import { isEquipmentCursed, isEquipmentLeased, isEquipmentPerishable } from '../../../game/ItemsSystem';
import { getRunState } from '../../../game/store/runStore';
import { selectIsProfessionSpecialEquipment } from '../../../game/store/selectors/runSelectors';
import type { EquipmentModifier } from '../../../game/types';
import { addModifierBadgeImage, addProfessionSpecialBadgeImage } from '../ModifierAssets';
import type { CardData, ItemCardLayout } from './itemCardTypes';

export interface TopRightBadgeLayout {
  cardW: number;
  cardH: number;
  cardScale?: number;
}

/** Place a badge in the top-right corner stack (index 0 = innermost). */
export function addTopRightBadge(
  scene: Scene,
  card: GameObjects.Container,
  layout: TopRightBadgeLayout,
  stackIndex: number,
  render: (scene: Scene, container: GameObjects.Container, size: number) => void,
): GameObjects.Container {
  const scale = layout.cardScale ?? 1;
  const size = UI.MODIFIER_BADGE_SIZE * scale;
  const gap = UI.MODIFIER_BADGE_GAP * scale;
  const offset = UI.MODIFIER_BADGE_OFFSET * scale;
  const hw = layout.cardW / 2;
  const hh = layout.cardH / 2;
  const x = hw - offset - size / 2;
  const y = -hh + offset + size / 2 + stackIndex * (size + gap);

  const container = scene.add.container(x, y);
  render(scene, container, size);
  container.setDepth(25);
  card.add(container);
  card.bringToTop(container);
  return container;
}

export class ItemCardBadges {
  private readonly scene: Scene;
  private readonly card: GameObjects.Container;
  private readonly layout: ItemCardLayout;
  private readonly def: CardData;
  private modifierBadgeContainers: GameObjects.Container[] = [];
  private professionSpecialBadgeContainer: GameObjects.Container | null = null;
  perishableBadgeContainer: GameObjects.Container | null = null;
  leasedBadgeContainer: GameObjects.Container | null = null;

  constructor(scene: Scene, card: GameObjects.Container, layout: ItemCardLayout, def: CardData) {
    this.scene = scene;
    this.card = card;
    this.layout = layout;
    this.def = def;
  }

  clear(): void {
    for (const c of this.modifierBadgeContainers) c.destroy();
    this.modifierBadgeContainers = [];
    this.professionSpecialBadgeContainer?.destroy();
    this.professionSpecialBadgeContainer = null;
    this.perishableBadgeContainer = null;
    this.leasedBadgeContainer = null;
  }

  render(equipment: EquipmentInstance | null): void {
    this.clear();
    this.renderModifierBadges(equipment);
    this.renderProfessionSpecialBadge();
  }

  setVisible(visible: boolean): void {
    for (const c of this.modifierBadgeContainers) c.setVisible(visible);
    if (this.professionSpecialBadgeContainer) this.professionSpecialBadgeContainer.setVisible(visible);
    if (this.perishableBadgeContainer) this.perishableBadgeContainer.setVisible(visible);
    if (this.leasedBadgeContainer) this.leasedBadgeContainer.setVisible(visible);
  }

  flashPerishableWarning(): void {
    if (!this.perishableBadgeContainer || !this.scene) return;
    this.scene.tweens.add({
      targets: this.perishableBadgeContainer,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 120,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut',
    });
  }

  flashLeasedPaid(): void {
    if (!this.leasedBadgeContainer || !this.scene) return;
    this.scene.tweens.add({
      targets: this.leasedBadgeContainer,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 100,
      yoyo: true,
      repeat: 1,
      ease: 'Back.easeOut',
    });
  }

  destroy(): void {
    this.clear();
  }

  private renderModifierBadges(equipment: EquipmentInstance | null): void {
    if (!equipment || equipment.modifiers.length === 0) return;

    const kinds: EquipmentModifier[] = [];
    if (isEquipmentCursed(equipment)) kinds.push('cursed');
    if (isEquipmentPerishable(equipment)) kinds.push('perishable');
    if (isEquipmentLeased(equipment)) kinds.push('leased');

    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i];
      const container = addTopRightBadge(this.scene, this.card, this.layout, i, (scene, badge, size) => {
        addModifierBadgeImage(scene, badge, kind, size);
      });
      this.modifierBadgeContainers.push(container);

      if (kind === 'perishable') this.perishableBadgeContainer = container;
      if (kind === 'leased') this.leasedBadgeContainer = container;
    }
  }

  private renderProfessionSpecialBadge(): void {
    if (!selectIsProfessionSpecialEquipment(getRunState(), this.def.id)) return;

    const scale = this.layout.cardScale;
    const size = UI.MODIFIER_BADGE_SIZE * scale;
    const offset = UI.MODIFIER_BADGE_OFFSET * scale;
    const hw = this.layout.cardW / 2;
    const hh = this.layout.cardH / 2;
    const x = -hw + offset + size / 2;
    const y = hh - offset - size / 2;

    const container = this.scene.add.container(x, y);
    addProfessionSpecialBadgeImage(this.scene, container, size);
    container.setDepth(25);
    this.card.add(container);
    this.card.bringToTop(container);
    this.professionSpecialBadgeContainer = container;
  }
}
