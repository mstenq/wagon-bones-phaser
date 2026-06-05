// ─── ConsumableBar ───
// Right-side bar showing consumable cards (supply cards, trail guides, frontier encounters).
// Extends CardBar with USE action and consumable-specific card creation.

import { Scene } from 'phaser';
import { UI } from '../../game/Constants';
import { getItemDisplayContext } from '../../game/displayContext';
import { ConsumableDef, getConsumableAtlasKey } from '../../game/ConsumablesSystem';
import { consumableActions } from '../../game/store/actions/consumableActions';
import { resolveConsumableList } from '../../game/store/resolve';
import { runStore } from '../../game/store/runStore';
import {
  selectCanUseSecondHelpings,
  selectConsumableBarSlotLabel,
  selectConsumableBarSnapshot,
} from '../../game/store/selectors/uiSelectors';
import { ItemCard, CardActionTabConfig } from './ItemCard';
import { CardBar } from './CardBar';
import { bindGameObject } from '../store/subscribe';

export class ConsumableBar extends CardBar {
  protected readonly cardScale = UI.CONSUMABLE_CARD_SCALE;
  protected readonly preferredSpacing = UI.CONSUMABLE_CARD_SPACING;
  protected readonly barPadding = 16;
  private canUsePredicate: ((def: ConsumableDef) => boolean) | null = null;
  private slotLabel = '';
  private canUseSecondHelpings = false;
  /** Skip store-driven rebuild while a use animation is playing (store already updated). */
  private suppressStoreRebuild = false;

  constructor(scene: Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y, width, height);

    bindGameObject(this, runStore, selectConsumableBarSnapshot, () => this.onStoreConsumablesChanged(), {
      equalityFn: (a, b) => a === b,
    });
    bindGameObject(this, runStore, selectConsumableBarSlotLabel, (label) => {
      this.slotLabel = label;
      this.slotCountText.setText(label);
    });
    bindGameObject(this, runStore, selectCanUseSecondHelpings, (canUse) => {
      this.canUseSecondHelpings = canUse;
      this.onStoreConsumablesChanged();
    });
  }

  private onStoreConsumablesChanged(): void {
    if (this.suppressStoreRebuild || this.isDragSettling()) return;
    if (!this.tryRefreshCardsInPlace()) {
      this.rebuildCards();
    }
  }

  /** Keep existing cards when only order/content matches slots (preserves drag settle tweens). */
  private tryRefreshCardsInPlace(): boolean {
    const consumables = resolveConsumableList();
    const count = this.getItemCount();
    if (this.cards.length !== count) return false;
    for (let i = 0; i < count; i++) {
      const card = this.cards[i];
      const consumable = consumables[i];
      if (!card || !consumable) return false;
      if (card.def.id !== consumable.def.id) return false;
    }
    return true;
  }

  setCanUsePredicate(predicate: ((def: ConsumableDef) => boolean) | null): void {
    this.canUsePredicate = predicate;
    this.rebuildCards();
  }

  protected getSlotLabel(): string {
    return this.slotLabel || selectConsumableBarSlotLabel();
  }

  protected getItemCount(): number {
    return resolveConsumableList().length;
  }

  protected createCardForItem(x: number, y: number, index: number): ItemCard {
    const consumable = resolveConsumableList()[index]!;
    const textureKey = getConsumableAtlasKey(consumable.def.category);
    const card = new ItemCard(this.scene, x, y, consumable.def, {
      mode: 'compact',
      cardScale: UI.CONSUMABLE_CARD_SCALE,
      textureKey,
    });
    card.setTooltipContext(null, getItemDisplayContext());
    return card;
  }

  protected buildActionTabs(card: ItemCard, index: number): CardActionTabConfig[] | null {
    const consumable = resolveConsumableList()[index];
    if (!consumable) return null;

    const tabs: CardActionTabConfig[] = [];

    const canUse = consumable.def.id !== 'second_helpings' || this.canUseSecondHelpings;
    const canUseInScene = this.canUsePredicate ? this.canUsePredicate(consumable.def) : true;

    if (canUse && canUseInScene) {
      tabs.push({
        label: 'USE',
        color: 0x2255aa,
        callback: () => this.onUseConsumable(card, index),
      });
    }

    tabs.push({
      label: `SELL\n$${consumable.sellValue}`,
      color: 0x338833,
      callback: () => this.animateSellCard(card, index),
    });

    return tabs;
  }

  protected onReorder(fromIndex: number, toIndex: number): void {
    consumableActions.reorderConsumable(fromIndex, toIndex);
  }

  protected onSellComplete(index: number): void {
    consumableActions.sellConsumable(index);
    this.emit('consumable-changed');
  }

  private onUseConsumable(card: ItemCard, consumableIndex: number): void {
    this.suppressStoreRebuild = true;
    this.beginCardRemoval(card);

    const consumed = consumableActions.useConsumable(consumableIndex);
    if (!consumed) {
      this.suppressStoreRebuild = false;
      return;
    }

    this.scene.sound.play('sfx_card_fan', { volume: 0.5 });

    this.scene.tweens.add({
      targets: card,
      y: card.y - 80,
      scaleX: 0.2,
      scaleY: 0.2,
      alpha: 0,
      duration: 350,
      ease: 'Power2',
      onComplete: () => {
        this.suppressStoreRebuild = false;
        card.destroy();
        this.emit('consumable-used', consumed);
        this.rebuildCards();
      },
    });
  }
}
