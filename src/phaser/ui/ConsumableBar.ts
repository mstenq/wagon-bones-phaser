// ─── ConsumableBar ───
// Right-side bar showing consumable cards (supply cards, trail guides, frontier encounters).
// Extends CardBar with USE action and consumable-specific card creation.

import { Scene } from 'phaser';
import { UI } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { ItemCard, CardActionTabConfig } from './ItemCard';
import { CardBar } from './CardBar';
import { ConsumableDef, getConsumableTexturePrefix, isSecondHelpingsCloneTarget } from '../../game/ConsumablesSystem';

export class ConsumableBar extends CardBar {
  protected readonly cardScale = UI.CONSUMABLE_CARD_SCALE;
  protected readonly preferredSpacing = UI.CONSUMABLE_CARD_SPACING;
  protected readonly barPadding = 16;
  private canUsePredicate: ((def: ConsumableDef) => boolean) | null = null;

  constructor(scene: Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y, width, height);
    this.refresh();
  }

  setCanUsePredicate(predicate: ((def: ConsumableDef) => boolean) | null): void {
    this.canUsePredicate = predicate;
    this.refresh();
  }

  // ─── CardBar abstract implementations ───

  protected getSlotLabel(): string {
    const player = getPlayerState();
    return `${player.consumables.length}/${player.maxConsumableSlots}`;
  }

  protected getItemCount(): number {
    return getPlayerState().consumables.length;
  }

  protected createCardForItem(x: number, y: number, index: number): ItemCard {
    const consumable = getPlayerState().consumables[index];
    const texturePrefix = getConsumableTexturePrefix(consumable.def.category);
    const card = new ItemCard(
      this.scene,
      x,
      y,
      {
        ...consumable.def,
        display: () => ({
          hint: [],
          tooltip: [[{ text: consumable.def.description, style: 'text' }]],
        }),
      },
      {
        mode: 'compact',
        cardScale: UI.CONSUMABLE_CARD_SCALE,
        texturePrefix,
      },
    );
    card.setTooltipContext(null, getPlayerState());
    return card;
  }

  protected buildActionTabs(card: ItemCard, index: number): CardActionTabConfig[] | null {
    const player = getPlayerState();
    const consumable = player.consumables[index];
    if (!consumable) return null;

    const tabs: CardActionTabConfig[] = [];

    // Block USE for second_helpings when there's no valid target to clone
    const canUse = consumable.def.id !== 'second_helpings' || isSecondHelpingsCloneTarget(player.lastUsedConsumable);
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
    getPlayerState().reorderConsumable(fromIndex, toIndex);
  }

  protected onSellComplete(index: number): void {
    getPlayerState().sellConsumable(index);
    this.emit('consumable-changed');
  }

  // ─── Consumable-specific: USE action ───

  private onUseConsumable(card: ItemCard, consumableIndex: number): void {
    const player = getPlayerState();
    const consumed = player.useConsumable(consumableIndex);
    if (!consumed) return;

    this.beginCardRemoval(card);
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
        this.refresh();
        this.emit('consumable-used', consumed);
      },
    });
  }
}
