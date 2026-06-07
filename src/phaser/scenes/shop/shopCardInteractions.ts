// ─── Shared shop card hover, lift, and active-tab dismiss helpers ───

import type { Scene } from 'phaser';
import { hitIncludesObjectOrChild, installClickAwayDismiss } from '../../ui/clickAwayDismiss';
import type { CardActionTabConfig, ItemCard } from '../../ui/ItemCard';

export type ShopActiveTabHandle = {
  getActiveCard: () => ItemCard | null;
  openTabs: (card: ItemCard, tabs: CardActionTabConfig[]) => void;
  dismiss: () => void;
  destroy: () => void;
};

/** Ignore pointerup unless pointerdown started on this card (avoids ghost clicks after scene transitions). */
export function wireShopCardPointerUp(card: ItemCard, onPointerUp: () => void): void {
  let pointerDownOnCard = false;

  card.on('pointerdown', () => {
    pointerDownOnCard = true;
  });
  card.on('pointerout', () => {
    pointerDownOnCard = false;
  });
  card.on('pointerup', () => {
    if (!pointerDownOnCard) return;
    pointerDownOnCard = false;
    onPointerUp();
  });
}

export function wireShopCardHover(scene: Scene, card: ItemCard, activeTab: ShopActiveTabHandle): void {
  card.on('pointerover', () => {
    if (!card.sold && activeTab.getActiveCard() !== card) {
      scene.tweens.add({ targets: card, scaleX: 1.05, scaleY: 1.05, duration: 100 });
    }
  });
  card.on('pointerout', () => {
    if (!card.sold && activeTab.getActiveCard() !== card) {
      scene.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: 100 });
    }
  });
}

export function createShopActiveTabHandle(scene: Scene): ShopActiveTabHandle {
  let activeCard: ItemCard | null = null;
  let dismissClickAway: (() => void) | null = null;

  const clearDismissClickAway = () => {
    if (dismissClickAway) {
      dismissClickAway();
      dismissClickAway = null;
    }
  };

  const settleCard = (card: ItemCard) => {
    if (!card.sold) {
      scene.tweens.add({
        targets: card,
        scaleX: 1,
        scaleY: 1,
        duration: 200,
        ease: 'Back.easeOut',
      });
    }
    card.setDepth(10);
  };

  return {
    getActiveCard: () => activeCard,

    openTabs: (card, tabs) => {
      card.showActionTabs(tabs);
      activeCard = card;
      clearDismissClickAway();
      dismissClickAway = installClickAwayDismiss(scene, {
        isInside: (hitObjects) => hitIncludesObjectOrChild(hitObjects, activeCard),
        onDismiss: () => {
          if (!activeCard) return;
          const current = activeCard;
          current.hideActionTabs(true);
          settleCard(current);
          activeCard = null;
          clearDismissClickAway();
        },
      });
    },

    dismiss: () => {
      if (activeCard) {
        const card = activeCard;
        card.hideActionTabs(true);
        settleCard(card);
        activeCard = null;
      }
      clearDismissClickAway();
    },

    destroy: () => {
      clearDismissClickAway();
      activeCard = null;
    },
  };
}

export function openShopCardTabs(
  scene: Scene,
  card: ItemCard,
  tabs: CardActionTabConfig[],
  activeTab: ShopActiveTabHandle,
): void {
  if (card.sold) return;

  if (activeTab.getActiveCard() === card) {
    activeTab.dismiss();
    return;
  }

  activeTab.dismiss();
  scene.tweens.add({
    targets: card,
    scaleX: 1.1,
    scaleY: 1.1,
    duration: 150,
    ease: 'Back.easeOut',
  });
  card.setDepth(200);
  activeTab.openTabs(card, tabs);
}
