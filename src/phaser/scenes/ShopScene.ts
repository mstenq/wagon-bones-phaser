// ─── ShopScene ───
// Shop that appears before each round. Buy equipment with your money.
// Balatro-inspired layout: sidebar left, equipment top, shop center, pouch bottom-right.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { gameFacade } from '../../game/facade';
import type { ConsumableDef, ConsumableInstance, UseConsumableResult } from '../../game/facade/consumable';
import {
  canBuyAndUseConsumableInShop,
  canUseConsumableInShop,
  getConsumableAtlasKey,
  getRandomSupplyDef,
  getRandomTrailGuideDef,
  getShopRandomFrontierDef,
} from '../../game/facade/consumable';
import type { EquipmentDef, EquipmentInstance, PackInstance } from '../../game/facade/shop';
import { getConsumableDefById } from '../../game/facade/consumable';
import { getEquipmentDefById, getPackDefById } from '../../game/facade/shop';
import { resolveEquipmentList } from '../../game/store/resolve';
import {
  selectProfession,
  selectShopRerollCost,
  selectTrailGuidesFree,
  selectUsedEquipmentSlots,
} from '../../game/store/selectors/runSelectors';
import { resolveConsumableList } from '../../game/store/resolve';
import { canAfford } from '../../game/store/economy';
import { getPermitById } from '../../game/PermitsSystem';
import { TEXT_COLORS, FONTS, UI, SHOP_WEIGHTS } from '../../game/Constants';
import { ItemCard, CardActionTabConfig, type CardData } from '../ui/ItemCard';
import { addDiceCardVisual } from '../ui/DiceCardVisual';
import { getItemDisplayContext } from '../../game/displayContext';
import { BoosterPackCard } from '../ui/BoosterPackCard';
import { Button } from '../ui/Button';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import { createLayout } from '../ui/SceneLayout';
import { handleStandardConsumableResult } from './consumableResult';
import {
  PermitDef,
  generateShopPermit,
  getPermitShopDiscount,
  getDiscountedShopPrice,
  hasPermitDiceInShop,
} from '../../game/PermitsSystem';
import { Die } from '../../game/types';
import diceEnhancements from '../../data/dice_enhancements';
import pipEnhancements from '../../data/pip_enhancements';
import { isDevMode, devLookupShopItem, devLookupPack, devLookupPermit } from '../../game/DevMode';
import { type SerializedShopItem, serializeEquipmentInstance, deserializeEquipmentInstance } from '../../game/SaveLoad';
import { getSceneState, sceneActions } from '../../game/store/sceneStore';
import { getRunState, runActions, runStore } from '../../game/store/runStore';
import { sceneStore } from '../../game/store/sceneStore';
import { selectShopAffordabilityInputs, selectShopStockRevision } from '../../game/store/selectors/sceneSelectors';
import { bindStore } from '../store/subscribe';
import { bindScenePlaybackRunner } from '../playback/bindScenePlaybackRunner';
import type { ShopSceneState } from '../../game/store/types';
import { rngFloat } from '../../game/RunRng';
import { generateShopDie } from '../../game/store/shopStock';

const CARD_SPACING = 185;

/** A shop stock item — equipment, consumable, or dice */
type ShopItem =
  | { type: 'equipment'; def: EquipmentDef; preview: EquipmentInstance; sold?: boolean }
  | { type: 'consumable'; def: ConsumableDef; sold?: boolean }
  | { type: 'dice'; die: Die; displayDef: EquipmentDef; sold?: boolean };

const ENHANCEMENT_INFO = new Map(diceEnhancements.map((e) => [e.id, e]));
const STICKER_INFO = new Map(pipEnhancements.map((s) => [s.id, s]));
const DICE_SHOP_COST = 5;

function buildShopDieDisplayDef(die: Die): EquipmentDef {
  const enhInfo = die.enhancement ? ENHANCEMENT_INFO.get(die.enhancement) : null;
  const name = enhInfo ? `${enhInfo.name} Die` : 'Die';
  const descParts = [enhInfo?.description ?? 'Standard die'];
  if (die.sticker) {
    const stickerInfo = STICKER_INFO.get(die.sticker);
    if (stickerInfo) descParts.push(`Sticker: ${stickerInfo.name}`);
  }
  return {
    id: `shop_die_${die.id}`,
    name,
    cost: DICE_SHOP_COST,
    rarity: 'uncommon' as string,
    effectType: 'DICE',
    effectParams: {},
    display: () => ({
      hint: [],
      tooltip: [[{ text: descParts.join('\n'), style: 'text' }]],
    }),
  } as unknown as EquipmentDef;
}

export class ShopScene extends Scene {
  private stockItems: ShopItem[];
  private packs: PackInstance[];
  private cards: ItemCard[] = [];
  private packCards: BoosterPackCard[] = [];
  private permitCard: ItemCard | null = null;
  private rerollBtn: Button;
  private displayStoreUnsubs: Array<() => void> = [];
  /** Shop row-1 objects (stock box, buttons, stock cards) — cleared on reroll without rebuilding equip bar. */
  private shopStockObjects: Phaser.GameObjects.GameObject[] = [];
  /** Avoid double stock rebuild when reroll handler and store subscription both fire. */
  private suppressStockRefresh = false;

  // Action tab state (shop card click-to-buy)
  private activeTabCard: ItemCard | null = null;
  private dismissHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;

  // Shared UI
  private sidebar: Sidebar;
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

  private buildShopSceneState(): ShopSceneState {
    return {
      stock: this.stockItems.map((item) => this.serializeShopItem(item)),
      packs: this.packs.map((p) => ({
        defId: p.def.id,
        instanceId: p.id,
        opened: this.isPackOpened(p),
      })),
      shopRerollCount: getRunState().shopRerollCount,
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
    if (!shop) return !!(pack as unknown as { _opened?: boolean })._opened;
    const entry = shop.packs.find((p) => p.instanceId === pack.id);
    return entry?.opened ?? false;
  }

  private serializeShopItem(item: ShopItem): SerializedShopItem {
    if (item.type === 'equipment') {
      return {
        type: 'equipment',
        defId: item.def.id,
        preview: serializeEquipmentInstance(item.preview),
        sold: item.sold,
      };
    }
    if (item.type === 'consumable') {
      return { type: 'consumable', defId: item.def.id, sold: item.sold };
    }
    return { type: 'dice', die: { ...item.die }, sold: item.sold };
  }

  private deserializeShopItem(item: SerializedShopItem): ShopItem {
    if (item.type === 'equipment') {
      const def = getEquipmentDefById(item.defId);
      if (!def) throw new Error(`Unknown equipment: ${item.defId}`);
      return {
        type: 'equipment',
        def,
        preview: deserializeEquipmentInstance(item.preview),
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

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.tearDownShopSubscriptions();
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
    const bonusPermit = run.bonusShopPermitId ? getPermitById(run.bonusShopPermitId) : null;

    const layout = createLayout(this, { bgKey: 'bg_shop', sidebarTitle: 'SHOP' });
    this.sidebar = layout.sidebar;
    this.equipBar = layout.equipBar;
    this.consumableBar = layout.consumableBar;
    this.consumableBar.setCanUsePredicate((def) => canUseConsumableInShop(def));
    const contentL = layout.contentX;
    const contentW = layout.contentW;

    this.equipBar.on('equipment-changed', () => {
      this.updateEquipHints();
    });

    this.consumableBar.on('consumable-changed', () => {
      this.updateEquipHints();
    });

    bindScenePlaybackRunner(this, {
      scene: this,
      equipBar: this.equipBar,
      consumableBar: this.consumableBar,
      sidebar: this.sidebar,
    });

    this.consumableBar.on('consumable-used', (consumed: ConsumableInstance) => {
      void this.handleConsumableUsed(consumed);
    });

    // Show equipment hints with default (shop) context
    this.updateEquipHints();

    const layoutMetrics = this.getShopLayoutMetrics(contentL, contentW);
    this.buildShopStock(run, equipment, consumables, trailGuidesFree, layoutMetrics);

    // ─── Box 2: Voucher + Booster packs ───
    const { box2Top, box2H, cardCY2, CARD_H, BOX_RADIUS, BOX_PAD, BTN_COL_W } = layoutMetrics;
    const packBox = this.add.graphics();
    packBox.fillStyle(0x0d0d1a, 0.75);
    packBox.fillRoundedRect(contentL, box2Top, contentW, box2H, BOX_RADIUS);
    packBox.lineStyle(2, 0x333355, 0.6);
    packBox.strokeRoundedRect(contentL, box2Top, contentW, box2H, BOX_RADIUS);

    // Permit card (left side of box 2)
    const voucherW = BTN_COL_W - 16;
    const voucherH = CARD_H;
    const voucherX = contentL + BOX_PAD + voucherW / 2 + 50;
    const voucherY = cardCY2;

    this.permitCard = null;
    const permit = this.getOrGeneratePermit();
    this.renderPermitCard(permit, voucherX, voucherY, voucherW, voucherH, 'FRONTIER PERMIT', true);
    if (bonusPermit && bonusPermit.id !== permit?.id) {
      const bonusX = voucherX + voucherW + 24;
      this.renderPermitCard(bonusPermit, bonusX, voucherY, voucherW, voucherH, 'BONUS PERMIT', false);
    }

    // Booster packs (right side of box 2)
    this.packCards = [];
    const packAreaLeft = contentL + BOX_PAD + BTN_COL_W + 8;
    const packAreaW = contentW - BOX_PAD * 2 - BTN_COL_W - 8;
    const packTotalW = (this.packs.length - 1) * CARD_SPACING;
    const packX0 = packAreaLeft + packAreaW / 2 - packTotalW / 2;

    for (let i = 0; i < this.packs.length; i++) {
      const packInst = this.packs[i];
      const packCard = new BoosterPackCard(this, packX0 + i * CARD_SPACING, cardCY2, packInst);
      packCard.setDepth(10);
      // Explorer's Guild: trail guide packs are free
      const isTrailGuidePack = packInst.def.category === 'trail_guide' && trailGuidesFree;
      const discountedPackCost = isTrailGuidePack ? 0 : this.getDiscountedCost(packInst.def.cost);
      if (discountedPackCost !== packInst.def.cost) {
        packCard.setCostDisplay(discountedPackCost);
      }

      if (this.isPackOpened(packInst)) {
        packCard.markSold();
      } else {
        packCard.setAffordable(canAfford(run, discountedPackCost));
        packCard.on('pointerdown', () => this.onBuyPack(packCard, i));
        packCard.on('pointerover', () => {
          if (!packCard.sold) this.tweens.add({ targets: packCard, scaleX: 1.05, scaleY: 1.05, duration: 100 });
        });
        packCard.on('pointerout', () => {
          if (!packCard.sold) this.tweens.add({ targets: packCard, scaleX: 1, scaleY: 1, duration: 100 });
        });
      }

      this.packCards.push(packCard);
    }

    // Dev icons on booster packs
    if (isDevMode()) {
      for (let i = 0; i < this.packCards.length; i++) {
        const packCard = this.packCards[i];
        if (packCard.sold) continue;
        this.addDevIcon(packX0 + i * CARD_SPACING + 60, cardCY2 - 125, () => this.devSwapPack(i));
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

  private onBuyPack(card: BoosterPackCard, packIndex: number): void {
    if (card.sold) return;
    const pack = this.packs[packIndex];
    if (!pack) return;
    const isTrailGuidePack = pack.def.category === 'trail_guide' && selectTrailGuidesFree(getRunState());
    const cost = isTrailGuidePack ? 0 : this.getDiscountedCost(pack.def.cost);
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
    const def = shopItem.def;
    const run = getRunState();
    if (def.aura?.id !== 'ghost' && selectUsedEquipmentSlots(run) >= run.maxEquipmentSlots) {
      this.showCardPopup(card, 'No space!');
      return;
    }
    const result = gameFacade.shop.buyEquipment(def, shopItem.preview, gameFacade.shop.getEquipmentListPrice(def));
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
      onComplete: () => card.destroy(),
    });
  }

  private onBuyDie(card: ItemCard, shopItem: { type: 'dice'; die: Die; displayDef: EquipmentDef }): void {
    if (card.sold) return;
    const cost = this.getDiscountedCost(shopItem.displayDef.cost);
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
      onComplete: () => card.destroy(),
    });
  }

  private onBuyConsumable(card: ItemCard, def: ConsumableDef): void {
    if (card.sold) return;
    const cost = gameFacade.shop.consumableCost(def, this.getDiscountedCost(def.cost));
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
    const targetY = this.consumableBar.y + UI.EQUIP_BAR_HEIGHT / 2;
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
      onComplete: () => card.destroy(),
    });
  }

  /** Buy a consumable and immediately use it (bypasses consumable slot limit) */
  private onBuyAndUseConsumable(card: ItemCard, def: ConsumableDef): void {
    if (card.sold) return;
    const cost = gameFacade.shop.consumableCost(def, this.getDiscountedCost(def.cost));
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
      onComplete: () => card.destroy(),
    });

    const result = gameFacade.shop.buyAndUseConsumable(def, cost);
    this.handleConsumableResult(result);
  }

  // ─── Shop Card Action Tabs ───

  private setupShopCardClick(card: ItemCard, stockIndex: number): void {
    card.on('pointerover', () => {
      if (!card.sold && this.activeTabCard !== card) {
        this.tweens.add({ targets: card, scaleX: 1.05, scaleY: 1.05, duration: 100 });
      }
    });
    card.on('pointerout', () => {
      if (!card.sold && this.activeTabCard !== card) {
        this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: 100 });
      }
    });

    card.on('pointerup', () => {
      if (card.sold) return;
      card.setTooltipContext(null, getItemDisplayContext());

      // Toggle: if this card already has tabs, dismiss
      if (this.activeTabCard === card) {
        this.dismissActiveTab();
        return;
      }

      // Dismiss any other card's tabs first
      this.dismissActiveTab();

      const shopItem = this.stockItems[stockIndex];
      if (!shopItem) return;

      // Lift card
      this.tweens.add({
        targets: card,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 150,
        ease: 'Back.easeOut',
      });
      card.setDepth(200);

      // Build tabs based on item type
      const tabs: CardActionTabConfig[] = [];

      if (shopItem.type === 'equipment') {
        tabs.push({
          label: 'BUY',
          color: 0x2255aa,
          position: 'bottom',
          callback: () => {
            this.dismissActiveTab();
            this.onBuyEquipment(card, stockIndex);
          },
        });
      } else if (shopItem.type === 'dice') {
        tabs.push({
          label: 'BUY',
          color: 0x2255aa,
          position: 'bottom',
          callback: () => {
            this.dismissActiveTab();
            this.onBuyDie(card, shopItem);
          },
        });
      } else {
        // Consumable
        tabs.push({
          label: 'BUY',
          color: 0x2255aa,
          position: 'bottom',
          callback: () => {
            this.dismissActiveTab();
            this.onBuyConsumable(card, shopItem.def);
          },
        });

        const canBuyAndUse = canBuyAndUseConsumableInShop(shopItem.def);
        if (shopItem.def.id === 'second_helpings') {
          tabs.push({
            label: 'BUY\n& USE',
            color: canBuyAndUse ? 0x338833 : 0x555555,
            textColor: canBuyAndUse ? '#ffffff' : '#bbbbbb',
            position: 'right',
            disabled: !canBuyAndUse,
            callback: () => {
              this.dismissActiveTab();
              this.onBuyAndUseConsumable(card, shopItem.def);
            },
          });
        } else if (canBuyAndUse) {
          tabs.push({
            label: 'BUY\n& USE',
            color: 0x338833,
            position: 'right',
            callback: () => {
              this.dismissActiveTab();
              this.onBuyAndUseConsumable(card, shopItem.def);
            },
          });
        }
      }

      card.showActionTabs(tabs);
      this.activeTabCard = card;

      // Install click-away dismiss
      this.time.delayedCall(50, () => {
        if (this.dismissHandler) {
          this.input.off('pointerdown', this.dismissHandler);
        }
        this.dismissHandler = (pointer: Phaser.Input.Pointer) => {
          const hitObjects = this.input.hitTestPointer(pointer);
          if (this.activeTabCard && hitObjects.includes(this.activeTabCard)) return;
          for (const go of hitObjects) {
            if (go.parentContainer && this.activeTabCard && go.parentContainer === this.activeTabCard) return;
          }
          this.dismissActiveTab();
        };
        this.input.on('pointerdown', this.dismissHandler);
      });
    });
  }

  private dismissActiveTab(): void {
    if (this.activeTabCard) {
      const card = this.activeTabCard;
      card.hideActionTabs(true);

      // Settle card back
      if (!card.sold) {
        this.tweens.add({
          targets: card,
          scaleX: 1,
          scaleY: 1,
          duration: 200,
          ease: 'Back.easeOut',
        });
      }
      card.setDepth(10);

      this.activeTabCard = null;
    }
    if (this.dismissHandler) {
      this.input.off('pointerdown', this.dismissHandler);
      this.dismissHandler = null;
    }
  }

  private handleConsumableUsed(consumed: ConsumableInstance): void {
    const result = gameFacade.consumable.use(consumed);
    this.handleConsumableResult(result);
  }

  private handleConsumableResult(result: UseConsumableResult): void {
    handleStandardConsumableResult(this, this.sidebar, result, 'Shop', {
      x: this.consumableBar.x + this.consumableBar.width / 2,
      y: this.consumableBar.y,
      sound: () => this.sound.play('sfx_cancel', { volume: 0.5 }),
    });
  }

  /** Show a brief floating text popup above a card with a cancel sound */
  private showCardPopup(card: ItemCard | BoosterPackCard, message: string): void {
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

  private getShopLayoutMetrics(contentL: number, contentW: number) {
    const equipBarH = UI.EQUIP_BAR_HEIGHT;
    const BOX_RADIUS = 12;
    const BOX_PAD = 16;
    const BOX_GAP = 12;
    const CARD_H = 235;
    const PRICE_TAG_SPACE = 36;
    const BTN_COL_W = 130;
    const rowInnerH = CARD_H + PRICE_TAG_SPACE + BOX_PAD * 2;
    const box1Top = equipBarH + 20;
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
      BOX_RADIUS,
      BOX_PAD,
      BTN_COL_W,
    };
  }

  private trackShopStockObject(obj: Phaser.GameObjects.GameObject): void {
    this.shopStockObjects.push(obj);
  }

  private clearShopStock(): void {
    this.dismissActiveTab();
    for (const obj of this.shopStockObjects) {
      if (obj.scene) obj.destroy();
    }
    this.shopStockObjects = [];
    for (const card of this.cards) {
      if (card.scene) card.destroy();
    }
    this.cards = [];
    this.rerollBtn = null!;
  }

  private buildShopStock(
    run: ReturnType<typeof getRunState>,
    equipment: EquipmentInstance[],
    consumables: ReturnType<typeof resolveConsumableList>,
    trailGuidesFree: boolean,
    metrics: ReturnType<typeof this.getShopLayoutMetrics>,
  ): void {
    const { contentL, contentW, box1Top, box1H, cardCY1, BOX_RADIUS, BOX_PAD, BTN_COL_W } = metrics;
    this.shopStockObjects = [];

    const shopBox = this.add.graphics();
    shopBox.fillStyle(0x0d0d1a, 0.75);
    shopBox.fillRoundedRect(contentL, box1Top, contentW, box1H, BOX_RADIUS);
    shopBox.lineStyle(2, 0x333355, 0.6);
    shopBox.strokeRoundedRect(contentL, box1Top, contentW, box1H, BOX_RADIUS);
    this.trackShopStockObject(shopBox);

    const btnColX = contentL + BOX_PAD + BTN_COL_W / 2 - 6;
    const btnW = BTN_COL_W - 16;
    const btnH = 52;

    const hitTrailBtn = new Button(this, btnColX, cardCY1 - btnH / 2 - 8, 'Hit the\nTrail', btnW, btnH)
      .setColor(0x8b2020, 0xb03030)
      .onClick(() => {
        gameFacade.shop.processShopEnd(resolveEquipmentList());
        this.tearDownShopSubscriptions();
        sceneActions.clearShop();
        this.scene.start('RoundSelect', {});
      });
    this.trackShopStockObject(hitTrailBtn);

    this.rerollBtn = new Button(
      this,
      btnColX,
      cardCY1 + btnH / 2 + 8,
      `Reroll\n$${selectShopRerollCost(run)}`,
      btnW,
      btnH,
    );
    this.rerollBtn.setColor(0x2d6b2d, 0x3d8b3d);
    this.rerollBtn.setEnabled(gameFacade.shop.canRerollShop(run));
    this.rerollBtn.onClick(() => this.onRerollShop());
    this.trackShopStockObject(this.rerollBtn);

    this.cards = [];
    const cardAreaLeft = contentL + BOX_PAD + BTN_COL_W + 8;
    const cardAreaW = contentW - BOX_PAD * 2 - BTN_COL_W - 8;
    const equipTotalW = this.stockItems.length > 1 ? (this.stockItems.length - 1) * CARD_SPACING : 0;
    const cardStartX = cardAreaLeft + cardAreaW / 2 - equipTotalW / 2;
    const shopDiscount = getPermitShopDiscount(run.purchasedPermits);

    for (let i = 0; i < this.stockItems.length; i++) {
      const shopItem = this.stockItems[i];
      const consumableTextureKey =
        shopItem.type === 'consumable' ? getConsumableAtlasKey(shopItem.def.category) : undefined;
      const itemDef = shopItem.type === 'dice' ? shopItem.displayDef : shopItem.def;
      const isTrailGuideFree =
        shopItem.type === 'consumable' && shopItem.def.category === 'trail_guide' && trailGuidesFree;
      let displayDef = isTrailGuideFree
        ? { ...itemDef, cost: 0 }
        : shopDiscount > 0 && shopItem.type !== 'equipment'
          ? { ...itemDef, cost: Math.max(1, Math.floor(itemDef.cost * (1 - shopDiscount))) }
          : itemDef;
      if (shopItem.type === 'equipment') {
        const listPrice = gameFacade.shop.getEquipmentListPrice(shopItem.def);
        const purchaseCost = gameFacade.shop.getEquipmentPurchasePrice(
          shopItem.def,
          shopItem.preview.modifiers,
          listPrice,
          run.purchasedPermits,
        );
        displayDef = { ...shopItem.def, cost: purchaseCost };
      }
      const card = new ItemCard(this, cardStartX + i * CARD_SPACING, cardCY1, displayDef as CardData, {
        mode: 'shop',
        showCost: true,
        ...(shopItem.type === 'equipment' ? { equipment: shopItem.preview } : {}),
        ...(consumableTextureKey != null ? { textureKey: consumableTextureKey } : {}),
      });
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

      const discountedCost = displayDef.cost ?? 0;
      if (shopItem.type === 'equipment') {
        const alreadyOwned = equipment.some((e) => e.def.id === shopItem.def.id);
        if (alreadyOwned) {
          card.markSold();
        } else {
          const canAffordEquip =
            canAfford(run, discountedCost) &&
            (shopItem.def.aura?.id === 'ghost' || selectUsedEquipmentSlots(run) < run.maxEquipmentSlots);
          card.setAffordable(canAffordEquip);
          this.setupShopCardClick(card, i);
        }
      } else if (shopItem.type === 'consumable') {
        const alreadyOwned = consumables.some((c) => c.def.id === shopItem.def.id);
        if (alreadyOwned) {
          card.markSold();
        } else {
          card.setAffordable(canAfford(run, discountedCost));
          this.setupShopCardClick(card, i);
        }
      } else {
        card.setAffordable(canAfford(run, discountedCost));
        this.setupShopCardClick(card, i);
      }

      this.cards.push(card);
    }

    if (isDevMode()) {
      for (let i = 0; i < this.cards.length; i++) {
        const card = this.cards[i];
        if (card.sold) continue;
        this.addDevIcon(cardStartX + i * CARD_SPACING + 60, cardCY1 - 125, () => this.devSwapShopItem(i));
      }
    }
  }

  private rebuildShopStockOnly(): void {
    this.clearShopStock();
    const run = getRunState();
    const { width } = this.scale;
    const sidebarW = Math.floor(width * UI.SIDEBAR_WIDTH_RATIO);
    const contentL = sidebarW + UI.FELT_PADDING;
    const contentW = width - sidebarW - UI.FELT_PADDING * 2;
    const metrics = this.getShopLayoutMetrics(contentL, contentW);
    this.buildShopStock(
      run,
      resolveEquipmentList(run),
      resolveConsumableList(run),
      selectTrailGuidesFree(run),
      metrics,
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
      const itemDef = shopItem.type === 'dice' ? shopItem.displayDef : shopItem.def;
      const isTrailGuideFree =
        shopItem.type === 'consumable' && shopItem.def.category === 'trail_guide' && shopInputs.trailGuidesFree;
      let cost = isTrailGuideFree ? 0 : this.getDiscountedCost(itemDef.cost);
      if (shopItem.type === 'equipment') {
        const listPrice = gameFacade.shop.getEquipmentListPrice(shopItem.def);
        cost = gameFacade.shop.getEquipmentPurchasePrice(
          shopItem.def,
          shopItem.preview.modifiers,
          listPrice,
          run.purchasedPermits,
        );
        const canAffordEquip =
          canAfford(run, cost) &&
          (shopItem.def.aura?.id === 'ghost' || shopInputs.usedEquipmentSlots < shopInputs.maxEquipmentSlots);
        card.setAffordable(canAffordEquip);
      } else {
        card.setAffordable(canAfford(run, cost));
      }
      card.setTooltipContext(null, tooltipPlayer);
    }

    for (const packCard of this.packCards) {
      if (!packCard.sold) {
        const isTrailGuidePack = packCard.pack.def.category === 'trail_guide' && shopInputs.trailGuidesFree;
        const packCost = isTrailGuidePack ? 0 : this.getDiscountedCost(packCard.pack.def.cost);
        packCard.setAffordable(canAfford(run, packCost));
      }
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
    this.shopStockObjects = [];
    this.children.removeAll(true);
    this.cards = [];
    this.packCards = [];
    this.rerollBtn = null!;
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

  /** Get IDs of equipment and consumables the player already owns */
  private getOwnedItemIds(): string[] {
    const run = getRunState();
    const equipIds = resolveEquipmentList(run).map((e) => e.def.id);
    const consumableIds = resolveConsumableList(run).map((c) => c.def.id);
    return [...equipIds, ...consumableIds];
  }

  /** Generate a single random stock item using the same category weights */
  private generateOneStockItem(): ShopItem {
    const run = getRunState();
    const excludeIds = this.getOwnedItemIds();
    // Also exclude items already in current stock
    for (const item of this.stockItems) {
      if (item.type === 'equipment') excludeIds.push(item.def.id);
      else if (item.type === 'consumable') excludeIds.push(item.def.id);
    }

    const categories: { type: 'equipment' | 'supply' | 'trail_guide' | 'frontier' | 'dice'; weight: number }[] = [
      { type: 'equipment', weight: SHOP_WEIGHTS.equipment },
      { type: 'supply', weight: SHOP_WEIGHTS.supply },
      { type: 'trail_guide', weight: SHOP_WEIGHTS.trail_guide },
    ];
    const diceMode = hasPermitDiceInShop(run.purchasedPermits);
    if (diceMode !== 'none') {
      categories.push({ type: 'dice', weight: SHOP_WEIGHTS.dice });
    }
    if (selectProfession(run)?.modifiers?.frontierInShop) {
      categories.push({ type: 'frontier', weight: SHOP_WEIGHTS.frontier });
    }
    const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
    let roll = rngFloat('shop') * totalWeight;
    let picked = categories[0].type;
    for (const cat of categories) {
      roll -= cat.weight;
      if (roll <= 0) {
        picked = cat.type;
        break;
      }
    }
    if (picked === 'dice' && diceMode !== 'none') {
      const die = generateShopDie(diceMode);
      return { type: 'dice', die, displayDef: buildShopDieDisplayDef(die) };
    }
    if (picked === 'equipment') {
      const [def] = gameFacade.shop.generateShopStock(1, excludeIds);
      return {
        type: 'equipment',
        def,
        preview: gameFacade.shop.rollShopEquipmentPreview(def, run.purchasedPermits),
      };
    }
    let def: ConsumableDef;
    if (picked === 'supply') def = getRandomSupplyDef(undefined, excludeIds);
    else if (picked === 'trail_guide') def = getRandomTrailGuideDef(undefined, excludeIds);
    else def = getShopRandomFrontierDef(undefined, excludeIds);
    return { type: 'consumable', def };
  }

  // ─── Permit Helpers ───

  private renderPermitCard(
    permit: PermitDef | null,
    voucherX: number,
    voucherY: number,
    voucherW: number,
    voucherH: number,
    label: string,
    isPrimary: boolean,
  ): void {
    if (permit) {
      const permitDisplayDef = {
        id: permit.id,
        name: permit.name,
        cost: this.getPermitCost(permit),
        rarity: 'permit' as string,
        effectType: 'PERMIT',
        effectParams: {},
        display: () => ({
          hint: [],
          tooltip: [[{ text: permit.description, style: 'text' }]],
        }),
      } as unknown as EquipmentDef;

      const permitItemCard = new ItemCard(this, voucherX, voucherY, permitDisplayDef, {
        mode: 'shop',
        showCost: true,
        textureKey: 'permits',
        transparentBg: true,
        cardScale: 1.2,
        tabAnchorX: 45,
      });
      permitItemCard.setTooltipContext(null, getItemDisplayContext());
      permitItemCard.setDepth(10);
      permitItemCard.setAffordable(canAfford(getRunState(), permitDisplayDef.cost));
      this.setupPermitCardClick(permitItemCard, permit, isPrimary);
      if (isPrimary) this.permitCard = permitItemCard;

      if (isDevMode() && isPrimary) {
        this.addDevIcon(voucherX + 50, voucherY - 125, () => this.devSwapPermit());
      }

      const labelX = voucherX - voucherW / 2 - 20;
      const permitLabel = this.add.text(labelX, voucherY, label, {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#ccccdd',
        fontStyle: 'bold',
        align: 'center',
        letterSpacing: 1,
      });
      permitLabel.setOrigin(0.5);
      permitLabel.setRotation(-Math.PI / 2);
      permitLabel.setAlpha(0.85);
      permitLabel.setDepth(5);
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

  /** Get the discounted cost for any shop item */
  private getDiscountedCost(baseCost: number): number {
    return getDiscountedShopPrice(baseCost, getRunState().purchasedPermits);
  }

  /** Set up click-to-buy on the permit card */
  private setupPermitCardClick(card: ItemCard, permit: PermitDef, isPrimary: boolean): void {
    card.on('pointerover', () => {
      if (!card.sold && this.activeTabCard !== card) {
        this.tweens.add({ targets: card, scaleX: 1.05, scaleY: 1.05, duration: 100 });
      }
    });
    card.on('pointerout', () => {
      if (!card.sold && this.activeTabCard !== card) {
        this.tweens.add({ targets: card, scaleX: 1, scaleY: 1, duration: 100 });
      }
    });

    card.on('pointerup', () => {
      if (card.sold) return;

      if (this.activeTabCard === card) {
        this.dismissActiveTab();
        return;
      }

      this.dismissActiveTab();

      this.tweens.add({
        targets: card,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 150,
        ease: 'Back.easeOut',
      });
      card.setDepth(200);

      const tabs: CardActionTabConfig[] = [
        {
          label: 'BUY',
          color: 0x7722aa,
          position: 'bottom',
          callback: () => {
            this.dismissActiveTab();
            this.onBuyPermit(card, permit, isPrimary);
          },
        },
      ];

      card.showActionTabs(tabs);
      this.activeTabCard = card;

      this.time.delayedCall(50, () => {
        if (this.dismissHandler) {
          this.input.off('pointerdown', this.dismissHandler);
        }
        this.dismissHandler = (pointer: Phaser.Input.Pointer) => {
          const hitObjects = this.input.hitTestPointer(pointer);
          if (this.activeTabCard && hitObjects.includes(this.activeTabCard)) return;
          for (const go of hitObjects) {
            if (go.parentContainer && this.activeTabCard && go.parentContainer === this.activeTabCard) return;
          }
          this.dismissActiveTab();
        };
        this.input.on('pointerdown', this.dismissHandler);
      });
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
        // If permit increased shop slots, append new items (keep existing stock)
        const newSlotCount = Math.max(1, getRunState().shopSlots);
        while (this.stockItems.length < newSlotCount) {
          this.stockItems.push(this.generateOneStockItem());
        }
        this.syncShopToStore();
        // Rebuild layout to reflect all permit changes (prices, sidebar, slots)
        this.children.removeAll(true);
        this.cards = [];
        this.packCards = [];
        this.permitCard = null;
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
    // Rebuild
    this.children.removeAll(true);
    this.cards = [];
    this.packCards = [];
    this.permitCard = null;
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
    this.packs[index] = { def: packDef as any, id: `pack_dev_${Date.now()}` };
    this.syncShopToStore();
    // Rebuild
    this.children.removeAll(true);
    this.cards = [];
    this.packCards = [];
    this.permitCard = null;
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
    // Rebuild
    this.children.removeAll(true);
    this.cards = [];
    this.packCards = [];
    this.permitCard = null;
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
