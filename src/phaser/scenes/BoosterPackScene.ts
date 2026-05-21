// ─── BoosterPackScene ───
// Opened when player buys a booster pack. Cards are used immediately via
// slide-out action tabs. Dice-targeting cards select from a visible dice lineup
// displayed above the pack cards. All effects applied inline — no consumable slots needed.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import {
  PackDefinition,
  PackItem,
  InstantEffect,
  generatePackContents,
  getPackDefById,
} from '../../game/BoosterPackSystem';
import { getPlayerState } from '../../game/PlayerState';
import { generateRandomEquipment } from '../../game/ItemsSystem';
import { acquireEquipmentInstance, acquireRewardEquipmentInstance } from '../../game/EquipmentModifiers';
import {
  createSupplyConsumableDef,
  createTrailGuideConsumableDef,
  createFrontierConsumableDef,
  ConsumableInstance,
  executeConsumableEffect,
  useConsumableDirectly,
  getConsumableTexturePrefix,
  getRandomSupplyDef,
} from '../../game/ConsumablesSystem';
import { applyDiceSelectionEffect } from '../../game/DiceSelectionSystem';
import { processEquipmentOnPackSkipped, processEquipmentOnPackOpened } from '../../game/EquipmentEffects';
import { Die, HandType, HandDefinition } from '../../game/types';
import { TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { Button } from '../ui/Button';
import { DiceSprite } from '../ui/DiceSprite';
import { ItemCard, CardActionTabConfig } from '../ui/ItemCard';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import { DicePouch } from '../ui/DicePouch';
import { createLayout } from '../ui/SceneLayout';
import { playHandUpgradeAnimation } from '../animations/HandUpgradeAnimation';
import handsData from '../../data/hands.json';
import diceEnhancementsData from '../../data/dice_enhancements.json';

const HAND_TABLE = handsData as HandDefinition[];
import stickerData from '../../data/pip_enhancements.json';
import trailGuidesData from '../../data/trail_guides.json';
import supplyCardsData from '../../data/supply_cards.json';
import frontierEncountersData from '../../data/frontier_encounters.json';

const ENHANCEMENT_INFO = new Map(diceEnhancementsData.map((e) => [e.id, e]));
const STICKER_INFO = new Map(stickerData.map((s) => [s.id, s]));

const CARD_W = 130;
const CARD_H = 180;
const CARD_SPACING = 185;
const CARD_RADIUS = 8;
const DICE_SPACING = UI.DICE_SPACING;

const CATEGORY_COLORS: Record<string, number> = {
  dice: 0x8b4513,
  supply: 0x2e8b57,
  trail_guide: 0x4682b4,
  frontier: 0x8b008b,
  equipment: 0xb8860b,
};

interface CardSprite {
  container: Phaser.GameObjects.Container;
  item: PackItem;
  used: boolean;
  index: number;
  diceSprite?: DiceSprite;
  itemCard?: ItemCard;
}

export class BoosterPackScene extends Scene {
  private packDef!: PackDefinition;
  private returnScene = 'Shop';
  private contents: PackItem[];
  private cardSprites: CardSprite[] = [];
  private picksRemaining: number;
  private skipBtn: Button;
  private picksText: Phaser.GameObjects.Text;
  private instructionText: Phaser.GameObjects.Text;

  // Shared UI
  private sidebar: Sidebar;
  private equipBar: EquipmentBar;
  private consumableBar: ConsumableBar;
  private dicePouch: DicePouch;

  // Layout helpers
  private contentCX: number = 0;
  private cardY: number = 0;

  // Dice lineup (displayed above cards)
  private lineupDice: Die[] = [];
  private lineupSprites: DiceSprite[] = [];
  private lineupLockIcons: Phaser.GameObjects.Text[] = [];
  private selectedDiceIds: Set<string> = new Set();
  private lineupY: number = 0;

  // Active card tab state
  private activeTabCard: CardSprite | null = null;
  private dismissHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;

  constructor() {
    super('BoosterPack');
  }

  init(data: {
    packDef?: PackDefinition;
    packDefId?: string;
    returnScene?: string;
    free?: boolean;
  } = {}) {
    if (data.packDef) {
      this.packDef = data.packDef;
    } else if (data.packDefId) {
      const def = getPackDefById(data.packDefId);
      if (!def) {
        throw new Error(`Unknown pack id: ${data.packDefId}`);
      }
      this.packDef = def;
    }
    this.returnScene = data.returnScene ?? 'Shop';
  }

  create() {
    this.contents = generatePackContents(this.packDef);
    this.picksRemaining = this.packDef.pickCount;
    this.cardSprites = [];
    this.selectedDiceIds = new Set();
    this.activeTabCard = null;

    // Process pack-opened equipment effects (Leftovers: chance to grant supply card)
    const player = getPlayerState();
    const grantSupply = processEquipmentOnPackOpened(player.equipment);
    if (grantSupply) {
      const supplyDef = getRandomSupplyDef();
      player.addConsumable(supplyDef);
    }

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    this.buildLayout();
  }

  private buildLayout(): void {
    const { height } = this.scale;

    const layout = createLayout(this, { bgKey: null, felt: true, sidebarTitle: 'BOOSTER PACK' });
    this.sidebar = layout.sidebar;
    this.equipBar = layout.equipBar;
    this.consumableBar = layout.consumableBar;
    this.dicePouch = layout.dicePouch;
    this.contentCX = layout.contentCX;

    // Refresh displays when equipment is sold from the bar
    this.equipBar.on('equipment-changed', () => {
      this.sidebar.refreshMoney();
      this.dicePouch.refresh();
      this.updateEquipHints();
    });

    // Refresh displays when consumables change
    this.consumableBar.on('consumable-changed', () => {
      this.sidebar.refreshMoney();
      this.dicePouch.refresh();
    });

    // Execute consumable effect when used
    this.consumableBar.on('consumable-used', (consumed: ConsumableInstance) => {
      this.handleConsumableUsed(consumed);
    });

    // Show equipment hints
    this.updateEquipHints();

    // ─── Pack name ───
    const equipBarH = UI.EQUIP_BAR_HEIGHT;
    const titleY = equipBarH + 16;
    this.add
      .text(this.contentCX, titleY, this.packDef.name, {
        fontFamily: FONTS.HEADING,
        fontSize: '28px',
        color: TEXT_COLORS.PRIMARY,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    // Instructions / picks remaining
    this.picksText = this.add
      .text(this.contentCX, titleY + 36, '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '16px',
        color: TEXT_COLORS.SECONDARY,
      })
      .setOrigin(0.5);
    this.updatePicksText();

    // ─── Dice lineup (above cards) — only for packs with dice-selection cards ───
    const showLineup = this.contents.some((item) => !!item.diceSelection);
    if (showLineup) {
      this.lineupY = titleY + 80 + 40;
      this.buildDiceLineup();

      // Instruction text for dice selection
      this.instructionText = this.add
        .text(this.contentCX, this.lineupY + 50, '', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '14px',
          color: TEXT_COLORS.MUTED,
        })
        .setOrigin(0.5)
        .setDepth(15);
    } else {
      this.lineupY = 0;
      this.instructionText = this.add.text(0, 0, '').setVisible(false);
    }

    // ─── Cards ───
    const totalCardsWidth = (this.contents.length - 1) * CARD_SPACING;
    const startX = this.contentCX - totalCardsWidth / 2;
    this.cardY = showLineup ? this.lineupY + 70 + CARD_H / 2 : titleY + 70 + CARD_H / 2;

    for (let i = 0; i < this.contents.length; i++) {
      const item = this.contents[i];
      const x = startX + i * CARD_SPACING;
      const { container, diceSprite, itemCard } = this.createCardDisplay(x, this.cardY, item);

      const sprite: CardSprite = {
        container,
        item,
        used: false,
        index: i,
        diceSprite: diceSprite ?? undefined,
        itemCard: itemCard ?? undefined,
      };
      this.cardSprites.push(sprite);

      this.setupCardClick(sprite);
    }

    // Skip button
    const btnY = height - 36;
    this.skipBtn = new Button(this, this.contentCX, btnY, 'Skip', 140, 44);
    this.skipBtn.onClick(() => this.onSkip());
  }

  // ─── Dice Lineup ───

  private buildDiceLineup(): void {
    this.clearDiceLineup();
    const player = getPlayerState();

    // Draw handSize random non-spent dice
    const nonSpent = player.dice.filter((d) => !player.spentDiceIds.has(d.id));
    const shuffled = [...nonSpent].sort(() => Math.random() - 0.5);
    this.lineupDice = shuffled.slice(0, Math.min(player.handSize, shuffled.length));

    if (this.lineupDice.length === 0) return;

    const totalWidth = (this.lineupDice.length - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;

    for (let i = 0; i < this.lineupDice.length; i++) {
      const die = this.lineupDice[i];
      const arc = this.getArcOffset(i, this.lineupDice.length);
      const x = startX + i * DICE_SPACING;
      const y = this.lineupY + arc.y;

      const sprite = new DiceSprite(this, x, y, die);
      sprite.rotation = arc.rotation;
      sprite.setDepth(10);
      this.lineupSprites.push(sprite);

      // Lock icon (hidden initially)
      const lockIcon = this.add
        .text(x, y + 46, '🔒', { fontSize: '14px' })
        .setOrigin(0.5)
        .setDepth(11)
        .setVisible(false);
      this.lineupLockIcons.push(lockIcon);

      // Click handler for dice selection
      sprite.on('pointerdown', () => this.onLineupDieClick(i));
    }

    // Disable lineup interaction by default (enabled when a dice-selection card is active)
    this.setLineupInteractive(false);
  }

  private clearDiceLineup(): void {
    for (const s of this.lineupSprites) s.destroy();
    for (const icon of this.lineupLockIcons) icon.destroy();
    this.lineupSprites = [];
    this.lineupLockIcons = [];
    this.lineupDice = [];
    this.selectedDiceIds.clear();
  }

  private refreshDiceLineup(): void {
    // Re-draw dice from current player pool
    const oldSelected = new Set(this.selectedDiceIds);
    this.clearDiceLineup();

    const player = getPlayerState();
    const nonSpent = player.dice.filter((d) => !player.spentDiceIds.has(d.id));
    const shuffled = [...nonSpent].sort(() => Math.random() - 0.5);
    this.lineupDice = shuffled.slice(0, Math.min(player.handSize, shuffled.length));

    if (this.lineupDice.length === 0) return;

    const totalWidth = (this.lineupDice.length - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;

    for (let i = 0; i < this.lineupDice.length; i++) {
      const die = this.lineupDice[i];
      const arc = this.getArcOffset(i, this.lineupDice.length);
      const x = startX + i * DICE_SPACING;
      const y = this.lineupY + arc.y;

      const sprite = new DiceSprite(this, x, y, die);
      sprite.rotation = arc.rotation;
      sprite.setDepth(10);
      this.lineupSprites.push(sprite);

      const lockIcon = this.add
        .text(x, y + 46, '🔒', { fontSize: '14px' })
        .setOrigin(0.5)
        .setDepth(11)
        .setVisible(false);
      this.lineupLockIcons.push(lockIcon);

      sprite.on('pointerdown', () => this.onLineupDieClick(i));

      // Restore selection if die still exists
      if (oldSelected.has(die.id)) {
        this.selectedDiceIds.add(die.id);
        sprite.setSelected(true);
        lockIcon.setVisible(true);
      }
    }

    this.setLineupInteractive(false);
  }

  private setLineupInteractive(enabled: boolean): void {
    for (const sprite of this.lineupSprites) {
      sprite.setDisabled(!enabled);
    }
  }

  private onLineupDieClick(index: number): void {
    if (!this.activeTabCard) return;
    const die = this.lineupDice[index];
    if (!die) return;

    const sprite = this.lineupSprites[index];
    const lockIcon = this.lineupLockIcons[index];
    const requiredPicks = this.getRequiredDicePicks();

    if (this.selectedDiceIds.has(die.id)) {
      // Deselect
      this.selectedDiceIds.delete(die.id);
      sprite.setSelected(false);
      if (lockIcon) lockIcon.setVisible(false);
      this.sound.play('sfx_card_slide2', { volume: 0.25 });
    } else if (this.selectedDiceIds.size < requiredPicks) {
      // Select
      this.selectedDiceIds.add(die.id);
      sprite.setSelected(true);
      if (lockIcon) lockIcon.setVisible(true);
      this.sound.play('sfx_highlight1', { volume: 0.3 });
    }

    this.updateInstructionText();
    this.updateActiveTabEnabled();
  }

  private getArcOffset(i: number, count: number): { y: number; rotation: number } {
    if (count <= 1) return { y: 0, rotation: 0 };
    const t = i / (count - 1) - 0.5;
    const y = -UI.DICE_ARC_HEIGHT * (1 - 4 * t * t);
    const rotation = t * UI.DICE_ARC_ROTATION * 2;
    return { y, rotation };
  }

  // ─── Card Display ───

  private createCardDisplay(
    x: number,
    y: number,
    item: PackItem,
  ): { container: Phaser.GameObjects.Container; diceSprite: DiceSprite | null; itemCard: ItemCard | null } {
    const container = this.add.container(x, y);
    const color = CATEGORY_COLORS[item.category] ?? 0x444444;
    let diceSprite: DiceSprite | null = null;
    let itemCard: ItemCard | null = null;

    // Card background
    const cardBg = this.add.graphics();
    cardBg.fillStyle(color, 1);
    cardBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    cardBg.lineStyle(2, 0x888888, 0.7);
    cardBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    container.add(cardBg);

    if (item.category === 'dice' && item.die) {
      // ─── Dice card layout ───
      const diceBg = this.add.graphics();
      diceBg.fillStyle(0xf0ece3, 1);
      diceBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
      diceBg.lineStyle(2, 0xc0b8a0, 0.9);
      diceBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
      container.add(diceBg);

      const enhInfo = item.die.enhancement ? ENHANCEMENT_INFO.get(item.die.enhancement) : null;
      const enhName = enhInfo ? enhInfo.name : 'Standard';
      const titleText = this.add
        .text(0, -CARD_H / 2 + 16, enhName, {
          fontFamily: FONTS.HEADING,
          fontSize: '15px',
          color: '#3a3020',
          align: 'center',
        })
        .setOrigin(0.5, 0);
      container.add(titleText);

      diceSprite = new DiceSprite(this, 0, -8, item.die, { showAuraLabel: true });
      container.add(diceSprite);

      if (item.die.sticker) {
        const sInfo = STICKER_INFO.get(item.die.sticker);
        const stickerLabel = sInfo ? sInfo.name : item.die.sticker.replace(/_/g, ' ');
        const descText = this.add
          .text(0, CARD_H / 2 - 12, stickerLabel, {
            fontFamily: FONTS.PRIMARY,
            fontSize: '11px',
            color: '#5a4a2a',
            align: 'center',
          })
          .setOrigin(0.5, 1);
        container.add(descText);
      }
    } else if (item.category === 'equipment' && item.equipmentDef) {
      itemCard = new ItemCard(this, 0, 0, item.equipmentDef, {
        mode: 'inventory',
        equipment: item.equipmentPreview,
      });
      container.add(itemCard);
    } else if (item.category === 'trail_guide' && item.trailGuideId) {
      const tgData = { ...item, id: item.trailGuideId };
      itemCard = new ItemCard(this, 0, 0, tgData, {
        mode: 'inventory',
        texturePrefix: getConsumableTexturePrefix('trail_guide'),
      });
      container.add(itemCard);
    } else if (item.category === 'supply' && item.supplyCardId) {
      const scData = { ...item, id: item.supplyCardId };
      itemCard = new ItemCard(this, 0, 0, scData, {
        mode: 'inventory',
        texturePrefix: getConsumableTexturePrefix('supply'),
      });
      container.add(itemCard);
    } else if (item.category === 'frontier' && item.frontierEncounterId) {
      const feData = { ...item, id: item.frontierEncounterId };
      itemCard = new ItemCard(this, 0, 0, feData, {
        mode: 'inventory',
        texturePrefix: getConsumableTexturePrefix('frontier'),
      });
      container.add(itemCard);
    } else {
      const catLabel = item.category.replace('_', ' ').toUpperCase();
      const catText = this.add
        .text(0, -CARD_H / 2 + 14, catLabel, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '10px',
          color: TEXT_COLORS.MUTED,
        })
        .setOrigin(0.5, 0);
      container.add(catText);

      const nameText = this.add
        .text(0, -20, item.name, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '14px',
          color: TEXT_COLORS.PRIMARY,
          align: 'center',
          wordWrap: { width: CARD_W - 16 },
        })
        .setOrigin(0.5, 0.5);
      container.add(nameText);

      const descText = this.add
        .text(0, 20, item.description, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '11px',
          color: TEXT_COLORS.SECONDARY,
          align: 'center',
          wordWrap: { width: CARD_W - 16 },
        })
        .setOrigin(0.5, 0);
      container.add(descText);
    }

    container.setSize(CARD_W, CARD_H);
    container.setInteractive(new Phaser.Geom.Rectangle(0, 0, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
    container.setDepth(10);

    return { container, diceSprite, itemCard };
  }

  // ─── Card Action Tabs (slide-out USE button) ───

  private setupCardClick(sprite: CardSprite): void {
    const { container, itemCard, diceSprite: diceSpriteChild } = sprite;

    const clickHandler = () => {
      if (sprite.used || this.picksRemaining <= 0) return;

      // Toggle: if this card already has tabs, dismiss
      if (this.activeTabCard === sprite) {
        this.dismissActiveTab();
        return;
      }

      // Dismiss any other card's tabs first
      this.dismissActiveTab();

      // Block equipment cards if no free slot
      if (this.cardNeedsEquipSlot(sprite.item)) {
        const player = getPlayerState();
        if (player.equipmentSlotsFree <= 0) return;
      }

      // Lift card
      this.tweens.add({
        targets: container,
        scaleX: 1.1,
        scaleY: 1.1,
        duration: 150,
        ease: 'Back.easeOut',
      });
      container.setDepth(200);

      // Build action tabs
      const tabs = this.buildActionTabs(sprite);

      // If no tabs available (e.g. second_helpings with no target), show popup
      if (tabs.length === 0) {
        // Undo the card lift
        this.tweens.add({
          targets: container,
          scaleX: 1,
          scaleY: 1,
          duration: 150,
        });
        container.setDepth(10);
        this.sound.play('sfx_cancel', { volume: 0.5 });
        this.showFloatingText('Nothing to copy');
        return;
      }

      // Show tabs — use ItemCard if available, otherwise build custom tabs on container
      if (itemCard) {
        itemCard.showActionTabs(tabs);
      } else {
        this.showContainerActionTabs(container, tabs);
      }

      this.activeTabCard = sprite;

      // Enable dice lineup interaction if card needs dice selection
      if (this.cardNeedsDiceSelection(sprite.item)) {
        this.setLineupInteractive(true);
        this.selectedDiceIds.clear();
        this.clearLineupSelections();
        this.updateInstructionText();
      }

      // Install click-away dismiss
      this.time.delayedCall(50, () => {
        if (this.dismissHandler) {
          this.input.off('pointerdown', this.dismissHandler);
        }
        this.dismissHandler = (pointer: Phaser.Input.Pointer) => {
          const hitObjects = this.input.hitTestPointer(pointer);
          // Don't dismiss if clicking the active card, its children, or lineup dice
          if (this.activeTabCard) {
            const activeContainer = this.activeTabCard.container;
            if (hitObjects.includes(activeContainer)) return;
            for (const go of hitObjects) {
              if (go.parentContainer && go.parentContainer === activeContainer) return;
              // Check if clicking an ItemCard's action tab
              if (this.activeTabCard.itemCard && go.parentContainer === this.activeTabCard.itemCard) return;
            }
          }
          // Don't dismiss if clicking lineup dice
          for (const ds of this.lineupSprites) {
            if (hitObjects.includes(ds)) return;
            for (const go of hitObjects) {
              if (go.parentContainer && go.parentContainer === ds) return;
            }
          }
          this.dismissActiveTab();
        };
        this.input.on('pointerdown', this.dismissHandler);
      });
    };

    container.on('pointerup', clickHandler);
    if (diceSpriteChild) {
      diceSpriteChild.on('pointerup', clickHandler);
    }
    if (itemCard) {
      itemCard.on('pointerup', clickHandler);
    }

    container.on('pointerover', () => {
      if (!sprite.used && this.activeTabCard !== sprite) {
        this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 80 });
      }
    });
    container.on('pointerout', () => {
      if (!sprite.used && this.activeTabCard !== sprite) {
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 80 });
      }
    });
  }

  private buildActionTabs(sprite: CardSprite): CardActionTabConfig[] {
    const item = sprite.item;

    // second_helpings needs a valid clone target
    if (item.supplyCardId === 'second_helpings') {
      const player = getPlayerState();
      if (!player.lastUsedConsumable || player.lastUsedConsumable.id === 'second_helpings') {
        return [];
      }
    }

    // BUMP_VALUE gets two tabs (+1 / -1)
    if (item.diceSelection && item.diceSelection.effectType === 'BUMP_VALUE') {
      return [
        {
          label: '+1\nUP',
          color: 0x338833,
          callback: () => {
            item.diceSelection!.effectParams.bumpDirection = 'up';
            this.onUseCard(sprite);
          },
        },
        {
          label: '-1\nDOWN',
          color: 0x883333,
          callback: () => {
            item.diceSelection!.effectParams.bumpDirection = 'down';
            this.onUseCard(sprite);
          },
        },
      ];
    }

    return [
      {
        label: 'USE',
        color: 0x338833,
        callback: () => this.onUseCard(sprite),
      },
    ];
  }

  /** Show action tabs on a plain container (for dice cards that don't use ItemCard) */
  private showContainerActionTabs(container: Phaser.GameObjects.Container, tabs: CardActionTabConfig[]): void {
    const tabW = 50;
    const tabH = 45;
    const tabGap = 4;
    const tabRadius = 6;
    const hw = CARD_W / 2;
    const hh = CARD_H / 2;

    for (let i = 0; i < tabs.length; i++) {
      const cfg = tabs[i];
      const tabContainer = this.add.container(hw, 0);
      tabContainer.setDepth(-1);

      const tabY = hh - tabH - (tabH + tabGap) * i - 20;

      const bg = this.add.graphics();
      bg.fillStyle(cfg.color, 0.95);
      bg.fillRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
      bg.lineStyle(1, 0xffffff, 0.2);
      bg.strokeRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
      tabContainer.add(bg);

      const label = this.add
        .text(tabW / 2, tabY + tabH / 2, cfg.label, {
          fontFamily: 'sans-serif',
          fontSize: '16px',
          color: '#ffffff',
          align: 'center',
          lineSpacing: -2,
        })
        .setOrigin(0.5);
      tabContainer.add(label);

      tabContainer.setSize(tabW, tabH);
      tabContainer.setInteractive(
        new Phaser.Geom.Rectangle(tabW / 2, tabY + tabH / 2, tabW, tabH),
        Phaser.Geom.Rectangle.Contains,
      );

      tabContainer.on('pointerover', () => {
        bg.clear();
        bg.fillStyle(Phaser.Display.Color.ValueToColor(cfg.color).lighten(20).color, 0.95);
        bg.fillRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
        bg.lineStyle(1, 0xffffff, 0.4);
        bg.strokeRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
      });

      tabContainer.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(cfg.color, 0.95);
        bg.fillRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
        bg.lineStyle(1, 0xffffff, 0.2);
        bg.strokeRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
      });

      tabContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        pointer.event?.stopPropagation();
        cfg.callback();
      });

      // Slide-out animation
      const finalX = hw;
      tabContainer.x = hw - tabW;
      container.add(tabContainer);
      container.sendToBack(tabContainer);

      this.tweens.add({
        targets: tabContainer,
        x: finalX,
        duration: 200,
        ease: 'Back.easeOut',
        delay: i * 50,
      });

      // Tag for cleanup
      tabContainer.setName('actionTab');
    }

    this.sound.play('sfx_whoosh', { volume: 0.3 });
  }

  /** Remove action tabs from a plain container */
  private hideContainerActionTabs(container: Phaser.GameObjects.Container, animate: boolean): void {
    const tabs = container.getAll().filter((c) => c.name === 'actionTab') as Phaser.GameObjects.Container[];
    if (tabs.length === 0) return;

    if (animate && this.scene) {
      this.sound.play('sfx_whoosh2', { volume: 0.3 });
      const tabW = 50;
      const hw = CARD_W / 2;
      for (const tab of tabs) {
        this.tweens.add({
          targets: tab,
          x: hw - tabW,
          duration: 150,
          ease: 'Power2',
          onComplete: () => tab.destroy(),
        });
      }
    } else {
      for (const tab of tabs) tab.destroy();
    }
  }

  private dismissActiveTab(): void {
    if (this.activeTabCard) {
      const sprite = this.activeTabCard;
      const { container, itemCard } = sprite;

      // Hide tabs
      if (itemCard) {
        itemCard.hideActionTabs(true);
      } else {
        this.hideContainerActionTabs(container, true);
      }

      // Settle card back
      if (!sprite.used) {
        this.tweens.add({
          targets: container,
          scaleX: 1,
          scaleY: 1,
          duration: 150,
          ease: 'Power2',
        });
        container.setDepth(10);
      }

      // Clear dice selection state
      this.setLineupInteractive(false);
      this.selectedDiceIds.clear();
      this.clearLineupSelections();
      this.instructionText.setText('');

      this.activeTabCard = null;
    }

    if (this.dismissHandler) {
      this.input.off('pointerdown', this.dismissHandler);
      this.dismissHandler = null;
    }
  }

  private clearLineupSelections(): void {
    for (let i = 0; i < this.lineupSprites.length; i++) {
      if (this.lineupSprites[i].scene) {
        this.lineupSprites[i].setSelected(false);
      }
      this.lineupLockIcons[i]?.setVisible(false);
    }
  }

  // ─── Card Use Logic ───

  private cardNeedsDiceSelection(item: PackItem): boolean {
    // drawCount === 0 means "use scene lineup" for ENHANCE/DESTROY/CLONE/etc.
    // drawCount > 0 means draw random dice (old pattern — but we now use lineup for all)
    return !!item.diceSelection;
  }

  private getRequiredDicePicks(): number {
    if (!this.activeTabCard?.item.diceSelection) return 0;
    return this.activeTabCard.item.diceSelection.pickCount;
  }

  private updateActiveTabEnabled(): void {
    // For dice-selection cards, the USE tab should only be enabled when enough dice are selected
    if (!this.activeTabCard) return;
    if (!this.cardNeedsDiceSelection(this.activeTabCard.item)) return;

    const required = this.getRequiredDicePicks();
    const selected = this.selectedDiceIds.size;
    const enabled = selected === required;

    // Update tab visuals — just adjust alpha on action tabs
    const { container, itemCard } = this.activeTabCard;
    if (itemCard) {
      // ItemCard manages its own tabs — we need to find them
      // The tabs are children of the ItemCard container; adjust their alpha
      const tabContainers = (itemCard as any).actionTabs as { container: Phaser.GameObjects.Container }[] | undefined;
      if (tabContainers) {
        for (const tab of tabContainers) {
          tab.container.setAlpha(enabled ? 1 : 0.4);
          if (enabled) {
            tab.container.setInteractive();
          } else {
            tab.container.disableInteractive();
          }
        }
      }
    } else {
      const tabs = container.getAll().filter((c) => c.name === 'actionTab') as Phaser.GameObjects.Container[];
      for (const tab of tabs) {
        tab.setAlpha(enabled ? 1 : 0.4);
        if (enabled) {
          tab.setInteractive();
        } else {
          tab.disableInteractive();
        }
      }
    }
  }

  private updateInstructionText(): void {
    if (!this.activeTabCard || !this.cardNeedsDiceSelection(this.activeTabCard.item)) {
      this.instructionText.setText('');
      return;
    }
    const required = this.getRequiredDicePicks();
    const selected = this.selectedDiceIds.size;
    const remaining = required - selected;
    if (remaining > 0) {
      this.instructionText.setText(`Select ${remaining} more dice from the lineup`);
    } else {
      this.instructionText.setText('Ready! Click USE to apply');
    }
  }

  private onUseCard(sprite: CardSprite): void {
    if (sprite.used) return;

    const item = sprite.item;
    const player = getPlayerState();

    // If card needs dice selection, validate
    if (this.cardNeedsDiceSelection(item)) {
      const required = this.getRequiredDicePicks();
      if (this.selectedDiceIds.size !== required) return;

      // Get actual selected dice from player's pool
      const selectedDice = this.lineupDice.filter((d) => this.selectedDiceIds.has(d.id));

      // Apply the dice selection effect
      const config = item.diceSelection!;
      const result = applyDiceSelectionEffect(config, selectedDice);
      this.showFloatingText(result);
    } else if (item.category === 'equipment' && item.equipmentDef) {
      if (item.equipmentDef.aura?.id === 'ghost' || player.equipmentSlotsFree > 0) {
        player.equipment.push(
          acquireEquipmentInstance(
            item.equipmentDef,
            player.purchasedPermits,
            item.equipmentPreview?.modifiers,
          ),
        );
      }
    } else if (item.category === 'dice' && item.die) {
      player.addDie(item.die);
    } else if (item.category === 'trail_guide' && item.trailGuideId) {
      const tg = trailGuidesData.find((t) => t.id === item.trailGuideId);
      if (tg) {
        const def = createTrailGuideConsumableDef(tg);
        const result = useConsumableDirectly(def, player);
        if (!result.success && result.failReason) {
          this.showFloatingText(result.failReason);
        }
        if (result.handUpgrade) {
          playHandUpgradeAnimation({
            scene: this,
            sidebar: this.sidebar,
            upgrades: [result.handUpgrade],
            onComplete: () => {},
          });
        }
      }
    } else if (item.category === 'supply' && item.supplyCardId) {
      const cardData = supplyCardsData.find((c) => c.id === item.supplyCardId);
      if (cardData) {
        const def = createSupplyConsumableDef(cardData);
        const result = useConsumableDirectly(def, player);
        if (!result.success && result.failReason) {
          this.showFloatingText(result.failReason);
        }
      }
    } else if (item.category === 'frontier' && item.frontierEncounterId) {
      const fe = frontierEncountersData.find((f) => f.id === item.frontierEncounterId);
      if (fe) {
        const def = createFrontierConsumableDef(fe);
        const result = useConsumableDirectly(def, player);
        if (!result.success && result.failReason) {
          this.showFloatingText(result.failReason);
        }
      }
    } else if (item.instantEffect) {
      this.applyInstantEffect(item.instantEffect, player);
    }

    // Mark card as used
    sprite.used = true;
    this.dismissActiveTab();

    // Gray out the card
    this.markCardUsed(sprite);

    // Decrement picks
    this.picksRemaining--;
    this.updatePicksText();

    // Refresh all UI
    this.equipBar.refresh();
    this.consumableBar.refresh();
    this.updateEquipHints();
    this.dicePouch.refresh();
    this.sidebar.refreshMoney();

    // Auto-return to shop when picks exhausted
    if (this.picksRemaining <= 0) {
      this.clearDiceLineup();
      this.time.delayedCall(800, () => {
        this.scene.start(this.returnScene);
      });
    } else {
      this.refreshDiceLineup();
    }
  }

  private markCardUsed(sprite: CardSprite): void {
    const { container, itemCard } = sprite;

    if (itemCard) {
      itemCard.markSold();
    } else {
      // Manual gray overlay for dice/generic cards
      const overlay = this.add.graphics();
      overlay.fillStyle(0x000000, 0.6);
      overlay.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
      container.add(overlay);

      const usedLabel = this.add
        .text(0, 0, 'USED', {
          fontFamily: FONTS.HEADING,
          fontSize: '18px',
          color: '#aaaaaa',
        })
        .setOrigin(0.5);
      container.add(usedLabel);
    }

    // Settle card scale
    this.tweens.add({
      targets: container,
      scaleX: 1,
      scaleY: 1,
      duration: 150,
    });
    container.setDepth(5);
    container.disableInteractive();
  }

  private showFloatingText(message: string): void {
    const text = this.add
      .text(this.contentCX, this.lineupY, message, {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: '#66ff66',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1000);

    this.tweens.add({
      targets: text,
      y: text.y - 30,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  // ─── Helpers ───

  private cardNeedsEquipSlot(item: PackItem): boolean {
    if (item.category === 'equipment' && item.equipmentDef) return true;
    if (item.instantEffect?.type === 'CREATE_EQUIPMENT') return true;
    return false;
  }

  private updatePicksText(): void {
    if (this.picksRemaining <= 0) {
      this.picksText.setText('All picks used!');
    } else {
      const total = this.packDef.pickCount;
      const used = total - this.picksRemaining;
      this.picksText.setText(`Use ${this.picksRemaining} more (${used}/${total} used)`);
    }
  }

  private applyInstantEffect(effect: InstantEffect, player: ReturnType<typeof getPlayerState>): void {
    switch (effect.type) {
      case 'DOUBLE_MONEY': {
        const gain = Math.min(player.economy.balance, effect.maxGain ?? 20);
        player.economy.earn(gain);
        break;
      }
      case 'TRADE_EQUIPMENT': {
        const totalValue = player.equipment.reduce((sum, eq) => sum + eq.sellValue, 0);
        const gain = Math.min(totalValue, effect.maxGain ?? 50);
        player.economy.earn(gain);
        break;
      }
      case 'UPGRADE_ALL_HANDS': {
        const upgrades: import('../../game/types').HandUpgradeInfo[] = [];
        for (const type of Object.values(HandType)) {
          const stats = player.getHandStats(type);
          const handDef = HAND_TABLE.find((h) => h.type === type)!;
          const oldLevel = stats.level;
          const oldBaseMiles = handDef.baseMiles + stats.milesPerLevel * (oldLevel - 1);
          const oldBaseMult = handDef.baseMult + stats.multPerLevel * (oldLevel - 1);
          player.upgradeHandLevel(type);
          const newLevel = stats.level;
          upgrades.push({
            handType: type,
            handName: handDef.name,
            oldLevel,
            newLevel,
            oldBaseMiles,
            newBaseMiles: handDef.baseMiles + stats.milesPerLevel * (newLevel - 1),
            oldBaseMult,
            newBaseMult: handDef.baseMult + stats.multPerLevel * (newLevel - 1),
          });
        }
        if (upgrades.length > 0) {
          playHandUpgradeAnimation({
            scene: this,
            sidebar: this.sidebar,
            upgrades,
            onComplete: () => {},
          });
        }
        break;
      }
      case 'CREATE_EQUIPMENT': {
        if (player.equipmentSlotsFree > 0) {
          const def = generateRandomEquipment({
            rarity: effect.rarity,
            excludeRarity: effect.excludeRarity,
          });
          player.equipment.push(acquireRewardEquipmentInstance(def, player.purchasedPermits));
        }
        if (effect.setMoneyZero) {
          player.economy.spend(player.economy.balance);
        }
        break;
      }
    }
  }

  private onSkip(): void {
    const player = getPlayerState();
    processEquipmentOnPackSkipped(player.equipment);
    this.scene.start(this.returnScene);
  }

  private onResize(): void {
    this.cardSprites = [];
    this.activeTabCard = null;
    this.dismissHandler = null;
    this.children.removeAll(true);
    this.buildLayout();
  }

  private updateEquipHints(): void {
    this.equipBar.updateHints(null, getPlayerState());
  }

  private handleConsumableUsed(consumed: ConsumableInstance): void {
    const player = getPlayerState();
    const result = executeConsumableEffect(consumed, player);

    this.sidebar.refreshMoney();
    this.equipBar.refresh();
    this.consumableBar.refresh();
    this.dicePouch.refresh();
    this.refreshDiceLineup();

    if (!result.success && result.failReason) {
      this.showFloatingText(result.failReason);
      this.sound.play('sfx_cancel', { volume: 0.5 });
    }

    if (result.diceSelection) {
      this.scene.start('DiceSelection', {
        config: result.diceSelection,
        returnScene: 'BoosterPack',
      });
    }

    // Play hand upgrade animation for trail guides
    if (result.handUpgrade) {
      playHandUpgradeAnimation({
        scene: this,
        sidebar: this.sidebar,
        upgrades: [result.handUpgrade],
        onComplete: () => {},
      });
    }
  }
}
