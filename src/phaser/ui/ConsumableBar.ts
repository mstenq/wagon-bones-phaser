// ─── ConsumableBar ───
// Right-side bar showing consumable cards (supply cards, trail guides, frontier encounters).
// Extends CardBar with USE action and consumable-specific card creation.

import { Scene } from 'phaser';
import { getItemDisplayContext } from '../../game/displayContext';
import { type ConsumableDef, type ConsumableInstance, getConsumableAtlasKey } from '../../game/ConsumablesSystem';
import { consumableActions } from '../../game/store/actions/consumableActions';
import { resolveConsumableList } from '../../game/store/resolve';
import { runStore } from '../../game/store/runStore';
import {
  selectCanUseSecondHelpings,
  selectConsumableBarSlotLabel,
  selectConsumableBarSnapshot,
} from '../../game/store/selectors/uiSelectors';
import { UI } from '../../game/Constants';
import { ItemCard, CardActionTabConfig } from './ItemCard';
import { CardBar } from './CardBar';
import { computeCompactCardSpacing, type CardBarMetrics } from './SceneLayout';
import { bindGameObject } from '../store/subscribe';

export type ConsumableTargetingRequest = {
  index: number;
  instance: ConsumableInstance;
};

export type ConsumableTargetingCommitRequest = {
  index: number;
  instance: ConsumableInstance;
  bumpDirection?: 'up' | 'down';
};

export type ConsumableBarTargetingState = {
  activeIndex: number | null;
  ready: boolean;
  diceReady: boolean;
  needsBumpDirection: boolean;
};

export class ConsumableBar extends CardBar {
  private canUsePredicate: ((def: ConsumableDef) => boolean) | null = null;
  private targetingStateProvider: (() => ConsumableBarTargetingState) | null = null;
  private slotLabel = '';
  private canUseSecondHelpings = false;
  /** Skip store-driven rebuild while a use animation is playing (store already updated). */
  private suppressStoreRebuild = false;
  /** Block spurious tab dismiss on the same pointer gesture as USE (card tap-up race). */
  private suppressTabDismissCancel = false;

  constructor(scene: Scene, x: number, y: number, width: number, height: number, cardLayout: CardBarMetrics) {
    super(scene, x, y, width, height, cardLayout);

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
    if (this.suppressStoreRebuild) return;
    if (this.isCardInteractionBusy()) {
      this.rebuildCards();
      return;
    }
    this.syncCardsFromStore();
  }

  protected syncCardsFromStore(): void {
    if (!this.tryRefreshCardsInPlace()) {
      this.rebuildCardsNow();
      return;
    }
    this.syncConsumablesInPlace();
  }

  /** Update tooltips and action tabs without destroying cards (preserves drag settle tweens). */
  private syncConsumablesInPlace(): void {
    const player = getItemDisplayContext();
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (!card?.scene) continue;
      card.setTooltipContext(null, player);
      card.refreshTooltipIfVisible();
      this.refreshOpenActionTabs(card, i);
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

  setTargetingStateProvider(provider: (() => ConsumableBarTargetingState) | null): void {
    this.targetingStateProvider = provider;
    this.rebuildCards();
  }

  /** Rebuild action tabs when scene eligibility changes (e.g. ROLL phase unlocks medicine). */
  refreshUseEligibility(): void {
    if (this.suppressStoreRebuild) return;
    const targetingState = this.targetingStateProvider?.() ?? null;
    if (targetingState?.activeIndex != null) {
      this.refreshTargetingTabs(targetingState.activeIndex);
      return;
    }
    this.rebuildCards();
  }

  refreshTargetingTabs(index: number): void {
    const card = this.cards[index];
    if (!card) return;
    const targetingState = this.targetingStateProvider?.() ?? null;
    const instant = targetingState?.activeIndex === index;
    this.ensureActionTabsOpen(card, index, instant);
  }

  protected shouldSuppressTabDismiss(): boolean {
    return this.suppressTabDismissCancel;
  }

  getCardAt(index: number): ItemCard | undefined {
    return this.cards[index];
  }

  /** Consumables fan/overlap in a narrow bar; compress further only when slots exceed width. */
  protected getCardSpacing(count: number): number {
    if (count <= 1) return 0;
    const cardW = UI.CARD_W * this.cardScale;
    const availableW = this.barWidth - this.barPadding * 2 - cardW;
    const compactSpacing = computeCompactCardSpacing(cardW);
    const neededW = (count - 1) * compactSpacing;
    if (neededW <= availableW) return compactSpacing;
    return availableW / (count - 1);
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
      cardScale: this.cardScale,
      textureKey,
    });
    card.setTooltipContext(null, getItemDisplayContext());
    return card;
  }

  protected buildActionTabs(card: ItemCard, index: number): CardActionTabConfig[] | null {
    const consumable = resolveConsumableList()[index];
    if (!consumable) return null;

    const tabs: CardActionTabConfig[] = [];
    const targetingState = this.targetingStateProvider?.() ?? null;
    const isArmed = targetingState?.activeIndex === index;

    if (isArmed) {
      if (targetingState.needsBumpDirection) {
        tabs.push({
          label: '-1\nDOWN',
          color: targetingState.diceReady ? 0x883333 : 0x555555,
          textColor: targetingState.diceReady ? '#ffffff' : '#bbbbbb',
          disabled: !targetingState.diceReady,
          callback: () => this.onCommitTargeting(consumable, index, 'down'),
        });
        tabs.push({
          label: '+1\nUP',
          color: targetingState.diceReady ? 0x338833 : 0x555555,
          textColor: targetingState.diceReady ? '#ffffff' : '#bbbbbb',
          disabled: !targetingState.diceReady,
          callback: () => this.onCommitTargeting(consumable, index, 'up'),
        });
        return tabs;
      }

      tabs.push({
        label: 'USE',
        color: targetingState.ready ? 0x2255aa : 0x555555,
        textColor: targetingState.ready ? '#ffffff' : '#bbbbbb',
        disabled: !targetingState.ready,
        callback: () => this.onCommitTargeting(consumable, index),
      });
      return tabs;
    }

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

  protected onActionTabsDismissed(card: ItemCard, index: number): void {
    const targetingState = this.targetingStateProvider?.() ?? null;
    if (targetingState?.activeIndex !== index) return;

    if (this.suppressTabDismissCancel) {
      this.scene.time.delayedCall(0, () => {
        const state = this.targetingStateProvider?.() ?? null;
        if (state?.activeIndex === index) {
          this.ensureActionTabsOpen(card, index, true);
        }
      });
      return;
    }

    this.emit('consumable-cancel-targeting', { index });
  }

  private onUseConsumable(card: ItemCard, consumableIndex: number): void {
    const consumable = resolveConsumableList()[consumableIndex];
    if (!consumable) return;

    const targetingState = this.targetingStateProvider?.() ?? null;
    if (targetingState?.activeIndex === consumableIndex) {
      this.onCommitTargeting(consumable, consumableIndex);
      return;
    }

    if (consumable.def.diceSelection) {
      this.suppressTabDismissCancel = true;
      this.scene.time.delayedCall(0, () => {
        this.suppressTabDismissCancel = false;
      });
      this.emit('consumable-arm-targeting', {
        index: consumableIndex,
        instance: consumable,
      } satisfies ConsumableTargetingRequest);
      return;
    }

    this.consumeAndAnimateCard(card, consumableIndex);
  }

  private onCommitTargeting(instance: ConsumableInstance, index: number, bumpDirection?: 'up' | 'down'): void {
    this.emit('consumable-commit-targeting', {
      index,
      instance,
      bumpDirection,
    } satisfies ConsumableTargetingCommitRequest);
  }

  /** Play the standard use animation after logic has removed the card from the store. */
  playUseSuccessAnimation(card: ItemCard, onComplete?: () => void): void {
    this.suppressStoreRebuild = true;
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
        this.suppressStoreRebuild = false;
        if (card.scene) card.destroy();
        this.rebuildCards();
        this.tryRestoreBarDepth();
        onComplete?.();
      },
    });
  }

  private consumeAndAnimateCard(card: ItemCard, consumableIndex: number): void {
    this.suppressStoreRebuild = true;

    const consumed = consumableActions.useConsumable(consumableIndex);
    if (!consumed) {
      this.suppressStoreRebuild = false;
      return;
    }

    this.playUseSuccessAnimation(card, () => {
      this.emit('consumable-used', consumed);
    });
  }
}
