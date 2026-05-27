// ─── BoosterPackScene ───
// Opened when player buys a booster pack. Cards are used immediately via
// slide-out action tabs. Dice-targeting cards select from a visible dice lineup
// displayed above the pack cards. All effects applied inline — no consumable slots needed.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { gameFacade } from '../../game/facade';
import type { ConsumableInstance, PackDefinition, PackItem, UseConsumableResult } from '../../game/facade/pack';
import { isSecondHelpingsCloneTarget } from '../../game/facade/consumable';
import {
  createFrontierConsumableDef,
  createSupplyConsumableDef,
  createTrailGuideConsumableDef,
  getConsumableTexturePrefix,
  getPackDefById,
} from '../../game/facade/pack';
import { getRunState } from '../../game/store';
import { getItemDisplayContext } from '../../game/displayContext';
import { resolveEquipmentList, resolveLastUsedConsumableDef } from '../../game/store/resolve';
import { selectEquipmentSlotsFree } from '../../game/store/selectors/runSelectors';
import { applyConsumableAnimEvents } from '../animations/ConsumableAnimPlayback';
import {
  getDiceSelectionMaxPicks,
  getDiceSelectionMinPicks,
  isDiceSelectionReady,
} from '../../game/DiceSelectionSystem';
import { Die } from '../../game/types';
import { TEXT_COLORS, FONTS, UI, ANIM, DICE } from '../../game/Constants';
import { Button } from '../ui/Button';
import { DiceSprite } from '../ui/DiceSprite';
import { ItemCard, CardActionTabConfig } from '../ui/ItemCard';
import { addDiceCardVisual } from '../ui/DiceCardVisual';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import { createLayout } from '../ui/SceneLayout';
import { playHandUpgradeAnimation } from '../animations/HandUpgradeAnimation';
import { type BoosterPackSaveData, deserializePackItem, serializePackItem } from '../../game/SaveLoad';
import { getSceneState, sceneActions } from '../../game/store/sceneStore';
import { bindPlaybackRunner } from '../playback/PlaybackRunner';
import type { BoosterPackSceneState } from '../../game/store/types';
import { rngShuffle } from '../../game/RunRng';

import trailGuidesData from '../../data/trail_guides';
import supplyCardsData from '../../data/supply_cards';
import frontierEncountersData from '../../data/frontier_encounters';

const CARD_W = UI.CARD_W;
const CARD_H = UI.CARD_H;
const CARD_SPACING = 185;
const CARD_RADIUS = UI.CARD_RADIUS;
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

  // Layout helpers
  private contentCX: number = 0;
  private cardY: number = 0;
  private hasDiceSelectionLineup: boolean = false;

  // Dice lineup (displayed above cards)
  private lineupDice: Die[] = [];
  private lineupSprites: DiceSprite[] = [];
  private lineupLockIcons: Phaser.GameObjects.Text[] = [];
  private selectedDiceIds: Set<string> = new Set();
  private lineupY: number = 0;

  // Drag-to-reorder (dice lineup — manual pointer drag, same feel as GameScene)
  private draggingLineupSprite: DiceSprite | null = null;
  private lineupDragCandidate: DiceSprite | null = null;
  private lineupDragPointerId: number | null = null;
  private lineupWasDragging = false;
  private lineupDragOffsetX = 0;
  private lineupDragOffsetY = 0;
  private lineupDragStartX = 0;
  private lineupDragStartY = 0;
  private lineupDragPrevX = 0;
  private lineupDragVelocityX = 0;
  private lineupPointerTracking = false;

  // Active card tab state
  private activeTabCard: CardSprite | null = null;
  private dismissHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
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
      restorePack?: BoosterPackSaveData;
    } = {},
  ) {
    const scenePack = getSceneState().boosterPack;
    if (scenePack) {
      const def = getPackDefById(scenePack.packDefId);
      if (!def) throw new Error(`Unknown pack id: ${scenePack.packDefId}`);
      this.packDef = def;
      this.returnScene = scenePack.returnScene;
    } else if (data.packDef) {
      this.packDef = data.packDef;
      this.returnScene = data.returnScene ?? 'Shop';
    } else if (data.packDefId) {
      const def = getPackDefById(data.packDefId);
      if (!def) {
        throw new Error(`Unknown pack id: ${data.packDefId}`);
      }
      this.packDef = def;
      this.returnScene = data.returnScene ?? 'Shop';
    }
  }

  private buildPackSceneState(): BoosterPackSceneState {
    return {
      packDefId: this.packDef.id,
      returnScene: this.returnScene,
      contents: this.contents.map(serializePackItem),
      picksRemaining: this.picksRemaining,
      usedCardIndices: this.cardSprites.filter((s) => s.used).map((s) => s.index),
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
      this.pendingUsedCardIndices = [...storedPack.usedCardIndices];
      this.syncPackToStore();
      sceneActions.enterScene('BoosterPack');
    } else {
      const opened = gameFacade.pack.openPack(this.packDef);
      this.contents = opened.contents;
      this.picksRemaining = opened.picksRemaining;
      this.syncPackToStore();
      sceneActions.enterScene('BoosterPack');
    }

    this.cardSprites = [];
    this.selectedDiceIds = new Set();
    this.activeTabCard = null;

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.stopLineupPointerTracking();
    });

    this.buildLayout();
  }

  private buildLayout(): void {
    const { height } = this.scale;

    const layout = createLayout(this, { bgKey: null, felt: true, sidebarTitle: 'BOOSTER PACK' });
    this.sidebar = layout.sidebar;
    this.equipBar = layout.equipBar;
    this.consumableBar = layout.consumableBar;
    this.consumableBar.setCanUsePredicate((def) => def.id !== 'raid' && !this.isPackDiceTargetingPending());
    this.contentCX = layout.contentCX;

    this.equipBar.on('equipment-changed', () => this.updateEquipHints());
    this.consumableBar.on('consumable-changed', () => this.updateEquipHints());

    bindPlaybackRunner(this, {
      scene: this,
      equipBar: this.equipBar,
      consumableBar: this.consumableBar,
      sidebar: this.sidebar,
      getDiceSprites: () => [],
      destroyDice: async () => {},
      scoreLayoutGate: null,
      setAnimating: () => {},
      onDiceAdded: () => {},
      onScoreComplete: () => {},
    });

    this.consumableBar.on('consumable-used', (consumed: ConsumableInstance) => {
      void this.handleConsumableUsed(consumed);
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
    this.hasDiceSelectionLineup = showLineup;
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

    for (const idx of this.pendingUsedCardIndices) {
      const sprite = this.cardSprites[idx];
      if (sprite) sprite.used = true;
    }
    this.pendingUsedCardIndices = [];

    // Skip button
    const btnY = height - 36;
    this.skipBtn = new Button(this, this.contentCX, btnY, 'Skip', 140, 44);
    this.skipBtn.onClick(() => this.onSkip());
  }

  // ─── Dice Lineup ───

  private buildDiceLineup(): void {
    const run = getRunState();
    const spent = new Set(run.spentDiceIds);
    const nonSpent = run.dice.filter((d) => !spent.has(d.id));
    const shuffled = rngShuffle('dice', nonSpent);
    const dice = shuffled.slice(0, Math.min(run.handSize, shuffled.length));
    this.layoutDiceLineup(dice);
  }

  /** Lay out dice in the given order (no shuffle). Used on pack open and after lineup count changes. */
  private layoutDiceLineup(dice: Die[], restoreSelection?: Set<string>): void {
    const selected = restoreSelection ?? new Set<string>();
    this.clearDiceLineup();
    this.lineupDice = dice.map((d) => ({ ...d }));

    if (this.lineupDice.length === 0) return;

    const totalWidth = (this.lineupDice.length - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;

    for (let i = 0; i < this.lineupDice.length; i++) {
      const die = this.lineupDice[i]!;
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

      this.wireLineupSpriteInteraction(sprite);

      if (selected.has(die.id)) {
        this.selectedDiceIds.add(die.id);
        sprite.setSelected(true);
        lockIcon.setVisible(true);
      }
    }

    this.setLineupInteractive(false);
  }

  /**
   * After a pack card or pouch consumable mutates dice, refresh visuals without reshuffling.
   * Preserves lineup order; drops destroyed dice and relayouts only when the count changes.
   */
  private syncDiceLineupFromRun(): void {
    if (!this.hasDiceSelectionLineup || this.lineupDice.length === 0) return;

    const run = getRunState();
    const runDiceById = new Map(run.dice.map((d) => [d.id, d]));
    const oldSelected = new Set(this.selectedDiceIds);

    const nextLineup: Die[] = [];
    for (const die of this.lineupDice) {
      const fresh = runDiceById.get(die.id);
      if (fresh) nextLineup.push({ ...fresh });
    }

    this.lineupDice = nextLineup;
    this.selectedDiceIds.clear();
    for (const die of nextLineup) {
      if (oldSelected.has(die.id)) this.selectedDiceIds.add(die.id);
    }

    if (nextLineup.length !== this.lineupSprites.length) {
      this.layoutDiceLineup(nextLineup, new Set(this.selectedDiceIds));
      return;
    }

    for (let i = 0; i < this.lineupSprites.length; i++) {
      const die = nextLineup[i]!;
      this.lineupSprites[i]!.setDieData(die);
      const isSelected = this.selectedDiceIds.has(die.id);
      this.lineupSprites[i]!.setSelected(isSelected);
      this.lineupLockIcons[i]?.setVisible(isSelected);
    }
  }

  private clearDiceLineup(): void {
    this.cancelLineupDrag();
    for (const s of this.lineupSprites) s.destroy();
    for (const icon of this.lineupLockIcons) icon.destroy();
    this.lineupSprites = [];
    this.lineupLockIcons = [];
    this.lineupDice = [];
    this.selectedDiceIds.clear();
  }

  private setLineupInteractive(enabled: boolean): void {
    const hitArea = new Phaser.Geom.Rectangle(0, 0, DICE.SIZE, DICE.SIZE);

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

  private getLineupRowXPositions(count: number): number[] {
    if (count === 0) return [];
    const totalWidth = (count - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;
    return Array.from({ length: count }, (_, i) => startX + i * DICE_SPACING);
  }

  private wireLineupSpriteInteraction(sprite: DiceSprite): void {
    sprite.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.activeTabCard?.item.diceSelection || sprite._disabled) return;

      this.lineupWasDragging = false;
      this.lineupDragCandidate = sprite;
      this.lineupDragPointerId = pointer.id;
      this.lineupDragOffsetX = pointer.worldX - sprite.x;
      this.lineupDragOffsetY = pointer.worldY - sprite.y;
      this.lineupDragStartX = pointer.worldX;
      this.lineupDragStartY = pointer.worldY;
      this.lineupDragPrevX = pointer.worldX;
      this.lineupDragVelocityX = 0;
      this.startLineupPointerTracking();
    });
  }

  private startLineupPointerTracking(): void {
    if (this.lineupPointerTracking) return;
    this.lineupPointerTracking = true;
    this.input.on('pointermove', this.onLineupPointerMove);
    this.input.on('pointerup', this.onLineupPointerUp);
  }

  private stopLineupPointerTracking(): void {
    if (!this.lineupPointerTracking) return;
    this.lineupPointerTracking = false;
    this.input.off('pointermove', this.onLineupPointerMove);
    this.input.off('pointerup', this.onLineupPointerUp);
  }

  private cancelLineupDrag(): void {
    this.draggingLineupSprite = null;
    this.lineupDragCandidate = null;
    this.lineupDragPointerId = null;
    this.lineupDragVelocityX = 0;
    DiceSprite.suppressTooltips = false;
    this.stopLineupPointerTracking();
  }

  private beginLineupDrag(sprite: DiceSprite): void {
    this.draggingLineupSprite = sprite;
    this.lineupDragCandidate = null;
    this.lineupWasDragging = true;

    sprite.emit('pointerout');
    DiceSprite.suppressTooltips = true;
    sprite.setDepth(30);
    sprite.scaleX = 1.1;
    sprite.scaleY = 1.1;
  }

  private updateLineupDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.draggingLineupSprite) return;

    const dx = pointer.worldX - this.lineupDragPrevX;
    this.lineupDragVelocityX =
      this.lineupDragVelocityX * ANIM.CARD_DRAG_SWING_DAMPING + dx * (1 - ANIM.CARD_DRAG_SWING_DAMPING);
    this.lineupDragPrevX = pointer.worldX;

    const swing = Phaser.Math.Clamp(
      this.lineupDragVelocityX * ANIM.CARD_DRAG_SWING_FACTOR,
      -ANIM.CARD_DRAG_SWING_MAX,
      ANIM.CARD_DRAG_SWING_MAX,
    );
    this.draggingLineupSprite.rotation = swing;
    this.draggingLineupSprite.x = pointer.worldX - this.lineupDragOffsetX;
    this.draggingLineupSprite.y = pointer.worldY - this.lineupDragOffsetY + ANIM.CARD_DRAG_LIFT_Y;

    const list = this.lineupSprites;
    const positions = this.getLineupRowXPositions(list.length);
    let newIndex = 0;
    let minDist = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const dist = Math.abs(this.draggingLineupSprite.x - positions[i]);
      if (dist < minDist) {
        minDist = dist;
        newIndex = i;
      }
    }

    const currentIndex = list.indexOf(this.draggingLineupSprite);
    if (newIndex !== currentIndex) {
      list.splice(currentIndex, 1);
      list.splice(newIndex, 0, this.draggingLineupSprite);

      const die = this.lineupDice.splice(currentIndex, 1)[0]!;
      this.lineupDice.splice(newIndex, 0, die);

      const lockIcon = this.lineupLockIcons.splice(currentIndex, 1)[0]!;
      this.lineupLockIcons.splice(newIndex, 0, lockIcon);

      for (let i = 0; i < list.length; i++) {
        if (list[i] === this.draggingLineupSprite) continue;
        const arc = this.getArcOffset(i, list.length);
        this.tweens.add({
          targets: list[i],
          x: positions[i],
          y: this.lineupY + arc.y,
          rotation: arc.rotation,
          duration: 150,
          ease: 'Power2',
        });
        this.lineupLockIcons[i]?.setPosition(positions[i], this.lineupY + arc.y + 46);
      }
    }
  }

  private finishLineupDrag(): void {
    if (!this.draggingLineupSprite) return;

    const sprite = this.draggingLineupSprite;
    const finalVelocity = this.lineupDragVelocityX;
    this.draggingLineupSprite = null;
    this.lineupDragVelocityX = 0;
    DiceSprite.suppressTooltips = false;

    sprite.setDepth(10);
    this.sound.play('sfx_dice_land', { volume: 0.2 });

    const positions = this.getLineupRowXPositions(this.lineupSprites.length);
    const idx = this.lineupSprites.indexOf(sprite);
    const arc = this.getArcOffset(idx, this.lineupSprites.length);
    const settleY = this.lineupY + arc.y;

    const overshoot = Phaser.Math.Clamp(
      finalVelocity * ANIM.CARD_DRAG_SWING_FACTOR * 2,
      -ANIM.CARD_DRAG_SWING_MAX,
      ANIM.CARD_DRAG_SWING_MAX,
    );
    const dur = ANIM.CARD_DRAG_SETTLE_DURATION;

    this.tweens.chain({
      targets: sprite,
      tweens: [
        {
          x: positions[idx],
          y: settleY,
          rotation: overshoot + arc.rotation,
          scaleX: 1,
          scaleY: 1,
          duration: dur * 0.3,
          ease: 'Sine.easeOut',
        },
        {
          rotation: -overshoot * 0.4 + arc.rotation,
          duration: dur * 0.25,
          ease: 'Sine.easeInOut',
        },
        {
          rotation: overshoot * 0.1 + arc.rotation,
          duration: dur * 0.2,
          ease: 'Sine.easeInOut',
        },
        {
          rotation: arc.rotation,
          duration: dur * 0.25,
          ease: 'Sine.easeIn',
        },
      ],
    });

    this.lineupLockIcons[idx]?.setPosition(positions[idx], settleY + 46);
  }

  private onLineupPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.lineupDragPointerId !== null && pointer.id !== this.lineupDragPointerId) return;

    if (!this.draggingLineupSprite && this.lineupDragCandidate) {
      const dx = pointer.worldX - this.lineupDragStartX;
      const dy = pointer.worldY - this.lineupDragStartY;
      if (Math.hypot(dx, dy) < 8) return;
      this.beginLineupDrag(this.lineupDragCandidate);
    }

    this.updateLineupDrag(pointer);
  };

  private onLineupPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (this.lineupDragPointerId !== null && pointer.id !== this.lineupDragPointerId) return;

    const candidate = this.lineupDragCandidate;
    const wasDragging = this.lineupWasDragging;

    if (this.draggingLineupSprite) {
      this.finishLineupDrag();
    } else if (candidate && !wasDragging) {
      this.onLineupDieClick(candidate);
    }

    this.lineupDragCandidate = null;
    this.lineupDragPointerId = null;
    this.stopLineupPointerTracking();
  };

  private onLineupDieClick(sprite: DiceSprite): void {
    if (!this.activeTabCard) return;
    const index = this.lineupSprites.indexOf(sprite);
    if (index < 0) return;
    const die = this.lineupDice[index];
    if (!die) return;

    const lockIcon = this.lineupLockIcons[index];
    const maxPicks = this.getMaxDicePicks();

    if (this.selectedDiceIds.has(die.id)) {
      // Deselect
      this.selectedDiceIds.delete(die.id);
      sprite.setSelected(false);
      if (lockIcon) lockIcon.setVisible(false);
      this.sound.play('sfx_card_slide2', { volume: 0.25 });
    } else if (this.selectedDiceIds.size < maxPicks) {
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
      diceBg.fillStyle(0x2a2a3a, 1);
      diceBg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
      diceBg.lineStyle(2, 0x555577, 0.9);
      diceBg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
      container.add(diceBg);
      const visual = addDiceCardVisual(this, container, item.die, {
        cardWidth: CARD_W,
        cardHeight: CARD_H,
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
        texturePrefix: getConsumableTexturePrefix('trail_guide'),
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
        texturePrefix: getConsumableTexturePrefix('supply'),
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
        texturePrefix: getConsumableTexturePrefix('frontier'),
      });
      itemCard.setTooltipContext(null, getItemDisplayContext());
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

      if (this.isPackDiceTargetingPending() && this.activeTabCard !== sprite) {
        this.showFloatingText('Finish selecting dice first');
        this.sound.play('sfx_cancel', { volume: 0.5 });
        return;
      }

      // Toggle: if this card already has tabs, dismiss
      if (this.activeTabCard === sprite) {
        this.dismissActiveTab();
        return;
      }

      // Dismiss any other card's tabs first
      this.dismissActiveTab();

      // Block equipment cards if no free slot
      if (this.cardNeedsEquipSlot(sprite.item)) {
        if (selectEquipmentSlotsFree(getRunState()) <= 0) return;
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
      if (!isSecondHelpingsCloneTarget(resolveLastUsedConsumableDef())) {
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

  private getMaxDicePicks(): number {
    const config = this.activeTabCard?.item.diceSelection;
    if (!config) return 0;
    return getDiceSelectionMaxPicks(config);
  }

  private updateActiveTabEnabled(): void {
    // For dice-selection cards, the USE tab should only be enabled when enough dice are selected
    if (!this.activeTabCard) return;
    if (!this.cardNeedsDiceSelection(this.activeTabCard.item)) return;

    const config = this.activeTabCard.item.diceSelection!;
    const selected = this.selectedDiceIds.size;
    const enabled = isDiceSelectionReady(config, selected);

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
    const config = this.activeTabCard.item.diceSelection!;
    const min = getDiceSelectionMinPicks(config);
    const max = getDiceSelectionMaxPicks(config);
    const selected = this.selectedDiceIds.size;
    const isClone = config.effectType === 'CLONE';

    if (selected < min) {
      const hint = isClone ? 'Drag to order — left copies right. ' : '';
      const need = min - selected;
      if (min === max) {
        this.instructionText.setText(`${hint}Select ${need} more dice from the lineup`);
      } else {
        this.instructionText.setText(`${hint}Select at least ${need} more die${need === 1 ? '' : 's'} (up to ${max})`);
      }
    } else if (selected < max) {
      this.instructionText.setText(
        isClone ? 'Ready! Left die will copy the right' : 'Ready! Pick another die or click USE',
      );
    } else {
      this.instructionText.setText(isClone ? 'Ready! Left die will copy the right' : 'Ready! Click USE to apply');
    }
  }

  private onUseCard(sprite: CardSprite): void {
    if (sprite.used) return;

    const item = sprite.item;
    const run = getRunState();
    let consumableResult: UseConsumableResult | undefined;
    let equipmentPopInCount = 0;
    const equipmentCountBefore = resolveEquipmentList(run).length;

    // If card needs dice selection, validate
    if (this.cardNeedsDiceSelection(item)) {
      const config = item.diceSelection!;
      if (!isDiceSelectionReady(config, this.selectedDiceIds.size)) return;

      // Get actual selected dice from player's pool
      const selectedDice = this.lineupDice.filter((d) => this.selectedDiceIds.has(d.id));

      // Apply the dice selection effect
      const result = gameFacade.pack.applyDiceSelection(config, selectedDice);
      this.showFloatingText(result);
    } else if (item.category === 'equipment' && item.equipmentDef) {
      if (item.equipmentDef.aura?.id === 'ghost' || selectEquipmentSlotsFree(run) > 0) {
        const instance = gameFacade.pack.acquireEquipment(item.equipmentDef, item.equipmentPreview?.modifiers);
        gameFacade.pack.addEquipmentInstance(instance);
        equipmentPopInCount = 1;
      }
    } else if (item.category === 'dice' && item.die) {
      gameFacade.pack.addDie(item.die);
    } else if (item.category === 'trail_guide' && item.trailGuideId) {
      const tg = trailGuidesData.find((t) => t.id === item.trailGuideId);
      if (tg) {
        const def = createTrailGuideConsumableDef(tg);
        const result = gameFacade.pack.useConsumableDirectly(def);
        if (!result.success && result.failReason) {
          this.showFloatingText(result.failReason);
        }
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
    } else if (item.category === 'supply' && item.supplyCardId) {
      const cardData = supplyCardsData.find((c) => c.id === item.supplyCardId);
      if (cardData) {
        const def = createSupplyConsumableDef(cardData);
        const result = gameFacade.pack.useConsumableDirectly(def);
        if (!result.success && result.failReason) {
          this.showFloatingText(result.failReason);
        }
      }
    } else if (item.category === 'frontier' && item.frontierEncounterId) {
      const fe = frontierEncountersData.find((f) => f.id === item.frontierEncounterId);
      if (fe) {
        const def = createFrontierConsumableDef(fe);
        consumableResult = gameFacade.pack.useConsumableDirectly(def, {
          visibleDiceIds: this.lineupDice.map((d) => d.id),
        });
        if (!consumableResult.success && consumableResult.failReason) {
          this.showFloatingText(consumableResult.failReason);
        }
      }
    } else if (item.instantEffect) {
      const instantResult = gameFacade.pack.applyInstantEffect(item.instantEffect);
      if (instantResult.handUpgrades?.length) {
        playHandUpgradeAnimation({
          scene: this,
          sidebar: this.sidebar,
          upgrades: instantResult.handUpgrades,
          onComplete: () => {},
        });
      }
      equipmentPopInCount = Math.max(
        equipmentPopInCount,
        instantResult.equipmentCreatedCount ?? resolveEquipmentList().length - equipmentCountBefore,
      );
    }

    const finishUse = () => this.finishUseCard(sprite, equipmentPopInCount);

    const animEvents = consumableResult?.consumableAnimEvents;
    if (animEvents && animEvents.length > 0) {
      void applyConsumableAnimEvents(this, this.equipBar, animEvents, {
        destroyDice: async () => {},
      }).then(finishUse);
      return;
    }

    finishUse();
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
      this.time.delayedCall(800, () => {
        sceneActions.clearBoosterPack();
        this.scene.start(this.returnScene, {});
      });
    } else {
      if (this.hasDiceSelectionLineup) {
        this.syncDiceLineupFromRun();
      }
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

  private onSkip(): void {
    gameFacade.pack.skipPack();
    sceneActions.clearBoosterPack();
    this.scene.start(this.returnScene, {});
  }

  private onResize(): void {
    const stored = getSceneState().boosterPack;
    if (stored) {
      this.contents = stored.contents.map(deserializePackItem);
      this.picksRemaining = stored.picksRemaining;
      this.pendingUsedCardIndices = [...stored.usedCardIndices];
    }
    this.cardSprites = [];
    this.activeTabCard = null;
    this.dismissHandler = null;
    this.children.removeAll(true);
    this.buildLayout();
  }

  private updateEquipHints(): void {
    this.equipBar.setHintRound(null);
  }

  private isPackDiceTargetingPending(): boolean {
    if (!this.activeTabCard?.item.diceSelection) return false;
    const config = this.activeTabCard.item.diceSelection;
    if (!config) return false;
    return this.selectedDiceIds.size < getDiceSelectionMinPicks(config);
  }

  private handleConsumableUsed(consumed: ConsumableInstance): void {
    if (this.isPackDiceTargetingPending()) return;

    void this.handleConsumableUsedAsync(consumed);
  }

  private async handleConsumableUsedAsync(consumed: ConsumableInstance): Promise<void> {
    const result = gameFacade.pack.useFromPouch(consumed, {
      visibleDiceIds: this.lineupDice.map((d) => d.id),
    });
    this.syncDiceLineupFromRun();

    if (!result.success && result.failReason) {
      this.showFloatingText(result.failReason);
      this.sound.play('sfx_cancel', { volume: 0.5 });
    }

    if (result.diceSelection) {
      this.scene.start('DiceSelection', {
        config: result.diceSelection,
        returnScene: 'BoosterPack',
        returnSceneData: {},
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
}
