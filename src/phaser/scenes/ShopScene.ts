// ─── ShopScene ───
// Shop that appears before each round. Buy equipment with your money.
// Balatro-inspired layout: sidebar left, equipment top, shop center, pouch bottom-right.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { gameFacade } from '../../game/facade';
import type { ConsumableDef, UseConsumableResult } from '../../game/facade/consumable';
import { canBuyAndUseConsumableInShop, getConsumableAtlasKey } from '../../game/facade/consumable';
import type { EquipmentDef, EquipmentInstance, PackInstance } from '../../game/facade/shop';
import { getConsumableDefById } from '../../game/facade/consumable';
import { getPackDefById } from '../../game/facade/shop';
import { resolveEquipmentInstance, resolveEquipmentList, storedFromEquipmentInstance } from '../../game/store/resolve';
import {
  selectProfession,
  selectShopRerollCost,
  selectTrailGuidesFree,
  selectUsedEquipmentSlots,
} from '../../game/store/selectors/runSelectors';
import { resolveConsumableList } from '../../game/store/resolve';
import { canAfford } from '../../game/store/economy';
import { getPermitById } from '../../game/PermitsSystem';
import { TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { ItemCard, CardActionTabConfig, type CardData } from '../ui/ItemCard';
import { addDiceCardVisual } from '../ui/DiceCardVisual';
import { getItemDisplayContext } from '../../game/displayContext';
import { Button } from '../ui/Button';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import { isAutoDrainCommand } from '../playback/handlers';
import { createRunSceneShell, type RunSceneShell } from './runSceneShell';
import { computeFittedRowSpacing, computeLayoutMetrics, type CardBarMetrics } from '../ui/SceneLayout';
import {
  createShopActiveTabHandle,
  openShopCardTabs,
  wireShopCardHover,
  wireShopCardPointerUp,
  type ShopActiveTabHandle,
} from './shop/shopCardInteractions';
import { PermitDef, generateShopPermit, getPermitShopDiscount } from '../../game/PermitsSystem';
import { computePriceTagMetrics } from '../ui/itemCard/priceTagLayout';
import { Die } from '../../game/types';
import { isDevMode, devLookupShopItem, devLookupPack, devLookupPermit } from '../../game/DevMode';
import type { SerializedShopItem } from '../../game/SaveLoad';
import { getSceneState, sceneActions } from '../../game/store/sceneStore';
import { getRunState, runActions, runStore } from '../../game/store/runStore';
import { sceneStore } from '../../game/store/sceneStore';
import { selectShopAffordabilityInputs, selectShopStockRevision } from '../../game/store/selectors/sceneSelectors';
import { bindStore } from '../store/subscribe';
import { DEFAULT_SHOP_VISIT_MODS, type ShopSceneState } from '../../game/store/types';
import {
  appendShopStockForSlots,
  buildShopDieDisplayDef,
  buildShopPackDisplayDef,
  resolveShopPackPurchaseCost,
  resolveShopStockPurchaseCost,
  buildShopPermitDisplayDef,
} from '../../game/store/shopStock';
import { clearSceneCardTooltips } from '../ui/itemCard/cardTooltipRegistry';

/** A shop stock item — equipment, consumable, or dice */
type ShopItem =
  | { type: 'equipment'; def: EquipmentDef; preview: EquipmentInstance; sold?: boolean }
  | { type: 'consumable'; def: ConsumableDef; sold?: boolean }
  | { type: 'dice'; die: Die; displayDef: EquipmentDef; sold?: boolean };

export class ShopScene extends Scene {
  private stockItems: ShopItem[];
  private packs: PackInstance[];
  private cards: ItemCard[] = [];
  private packCards: ItemCard[] = [];
  private permitCard: ItemCard | null = null;
  private rerollBtn: Button;
  private displayStoreUnsubs: Array<() => void> = [];
  /** Shop row-1 objects (stock box, buttons, stock cards) — cleared on reroll without rebuilding equip bar. */
  private shopStockObjects: Phaser.GameObjects.GameObject[] = [];
  /** Avoid double stock rebuild when reroll handler and store subscription both fire. */
  private suppressStockRefresh = false;

  private activeTab!: ShopActiveTabHandle;

  // Shared UI
  private runShell: RunSceneShell | null = null;
  private equipBar: EquipmentBar;
  private consumableBar: ConsumableBar;

  constructor() {
    super('Shop');
  }

  init(_data: Record<string, never> = {}) {
    // Phaser reuses scene instances; drop cached stock so create() always syncs from the store or rolls new stock.
    this.stockItems = null!;
    this.packs = null!;
  }

  private getShopVisitMods() {
    return getSceneState().shop?.visitMods ?? DEFAULT_SHOP_VISIT_MODS;
  }

  private buildShopSceneState(): ShopSceneState {
    const existing = getSceneState().shop;
    return {
      stock: this.stockItems.map((item, i) => this.serializeShopItem(item, i)),
      packs: this.packs.map((p) => ({
        defId: p.def.id,
        instanceId: p.id,
        opened: this.isPackOpened(p),
      })),
      shopRerollCount: getRunState().shopRerollCount,
      visitMods: existing?.visitMods ?? DEFAULT_SHOP_VISIT_MODS,
      bonusPermitIds: existing?.bonusPermitIds,
    };
  }

  private syncShopToStore(): void {
    const next = this.buildShopSceneState();
    if (getSceneState().shop) {
      sceneActions.patchShop(next);
    } else {
      sceneActions.enterShop(next);
    }
  }

  private isPackOpened(pack: PackInstance): boolean {
    const shop = getSceneState().shop;
    if (!shop) return false;
    const entry = shop.packs.find((p) => p.instanceId === pack.id);
    return entry?.opened ?? false;
  }

  private serializeShopItem(item: ShopItem, stockIndex?: number): SerializedShopItem {
    const existing = stockIndex != null ? getSceneState().shop?.stock[stockIndex] : undefined;
    const shopCost = existing?.shopCost;

    if (item.type === 'equipment') {
      return {
        type: 'equipment',
        defId: item.def.id,
        preview: storedFromEquipmentInstance(item.preview),
        sold: item.sold,
        ...(shopCost === 0 ? { shopCost: 0 } : {}),
      };
    }
    if (item.type === 'consumable') {
      return {
        type: 'consumable',
        defId: item.def.id,
        sold: item.sold,
        ...(shopCost === 0 ? { shopCost: 0 } : {}),
      };
    }
    return {
      type: 'dice',
      die: { ...item.die },
      sold: item.sold,
      ...(shopCost === 0 ? { shopCost: 0 } : {}),
    };
  }

  private resolveStockItemCost(stockIndex: number): number {
    const stored = getSceneState().shop?.stock[stockIndex];
    const shopItem = this.stockItems[stockIndex];
    if (!shopItem) return 0;
    const serialized = stored ?? this.serializeShopItem(shopItem, stockIndex);
    return resolveShopStockPurchaseCost(serialized, getRunState());
  }

  private deserializeShopItem(item: SerializedShopItem): ShopItem {
    if (item.type === 'equipment') {
      const preview = resolveEquipmentInstance(item.preview, getRunState().purchasedPermits);
      return {
        type: 'equipment',
        def: preview.def,
        preview,
        sold: item.sold,
      };
    }
    if (item.type === 'consumable') {
      const def = getConsumableDefById(item.defId);
      if (!def) throw new Error(`Unknown consumable: ${item.defId}`);
      return { type: 'consumable', def, sold: item.sold };
    }
    return {
      type: 'dice',
      die: { ...item.die },
      displayDef: buildShopDieDisplayDef(item.die),
      sold: item.sold,
    };
  }

  create() {
    const sceneShop = getSceneState().shop;
    if (sceneShop) {
      this.hydrateShopFromState(sceneShop);
    } else {
      const shop = gameFacade.shop.openShop();
      this.hydrateShopFromState(shop);
    }
    sceneActions.enterScene('Shop');

    this.activeTab = createShopActiveTabHandle(this);

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.tearDownShopSubscriptions();
      this.activeTab.destroy();
      this.runShell?.destroy();
      this.runShell = null;
      this.stockItems = null!;
      this.packs = null!;
    });

    this.buildLayout();
    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildLayout(): void {
    const run = getRunState();
    const equipment = resolveEquipmentList(run);
    const consumables = resolveConsumableList(run);
    selectProfession(run);
    const trailGuidesFree = selectTrailGuidesFree(run);
    const bonusPermitIds = getSceneState().shop?.bonusPermitIds ?? [];

    this.runShell?.destroy();
    this.runShell = createRunSceneShell(this, {
      layout: { bgKey: 'bg_shop', sidebarTitle: 'SHOP' },
      consumableReturnScene: 'Shop',
      autoDestroyOnShutdown: false,
    });
    void this.runShell.playbackRunner.drainMatching(isAutoDrainCommand);

    const layout = this.runShell.layout;
    this.equipBar = layout.equipBar;
    this.consumableBar = layout.consumableBar;
    const contentL = layout.contentX;
    const contentW = layout.contentW;

    this.equipBar.on('equipment-changed', () => {
      this.updateEquipHints();
    });

    this.consumableBar.on('consumable-changed', () => {
      this.updateEquipHints();
    });

    // Show equipment hints with default (shop) context
    this.updateEquipHints();

    const layoutMetrics = this.getShopLayoutMetrics(contentL, contentW, layout.contentTop, layout.cardBar);
    this.buildShopStock(run, equipment, consumables, trailGuidesFree, layoutMetrics);

    // ─── Box 2: Voucher + Booster packs ───
    const { box2Top, box2H, cardCY2, CARD_H, CARD_W, PREFERRED_SPACING, cardScale, BOX_RADIUS, BOX_PAD, BTN_COL_W } =
      layoutMetrics;
    const packBox = this.add.graphics();
    packBox.fillStyle(0x0d0d1a, 0.75);
    packBox.fillRoundedRect(contentL, box2Top, contentW, box2H, BOX_RADIUS);
    packBox.lineStyle(2, 0x333355, 0.6);
    packBox.strokeRoundedRect(contentL, box2Top, contentW, box2H, BOX_RADIUS);
    packBox.setDepth(UI.SHOP_PANEL_DEPTH);

    // Permit card (left side of box 2)
    const voucherW = BTN_COL_W - 16;
    const voucherH = CARD_H;
    const voucherX = contentL + BOX_PAD + voucherW / 2 + 50;
    const voucherY = cardCY2;

    const permitAreaCenterX = voucherX;
    const primaryPermit = this.getOrGeneratePermit();
    const permitEntries: { permit: PermitDef; isPrimary: boolean }[] = [];
    const seenPermitIds = new Set<string>();
    if (primaryPermit) {
      permitEntries.push({ permit: primaryPermit, isPrimary: true });
      seenPermitIds.add(primaryPermit.id);
    }
    for (const id of bonusPermitIds) {
      if (seenPermitIds.has(id)) continue;
      const bonus = getPermitById(id);
      if (bonus) {
        permitEntries.push({ permit: bonus, isPrimary: false });
        seenPermitIds.add(bonus.id);
      }
    }
    this.renderPermitArea(
      permitEntries,
      permitAreaCenterX,
      voucherW,
      voucherW,
      voucherY,
      voucherH,
      cardScale,
      CARD_W,
      PREFERRED_SPACING,
    );

    // Booster packs (right side of box 2)
    this.packCards = [];
    const packAreaLeft = contentL + BOX_PAD + BTN_COL_W + 8;
    const packAreaW = contentW - BOX_PAD * 2 - BTN_COL_W - 8;
    const packSpacing = computeFittedRowSpacing(this.packs.length, packAreaW, CARD_W, PREFERRED_SPACING);
    const packTotalW = (this.packs.length - 1) * packSpacing;
    const packX0 = packAreaLeft + packAreaW / 2 - packTotalW / 2;

    for (let i = 0; i < this.packs.length; i++) {
      const packInst = this.packs[i];
      const packCost = resolveShopPackPurchaseCost(packInst.def, this.getShopVisitMods(), run);
      const packDisplayDef = buildShopPackDisplayDef(packInst.def, packCost);

      const packCard = new ItemCard(this, packX0 + i * packSpacing, cardCY2, packDisplayDef, {
        mode: 'shop',
        showCost: true,
        textureKey: 'packs',
        transparentBg: true,
        cardScale,
      });
      this.add.existing(packCard);
      packCard.setTooltipContext(null, getItemDisplayContext());
      packCard.setDepth(10);

      if (this.isPackOpened(packInst)) {
        packCard.markSold();
      } else {
        packCard.setAffordable(canAfford(run, packCost));
        this.setupPackCardClick(packCard, i);
      }

      this.packCards.push(packCard);
    }

    // Dev icons on booster packs
    if (isDevMode()) {
      for (let i = 0; i < this.packCards.length; i++) {
        const packCard = this.packCards[i];
        if (packCard.sold) continue;
        this.addDevIcon(packX0 + i * packSpacing + packCard.cardWidth * 0.25, cardCY2 - CARD_H / 2 - 12, () =>
          this.devSwapPack(i),
        );
      }
    }

    this.tearDownShopSubscriptions();
    this.displayStoreUnsubs = [
      bindStore(this, runStore, selectShopAffordabilityInputs, () => this.updateDisplays()),
      bindStore(
        this,
        runStore,
        (state) => state.lastUsedConsumableId,
        () => this.refreshStockCardTooltipContexts(),
      ),
      bindStore(this, sceneStore, selectShopStockRevision, () => this.onShopStockRevisionChanged()),
    ];
  }

  private onBuyPack(card: ItemCard, packIndex: number): void {
    if (card.sold) return;
    const pack = this.packs[packIndex];
    if (!pack) return;
    const cost = resolveShopPackPurchaseCost(pack.def, this.getShopVisitMods());
    if (!gameFacade.shop.buyPack(cost).ok) {
      this.showCardPopup(card, "Can't afford!");
      return;
    }

    card.markSold();
    sceneActions.markShopPackOpened(packIndex);
    this.syncShopToStore();

    // Burst open animation + SFX
    this.sound.play('sfx_explosion_release', { volume: 0.5 });
    this.tweens.add({
      targets: card,
      scaleX: 1.3,
      scaleY: 1.3,
      alpha: 0,
      duration: 350,
      ease: 'Power2',
      onComplete: () => {
        card.destroy();
        this.scene.start('BoosterPack', { packDef: pack.def });
      },
    });
  }

  private onBuyEquipment(card: ItemCard, stockIndex: number): void {
    if (card.sold) return;
    const shopItem = this.stockItems[stockIndex];
    if (!shopItem || shopItem.type !== 'equipment') return;
    const def = shopItem.preview.def;
    const run = getRunState();
    if (def.aura?.id !== 'ghost' && selectUsedEquipmentSlots(run) >= run.maxEquipmentSlots) {
      this.showCardPopup(card, 'No space!');
      return;
    }
    const purchaseCost = this.resolveStockItemCost(stockIndex);
    const purchaseDef = purchaseCost === 0 ? { ...def, cost: 0 } : def;
    const result = gameFacade.shop.buyEquipment(
      purchaseDef,
      shopItem.preview,
      gameFacade.shop.getEquipmentListPrice(purchaseDef),
    );
    if (!result.ok) {
      this.showCardPopup(card, result.reason === 'no_space' ? 'No space!' : "Can't afford!");
      return;
    }
    card.markSold();
    this.markStockSold(card);
    this.sound.play('sfx_coin', { volume: 0.5 });
    this.updateEquipHints();

    card.setDepth(200);
    this.tweens.add({
      targets: card,

      scaleX: 0.15,
      scaleY: 0.15,
      alpha: 0,
      duration: 400,
      ease: 'Power3',
      onComplete: () => {
        if (card.scene) card.destroy();
      },
    });
  }

  private onBuyDie(card: ItemCard, shopItem: { type: 'dice'; die: Die; displayDef: EquipmentDef }): void {
    if (card.sold) return;
    const stockIndex = this.cards.indexOf(card);
    const cost = this.resolveStockItemCost(stockIndex);
    if (!gameFacade.shop.buyDie(shopItem.die, cost).ok) {
      this.showCardPopup(card, "Can't afford!");
      return;
    }
    card.markSold();
    this.markStockSold(card);
    this.sound.play('sfx_coin', { volume: 0.5 });

    // Animate card shrinking toward dice pouch
    card.setDepth(200);
    this.tweens.add({
      targets: card,
      scaleX: 0.15,
      scaleY: 0.15,
      alpha: 0,
      duration: 400,
      ease: 'Power3',
      onComplete: () => {
        if (card.scene) card.destroy();
      },
    });
  }

  private onBuyConsumable(card: ItemCard, def: ConsumableDef): void {
    if (card.sold) return;
    const stockIndex = this.cards.indexOf(card);
    const cost = this.resolveStockItemCost(stockIndex);
    const result = gameFacade.shop.buyConsumable(def, cost);
    if (!result.ok) {
      this.showCardPopup(card, result.reason === 'no_space' ? 'No space!' : "Can't afford!");
      return;
    }
    card.markSold();
    this.markStockSold(card);
    this.sound.play('sfx_coin', { volume: 0.5 });

    // Animate card shrinking toward consumable bar
    const targetX = this.consumableBar.x + this.consumableBar.width / 2;
    const targetY = this.consumableBar.y + this.consumableBar.height / 2;
    card.setDepth(200);
    this.tweens.add({
      targets: card,
      x: targetX,
      y: targetY,
      scaleX: 0.15,
      scaleY: 0.15,
      alpha: 0,
      duration: 400,
      ease: 'Power3',
      onComplete: () => {
        if (card.scene) card.destroy();
      },
    });
  }

  /** Buy a consumable and immediately use it (bypasses consumable slot limit) */
  private onBuyAndUseConsumable(card: ItemCard, def: ConsumableDef): void {
    if (card.sold) return;
    const stockIndex = this.cards.indexOf(card);
    const cost = this.resolveStockItemCost(stockIndex);
    card.markSold();
    this.markStockSold(card);
    this.sound.play('sfx_tarot1', { volume: 0.5 });

    // Fade out card
    card.setDepth(200);
    this.tweens.add({
      targets: card,
      alpha: 0,
      scaleX: 0.9,
      scaleY: 0.9,
      duration: 350,
      ease: 'Power2',
      onComplete: () => {
        if (card.scene) card.destroy();
      },
    });

    const result = gameFacade.shop.buyAndUseConsumable(def, cost);
    this.handleConsumableResult(result);
  }

  // ─── Shop Card Action Tabs ───

  private setupShopCardClick(card: ItemCard, stockIndex: number): void {
    wireShopCardHover(this, card, this.activeTab);

    wireShopCardPointerUp(card, () => {
      if (card.sold) return;
      card.setTooltipContext(null, getItemDisplayContext());

      const shopItem = this.stockItems[stockIndex];
      if (!shopItem) return;

      const tabs: CardActionTabConfig[] = [];

      if (shopItem.type === 'equipment') {
        tabs.push({
          label: 'BUY',
          color: 0x2255aa,
          position: 'bottom',
          callback: () => {
            this.activeTab.dismiss();
            this.onBuyEquipment(card, stockIndex);
          },
        });
      } else if (shopItem.type === 'dice') {
        tabs.push({
          label: 'BUY',
          color: 0x2255aa,
          position: 'bottom',
          callback: () => {
            this.activeTab.dismiss();
            this.onBuyDie(card, shopItem);
          },
        });
      } else {
        tabs.push({
          label: 'BUY',
          color: 0x2255aa,
          position: 'bottom',
          callback: () => {
            this.activeTab.dismiss();
            this.onBuyConsumable(card, shopItem.def);
          },
        });

        const canBuyAndUse = canBuyAndUseConsumableInShop(shopItem.def);
        if (shopItem.def.id === 'second_helpings') {
          tabs.push({
            label: 'BUY\n& USE',
            color: canBuyAndUse ? 0x338833 : 0x555555,
            textColor: canBuyAndUse ? '#ffffff' : '#bbbbbb',
            disabled: !canBuyAndUse,
            callback: () => {
              this.activeTab.dismiss();
              this.onBuyAndUseConsumable(card, shopItem.def);
            },
          });
        } else if (canBuyAndUse) {
          tabs.push({
            label: 'BUY\n& USE',
            color: 0x338833,
            callback: () => {
              this.activeTab.dismiss();
              this.onBuyAndUseConsumable(card, shopItem.def);
            },
          });
        }
      }

      openShopCardTabs(this, card, tabs, this.activeTab);
    });
  }

  private handleConsumableResult(result: UseConsumableResult): void {
    this.runShell?.handleConsumableResult(result);
  }

  /** Show a brief floating text popup above a card with a cancel sound */
  private showCardPopup(card: ItemCard, message: string): void {
    this.sound.play('sfx_cancel', { volume: 0.5 });

    const matrix = card.getWorldTransformMatrix();
    const worldX = matrix.tx;
    const worldY = matrix.ty;

    const text = this.add
      .text(worldX, worldY - 40, message, {
        fontFamily: 'sans-serif',
        fontSize: '24px',
        color: '#fff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1000);

    this.tweens.add({
      targets: text,
      y: text.y - 15,
      fontSize: '32px',
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  private onRerollShop(): void {
    this.suppressStockRefresh = true;
    try {
      if (!gameFacade.shop.rerollShop()) return;
      this.refreshShopStockFromStore();
    } finally {
      this.suppressStockRefresh = false;
    }
  }

  private onShopStockRevisionChanged(): void {
    if (this.suppressStockRefresh) return;
    this.refreshShopStockFromStore();
    this.syncPackCardsSoldFromStore();
  }

  /** Rebuild shop stock row from scene store (after reroll, restore, or external patch). */
  private refreshShopStockFromStore(): void {
    const shop = getSceneState().shop;
    if (!shop) return;
    this.hydrateStockFromState(shop);
    this.rebuildShopStockOnly();
  }

  /** Mark pack cards sold when store records them opened (e.g. after restore). */
  private syncPackCardsSoldFromStore(): void {
    const shop = getSceneState().shop;
    if (!shop) return;
    for (let i = 0; i < this.packCards.length; i++) {
      const packCard = this.packCards[i];
      if (packCard.sold || !shop.packs[i]?.opened) continue;
      packCard.markSold();
      packCard.removeAllListeners();
    }
  }

  private getShopLayoutMetrics(contentL: number, contentW: number, contentTop: number, cardBar: CardBarMetrics) {
    const BOX_RADIUS = 12;
    const BOX_PAD = 16;
    const BOX_GAP = 12;
    const cardScale = cardBar.cardScale;
    const CARD_H = UI.CARD_H * cardScale;
    const CARD_W = UI.CARD_W * cardScale;
    const PREFERRED_SPACING = cardBar.cardSpacing;
    const PRICE_TAG_SPACE = computePriceTagMetrics(cardScale).spaceAbove;
    const BTN_COL_W = Math.max(96, Math.floor(130 * cardBar.displayScale));
    const rowInnerH = CARD_H + PRICE_TAG_SPACE + BOX_PAD * 2;
    const box1Top = contentTop + 4;
    const box1H = rowInnerH;
    const box2Top = box1Top + box1H + BOX_GAP;
    const box2H = rowInnerH;
    const cardCY1 = box1Top + BOX_PAD + PRICE_TAG_SPACE + CARD_H / 2;
    const cardCY2 = box2Top + BOX_PAD + PRICE_TAG_SPACE + CARD_H / 2;
    return {
      contentL,
      contentW,
      box1Top,
      box1H,
      box2Top,
      box2H,
      cardCY1,
      cardCY2,
      CARD_H,
      CARD_W,
      PREFERRED_SPACING,
      cardScale,
      BOX_RADIUS,
      BOX_PAD,
      BTN_COL_W,
    };
  }

  private trackShopStockObject(obj: Phaser.GameObjects.GameObject): void {
    this.shopStockObjects.push(obj);
  }

  private raiseShopActionButtons(): void {
    for (const obj of this.shopStockObjects) {
      if (!(obj instanceof Button)) continue;
      obj.setDepth(UI.SHOP_ACTION_BTN_DEPTH);
    }
  }

  private clearShopStock(preserveActionButtons = false): void {
    this.activeTab.dismiss();
    for (const card of this.cards) {
      card.hideTooltip();
    }
    const keptObjects: Phaser.GameObjects.GameObject[] = [];
    for (const obj of this.shopStockObjects) {
      if (preserveActionButtons && obj instanceof Button) {
        keptObjects.push(obj);
        continue;
      }
      if (obj.scene) obj.destroy();
    }
    this.shopStockObjects = preserveActionButtons ? keptObjects : [];
    for (const card of this.cards) {
      if (card.scene) card.destroy();
    }
    this.cards = [];
    if (!preserveActionButtons) {
      this.rerollBtn = null!;
    }
  }

  /** Tear down shop UI before resize or full layout rebuild (mirrors CardBar card cleanup). */
  private tearDownShopLayout(): void {
    clearSceneCardTooltips(this);
    this.clearShopStock();

    for (const packCard of this.packCards) {
      if (packCard.scene) packCard.destroy();
    }
    this.packCards = [];

    if (this.permitCard?.scene) {
      this.permitCard.hideTooltip();
      this.permitCard.destroy();
    }
    this.permitCard = null;

    this.runShell?.destroy();
    this.runShell = null;
    this.children.removeAll(true);
  }

  private buildShopStock(
    run: ReturnType<typeof getRunState>,
    equipment: EquipmentInstance[],
    consumables: ReturnType<typeof resolveConsumableList>,
    _trailGuidesFree: boolean,
    metrics: ReturnType<typeof this.getShopLayoutMetrics>,
    reuseActionButtons = false,
  ): void {
    const {
      contentL,
      contentW,
      box1Top,
      box1H,
      cardCY1,
      CARD_H,
      CARD_W,
      PREFERRED_SPACING,
      cardScale,
      BOX_RADIUS,
      BOX_PAD,
      BTN_COL_W,
    } = metrics;
    if (!reuseActionButtons) {
      this.shopStockObjects = [];
    }

    const shopBox = this.add.graphics();
    shopBox.fillStyle(0x0d0d1a, 0.75);
    shopBox.fillRoundedRect(contentL, box1Top, contentW, box1H, BOX_RADIUS);
    shopBox.lineStyle(2, 0x333355, 0.6);
    shopBox.strokeRoundedRect(contentL, box1Top, contentW, box1H, BOX_RADIUS);
    shopBox.setDepth(UI.SHOP_PANEL_DEPTH);
    this.trackShopStockObject(shopBox);

    const btnColX = contentL + BOX_PAD + BTN_COL_W / 2 - 6;
    const btnW = BTN_COL_W - 16;
    const btnH = Math.max(44, Math.floor((52 * metrics.cardScale) / UI.CARD_BAR_BASE_SCALE));

    if (!reuseActionButtons || !this.rerollBtn?.scene) {
      const hitTrailBtn = new Button(this, btnColX, cardCY1 - btnH / 2 - 8, 'Hit the\nTrail', {
        variant: 'danger',
        width: btnW,
        height: btnH,
      }).onClick(() => {
        gameFacade.shop.processShopEnd(resolveEquipmentList());
        this.tearDownShopSubscriptions();
        sceneActions.clearShop();
        this.scene.start('RoundSelect', {});
      });
      hitTrailBtn.setDepth(UI.SHOP_ACTION_BTN_DEPTH);
      this.trackShopStockObject(hitTrailBtn);

      this.rerollBtn = new Button(this, btnColX, cardCY1 + btnH / 2 + 8, `Reroll\n$${selectShopRerollCost(run)}`, {
        variant: 'success',
        width: btnW,
        height: btnH,
      });
      this.rerollBtn.setEnabled(gameFacade.shop.canRerollShop(run));
      this.rerollBtn.onClick(() => this.onRerollShop());
      this.rerollBtn.setDepth(UI.SHOP_ACTION_BTN_DEPTH);
      this.trackShopStockObject(this.rerollBtn);
    } else {
      this.raiseShopActionButtons();
    }

    this.cards = [];
    const cardAreaLeft = contentL + BOX_PAD + BTN_COL_W + 8;
    const cardAreaW = contentW - BOX_PAD * 2 - BTN_COL_W - 8;
    const stockSpacing = computeFittedRowSpacing(this.stockItems.length, cardAreaW, CARD_W, PREFERRED_SPACING);
    const stockTotalW = this.stockItems.length > 1 ? (this.stockItems.length - 1) * stockSpacing : 0;
    const cardStartX = cardAreaLeft + cardAreaW / 2 - stockTotalW / 2;
    for (let i = 0; i < this.stockItems.length; i++) {
      const shopItem = this.stockItems[i];
      const consumableTextureKey =
        shopItem.type === 'consumable' ? getConsumableAtlasKey(shopItem.def.category) : undefined;
      const itemDef = shopItem.type === 'dice' ? shopItem.displayDef : shopItem.def;
      const purchaseCost = this.resolveStockItemCost(i);
      const displayDef = { ...itemDef, cost: purchaseCost };
      const card = new ItemCard(this, cardStartX + i * stockSpacing, cardCY1, displayDef as CardData, {
        mode: 'shop',
        showCost: true,
        cardScale,
        ...(shopItem.type === 'equipment' ? { equipment: shopItem.preview } : {}),
        ...(consumableTextureKey != null ? { textureKey: consumableTextureKey } : {}),
      });
      this.add.existing(card);
      if (shopItem.type === 'dice') {
        addDiceCardVisual(this, card, shopItem.die, {
          cardWidth: card.cardWidth,
          cardHeight: card.cardHeight,
          cornerRadius: UI.CARD_RADIUS,
          showAuraLabel: true,
          showStickerLabel: true,
          interactive: false,
        });
      }
      card.setTooltipContext(null, getItemDisplayContext(run));
      card.setDepth(10);
      this.trackShopStockObject(card);

      if (shopItem.sold) {
        card.markSold();
        this.cards.push(card);
        continue;
      }

      if (shopItem.type === 'equipment') {
        const alreadyOwned = equipment.some((e) => e.def.id === shopItem.def.id);
        if (alreadyOwned) {
          card.markSold();
        } else {
          const canAffordEquip =
            canAfford(run, purchaseCost) &&
            (shopItem.def.aura?.id === 'ghost' || selectUsedEquipmentSlots(run) < run.maxEquipmentSlots);
          card.setAffordable(canAffordEquip);
          this.setupShopCardClick(card, i);
        }
      } else if (shopItem.type === 'consumable') {
        const alreadyOwned = consumables.some((c) => c.def.id === shopItem.def.id);
        if (alreadyOwned) {
          card.markSold();
        } else {
          card.setAffordable(canAfford(run, purchaseCost));
          this.setupShopCardClick(card, i);
        }
      } else {
        card.setAffordable(canAfford(run, purchaseCost));
        this.setupShopCardClick(card, i);
      }

      this.cards.push(card);
    }

    if (isDevMode()) {
      for (let i = 0; i < this.cards.length; i++) {
        const card = this.cards[i];
        if (card.sold) continue;
        this.addDevIcon(cardStartX + i * stockSpacing + CARD_H * 0.25, cardCY1 - CARD_H / 2 - 12, () =>
          this.devSwapShopItem(i),
        );
      }
    }
  }

  private rebuildShopStockOnly(): void {
    this.clearShopStock(true);
    const run = getRunState();
    const { width } = this.scale;
    const layout = computeLayoutMetrics(width, this.scale.height);
    const contentL = layout.contentX;
    const contentW = layout.contentW;
    const shopMetrics = this.getShopLayoutMetrics(contentL, contentW, layout.contentTop, layout.cardBar);
    this.buildShopStock(
      run,
      resolveEquipmentList(run),
      resolveConsumableList(run),
      selectTrailGuidesFree(run),
      shopMetrics,
      true,
    );
    this.updateDisplays();
  }

  private hydrateStockFromState(shop: ShopSceneState): void {
    this.stockItems = shop.stock.map((s) => this.deserializeShopItem(s));
  }

  private hydratePacksFromState(shop: ShopSceneState): void {
    this.packs = shop.packs.map((p) => {
      const def = getPackDefById(p.defId);
      if (!def) throw new Error(`Unknown pack: ${p.defId}`);
      return { def, id: p.instanceId };
    });
  }

  private hydrateShopFromState(shop: ShopSceneState): void {
    this.hydrateStockFromState(shop);
    this.hydratePacksFromState(shop);
    if (getRunState().shopRerollCount !== shop.shopRerollCount) {
      runActions.patch({ shopRerollCount: shop.shopRerollCount });
    }
  }

  private tearDownShopSubscriptions(): void {
    for (const unsub of this.displayStoreUnsubs) unsub();
    this.displayStoreUnsubs = [];
  }

  private updateDisplays(): void {
    if (!this.stockItems) return;

    const run = getRunState();
    const shopInputs = selectShopAffordabilityInputs(run);
    const tooltipPlayer = getItemDisplayContext(run);

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (card.sold) continue;
      const shopItem = this.stockItems[i];
      const cost = this.resolveStockItemCost(i);
      if (shopItem.type === 'equipment') {
        const canAffordEquip =
          canAfford(run, cost) &&
          (shopItem.def.aura?.id === 'ghost' || shopInputs.usedEquipmentSlots < shopInputs.maxEquipmentSlots);
        card.setAffordable(canAffordEquip);
      } else {
        card.setAffordable(canAfford(run, cost));
      }
      card.setTooltipContext(null, tooltipPlayer);
    }

    for (let i = 0; i < this.packCards.length; i++) {
      const packCard = this.packCards[i];
      if (packCard.sold) continue;
      const pack = this.packs[i];
      if (!pack) continue;
      const packCost = resolveShopPackPurchaseCost(pack.def, this.getShopVisitMods(), run);
      packCard.setAffordable(canAfford(run, packCost));
    }

    if (this.permitCard && !this.permitCard.sold) {
      const permit = run.currentLegPermitId ? getPermitById(run.currentLegPermitId) : null;
      if (permit) {
        this.permitCard.setAffordable(canAfford(run, this.getPermitCost(permit, run.purchasedPermits)));
      }
    }

    if (this.rerollBtn?.scene) {
      this.rerollBtn.setEnabled(shopInputs.canRerollShop);
      const rerollCost = shopInputs.shopRerollCost;
      this.rerollBtn.setText(rerollCost === 0 ? 'Reroll\nFREE' : `Reroll\n$${rerollCost}`);
    }
  }

  private refreshStockCardTooltipContexts(): void {
    if (!this.stockItems) return;
    const player = getItemDisplayContext();
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      const shopItem = this.stockItems[i];
      if (!card || !shopItem || shopItem.type !== 'consumable') continue;
      card.updateHints(null, player);
    }
  }

  private onResize(): void {
    const shop = getSceneState().shop;
    if (shop) {
      this.stockItems = shop.stock.map((s) => this.deserializeShopItem(s));
      this.packs = shop.packs.map((p) => {
        const def = getPackDefById(p.defId);
        if (!def) throw new Error(`Unknown pack: ${p.defId}`);
        return { def, id: p.instanceId };
      });
      if (getRunState().shopRerollCount !== shop.shopRerollCount) {
        runActions.patch({ shopRerollCount: shop.shopRerollCount });
      }
    }
    this.tearDownShopLayout();
    this.buildLayout();
  }

  private updateEquipHints(): void {
    this.equipBar.setHintRound(null);
  }

  /** Mark a stock item as sold by matching the card's index in this.cards */
  private markStockSold(card: ItemCard): void {
    const idx = this.cards.indexOf(card);
    if (idx >= 0 && this.stockItems[idx]) {
      this.stockItems[idx].sold = true;
      sceneActions.markShopStockSold(idx);
      this.syncShopToStore();
    }
  }

  // ─── Permit Helpers ───

  private renderPermitArea(
    entries: { permit: PermitDef; isPrimary: boolean }[],
    areaCenterX: number,
    areaWidth: number,
    voucherW: number,
    voucherY: number,
    voucherH: number,
    cardScale: number,
    cardW: number,
    preferredSpacing: number,
  ): void {
    this.permitCard = null;

    if (entries.length === 0) {
      this.renderPermitAreaLabel(areaCenterX - cardW / 2 - 14, voucherY, cardScale);
      this.renderPermitCard(null, areaCenterX, voucherY, voucherW, voucherH, cardScale, true);
      return;
    }

    const count = entries.length;
    const spacing = computeFittedRowSpacing(count, areaWidth, cardW, preferredSpacing);
    const rowTotalW = count > 1 ? (count - 1) * spacing : 0;
    const startX = areaCenterX - rowTotalW / 2;

    this.renderPermitAreaLabel(startX - cardW / 2 - 14, voucherY, cardScale);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!;
      const cardX = startX + i * spacing;
      this.renderPermitCard(entry.permit, cardX, voucherY, voucherW, voucherH, cardScale, entry.isPrimary);
    }
  }

  private renderPermitAreaLabel(labelX: number, voucherY: number, cardScale: number): void {
    const labelFontSize = Math.max(10, Math.round(13 * (cardScale / UI.CARD_BAR_BASE_SCALE)));
    const permitLabel = this.add.text(labelX, voucherY, 'PERMITS', {
      fontFamily: 'Arial',
      fontSize: `${labelFontSize}px`,
      color: '#ccccdd',
      fontStyle: 'bold',
      align: 'center',
      letterSpacing: 0.5,
    });
    permitLabel.setOrigin(0.5);
    permitLabel.setRotation(-Math.PI / 2);
    permitLabel.setAlpha(0.85);
    permitLabel.setDepth(5);
  }

  private renderPermitCard(
    permit: PermitDef | null,
    voucherX: number,
    voucherY: number,
    voucherW: number,
    voucherH: number,
    cardScale: number,
    isPrimary: boolean,
  ): void {
    if (permit) {
      const permitDisplayDef = buildShopPermitDisplayDef(permit, this.getPermitCost(permit));

      const permitItemCard = new ItemCard(this, voucherX, voucherY, permitDisplayDef, {
        mode: 'shop',
        showCost: true,
        textureKey: 'permits',
        transparentBg: true,
        cardScale,
        tabAnchorX: (UI.CARD_W * cardScale) / 2,
      });
      this.add.existing(permitItemCard);
      permitItemCard.setTooltipContext(null, getItemDisplayContext());
      permitItemCard.setDepth(10);
      permitItemCard.setAffordable(canAfford(getRunState(), permitDisplayDef.cost));
      this.setupPermitCardClick(permitItemCard, permit, isPrimary);
      if (isPrimary) this.permitCard = permitItemCard;

      if (isDevMode() && isPrimary) {
        this.addDevIcon(voucherX + voucherW * 0.35, voucherY - voucherH / 2 - 12, () => this.devSwapPermit());
      }
    } else if (isPrimary) {
      const voucherSlot = this.add.graphics();
      voucherSlot.fillStyle(0x1a1a2e, 0.6);
      voucherSlot.fillRoundedRect(-voucherW / 2, -voucherH / 2, voucherW, voucherH, 8);
      voucherSlot.lineStyle(1.5, 0x444466, 0.5);
      voucherSlot.strokeRoundedRect(-voucherW / 2, -voucherH / 2, voucherW, voucherH, 8);
      voucherSlot.setPosition(voucherX, voucherY);

      this.add
        .text(voucherX, voucherY, 'SOLD', {
          fontFamily: FONTS.HEADING,
          fontSize: '12px',
          color: TEXT_COLORS.MUTED,
          align: 'center',
        })
        .setOrigin(0.5)
        .setAlpha(0.4);
    }
  }

  /** Get or generate the permit for this leg */
  private getOrGeneratePermit(): PermitDef | null {
    const run = getRunState();
    if (run.permitPurchasedThisLeg) return null;
    if (run.currentLegPermitId) return getPermitById(run.currentLegPermitId);
    const permit = generateShopPermit(run.purchasedPermits);
    if (permit) runActions.patch({ currentLegPermitId: permit.id });
    return permit;
  }

  /** Get permit cost after shop discount */
  private getPermitCost(
    permit: PermitDef,
    purchasedPermits: readonly string[] = getRunState().purchasedPermits,
  ): number {
    const discount = getPermitShopDiscount(purchasedPermits);
    return Math.max(1, Math.floor(permit.cost * (1 - discount)));
  }

  /** Set up click-to-buy on a booster pack card */
  private setupPackCardClick(card: ItemCard, packIndex: number): void {
    wireShopCardHover(this, card, this.activeTab);

    wireShopCardPointerUp(card, () => {
      if (card.sold) return;

      const tabs: CardActionTabConfig[] = [
        {
          label: 'BUY',
          color: 0x2255aa,
          position: 'bottom',
          callback: () => {
            this.activeTab.dismiss();
            this.onBuyPack(card, packIndex);
          },
        },
      ];

      openShopCardTabs(this, card, tabs, this.activeTab);
    });
  }

  /** Set up click-to-buy on the permit card */
  private setupPermitCardClick(card: ItemCard, permit: PermitDef, isPrimary: boolean): void {
    wireShopCardHover(this, card, this.activeTab);

    wireShopCardPointerUp(card, () => {
      if (card.sold) return;

      const tabs: CardActionTabConfig[] = [
        {
          label: 'BUY',
          color: 0x7722aa,
          position: 'bottom',
          callback: () => {
            this.activeTab.dismiss();
            this.onBuyPermit(card, permit, isPrimary);
          },
        },
      ];

      openShopCardTabs(this, card, tabs, this.activeTab);
    });
  }

  /** Handle purchasing a permit */
  private onBuyPermit(card: ItemCard, permit: PermitDef, isPrimary: boolean): void {
    if (card.sold) return;
    const cost = this.getPermitCost(permit);
    if (!gameFacade.shop.buyPermit(permit, cost, isPrimary).ok) {
      this.showCardPopup(card, "Can't afford!");
      return;
    }

    card.markSold();
    this.sound.play('sfx_tarot1', { volume: 0.6 });

    // Animate card, then rebuild the entire shop to reflect permit effects
    // (new stock slots, updated prices, updated sidebar info, etc.)
    card.setDepth(200);
    this.tweens.add({
      targets: card,
      scaleX: 1.3,
      scaleY: 1.3,
      alpha: 0,
      duration: 400,
      ease: 'Power2',
      onComplete: () => {
        card.destroy();
        // If permit increased shop slots, drop sold rows and fill to the new slot count
        const newSlotCount = Math.max(1, getRunState().shopSlots);
        const currentStored = this.stockItems.map((item) => this.serializeShopItem(item));
        const appendedStored = appendShopStockForSlots(currentStored, newSlotCount);
        this.stockItems = appendedStored.map((s) => this.deserializeShopItem(s));
        this.syncShopToStore();
        // Rebuild layout to reflect all permit changes (prices, sidebar, slots)
        this.tearDownShopLayout();
        this.buildLayout();
      },
    });
  }

  // ─── Dev Mode Helpers ───

  /** Add a small dev wrench icon at (x, y) that calls `onClick` when clicked */
  private addDevIcon(x: number, y: number, onClick: () => void): void {
    const icon = this.add
      .text(x, y, '🔧', {
        fontSize: '18px',
      })
      .setOrigin(0.5)
      .setDepth(300)
      .setInteractive({ useHandCursor: true });
    icon.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      onClick();
    });
    icon.on('pointerover', () => icon.setScale(1.3));
    icon.on('pointerout', () => icon.setScale(1));
  }

  /** Dev: swap a shop stock item by prompting for an ID */
  private devSwapShopItem(index: number): void {
    const id = window.prompt('Enter item ID (equipment, supply, trail guide, or frontier):');
    if (!id) return;
    const result = devLookupShopItem(id.trim());
    if (!result) {
      this.showDevMessage('ID not found');
      return;
    }
    if (result.type === 'equipment') {
      this.stockItems[index] = {
        type: 'equipment',
        def: result.def,
        preview: gameFacade.shop.rollShopEquipmentPreview(result.def, getRunState().purchasedPermits),
      };
    } else {
      this.stockItems[index] = { type: 'consumable', def: result.def };
    }
    this.syncShopToStore();
    this.tearDownShopLayout();
    this.buildLayout();
  }

  /** Dev: swap a booster pack by prompting for a pack ID */
  private devSwapPack(index: number): void {
    const id = window.prompt('Enter pack ID:');
    if (!id) return;
    const packDef = devLookupPack(id.trim());
    if (!packDef) {
      this.showDevMessage('ID not found');
      return;
    }
    this.packs[index] = { def: packDef, id: `pack_dev_${Date.now()}` };
    this.syncShopToStore();
    this.tearDownShopLayout();
    this.buildLayout();
  }

  /** Dev: swap the permit by prompting for a permit ID */
  private devSwapPermit(): void {
    const id = window.prompt('Enter permit ID:');
    if (!id) return;
    const permit = devLookupPermit(id.trim());
    if (!permit) {
      this.showDevMessage('ID not found');
      return;
    }
    runActions.patch({ currentLegPermitId: permit.id, permitPurchasedThisLeg: false });
    this.tearDownShopLayout();
    this.buildLayout();
  }

  /** Show a brief dev-mode message at the center of the screen */
  private showDevMessage(msg: string): void {
    const { width, height } = this.scale;
    const text = this.add
      .text(width / 2, height / 2, msg, {
        fontFamily: 'sans-serif',
        fontSize: '28px',
        color: '#ff4444',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.tweens.add({
      targets: text,
      y: text.y - 20,
      alpha: 0,
      duration: 1500,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }
}
