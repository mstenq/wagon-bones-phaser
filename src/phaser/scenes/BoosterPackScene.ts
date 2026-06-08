// ─── BoosterPackScene ───
// Opened when player buys a booster pack. Cards are used immediately via
// slide-out action tabs. Dice-targeting cards select from a visible dice lineup
// displayed above the pack cards. All effects applied inline — no consumable slots needed.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { gameFacade } from '../../game/facade';
import { canAcquirePackCardItem, packCardNeedsEquipSlot, resolvePackCardUse } from '../../game/facade/pack';
import type { PackDefinition, PackItem } from '../../game/facade/pack';
import {
  canUseConsumable,
  getConsumableAtlasKey,
  getPackLineupSelectedDieIds,
  isSecondHelpingsCloneTarget,
  resolvePackItemDefId,
  type ConsumableDef,
  type ConsumableInstance,
} from '../../game/facade/consumable';
import {
  createFrontierConsumableDef,
  createSupplyConsumableDef,
  createTrailGuideConsumableDef,
  getPackDefById,
} from '../../game/facade/pack';
import { getRunState } from '../../game/store';
import { getItemDisplayContext } from '../../game/displayContext';
import { resolveEquipmentList, resolveLastUsedConsumableDef } from '../../game/store/resolve';
import { getBonusPackPicks } from '../../game/effects/helpers';
import {
  getDiceSelectionMaxPicks,
  isDiceSelectionReady,
  type DiceSelectionConfig,
} from '../../game/facade/diceSelection';
import { Die } from '../../game/types';
import { TEXT_COLORS, FONTS, UI, ANIM, DICE } from '../../game/Constants';
import { Button } from '../ui/Button';
import { DiceSprite } from '../ui/DiceSprite';
import { createHorizontalDragReorder, type HorizontalDragReorder } from '../ui/horizontalDragReorder';
import { hitIncludesObjectOrChild, installClickAwayDismiss } from '../ui/clickAwayDismiss';
import { createActionTabs, type ActionTabsHandle } from '../ui/actionTabs';
import { ItemCard, CardActionTabConfig } from '../ui/ItemCard';
import { clearSceneCardTooltips } from '../ui/itemCard/cardTooltipRegistry';
import { addDiceCardVisual } from '../ui/DiceCardVisual';
import { EquipmentBar } from '../ui/EquipmentBar';
import {
  ConsumableBar,
  type ConsumableTargetingCommitRequest,
  type ConsumableTargetingRequest,
} from '../ui/ConsumableBar';
import { computeFittedRowSpacing } from '../ui/SceneLayout';
import { createRunSceneShell, type RunSceneShell } from './runSceneShell';
import { computeDiceRowLayout, getArcOffset, getRowXPositions } from './game/diceRowGeometry';
import { armPackCardTargeting, commitConsumableTargetingFlow } from '../../game/consumables/consumableFlowHarness';
import { formatLineupTargetingInstruction } from '../../game/consumables/formatTargetingInstruction';
import { type BoosterPackSaveData, deserializePackItem, serializePackItem } from '../../game/SaveLoad';
import { ConsumableBarTargetingBridge } from './game/ConsumableBarTargetingBridge';
import { getSceneState, sceneActions } from '../../game/store/sceneStore';
import type { BoosterPackSceneState } from '../../game/store/types';
import trailGuidesData from '../../data/trail_guides';
import supplyCardsData from '../../data/supply_cards';
import frontierEncountersData from '../../data/frontier_encounters';

const CARD_RADIUS = UI.CARD_RADIUS;

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
  useInProgress?: boolean;
  index: number;
  diceSprite?: DiceSprite;
  itemCard?: ItemCard;
  actionTabs?: ActionTabsHandle;
}

export class BoosterPackScene extends Scene {
  private packDef!: PackDefinition;
  private returnScene = 'Shop';
  private queuedPackDefIds: string[] = [];
  private contents: PackItem[];
  private cardSprites: CardSprite[] = [];
  private picksRemaining: number;
  private effectivePickCount: number;
  private skipBtn: Button;
  private picksText: Phaser.GameObjects.Text;
  private instructionText: Phaser.GameObjects.Text;

  // Shared UI
  private runShell: RunSceneShell | null = null;
  private equipBar: EquipmentBar;
  private consumableBar: ConsumableBar;

  // Layout helpers
  private contentCX: number = 0;
  private contentW: number = 0;
  private contentTop: number = 0;
  private contentBottom: number = 0;
  private cardScale: number = 1;
  private cardW: number = UI.CARD_W;
  private cardH: number = UI.CARD_H;
  private cardY: number = 0;
  private hasDiceSelectionLineup: boolean = false;

  // Dice lineup (displayed above cards; data lives in scene store)
  private lineupSprites: DiceSprite[] = [];
  private lineupLockIcons: Phaser.GameObjects.Text[] = [];
  private lineupY: number = 0;
  private consumableBarBridge!: ConsumableBarTargetingBridge;

  // Drag-to-reorder (dice lineup)
  private lineupDragReorder!: HorizontalDragReorder<DiceSprite>;

  // Active card tab state
  private activeTabCard: CardSprite | null = null;
  private dismissClickAway: (() => void) | null = null;
  private pendingUsedCardIndices: number[] = [];

  constructor() {
    super('BoosterPack');
  }

  init(
    data: {
      packDef?: PackDefinition;
      packDefId?: string;
      returnScene?: string;
      free?: boolean;
      queuedPackDefIds?: string[];
      restorePack?: BoosterPackSaveData;
    } = {},
  ) {
    const scenePack = getSceneState().boosterPack;
    if (scenePack) {
      const def = getPackDefById(scenePack.packDefId);
      if (!def) throw new Error(`Unknown pack id: ${scenePack.packDefId}`);
      this.packDef = def;
      this.returnScene = scenePack.returnScene;
      this.queuedPackDefIds = [...scenePack.queuedPackDefIds];
    } else if (data.packDef) {
      this.packDef = data.packDef;
      this.returnScene = data.returnScene ?? 'Shop';
      this.queuedPackDefIds = [...(data.queuedPackDefIds ?? [])];
    } else if (data.packDefId) {
      const def = getPackDefById(data.packDefId);
      if (!def) {
        throw new Error(`Unknown pack id: ${data.packDefId}`);
      }
      this.packDef = def;
      this.returnScene = data.returnScene ?? 'Shop';
      this.queuedPackDefIds = [...(data.queuedPackDefIds ?? [])];
    }
  }

  private buildPackSceneState(): BoosterPackSceneState {
    const existing = getSceneState().boosterPack;
    return {
      packDefId: this.packDef.id,
      returnScene: this.returnScene,
      queuedPackDefIds: [...this.queuedPackDefIds],
      contents: this.contents.map(serializePackItem),
      picksRemaining: this.picksRemaining,
      effectivePickCount: this.effectivePickCount,
      usedCardIndices: this.cardSprites.filter((s) => s.used).map((s) => s.index),
      lineupDieIds: existing?.lineupDieIds ?? [],
      lineupSelectedDieIds: getPackLineupSelectedDieIds(),
    };
  }

  private syncPackToStore(): void {
    const next = this.buildPackSceneState();
    if (getSceneState().boosterPack) {
      sceneActions.patchBoosterPack(next);
    } else {
      sceneActions.enterBoosterPack(next);
    }
  }

  create() {
    const storedPack = getSceneState().boosterPack;
    if (storedPack) {
      this.contents = storedPack.contents.map(deserializePackItem);
      this.picksRemaining = storedPack.picksRemaining;
      this.effectivePickCount =
        (storedPack.effectivePickCount ?? 0) > 0
          ? storedPack.effectivePickCount!
          : this.packDef.pickCount + getBonusPackPicks(resolveEquipmentList());
      this.pendingUsedCardIndices = [...storedPack.usedCardIndices];
      this.syncPackToStore();
      sceneActions.enterScene('BoosterPack');
    } else {
      const opened = gameFacade.pack.openPack(this.packDef);
      this.contents = opened.contents;
      this.picksRemaining = opened.picksRemaining;
      this.effectivePickCount = opened.effectivePickCount;
      this.syncPackToStore();
      sceneActions.enterScene('BoosterPack');
    }

    this.cardSprites = [];
    const storedSelection = getSceneState().boosterPack?.lineupSelectedDieIds;
    sceneActions.patchPackLineupSelection(storedSelection ?? []);
    this.activeTabCard = null;

    this.initLineupDragReorder();

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.lineupDragReorder.stop();
      this.clearDismissClickAway();
      this.runShell?.destroy();
      this.runShell = null;
    });

    this.buildLayout();
  }

  private initLineupDragReorder(): void {
    this.lineupDragReorder = createHorizontalDragReorder({
      scene: this,
      getItems: () => this.lineupSprites,
      getSlotPositions: (count) => {
        const diceLayout = computeDiceRowLayout(count, this.contentW);
        const positions = getRowXPositions(count, this.contentCX, diceLayout.spacing);
        return positions.map((x, i) => {
          const arc = getArcOffset(i, count, diceLayout.scale);
          return { x, y: this.lineupY + arc.y, rotation: arc.rotation };
        });
      },
      canStart: (sprite) => !sprite._disabled,
      getPointerOffset: (sprite, pointer) => ({
        x: pointer.worldX - sprite.x,
        y: pointer.worldY - sprite.y,
      }),
      onBegin: (sprite) => {
        sprite.emit('pointerout');
        DiceSprite.suppressTooltips = true;
        sprite.setDepth(30);
        sprite.scaleX = 1.1;
        sprite.scaleY = 1.1;
      },
      onMoveItem: (sprite, pointer, ctx) => {
        sprite.rotation = ctx.swing;
        sprite.x = pointer.worldX - ctx.offsetX;
        sprite.y = pointer.worldY - ctx.offsetY + ANIM.CARD_DRAG_LIFT_Y;
      },
      onReorder: (fromIndex, toIndex) => {
        gameFacade.pack.reorderLineup(fromIndex, toIndex);
        const lockIcon = this.lineupLockIcons.splice(fromIndex, 1)[0]!;
        this.lineupLockIcons.splice(toIndex, 0, lockIcon);
      },
      onSiblingMove: (sibling, index, slot) => {
        this.tweens.add({
          targets: sibling,
          x: slot.x,
          y: slot.y,
          rotation: slot.rotation ?? 0,
          duration: 150,
          ease: 'Power2',
        });
        this.lineupLockIcons[index]?.setPosition(slot.x, slot.y + this.getLineupLockIconOffsetY());
      },
      getSettleSlot: (_sprite, index, count) => {
        const diceLayout = computeDiceRowLayout(count, this.contentW);
        const positions = getRowXPositions(count, this.contentCX, diceLayout.spacing);
        const arc = getArcOffset(index, count, diceLayout.scale);
        return {
          x: positions[index],
          y: this.lineupY + arc.y,
          rotation: arc.rotation,
        };
      },
      onSettleStart: (sprite) => {
        sprite.setDepth(10);
        DiceSprite.suppressTooltips = false;
      },
      onDragEnd: (sprite) => {
        const idx = this.lineupSprites.indexOf(sprite);
        const count = this.lineupSprites.length;
        const diceLayout = computeDiceRowLayout(count, this.contentW);
        const positions = getRowXPositions(count, this.contentCX, diceLayout.spacing);
        const arc = getArcOffset(idx, count, diceLayout.scale);
        const settleY = this.lineupY + arc.y;
        this.lineupLockIcons[idx]?.setPosition(positions[idx], settleY + this.getLineupLockIconOffsetY());
      },
      playSettleSound: true,
      onReleaseWithoutDrag: (sprite) => {
        this.onLineupDieClick(sprite);
      },
    });
  }

  private buildLayout(): void {
    this.runShell?.destroy();
    this.runShell = createRunSceneShell(this, {
      layout: { bgKey: null, felt: true, sidebarTitle: 'BOOSTER PACK' },
      consumableReturnScene: 'BoosterPack',
      showConsumableFailurePopup: false,
      autoDestroyOnShutdown: false,
      canUseConsumable: (def) => this.canUseConsumableFromBar(def),
      onConsumableUsed: (consumed) => {
        void this.handleConsumableUsed(consumed);
      },
    });

    const layout = this.runShell.layout;
    this.equipBar = layout.equipBar;
    this.consumableBar = layout.consumableBar;
    this.contentCX = layout.contentCX;
    this.contentW = layout.contentW;
    this.contentTop = layout.contentTop;
    this.contentBottom = layout.contentBottom;
    this.cardScale = layout.cardBar.cardScale;
    this.cardW = UI.CARD_W * this.cardScale;
    this.cardH = UI.CARD_H * this.cardScale;

    this.equipBar.on('equipment-changed', () => this.updateEquipHints());
    this.consumableBar.on('consumable-changed', () => this.updateEquipHints());
    this.consumableBarBridge = new ConsumableBarTargetingBridge({
      surface: 'pack_lineup',
      getEligibilityContext: () => this.getPackBarUseContext(),
      seedDieIds: () => getPackLineupSelectedDieIds(),
      onArmEnter: () => {
        this.syncLineupFromTargetingSession();
        this.updateInstructionText();
      },
      onApplySuccess: async (result) => {
        this.showFloatingText(result.diceResult.message);
        sceneActions.patchPackLineupSelection([]);
        this.clearLineupSelections();
        this.renderLineupFromStore();
        this.updateInstructionText();
      },
      onFailure: (message) => {
        this.showFloatingText(message);
        this.sound.play('sfx_cancel', { volume: 0.5 });
      },
    });
    this.consumableBar.setTargetingStateProvider(() => this.consumableBarBridge.getTargetingState());
    this.consumableBar.on('consumable-arm-targeting', (payload: ConsumableTargetingRequest) => {
      this.dismissActiveTab();
      void this.consumableBarBridge.arm(this.consumableBar, payload.index, payload.instance);
    });
    this.consumableBar.on('consumable-commit-targeting', (payload: ConsumableTargetingCommitRequest) => {
      void this.consumableBarBridge.commit(this.consumableBar, payload);
    });
    this.consumableBar.on('consumable-cancel-targeting', () => {
      this.consumableBarBridge.cancel(() => this.updateInstructionText());
    });

    // Show equipment hints
    this.updateEquipHints();

    const uiScale = layout.uiScale;
    const titleFontSize = Math.max(20, Math.floor(28 * uiScale));
    const picksFontSize = Math.max(13, Math.floor(16 * uiScale));

    // ─── Pack name (below equip/consumable bars, inside content area) ───
    const titleY = this.contentTop + Math.floor(8 * uiScale);
    this.add
      .text(this.contentCX, titleY, this.packDef.name, {
        fontFamily: FONTS.HEADING,
        fontSize: `${titleFontSize}px`,
        color: TEXT_COLORS.PRIMARY,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    // Instructions / picks remaining
    this.picksText = this.add
      .text(this.contentCX, titleY + Math.floor(32 * uiScale), '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: `${picksFontSize}px`,
        color: TEXT_COLORS.SECONDARY,
      })
      .setOrigin(0.5);
    this.updatePicksText();

    const headerBottom = titleY + Math.floor(52 * uiScale);

    // ─── Dice lineup (above cards) — supply/frontier packs always show dice so pouch
    // consumables (e.g. Raid) and non-targeting frontier cards can see the active pool.
    const showLineup = this.shouldShowDiceLineup();
    this.hasDiceSelectionLineup = showLineup;
    let cardsAreaTop = headerBottom + Math.floor(16 * uiScale);
    if (showLineup) {
      const run = getRunState();
      const spent = new Set(run.spentDiceIds);
      const defaultLineupCount = Math.min(run.handSize, run.dice.filter((d) => !spent.has(d.id)).length);
      const lineupDice = gameFacade.pack.getLineupDice();
      const lineupCount = lineupDice.length > 0 ? lineupDice.length : defaultLineupCount;
      const diceLayout = computeDiceRowLayout(Math.max(1, lineupCount), this.contentW);
      this.lineupY = headerBottom + diceLayout.dieSize / 2 + Math.floor(8 * uiScale);
      if (lineupDice.length === 0) {
        gameFacade.pack.initLineup();
      }
      this.renderLineupFromStore();
      if (gameFacade.consumable.targeting.active()) {
        this.syncLineupFromTargetingSession();
      }

      const instructionY = this.lineupY + diceLayout.dieSize / 2 + UI.DICE_ARC_HEIGHT * diceLayout.scale + 12;
      this.instructionText = this.add
        .text(this.contentCX, instructionY, '', {
          fontFamily: FONTS.PRIMARY,
          fontSize: `${Math.max(12, Math.floor(14 * uiScale))}px`,
          color: TEXT_COLORS.MUTED,
        })
        .setOrigin(0.5)
        .setDepth(15);
      cardsAreaTop = instructionY + Math.floor(20 * uiScale);
    } else {
      this.lineupY = 0;
      this.instructionText = this.add.text(0, 0, '').setVisible(false);
    }

    // ─── Cards (inventory-sized, shrink spacing to fit up to 4+ across on narrow screens) ───
    const packPad = Math.max(8, Math.floor(12 * uiScale));
    const cardAreaW = this.contentW - packPad * 2;
    const cardSpacing = computeFittedRowSpacing(
      this.contents.length,
      cardAreaW,
      this.cardW,
      layout.cardBar.cardSpacing,
    );
    const totalCardsWidth = this.contents.length > 1 ? (this.contents.length - 1) * cardSpacing : 0;
    const startX = this.contentCX - totalCardsWidth / 2;

    const skipBtnY = this.contentBottom - Math.floor(36 * uiScale);
    const cardsAreaBottom = skipBtnY - Math.floor(28 * uiScale);
    this.cardY = cardsAreaTop + Math.max(this.cardH / 2, (cardsAreaBottom - cardsAreaTop) / 2);

    for (let i = 0; i < this.contents.length; i++) {
      const item = this.contents[i];
      const x = startX + i * cardSpacing;
      const { container, diceSprite, itemCard } = this.createCardDisplay(x, this.cardY, item);

      const actionTabs =
        itemCard === null
          ? createActionTabs({
              scene: this,
              parent: container,
              layout: {
                cardW: this.cardW,
                cardH: this.cardH,
                cardScale: this.cardScale,
                tabAnchorX: this.cardW / 2,
                rightTabYOffset: 20,
              },
              liftParentForBottomTabs: false,
            })
          : undefined;

      const sprite: CardSprite = {
        container,
        item,
        used: false,
        index: i,
        diceSprite: diceSprite ?? undefined,
        itemCard: itemCard ?? undefined,
        actionTabs,
      };
      this.cardSprites.push(sprite);

      this.setupCardClick(sprite);
    }

    for (const idx of this.pendingUsedCardIndices) {
      const sprite = this.cardSprites[idx];
      if (sprite) sprite.used = true;
    }
    this.pendingUsedCardIndices = [];

    // Skip button
    this.skipBtn = new Button(this, this.contentCX, skipBtnY, 'Skip', 140, 44);
    this.skipBtn.onClick(() => this.onSkip());
  }

  private getLineupLockIconOffsetY(): number {
    const count = Math.max(1, this.lineupSprites.length);
    const { scale } = computeDiceRowLayout(count, this.contentW);
    return DICE.SIZE * scale * 0.62;
  }

  // ─── Dice Lineup ───

  private renderLineupFromStore(): void {
    const selection = new Set(getPackLineupSelectedDieIds());
    this.layoutDiceLineup(gameFacade.pack.getLineupDice(), selection);
  }

  /** Lay out dice in store order (sprites only). */
  private layoutDiceLineup(dice: Die[], restoreSelection?: Set<string>): void {
    const selected = restoreSelection ?? new Set<string>();
    this.clearDiceLineupSprites();

    if (dice.length === 0) return;

    const diceLayout = computeDiceRowLayout(dice.length, this.contentW);
    const positions = getRowXPositions(dice.length, this.contentCX, diceLayout.spacing);
    const lockOffsetY = DICE.SIZE * diceLayout.scale * 0.62;

    for (let i = 0; i < dice.length; i++) {
      const die = dice[i]!;
      const arc = getArcOffset(i, dice.length, diceLayout.scale);
      const x = positions[i];
      const y = this.lineupY + arc.y;

      const sprite = new DiceSprite(this, x, y, die, { showSelectedStroke: true });
      sprite.setScale(diceLayout.scale);
      sprite.rotation = arc.rotation;
      sprite.setDepth(10);
      this.lineupSprites.push(sprite);

      const lockIcon = this.add
        .text(x, y + lockOffsetY, '🔒', { fontSize: `${Math.max(11, Math.floor(14 * diceLayout.scale))}px` })
        .setOrigin(0.5)
        .setDepth(11)
        .setVisible(false);
      this.lineupLockIcons.push(lockIcon);

      this.wireLineupSpriteInteraction(sprite);

      if (selected.has(die.id)) {
        sprite.setSelected(true);
        lockIcon.setVisible(true);
      }
    }

    this.setLineupInteractive(true);
    sceneActions.patchPackLineupSelection([...selected]);
  }

  private clearDiceLineupSprites(): void {
    this.cancelLineupDrag();
    for (const s of this.lineupSprites) s.destroy();
    for (const icon of this.lineupLockIcons) icon.destroy();
    this.lineupSprites = [];
    this.lineupLockIcons = [];
  }

  private clearDiceLineup(): void {
    this.clearDiceLineupSprites();
    gameFacade.consumable.targeting.cancel();
    sceneActions.patchBoosterPack({ lineupDieIds: [], lineupSelectedDieIds: [] });
  }

  private setLineupInteractive(enabled: boolean): void {
    const count = Math.max(1, this.lineupSprites.length);
    const dieSize = computeDiceRowLayout(count, this.contentW).dieSize;
    const hitArea = new Phaser.Geom.Rectangle(0, 0, dieSize, dieSize);

    for (const sprite of this.lineupSprites) {
      sprite.setDisabled(!enabled);
      if (enabled) {
        sprite.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);
        if (sprite.input) sprite.input.cursor = 'grab';
      } else {
        sprite.disableInteractive();
      }
    }
    if (!enabled) {
      this.cancelLineupDrag();
    }
  }

  private wireLineupSpriteInteraction(sprite: DiceSprite): void {
    sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (sprite._disabled) return;
      this.lineupDragReorder.wirePointerDown(sprite, pointer, sprite);
    });
  }

  private cancelLineupDrag(): void {
    this.lineupDragReorder.stop();
    DiceSprite.suppressTooltips = false;
  }

  private onLineupDieClick(sprite: DiceSprite): void {
    const index = this.lineupSprites.indexOf(sprite);
    if (index < 0) return;
    const die = gameFacade.pack.getLineupDice()[index];
    if (!die) return;

    if (gameFacade.consumable.targeting.active()) {
      const result = gameFacade.consumable.targeting.toggleDie(die.id);
      if (!result.ok) return;
      this.syncLineupFromTargetingSession();
      this.consumableBarBridge.refreshTabs(this.consumableBar);
      this.updateActiveTabEnabled();
      this.updateInstructionText();
      return;
    }

    const config = this.getLineupDiceConfig();
    const lockIcon = this.lineupLockIcons[index];
    const maxPicks = config ? getDiceSelectionMaxPicks(config) : Number.MAX_SAFE_INTEGER;
    const selected = new Set(getPackLineupSelectedDieIds());

    if (selected.has(die.id)) {
      selected.delete(die.id);
      sprite.setSelected(false);
      if (lockIcon) lockIcon.setVisible(false);
      this.sound.play('sfx_card_slide2', { volume: 0.25 });
    } else if (selected.size < maxPicks) {
      selected.add(die.id);
      sprite.setSelected(true);
      if (lockIcon) lockIcon.setVisible(true);
      this.sound.play('sfx_highlight1', { volume: 0.3 });
    }

    sceneActions.patchPackLineupSelection([...selected]);
    this.updateInstructionText();
    this.updateActiveTabEnabled();
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
    cardBg.fillRoundedRect(-this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH, CARD_RADIUS);
    cardBg.lineStyle(2, 0x888888, 0.7);
    cardBg.strokeRoundedRect(-this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH, CARD_RADIUS);
    container.add(cardBg);

    if (item.category === 'dice' && item.die) {
      // ─── Dice card layout ───
      const diceBg = this.add.graphics();
      diceBg.fillStyle(0x2a2a3a, 1);
      diceBg.fillRoundedRect(-this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH, CARD_RADIUS);
      diceBg.lineStyle(2, 0x555577, 0.9);
      diceBg.strokeRoundedRect(-this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH, CARD_RADIUS);
      container.add(diceBg);
      const visual = addDiceCardVisual(this, container, item.die, {
        cardWidth: this.cardW,
        cardHeight: this.cardH,
        cornerRadius: CARD_RADIUS,
        showAuraLabel: true,
        showStickerLabel: true,
        interactive: true,
      });
      diceSprite = visual.diceSprite;
    } else if (item.category === 'equipment' && item.equipmentDef) {
      itemCard = new ItemCard(this, 0, 0, item.equipmentDef, {
        mode: 'inventory',
        equipment: item.equipmentPreview,
        cardScale: this.cardScale,
      });
      itemCard.setTooltipContext(null, null);
      container.add(itemCard);
    } else if (item.category === 'trail_guide' && item.trailGuideId) {
      const trailGuideData = trailGuidesData.find((guide) => guide.id === item.trailGuideId);
      const trailGuideDef = trailGuideData
        ? createTrailGuideConsumableDef(trailGuideData)
        : {
            ...item,
            id: item.trailGuideId,
            display: () => ({ hint: [], tooltip: [[{ text: item.description, style: 'text' as const }]] }),
          };
      itemCard = new ItemCard(this, 0, 0, trailGuideDef, {
        mode: 'inventory',
        textureKey: getConsumableAtlasKey('trail_guide'),
        cardScale: this.cardScale,
      });
      itemCard.setTooltipContext(null, getItemDisplayContext());
      container.add(itemCard);
    } else if (item.category === 'supply' && item.supplyCardId) {
      const supplyCardData = supplyCardsData.find((card) => card.id === item.supplyCardId);
      const supplyDef = supplyCardData
        ? createSupplyConsumableDef(supplyCardData)
        : {
            ...item,
            id: item.supplyCardId,
            display: () => ({ hint: [], tooltip: [[{ text: item.description, style: 'text' as const }]] }),
          };
      itemCard = new ItemCard(this, 0, 0, supplyDef, {
        mode: 'inventory',
        textureKey: getConsumableAtlasKey('supply'),
        cardScale: this.cardScale,
      });
      itemCard.setTooltipContext(null, getItemDisplayContext());
      container.add(itemCard);
    } else if (item.category === 'frontier' && item.frontierEncounterId) {
      const frontierData = frontierEncountersData.find((encounter) => encounter.id === item.frontierEncounterId);
      const frontierDef = frontierData
        ? createFrontierConsumableDef(frontierData)
        : {
            ...item,
            id: item.frontierEncounterId,
            display: () => ({ hint: [], tooltip: [[{ text: item.description, style: 'text' as const }]] }),
          };
      itemCard = new ItemCard(this, 0, 0, frontierDef, {
        mode: 'inventory',
        textureKey: getConsumableAtlasKey('frontier'),
        cardScale: this.cardScale,
      });
      itemCard.setTooltipContext(null, getItemDisplayContext());
      container.add(itemCard);
    } else {
      const catLabel = item.category.replace('_', ' ').toUpperCase();
      const catText = this.add
        .text(0, -this.cardH / 2 + 14, catLabel, {
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
          wordWrap: { width: this.cardW - 16 },
        })
        .setOrigin(0.5, 0.5);
      container.add(nameText);

      const descText = this.add
        .text(0, 20, item.description, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '11px',
          color: TEXT_COLORS.SECONDARY,
          align: 'center',
          wordWrap: { width: this.cardW - 16 },
        })
        .setOrigin(0.5, 0);
      container.add(descText);
    }

    container.setSize(this.cardW, this.cardH);
    container.setInteractive(new Phaser.Geom.Rectangle(0, 0, this.cardW, this.cardH), Phaser.Geom.Rectangle.Contains);
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

      if (sprite.itemCard) {
        sprite.itemCard.setTooltipContext(null, getItemDisplayContext());
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

      this.showCardActionTabs(sprite, tabs);

      this.activeTabCard = sprite;

      if (this.cardNeedsDiceSelection(sprite.item)) {
        this.beginPackCardTargeting(sprite);
        this.updateInstructionText();
        this.updateActiveTabEnabled();
      }

      // Install click-away dismiss
      this.installActionTabClickAway();
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

  private buildPackUseTab(sprite: CardSprite, label: string, color: number, onUse: () => void): CardActionTabConfig {
    const canAcquire = canAcquirePackCardItem(sprite.item);
    return {
      label,
      color: canAcquire ? color : 0x555555,
      textColor: canAcquire ? '#ffffff' : '#bbbbbb',
      callback: () => {
        if (!canAcquire) {
          this.showPackCardPopup(sprite, 'No space!');
          return;
        }
        onUse();
      },
    };
  }

  private buildActionTabs(sprite: CardSprite): CardActionTabConfig[] {
    const item = sprite.item;

    // second_helpings needs a valid clone target
    if (item.supplyCardId === 'second_helpings') {
      if (!isSecondHelpingsCloneTarget(resolveLastUsedConsumableDef())) {
        return [];
      }
    }

    // BUMP_VALUE gets two tabs (+1 / -1)
    if (item.diceSelection && item.diceSelection.effectType === 'BUMP_VALUE') {
      return [
        this.buildPackUseTab(sprite, '-1\nDOWN', 0x883333, () => {
          void this.onUsePackDiceCard(sprite, 'down');
        }),
        this.buildPackUseTab(sprite, '+1\nUP', 0x338833, () => {
          void this.onUsePackDiceCard(sprite, 'up');
        }),
      ];
    }

    return [
      this.buildPackUseTab(sprite, 'USE', 0x338833, () => {
        this.onUseCard(sprite);
      }),
    ];
  }

  private showCardActionTabs(sprite: CardSprite, tabs: CardActionTabConfig[]): void {
    if (sprite.itemCard) {
      sprite.itemCard.showActionTabs(tabs);
    } else {
      sprite.actionTabs?.show(tabs);
    }
  }

  private hideCardActionTabs(sprite: CardSprite, animate: boolean): void {
    if (sprite.itemCard) {
      sprite.itemCard.hideActionTabs(animate);
    } else {
      sprite.actionTabs?.hide(animate);
    }
  }

  private getCardActionTabContainers(sprite: CardSprite): Phaser.GameObjects.Container[] {
    if (sprite.itemCard) {
      return sprite.itemCard.getActionTabContainers();
    }
    return sprite.actionTabs?.getContainers() ?? [];
  }

  private dismissActiveTab(): void {
    const session = gameFacade.consumable.targeting.active();
    if (session?.source.kind === 'pack_card') {
      gameFacade.consumable.targeting.cancel();
    }

    if (this.activeTabCard) {
      const sprite = this.activeTabCard;
      this.hideCardActionTabs(sprite, true);

      // Settle card back
      if (!sprite.used) {
        this.tweens.add({
          targets: sprite.container,
          scaleX: 1,
          scaleY: 1,
          duration: 150,
          ease: 'Power2',
        });
        sprite.container.setDepth(10);
      }

      this.instructionText.setText('');
      this.updateInstructionText();

      this.activeTabCard = null;
    }

    this.clearDismissClickAway();
  }

  private clearDismissClickAway(): void {
    if (this.dismissClickAway) {
      this.dismissClickAway();
      this.dismissClickAway = null;
    }
  }

  private installActionTabClickAway(): void {
    this.clearDismissClickAway();
    this.dismissClickAway = installClickAwayDismiss(this, {
      isInside: (hitObjects) => {
        if (this.activeTabCard) {
          const activeContainer = this.activeTabCard.container;
          if (hitIncludesObjectOrChild(hitObjects, activeContainer)) return true;
          if (this.activeTabCard.itemCard && hitIncludesObjectOrChild(hitObjects, this.activeTabCard.itemCard)) {
            return true;
          }
        }
        for (const ds of this.lineupSprites) {
          if (hitIncludesObjectOrChild(hitObjects, ds)) return true;
        }
        return false;
      },
      onDismiss: () => this.dismissActiveTab(),
    });
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

  private getLineupDiceConfig(): DiceSelectionConfig | null {
    const session = gameFacade.consumable.targeting.active();
    if (session?.diceSelection) return session.diceSelection;
    return this.activeTabCard?.item.diceSelection ?? null;
  }

  private updateActiveTabEnabled(): void {
    // For dice-selection cards, the USE tab should only be enabled when enough dice are selected
    if (!this.activeTabCard) return;
    if (!this.cardNeedsDiceSelection(this.activeTabCard.item)) return;

    const config = this.activeTabCard.item.diceSelection!;
    const selected = getPackLineupSelectedDieIds().length;
    const enabled = isDiceSelectionReady(config, selected);

    for (const tab of this.getCardActionTabContainers(this.activeTabCard)) {
      tab.setAlpha(enabled ? 1 : 0.4);
      if (enabled) {
        tab.setInteractive();
      } else {
        tab.disableInteractive();
      }
    }
  }

  private updateInstructionText(): void {
    const config = this.getLineupDiceConfig();
    if (!config) {
      this.instructionText.setText('');
      return;
    }

    const selected = getPackLineupSelectedDieIds().length;
    this.instructionText.setText(formatLineupTargetingInstruction(config, selected));
  }

  private shouldShowDiceLineup(): boolean {
    return this.packDef.category === 'supply' || this.packDef.category === 'frontier';
  }

  private canUseConsumableFromBar(def: ConsumableDef): boolean {
    const visibleDieIds = gameFacade.pack.getLineupDice().map((d) => d.id);
    return canUseConsumable(def, { scene: 'booster_pack', source: 'pack_bar', visibleDieIds }).allowed;
  }

  private lockPackCard(sprite: CardSprite): void {
    sprite.itemCard?.prepareForRemoval();
    sprite.container.disableInteractive();
    this.dismissActiveTab();
  }

  private unlockPackCardAfterFailedUse(sprite: CardSprite): void {
    sprite.useInProgress = false;
    sprite.container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this.cardW, this.cardH),
      Phaser.Geom.Rectangle.Contains,
    );
    if (sprite.itemCard) {
      sprite.itemCard.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, this.cardW, this.cardH),
        Phaser.Geom.Rectangle.Contains,
      );
    }
    sprite.container.setDepth(10);
    this.tweens.add({
      targets: sprite.container,
      scaleX: 1,
      scaleY: 1,
      duration: 150,
    });
  }

  private beginPackCardUse(sprite: CardSprite): boolean {
    if (sprite.used || sprite.useInProgress) return false;
    sprite.useInProgress = true;
    this.lockPackCard(sprite);
    return true;
  }

  private onUseCard(sprite: CardSprite): void {
    if (sprite.used || sprite.useInProgress) return;

    const item = sprite.item;
    if (item.diceSelection) {
      void this.onUsePackDiceCard(sprite);
      return;
    }

    const run = getRunState();
    const useResult = resolvePackCardUse(item, {
      equipmentCountBefore: resolveEquipmentList(run).length,
    });

    if (useResult.status === 'blocked') {
      if (packCardNeedsEquipSlot(item) && !canAcquirePackCardItem(item)) {
        this.showPackCardPopup(sprite, 'No space!');
      }
      return;
    }
    if (!this.beginPackCardUse(sprite)) return;

    const { equipmentPopInCount, feedbackText, consumableResult } = useResult.outcome;
    if (consumableResult && !consumableResult.success) {
      this.unlockPackCardAfterFailedUse(sprite);
      if (feedbackText) {
        this.showFloatingText(feedbackText);
        this.sound.play('sfx_cancel', { volume: 0.5 });
      }
      return;
    }

    if (feedbackText) {
      this.showFloatingText(feedbackText);
    }

    this.finishUseCard(sprite, equipmentPopInCount);
  }

  private finishUseCard(sprite: CardSprite, equipmentPopInCount = 0): void {
    sprite.used = true;
    this.dismissActiveTab();
    this.markCardUsed(sprite);

    this.picksRemaining--;
    sceneActions.markBoosterCardUsed(sprite.index);
    this.syncPackToStore();
    this.updatePicksText();

    gameFacade.pack.enqueueEquipmentPopIn(equipmentPopInCount);
    this.updateEquipHints();

    if (this.picksRemaining <= 0) {
      this.clearDiceLineup();
      this.time.delayedCall(800, () => this.exitBoosterPackFlow());
    } else if (this.hasDiceSelectionLineup) {
      gameFacade.consumable.targeting.cancel();
      sceneActions.patchPackLineupSelection([]);
      this.renderLineupFromStore();
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
      overlay.fillRoundedRect(-this.cardW / 2, -this.cardH / 2, this.cardW, this.cardH, CARD_RADIUS);
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

  private showPackCardPopup(sprite: CardSprite, message: string): void {
    this.sound.play('sfx_cancel', { volume: 0.5 });

    const matrix = sprite.container.getWorldTransformMatrix();
    const worldX = matrix.tx;
    const worldY = matrix.ty;

    const text = this.add
      .text(worldX, worldY - 40, message, {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: '#ffffff',
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

  private updatePicksText(): void {
    if (this.picksRemaining <= 0) {
      this.picksText.setText('All picks used!');
    } else {
      const total = this.effectivePickCount;
      const used = total - this.picksRemaining;
      this.picksText.setText(`Use ${this.picksRemaining} more (${used}/${total} used)`);
    }
  }

  private onSkip(): void {
    gameFacade.pack.skipPack();
    this.exitBoosterPackFlow();
  }

  private exitBoosterPackFlow(): void {
    const returnScene = this.returnScene;
    const queued = [...this.queuedPackDefIds];
    sceneActions.clearBoosterPack();

    if (queued.length > 0) {
      const nextId = queued[0]!;
      const packDef = getPackDefById(nextId);
      if (packDef) {
        this.scene.start('BoosterPack', {
          packDef,
          returnScene,
          free: true,
          queuedPackDefIds: queued.slice(1),
        });
        return;
      }
    }

    this.scene.start(returnScene, {});
  }

  private tearDownPackLayout(): void {
    clearSceneCardTooltips(this);
    this.dismissActiveTab();
    this.lineupDragReorder.stop();
    this.clearDiceLineupSprites();

    for (const sprite of this.cardSprites) {
      sprite.itemCard?.hideTooltip();
      if (sprite.container.scene) {
        sprite.container.disableInteractive();
        sprite.container.removeAllListeners();
        sprite.container.destroy();
      }
    }
    this.cardSprites = [];
    this.activeTabCard = null;

    this.runShell?.destroy();
    this.runShell = null;
    this.children.removeAll(true);
  }

  private onResize(): void {
    const stored = getSceneState().boosterPack;
    if (stored) {
      this.contents = stored.contents.map(deserializePackItem);
      this.picksRemaining = stored.picksRemaining;
      this.effectivePickCount =
        (stored.effectivePickCount ?? 0) > 0
          ? stored.effectivePickCount!
          : this.packDef.pickCount + getBonusPackPicks(resolveEquipmentList());
      this.pendingUsedCardIndices = [...stored.usedCardIndices];
      this.queuedPackDefIds = [...stored.queuedPackDefIds];
      this.returnScene = stored.returnScene;
    }

    this.syncPackToStore();
    this.tearDownPackLayout();
    this.buildLayout();
  }

  private updateEquipHints(): void {
    this.equipBar.setHintRound(null);
  }

  private getPackBarUseContext() {
    return {
      scene: 'booster_pack' as const,
      source: 'pack_bar' as const,
      visibleDieIds: gameFacade.pack.getLineupDice().map((d) => d.id),
    };
  }

  private getPackCardUseContext() {
    return {
      scene: 'booster_pack' as const,
      source: 'pack_card' as const,
      visibleDieIds: gameFacade.pack.getLineupDice().map((d) => d.id),
    };
  }

  private beginPackCardTargeting(sprite: CardSprite): boolean {
    const item = sprite.item;
    const config = item.diceSelection;
    const defId = resolvePackItemDefId(item);
    if (!config || !defId || !this.hasDiceSelectionLineup) return false;

    const result = armPackCardTargeting(sprite.index, defId, config, {
      eligibilityContext: this.getPackCardUseContext(),
      surface: 'pack_lineup',
    });
    if (!result.ok) {
      this.showFloatingText(result.reason ?? 'Could not target dice');
      this.sound.play('sfx_cancel', { volume: 0.5 });
      return false;
    }

    this.syncLineupFromTargetingSession();
    return true;
  }

  private async onUsePackDiceCard(sprite: CardSprite, bumpDirection?: 'up' | 'down'): Promise<void> {
    if (sprite.used || sprite.useInProgress) return;
    if (!sprite.item.diceSelection) return;

    if (!this.beginPackCardTargeting(sprite)) return;

    const result = commitConsumableTargetingFlow(
      {
        eligibilityContext: this.getPackCardUseContext(),
        surface: 'pack_lineup',
      },
      bumpDirection,
    );
    if (!result.ok) {
      this.showFloatingText(result.reason ?? 'Could not apply card');
      this.sound.play('sfx_cancel', { volume: 0.5 });
      this.updateActiveTabEnabled();
      return;
    }

    if (!this.beginPackCardUse(sprite)) return;

    if (!result.applied) {
      this.unlockPackCardAfterFailedUse(sprite);
      this.showFloatingText('Could not apply card');
      this.sound.play('sfx_cancel', { volume: 0.5 });
      return;
    }

    this.showFloatingText(result.applied.diceResult.message);
    this.finishUseCard(sprite);
  }

  private syncLineupFromTargetingSession(): void {
    const session = gameFacade.consumable.targeting.active();
    if (!session) return;
    const selected = new Set(session.selectedDieIds);
    for (let i = 0; i < this.lineupSprites.length; i++) {
      const sprite = this.lineupSprites[i]!;
      const die = gameFacade.pack.getLineupDice()[i];
      const isSelected = die ? selected.has(die.id) : false;
      sprite.setSelected(isSelected);
      this.lineupLockIcons[i]?.setVisible(isSelected);
    }
    sceneActions.patchPackLineupSelection([...selected]);
  }

  private handleConsumableUsed(consumed: ConsumableInstance): void {
    if (gameFacade.consumable.targeting.active()) return;

    void this.handleConsumableUsedAsync(consumed);
  }

  private async handleConsumableUsedAsync(consumed: ConsumableInstance): Promise<void> {
    const result = gameFacade.pack.useFromPouch(consumed, {
      visibleDiceIds: gameFacade.pack.getLineupDice().map((d) => d.id),
    });

    if (!result.success && result.failReason) {
      this.showFloatingText(result.failReason);
      this.sound.play('sfx_cancel', { volume: 0.5 });
      return;
    }

    this.renderLineupFromStore();
    this.runShell?.handleConsumableResult(result);
  }
}
