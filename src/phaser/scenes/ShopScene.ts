// ─── ShopScene ───
// Shop that appears before each round. Buy equipment with your money.
// Balatro-inspired layout: sidebar left, equipment top, shop center, pouch bottom-right.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState } from '../../game/PlayerState';
import { processEquipmentOnShopReroll, processEquipmentOnShopEnd } from '../../game/EquipmentEffects';
import { TEXT_COLORS, FONTS, UI, SHOP_WEIGHTS } from '../../game/Constants';
import { generateShopStock, EquipmentDef, EquipmentInstance, getEquipmentListPrice } from '../../game/ItemsSystem';
import {
  processShopTags,
  applyInjectTagsToShopStock,
  applyAuraTagsToShopStock,
  type ShopTagModifications,
} from '../../game/TagSystem';
import { generateShopPacks, PackInstance } from '../../game/BoosterPackSystem';
import {
  ConsumableDef,
  ConsumableInstance,
  executeConsumableEffect,
  useConsumableDirectly,
  getConsumableTexturePrefix,
  getRandomSupplyDef,
  getRandomTrailGuideDef,
  getShopRandomFrontierDef,
  canUseConsumableInShop,
  isSecondHelpingsCloneTarget,
} from '../../game/ConsumablesSystem';
import { ItemCard, CardActionTabConfig } from '../ui/ItemCard';
import { BoosterPackCard } from '../ui/BoosterPackCard';
import { Button } from '../ui/Button';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import { DicePouch } from '../ui/DicePouch';
import { createLayout } from '../ui/SceneLayout';
import { playHandUpgradeAnimation } from '../animations/HandUpgradeAnimation';
import {
  PermitDef,
  generateShopPermit,
  getPermitShopDiscount,
  getDiscountedShopPrice,
  applyPermitEffect,
  hasPermitDiceInShop,
} from '../../game/PermitsSystem';
import {
  acquireEquipmentInstance,
  applyModifiersToEquipment,
  getEquipmentPurchasePrice,
  rollShopEquipmentPreview,
} from '../../game/EquipmentModifiers';
import { createDie } from '../../game/DiceSystem';
import { Die } from '../../game/types';
import diceEnhancements from '../../data/dice_enhancements';
import pipEnhancements from '../../data/pip_enhancements';
import { isDevMode, devLookupShopItem, devLookupPack, devLookupPermit } from '../../game/DevMode';
import {
  type ShopSaveData,
  type SerializedShopItem,
  serializeEquipmentInstance,
  deserializeEquipmentInstance,
} from '../../game/SaveLoad';
import { getPackDefById } from '../../game/BoosterPackSystem';
import { getConsumableDefById } from '../../game/ConsumablesSystem';
import { getEquipmentDefById } from '../../game/ItemsSystem';

const CARD_SPACING = 185;

/** Check if a consumable can be used immediately ("Buy & Use" eligible).
 *  Trail guides, cards with instantEffect, diceSelection, or special-case IDs all qualify. */
function canBuyAndUse(def: ConsumableDef): boolean {
  if (def.category === 'trail_guide') return true;
  // Dice-selection cards can't be used from the shop (no dice to select)
  if (def.diceSelection) return false;
  if (def.instantEffect) return true;
  // second_helpings requires a previous supply or trail guide to clone
  if (def.id === 'second_helpings') {
    return isSecondHelpingsCloneTarget(getPlayerState().lastUsedConsumable);
  }
  // Special-case supply/frontier IDs handled by switch in executeConsumableEffect
  const SPECIAL_IDS = ['doctor', 'compass', 'supply_cache', 'bless'];
  if (SPECIAL_IDS.includes(def.id)) return true;
  return false;
}

/** A shop stock item — equipment, consumable, or dice */
type ShopItem =
  | { type: 'equipment'; def: EquipmentDef; preview: EquipmentInstance; sold?: boolean }
  | { type: 'consumable'; def: ConsumableDef; sold?: boolean }
  | { type: 'dice'; die: Die; displayDef: EquipmentDef; sold?: boolean };

const ENHANCEMENT_INFO = new Map(diceEnhancements.map((e) => [e.id, e]));
const STICKER_INFO = new Map(pipEnhancements.map((s) => [s.id, s]));
const SHOP_ENHANCEMENTS: Die['enhancement'][] = ['bone', 'lucky', 'wooden', 'steel', 'gold', 'loaded'];
const ALL_STICKERS: Die['sticker'][] = ['purple_flower', 'red_bullet', 'golden_dollar', 'blue_moon'];
const DICE_SHOP_COST = 5;

/** Generate a single enhanced die for the shop */
function generateShopDie(mode: 'enhanced' | 'stickered'): { die: Die; displayDef: EquipmentDef } {
  const enhancement = SHOP_ENHANCEMENTS[Math.floor(Math.random() * SHOP_ENHANCEMENTS.length)];
  const die = createDie({ enhancement });

  if (mode === 'stickered') {
    die.sticker = ALL_STICKERS[Math.floor(Math.random() * ALL_STICKERS.length)];
  }

  const enhInfo = enhancement ? ENHANCEMENT_INFO.get(enhancement) : null;
  const name = enhInfo ? `${enhInfo.name} Die` : 'Die';
  const descParts = [enhInfo?.description ?? 'Standard die'];
  if (die.sticker) {
    const stickerInfo = STICKER_INFO.get(die.sticker);
    if (stickerInfo) descParts.push(`Sticker: ${stickerInfo.name}`);
  }

  const displayDef = {
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

  return { die, displayDef };
}

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

  // Action tab state (shop card click-to-buy)
  private activeTabCard: ItemCard | null = null;
  private dismissHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;

  // Shared UI
  private sidebar: Sidebar;
  private equipBar: EquipmentBar;
  private consumableBar: ConsumableBar;
  private dicePouch: DicePouch;

  private pendingRestoreShop: ShopSaveData | null = null;

  constructor() {
    super('Shop');
  }

  init(data: { restoreShop?: ShopSaveData } = {}) {
    if (data.restoreShop) {
      this.pendingRestoreShop = data.restoreShop;
      this.stockItems = null!;
      this.packs = null!;
    }
  }

  getSaveContext(): ShopSaveData {
    return {
      stock: this.stockItems.map((item) => this.serializeShopItem(item)),
      packs: this.packs.map((p) => ({ defId: p.def.id, instanceId: p.id })),
      shopRerollCount: getPlayerState().shopRerollCount,
    };
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
    const player = getPlayerState();
    if (this.pendingRestoreShop) {
      this.stockItems = this.pendingRestoreShop.stock.map((s) => this.deserializeShopItem(s));
      this.packs = this.pendingRestoreShop.packs.map((p) => {
        const def = getPackDefById(p.defId);
        if (!def) throw new Error(`Unknown pack: ${p.defId}`);
        return { def, id: p.instanceId };
      });
      player.shopRerollCount = this.pendingRestoreShop.shopRerollCount;
      this.pendingRestoreShop = null;
    } else if (!this.stockItems) {
      this.stockItems = this.generateMixedStock(player);
      if (!this.packs) {
        this.packs = generateShopPacks(
          2,
          player.isFirstShopVisit() ? { guaranteePackId: 'equipment_standard' } : undefined,
        );
      }
      const tagMods = processShopTags(player);
      this.applyShopTagMods(tagMods, player);
      EventBus.emit(Events.TAG_QUEUE_CHANGED);
      player.resetShopRerolls();
      if (tagMods.freeFirstReroll) {
        player.tagFreeReroll = true;
      }
      if (tagMods.extraPermits > 0) {
        player.bonusShopPermit = generateShopPermit(player.purchasedPermits);
      }
    } else if (!this.packs) {
      this.packs = generateShopPacks(
        2,
        player.isFirstShopVisit() ? { guaranteePackId: 'equipment_standard' } : undefined,
      );
    }

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
    });

    this.buildLayout();
    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildLayout(): void {
    const player = getPlayerState();

    const layout = createLayout(this, { bgKey: 'bg_shop', sidebarTitle: 'SHOP' });
    this.sidebar = layout.sidebar;
    this.equipBar = layout.equipBar;
    this.consumableBar = layout.consumableBar;
    this.consumableBar.setCanUsePredicate((def) => canUseConsumableInShop(def));
    this.dicePouch = layout.dicePouch;
    const contentL = layout.contentX;
    const contentW = layout.contentW;

    // Refresh displays when equipment is sold from the bar
    this.equipBar.on('equipment-changed', () => {
      this.updateDisplays();
      this.updateEquipHints();
    });

    // Refresh displays when consumables change
    this.consumableBar.on('consumable-changed', () => {
      this.updateDisplays();
      this.updateEquipHints();
    });

    // Execute consumable effect when used
    this.consumableBar.on('consumable-used', (consumed: ConsumableInstance) => {
      this.handleConsumableUsed(consumed);
    });

    // Show equipment hints with default (shop) context
    this.updateEquipHints();

    // ─── Layout constants ───
    const equipBarH = UI.EQUIP_BAR_HEIGHT;
    const BOX_RADIUS = 12;
    const BOX_PAD = 16; // padding inside boxes
    const BOX_GAP = 12; // gap between the two boxes
    const CARD_H = 235;
    const PRICE_TAG_SPACE = 36; // room above cards for price tags
    const BTN_COL_W = 130;

    // Row heights (box inner height = card height + price tag + padding)
    const rowInnerH = CARD_H + PRICE_TAG_SPACE + BOX_PAD * 2;

    // Top of first box (below equipment/consumable bars)
    const box1Top = equipBarH + 20;
    const box1H = rowInnerH;
    const box2Top = box1Top + box1H + BOX_GAP;
    const box2H = rowInnerH;

    // Card center Y (same for both rows — vertically centered in box, shifted down for price tags)
    const cardCY1 = box1Top + BOX_PAD + PRICE_TAG_SPACE + CARD_H / 2;
    const cardCY2 = box2Top + BOX_PAD + PRICE_TAG_SPACE + CARD_H / 2;

    // ─── Box 1: Shop items + action buttons ───
    const shopBox = this.add.graphics();
    shopBox.fillStyle(0x0d0d1a, 0.75);
    shopBox.fillRoundedRect(contentL, box1Top, contentW, box1H, BOX_RADIUS);
    shopBox.lineStyle(2, 0x333355, 0.6);
    shopBox.strokeRoundedRect(contentL, box1Top, contentW, box1H, BOX_RADIUS);

    // Action buttons (left side of box 1)
    const btnColX = contentL + BOX_PAD + BTN_COL_W / 2 - 6;
    const btnW = BTN_COL_W - 16;
    const btnH = 52;

    new Button(this, btnColX, cardCY1 - btnH / 2 - 8, 'Hit the\nTrail', btnW, btnH)
      .setColor(0x8b2020, 0xb03030)
      .onClick(() => {
        processEquipmentOnShopEnd(getPlayerState().equipment);
        this.stockItems = null!;
        this.packs = null!;
        this.scene.start('RoundSelect', {});
      });

    this.rerollBtn = new Button(this, btnColX, cardCY1 + btnH / 2 + 8, `Reroll\n$${player.shopRerollCost}`, btnW, btnH);
    this.rerollBtn.setColor(0x2d6b2d, 0x3d8b3d);
    this.rerollBtn.setEnabled(player.canRerollShop());
    this.rerollBtn.onClick(() => this.onRerollShop());

    // Shop stock cards (right side of box 1)
    this.cards = [];
    const cardAreaLeft = contentL + BOX_PAD + BTN_COL_W + 8;
    const cardAreaW = contentW - BOX_PAD * 2 - BTN_COL_W - 8;
    const equipTotalW = this.stockItems.length > 1 ? (this.stockItems.length - 1) * CARD_SPACING : 0;
    const cardStartX = cardAreaLeft + cardAreaW / 2 - equipTotalW / 2;
    const shopDiscount = getPermitShopDiscount(player.purchasedPermits);

    for (let i = 0; i < this.stockItems.length; i++) {
      const shopItem = this.stockItems[i];
      const texturePrefix =
        shopItem.type === 'consumable' ? getConsumableTexturePrefix(shopItem.def.category) : undefined;
      // Apply shop discount to displayed cost
      const itemDef = shopItem.type === 'dice' ? shopItem.displayDef : shopItem.def;
      // Explorer's Guild: trail guides are free
      const isTrailGuideFree =
        shopItem.type === 'consumable' && shopItem.def.category === 'trail_guide' && player.trailGuidesFree;
      let displayDef = isTrailGuideFree
        ? { ...itemDef, cost: 0 }
        : shopDiscount > 0 && shopItem.type !== 'equipment'
          ? { ...itemDef, cost: Math.max(1, Math.floor(itemDef.cost * (1 - shopDiscount))) }
          : itemDef;
      if (shopItem.type === 'equipment') {
        const listPrice = getEquipmentListPrice(shopItem.def);
        const purchaseCost = getEquipmentPurchasePrice(
          shopItem.def,
          shopItem.preview.modifiers,
          listPrice,
          player.purchasedPermits,
        );
        displayDef = { ...shopItem.def, cost: purchaseCost };
      }
      const cardData = (displayDef as { display?: unknown }).display
        ? displayDef
        : {
            ...displayDef,
            display: () => ({
              hint: [],
              tooltip: [[{ text: (displayDef as { description?: string }).description ?? '', style: 'text' }]],
            }),
          };
      const card = new ItemCard(this, cardStartX + i * CARD_SPACING, cardCY1, cardData, {
        mode: 'shop',
        showCost: true,
        ...(shopItem.type === 'equipment' ? { equipment: shopItem.preview } : {}),
        ...(texturePrefix != null ? { texturePrefix } : {}),
      });
      card.setTooltipContext(null, player);
      card.setDepth(10);

      // If this stock item was already sold (e.g. before a permit rebuild), mark and skip
      if (shopItem.sold) {
        card.markSold();
        this.cards.push(card);
        continue;
      }

      const discountedCost = displayDef.cost ?? 0;
      if (shopItem.type === 'equipment') {
        const alreadyOwned = player.equipment.some((e) => e.def.id === shopItem.def.id);
        if (alreadyOwned) {
          card.markSold();
        } else {
          const canAffordEquip =
            player.canAfford(discountedCost) &&
            (shopItem.def.aura?.id === 'ghost' || player.usedEquipmentSlots < player.maxEquipmentSlots);
          card.setAffordable(canAffordEquip);
          this.setupShopCardClick(card, i);
        }
      } else if (shopItem.type === 'consumable') {
        const alreadyOwned = player.consumables.some((c) => c.def.id === shopItem.def.id);
        if (alreadyOwned) {
          card.markSold();
        } else {
          const canAfford = player.canAfford(discountedCost);
          card.setAffordable(canAfford);
          this.setupShopCardClick(card, i);
        }
      } else {
        // Dice card
        const canAfford = player.canAfford(discountedCost);
        card.setAffordable(canAfford);
        this.setupShopCardClick(card, i);
      }

      this.cards.push(card);
    }

    // Dev icons on shop stock cards
    if (isDevMode()) {
      for (let i = 0; i < this.cards.length; i++) {
        const card = this.cards[i];
        if (card.sold) continue;
        this.addDevIcon(cardStartX + i * CARD_SPACING + 60, cardCY1 - 125, () => this.devSwapShopItem(i));
      }
    }

    // ─── Box 2: Voucher + Booster packs ───
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
    const permit = this.getOrGeneratePermit(player);
    this.renderPermitCard(permit, player, voucherX, voucherY, voucherW, voucherH, 'FRONTIER PERMIT', true);
    const bonusPermit = player.bonusShopPermit;
    if (bonusPermit && bonusPermit.id !== permit?.id) {
      const bonusX = voucherX + voucherW + 24;
      this.renderPermitCard(bonusPermit, player, bonusX, voucherY, voucherW, voucherH, 'BONUS PERMIT', false);
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
      const isTrailGuidePack = packInst.def.category === 'trail_guide' && player.trailGuidesFree;
      const discountedPackCost = isTrailGuidePack ? 0 : this.getDiscountedCost(packInst.def.cost);
      if (discountedPackCost !== packInst.def.cost) {
        packCard.setCostDisplay(discountedPackCost);
      }

      if ((packInst as unknown as { _opened?: boolean })._opened) {
        packCard.markSold();
      } else {
        packCard.setAffordable(player.canAfford(discountedPackCost));
        packCard.on('pointerdown', () => this.onBuyPack(packCard, packInst));
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
  }

  private onBuyPack(card: BoosterPackCard, pack: PackInstance): void {
    if (card.sold) return;
    const player = getPlayerState();
    // Explorer's Guild: trail guide packs are free
    const isTrailGuidePack = pack.def.category === 'trail_guide' && player.trailGuidesFree;
    const cost = isTrailGuidePack ? 0 : this.getDiscountedCost(pack.def.cost);
    if (!player.trySpend(cost)) {
      this.showCardPopup(card, "Can't afford!");
      return;
    }

    card.markSold();
    (pack as unknown as { _opened?: boolean })._opened = true;
    this.updateDisplays();

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
    const player = getPlayerState();
    if (def.aura?.id !== 'ghost' && player.usedEquipmentSlots >= player.maxEquipmentSlots) {
      this.showCardPopup(card, 'No space!');
      return;
    }
    const instance = acquireEquipmentInstance(def, player.purchasedPermits, shopItem.preview.modifiers);
    const listPrice = getEquipmentListPrice(def);
    const cost = getEquipmentPurchasePrice(def, instance.modifiers, listPrice, player.purchasedPermits);
    if (!player.trySpend(cost)) {
      this.showCardPopup(card, "Can't afford!");
      return;
    }
    player.equipment.push(instance);
    card.markSold();
    this.markStockSold(card);
    this.sound.play('sfx_coin', { volume: 0.5 });
    this.updateDisplays();
    this.equipBar.refresh();
    this.updateEquipHints();

    // Animate card shrinking toward equipment bar
    const targetX = this.equipBar.x + this.equipBar.width / 2;
    const targetY = this.equipBar.y + UI.EQUIP_BAR_HEIGHT / 2;
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
    const player = getPlayerState();
    const cost = this.getDiscountedCost(shopItem.displayDef.cost);
    if (!player.trySpend(cost)) {
      this.showCardPopup(card, "Can't afford!");
      return;
    }
    player.addDie(shopItem.die);
    card.markSold();
    this.markStockSold(card);
    this.sound.play('sfx_coin', { volume: 0.5 });
    this.updateDisplays();
    this.dicePouch.refresh();

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
    const player = getPlayerState();
    // Explorer's Guild: trail guides are free
    const cost = def.category === 'trail_guide' && player.trailGuidesFree ? 0 : this.getDiscountedCost(def.cost);
    if (!player.canAfford(cost)) {
      this.showCardPopup(card, "Can't afford!");
      return;
    }
    if (!player.canAddConsumable(def)) {
      this.showCardPopup(card, 'No space!');
      return;
    }
    player.trySpend(cost);
    player.addConsumable(def);
    card.markSold();
    this.markStockSold(card);
    this.sound.play('sfx_coin', { volume: 0.5 });
    this.updateDisplays();
    this.consumableBar.refresh();

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
    const player = getPlayerState();
    // Explorer's Guild: trail guides are free
    const cost = def.category === 'trail_guide' && player.trailGuidesFree ? 0 : this.getDiscountedCost(def.cost);
    if (!player.trySpend(cost)) {
      this.showCardPopup(card, "Can't afford!");
      return;
    }
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

    // Use consumable directly (handles lastUsedConsumable tracking)
    const result = useConsumableDirectly(def, player);
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

        if (canBuyAndUse(shopItem.def)) {
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
    const player = getPlayerState();
    const result = executeConsumableEffect(consumed, player);
    this.handleConsumableResult(result);
  }

  private handleConsumableResult(result: ReturnType<typeof executeConsumableEffect>): void {
    // Refresh all UI
    this.updateDisplays();
    this.equipBar.refresh();
    this.consumableBar.refresh();
    this.dicePouch.refresh();

    if (!result.success && result.failReason) {
      // Show popup at center of consumable bar area
      const text = this.add
        .text(this.consumableBar.x + this.consumableBar.width / 2, this.consumableBar.y, result.failReason, {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: '#fff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(1000);
      this.sound.play('sfx_cancel', { volume: 0.5 });
      this.tweens.add({
        targets: text,
        y: text.y - 15,
        alpha: 0,
        duration: 2000,
        ease: 'Power2',
        onComplete: () => text.destroy(),
      });
    }

    // If the consumable triggers a dice selection, launch it
    if (result.diceSelection) {
      this.scene.start('DiceSelection', {
        config: result.diceSelection,
        returnScene: 'Shop',
      });
    }

    // Play hand upgrade animation for trail guides / Spiritual Journey
    const upgrades = result.handUpgrades ?? (result.handUpgrade ? [result.handUpgrade] : []);
    if (upgrades.length > 0) {
      playHandUpgradeAnimation({
        scene: this,
        sidebar: this.sidebar,
        upgrades,
        onComplete: () => {},
      });
    }
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
    const player = getPlayerState();
    if (!player.payShopReroll()) return;

    this.stockItems = this.generateMixedStock(player);
    applyInjectTagsToShopStock(this.stockItems, player);
    applyAuraTagsToShopStock(this.stockItems, player);
    EventBus.emit(Events.TAG_QUEUE_CHANGED);

    this.children.removeAll(true);
    this.cards = [];
    this.packCards = [];
    this.buildLayout();
  }

  private updateDisplays(): void {
    const player = getPlayerState();
    this.sidebar.refreshMoney();

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (card.sold) continue;
      const shopItem = this.stockItems[i];
      const itemDef = shopItem.type === 'dice' ? shopItem.displayDef : shopItem.def;
      // Explorer's Guild: trail guides are free
      const isTrailGuideFree =
        shopItem.type === 'consumable' && shopItem.def.category === 'trail_guide' && player.trailGuidesFree;
      let cost = isTrailGuideFree ? 0 : this.getDiscountedCost(itemDef.cost);
      if (shopItem.type === 'equipment') {
        const listPrice = getEquipmentListPrice(shopItem.def);
        cost = getEquipmentPurchasePrice(shopItem.def, shopItem.preview.modifiers, listPrice, player.purchasedPermits);
        const canAffordEquip =
          player.canAfford(cost) &&
          (shopItem.def.aura?.id === 'ghost' || player.usedEquipmentSlots < player.maxEquipmentSlots);
        card.setAffordable(canAffordEquip);
      } else {
        card.setAffordable(player.canAfford(cost));
      }
    }

    for (const packCard of this.packCards) {
      if (!packCard.sold) {
        // Explorer's Guild: trail guide packs are free
        const isTrailGuidePack = packCard.pack.def.category === 'trail_guide' && player.trailGuidesFree;
        const packCost = isTrailGuidePack ? 0 : this.getDiscountedCost(packCard.pack.def.cost);
        packCard.setAffordable(player.canAfford(packCost));
      }
    }

    // Update permit card affordability
    if (this.permitCard && !this.permitCard.sold) {
      const permit = player.currentLegPermit;
      if (permit) {
        this.permitCard.setAffordable(player.canAfford(this.getPermitCost(permit, player)));
      }
    }

    this.rerollBtn.setEnabled(player.canRerollShop());
    const rerollCost = player.shopRerollCost;
    this.rerollBtn.setText(rerollCost === 0 ? 'Reroll\nFREE' : `Reroll\n$${rerollCost}`);
    this.dicePouch.refresh();
  }

  private onResize(): void {
    this.children.removeAll(true);
    this.cards = [];
    this.packCards = [];
    this.buildLayout();
  }

  private updateEquipHints(): void {
    this.equipBar.updateHints(null, getPlayerState());
  }

  /** Mark a stock item as sold by matching the card's index in this.cards */
  private markStockSold(card: ItemCard): void {
    const idx = this.cards.indexOf(card);
    if (idx >= 0 && this.stockItems[idx]) {
      this.stockItems[idx].sold = true;
    }
  }

  /** Get IDs of equipment and consumables the player already owns */
  private getOwnedItemIds(player: ReturnType<typeof getPlayerState>): string[] {
    const equipIds = player.equipment.map((e) => e.def.id);
    const consumableIds = player.consumables.map((c) => c.def.id);
    return [...equipIds, ...consumableIds];
  }

  /** Apply tag modifications to freshly generated shop stock. */
  private applyShopTagMods(tagMods: ShopTagModifications, player: ReturnType<typeof getPlayerState>): void {
    applyInjectTagsToShopStock(this.stockItems, player);

    if (tagMods.freeShop) {
      for (const stockItem of this.stockItems) {
        if (stockItem.type === 'equipment') {
          stockItem.def = { ...stockItem.def, cost: 0 };
        } else if (stockItem.type === 'consumable') {
          stockItem.def = { ...stockItem.def, cost: 0 };
        } else if (stockItem.type === 'dice') {
          stockItem.displayDef = { ...stockItem.displayDef, cost: 0 };
        }
      }
      for (const pack of this.packs ?? []) {
        pack.def = { ...pack.def, cost: 0 };
      }
    }

    applyAuraTagsToShopStock(this.stockItems, player);
    this.syncEquipmentPreviews();
  }

  /** Keep preview instances aligned with stock defs (aura tags, free shop, inject tags). */
  private syncEquipmentPreviews(): void {
    const player = getPlayerState();
    for (const item of this.stockItems) {
      if (item.type !== 'equipment') continue;
      if (!item.preview) {
        item.preview = rollShopEquipmentPreview(item.def, player.purchasedPermits);
        continue;
      }
      item.preview.def = item.def;
      applyModifiersToEquipment(item.preview, item.preview.modifiers);
    }
  }

  /** Generate a mix of equipment and consumable cards for the shop stock.
   *  Each slot is independently rolled from a weighted category pool. */
  private generateMixedStock(player: ReturnType<typeof getPlayerState>): ShopItem[] {
    const slotCount = Math.max(1, player.shopSlots);
    const items: ShopItem[] = [];
    const excludeIds = this.getOwnedItemIds(player);

    // If permit allows dice in shop, always include one die as the first slot
    const diceMode = hasPermitDiceInShop(player.purchasedPermits);
    if (diceMode !== 'none') {
      const { die, displayDef } = generateShopDie(diceMode);
      items.push({ type: 'dice', die, displayDef });
    }

    // Build weighted category table
    const categories: { type: 'equipment' | 'supply' | 'trail_guide' | 'frontier'; weight: number }[] = [
      { type: 'equipment', weight: SHOP_WEIGHTS.equipment },
      { type: 'supply', weight: SHOP_WEIGHTS.supply },
      { type: 'trail_guide', weight: SHOP_WEIGHTS.trail_guide },
    ];
    if (player.profession?.modifiers?.frontierInShop) {
      categories.push({ type: 'frontier', weight: SHOP_WEIGHTS.frontier });
    }

    const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
    const remainingSlots = slotCount - items.length;

    for (let i = 0; i < remainingSlots; i++) {
      let roll = Math.random() * totalWeight;
      let picked = categories[0].type;
      for (const cat of categories) {
        roll -= cat.weight;
        if (roll <= 0) {
          picked = cat.type;
          break;
        }
      }

      if (picked === 'equipment') {
        const [def] = generateShopStock(1, excludeIds);
        items.push({
          type: 'equipment',
          def,
          preview: rollShopEquipmentPreview(def, player.purchasedPermits),
        });
        excludeIds.push(def.id); // also exclude from subsequent slots
      } else {
        let def: ConsumableDef;
        if (picked === 'supply') {
          def = getRandomSupplyDef(undefined, excludeIds);
        } else if (picked === 'trail_guide') {
          def = getRandomTrailGuideDef(undefined, excludeIds);
        } else {
          def = getShopRandomFrontierDef(undefined, excludeIds);
        }
        items.push({ type: 'consumable', def });
        excludeIds.push(def.id); // also exclude from subsequent slots
      }
    }

    return items;
  }

  /** Generate a single random stock item using the same category weights */
  private generateOneStockItem(player: ReturnType<typeof getPlayerState>): ShopItem {
    const excludeIds = this.getOwnedItemIds(player);
    // Also exclude items already in current stock
    for (const item of this.stockItems) {
      if (item.type === 'equipment') excludeIds.push(item.def.id);
      else if (item.type === 'consumable') excludeIds.push(item.def.id);
    }

    const categories: { type: 'equipment' | 'supply' | 'trail_guide' | 'frontier'; weight: number }[] = [
      { type: 'equipment', weight: SHOP_WEIGHTS.equipment },
      { type: 'supply', weight: SHOP_WEIGHTS.supply },
      { type: 'trail_guide', weight: SHOP_WEIGHTS.trail_guide },
    ];
    if (player.profession?.modifiers?.frontierInShop) {
      categories.push({ type: 'frontier', weight: SHOP_WEIGHTS.frontier });
    }
    const totalWeight = categories.reduce((sum, c) => sum + c.weight, 0);
    let roll = Math.random() * totalWeight;
    let picked = categories[0].type;
    for (const cat of categories) {
      roll -= cat.weight;
      if (roll <= 0) {
        picked = cat.type;
        break;
      }
    }
    if (picked === 'equipment') {
      const [def] = generateShopStock(1, excludeIds);
      return {
        type: 'equipment',
        def,
        preview: rollShopEquipmentPreview(def, player.purchasedPermits),
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
    player: ReturnType<typeof getPlayerState>,
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
        cost: this.getPermitCost(permit, player),
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
        texturePrefix: 'permit_',
        transparentBg: true,
        cardScale: 1.2,
        tabAnchorX: 45,
      });
      permitItemCard.setTooltipContext(null, player);
      permitItemCard.setDepth(10);
      permitItemCard.setAffordable(player.canAfford(permitDisplayDef.cost));
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
  private getOrGeneratePermit(player: ReturnType<typeof getPlayerState>): PermitDef | null {
    // Already purchased a permit this leg — no new one until next leg
    if (player.permitPurchasedThisLeg) return null;
    if (player.currentLegPermit) return player.currentLegPermit;
    const permit = generateShopPermit(player.purchasedPermits);
    if (permit) player.currentLegPermit = permit;
    return permit;
  }

  /** Get permit cost after shop discount */
  private getPermitCost(permit: PermitDef, player: ReturnType<typeof getPlayerState>): number {
    const discount = getPermitShopDiscount(player.purchasedPermits);
    return Math.max(1, Math.floor(permit.cost * (1 - discount)));
  }

  /** Get the discounted cost for any shop item */
  private getDiscountedCost(baseCost: number): number {
    return getDiscountedShopPrice(baseCost, getPlayerState().purchasedPermits);
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
    const player = getPlayerState();
    const cost = this.getPermitCost(permit, player);

    if (!player.trySpend(cost)) {
      this.showCardPopup(card, "Can't afford!");
      return;
    }

    // Apply permit after spending
    player.purchasedPermits.push(permit.id);
    applyPermitEffect(permit, player);
    if (isPrimary) {
      player.currentLegPermit = null;
      player.permitPurchasedThisLeg = true;
    } else {
      player.bonusShopPermit = null;
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
        const newSlotCount = Math.max(1, player.shopSlots);
        while (this.stockItems.length < newSlotCount) {
          this.stockItems.push(this.generateOneStockItem(player));
        }
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
      const player = getPlayerState();
      this.stockItems[index] = {
        type: 'equipment',
        def: result.def,
        preview: rollShopEquipmentPreview(result.def, player.purchasedPermits),
      };
    } else {
      this.stockItems[index] = { type: 'consumable', def: result.def };
    }
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
    const player = getPlayerState();
    player.currentLegPermit = permit;
    player.permitPurchasedThisLeg = false;
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
