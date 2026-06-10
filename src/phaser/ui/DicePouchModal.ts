// ─── DicePouchModal ───
// Full-screen modal showing all dice in player's collection.
// Filter toggles: All / Available / Spent
// Groups identical dice together with count labels.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS, DICE } from '../../game/Constants';
import { getRunState, runStore } from '../../game/store/runStore';
import { selectAvailableDice, selectSpentDice } from '../../game/store/selectors/runSelectors';
import { Die } from '../../game/types';
import { DiceSprite } from './DiceSprite';
import { Button } from './Button';
import { getDiceGroupDisplayLabel, getDiceGroupKey } from './diceGrouping';
import { isDevMode } from '../../game/DevMode';
import diceAuras from '../../data/dice_auras';
import diceEnhancements from '../../data/dice_enhancements';
import diceStickers from '../../data/dice_stickers';
import {
  CATALOG_CHROME_DEPTH,
  createCatalogModalShell,
  finalizeCatalogModal,
  type CatalogModalShell,
} from './catalogModal';

type FilterMode = 'all' | 'available' | 'spent';

interface DiceGroup {
  key: string;
  dice: Die[];
  representative: Die;
  isSpent: boolean; // true if these dice are in the spent pile
}

const PANEL_MARGIN = 16;
const PANEL_MAX_WIDTH = 700;
const PANEL_WIDTH_INSET = 40;

export class DicePouchModal extends GameObjects.Container {
  private diceSprites: DiceSprite[] = [];
  private filterMode: FilterMode = 'all';
  private filterBtns: Button[] = [];
  private shell!: CatalogModalShell;

  constructor(scene: Scene, contentX: number, width: number, height: number, contentY = 0) {
    super(scene, 0, 0);

    const panelW = Math.min(width - PANEL_WIDTH_INSET, PANEL_MAX_WIDTH);
    const panelH = height - PANEL_MARGIN * 2;
    const panelX = contentX + (width - panelW) / 2;
    const panelY = contentY + (height - panelH) / 2;

    this.shell = createCatalogModalShell({
      scene,
      parent: this,
      screenW: scene.scale.width,
      screenH: height,
      contentY,
      panel: { panelX, panelY, panelW, panelH },
      title: 'Dice Pouch',
      titleFontSize: '24px',
      titleY: 24,
      listTopOffset: 90,
      listBottomOffset: 48,
      closeLabel: 'Close',
      closeBottomOffset: 28,
      onClose: () => this.destroy(),
    });

    // Filter buttons (fixed header above scroll area)
    const filterY = panelY + 56;
    const filterLabels: { label: string; mode: FilterMode }[] = [
      { label: 'All', mode: 'all' },
      { label: 'Available', mode: 'available' },
      { label: 'Spent', mode: 'spent' },
    ];
    const filterBtnW = 100;
    const filterGap = 8;
    const totalFilterW = filterLabels.length * filterBtnW + (filterLabels.length - 1) * filterGap;
    const filterStartX = panelX + panelW / 2 - totalFilterW / 2 + filterBtnW / 2;

    for (let i = 0; i < filterLabels.length; i++) {
      const { label, mode } = filterLabels[i];
      const btn = new Button(scene, filterStartX + i * (filterBtnW + filterGap), filterY, label, filterBtnW, 28);
      btn.setDepth(CATALOG_CHROME_DEPTH);
      btn.onClick(() => {
        this.filterMode = mode;
        this.updateFilterButtons();
        this.renderDice();
      });
      this.shell.track(btn);
      this.filterBtns.push(btn);
    }

    this.updateFilterButtons();
    this.renderDice();

    finalizeCatalogModal(this, scene);
  }

  private updateFilterButtons(): void {
    const modes: FilterMode[] = ['all', 'available', 'spent'];
    for (let i = 0; i < this.filterBtns.length; i++) {
      this.filterBtns[i].setEnabled(modes[i] !== this.filterMode);
    }
  }

  /** Group dice by visual identity, preserving spent/available status */
  private groupDice(dice: Die[], markSpent: boolean): DiceGroup[] {
    const spentIds = new Set(getRunState().spentDiceIds);
    const groups = new Map<string, DiceGroup>();

    for (const die of dice) {
      const isSpent = spentIds.has(die.id);
      const spentSuffix = markSpent ? (isSpent ? '|SPENT' : '|AVAIL') : '';
      const key = getDiceGroupKey(die) + spentSuffix;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          dice: [],
          representative: die,
          isSpent,
        });
      }
      groups.get(key)!.dice.push(die);
    }

    return [...groups.values()].sort((a, b) => {
      if (a.isSpent !== b.isSpent) return a.isSpent ? 1 : -1;
      return 0;
    });
  }

  private renderDice(): void {
    for (const s of this.diceSprites) s.destroy();
    this.diceSprites = [];
    this.shell.scrollContainer.removeAll(true);

    const run = getRunState();
    const { panelW } = this.shell.panel;
    const summaryY = 12;
    const gridStartY = summaryY + 22 + DICE.SIZE / 2;

    let dice = run.dice;
    if (this.filterMode === 'available') {
      dice = selectAvailableDice(run);
    } else if (this.filterMode === 'spent') {
      dice = selectSpentDice(run);
    }

    const spentCount = selectSpentDice(run).length;

    if (dice.length === 0) {
      const emptyText = this.scene.add
        .text(0, this.shell.scrollAreaH / 2, 'No dice', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '16px',
          color: TEXT_COLORS.DISABLED,
        })
        .setOrigin(0.5);
      this.shell.scrollContainer.add(emptyText);
      this.shell.setContentHeight(this.shell.scrollAreaH);
      return;
    }

    const markSpent = this.filterMode === 'all';
    const groups = this.groupDice(dice, markSpent);

    const spacing = 96;
    const rowStep = DICE.SIZE + 28;
    const cols = Math.max(1, Math.floor((panelW - 40) / spacing));
    const totalGroups = groups.length;
    const totalW = (Math.min(totalGroups, cols) - 1) * spacing;
    const gridStartX = -totalW / 2;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridStartX + col * spacing;
      const y = gridStartY + row * rowStep;

      const sprite = new DiceSprite(this.scene, x, y, group.representative);

      if (this.filterMode === 'all' && group.isSpent) {
        sprite.setAlpha(0.4);
      }

      this.shell.scrollContainer.add(sprite);
      this.diceSprites.push(sprite);

      const countLabel = this.scene.add
        .text(x, y + DICE.SIZE / 2 + 12, getDiceGroupDisplayLabel(group.representative, group.dice.length), {
          fontFamily: FONTS.PRIMARY,
          fontSize: '12px',
          color: group.isSpent ? TEXT_COLORS.DISABLED : TEXT_COLORS.SECONDARY,
        })
        .setOrigin(0.5);
      this.shell.scrollContainer.add(countLabel);

      if (isDevMode()) {
        const wrench = this.scene.add
          .text(x, y - DICE.SIZE / 2 - 14, '🔧', {
            fontSize: '14px',
          })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true });
        wrench.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          pointer.event.stopPropagation();
          this.devEditDiceGroup(group);
        });
        wrench.on('pointerover', () => wrench.setScale(1.2));
        wrench.on('pointerout', () => wrench.setScale(1));
        this.shell.scrollContainer.add(wrench);
      }
    }

    const summaryParts: string[] = [];
    if (this.filterMode === 'all') {
      summaryParts.push(`${selectAvailableDice(run).length} available, ${spentCount} spent`);
    } else {
      summaryParts.push(`${dice.length} dice`);
    }
    const countText = this.scene.add
      .text(0, summaryY, summaryParts.join(''), {
        fontFamily: FONTS.PRIMARY,
        fontSize: '12px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5);
    this.shell.scrollContainer.add(countText);

    const numRows = Math.ceil(groups.length / cols);
    const contentHeight = gridStartY + numRows * rowStep + DICE.SIZE / 2 + 16;
    this.shell.setContentHeight(contentHeight);
  }

  private devEditDiceGroup(group: DiceGroup): void {
    const targetDie = group.dice[0];
    if (!targetDie) return;

    const auraIds = diceAuras.map((a) => a.id);
    const enhancementIds = diceEnhancements.map((e) => e.id);
    const stickerIds: Die['sticker'][] = diceStickers.map((s) => s.id);
    const current = `aura=${targetDie.aura ?? 'none'}, enhancement=${targetDie.enhancement ?? 'none'}, sticker=${targetDie.sticker ?? 'none'}`;
    const choice = window.prompt(
      [
        `Edit one die from this stack (${group.dice.length} dice)`,
        `Current: ${current}`,
        'Enter one of:',
        `- aura <id|none> (${auraIds.join(', ')})`,
        `- enhancement <id|none> (${enhancementIds.join(', ')})`,
        `- sticker <id|none> (${stickerIds.join(', ')})`,
      ].join('\n'),
      targetDie.aura ?? targetDie.enhancement ?? targetDie.sticker ?? 'holy',
    );
    if (choice === null) return;

    const normalized = choice.trim().toLowerCase().replace(/[:=]+/g, ' ');
    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length < 2) {
      window.alert('Use format: "aura holy", "enhancement steel", or "sticker red_bullet".');
      return;
    }

    const field = parts[0];
    const value = parts.slice(1).join('_');
    const isNone = value === 'none' || value === 'null' || value === 'clear';
    const state = getRunState();
    let changed = false;
    const nextDice = state.dice.map((die) => {
      if (die.id !== targetDie.id) return die;
      changed = true;
      if (field === 'aura') {
        if (!isNone && !auraIds.includes(value)) {
          window.alert(`Unknown aura: ${value}`);
          return die;
        }
        return { ...die, aura: isNone ? null : (value as Die['aura']) };
      }
      if (field === 'enhancement') {
        if (!isNone && !enhancementIds.includes(value)) {
          window.alert(`Unknown enhancement: ${value}`);
          return die;
        }
        return { ...die, enhancement: isNone ? null : (value as Die['enhancement']) };
      }
      if (field === 'sticker') {
        if (!isNone && !(stickerIds as readonly string[]).includes(value)) {
          window.alert(`Unknown sticker: ${value}`);
          return die;
        }
        return { ...die, sticker: isNone ? null : (value as Die['sticker']) };
      }
      window.alert('Unknown field. Use aura, enhancement, or sticker.');
      return die;
    });

    if (!changed) return;
    runStore.setState({ dice: nextDice });
    this.renderDice();
  }

  destroy(fromScene?: boolean): void {
    for (const s of this.diceSprites) s.destroy();
    this.diceSprites = [];
    this.shell.destroyManagedObjects();
    super.destroy(fromScene);
  }
}
