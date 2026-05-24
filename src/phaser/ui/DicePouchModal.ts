// ─── DicePouchModal ───
// Full-screen modal showing all dice in player's collection.
// Filter toggles: All / Available / Spent
// Groups identical dice together with count labels.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS, UI, DICE } from '../../game/Constants';
import { getRunState } from '../../game/store/runStore';
import { selectAvailableDice, selectSpentDice } from '../../game/store/selectors/runSelectors';
import { Die } from '../../game/types';
import { DiceSprite } from './DiceSprite';
import { Button } from './Button';
import { getDiceGroupDisplayLabel, getDiceGroupKey } from './diceGrouping';

type FilterMode = 'all' | 'available' | 'spent';

interface DiceGroup {
  key: string;
  dice: Die[];
  representative: Die;
  isSpent: boolean; // true if these dice are in the spent pile
}

export class DicePouchModal extends GameObjects.Container {
  private diceSprites: DiceSprite[] = [];
  private filterMode: FilterMode = 'all';
  private filterBtns: Button[] = [];
  private diceContainer: GameObjects.Container;
  private panelX: number;
  private panelY: number;
  private panelW: number;
  private panelH: number;

  constructor(scene: Scene, contentX: number, width: number, height: number) {
    super(scene, 0, 0);

    // Dim background (full screen)
    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, UI.MODAL_DIM_ALPHA);
    dim.fillRect(0, 0, scene.scale.width, height);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, scene.scale.width, height), Phaser.Geom.Rectangle.Contains);
    this.add(dim);

    // Modal panel
    const panelW = Math.min(width - 40, 700);
    const panelH = Math.min(height - 80, 500);
    const panelX = contentX + (width - panelW) / 2;
    const panelY = (height - panelH) / 2;
    this.panelX = panelX;
    this.panelY = panelY;
    this.panelW = panelW;
    this.panelH = panelH;

    const panel = scene.add.graphics();
    panel.fillStyle(UI.MODAL_BG, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    panel.lineStyle(2, UI.MODAL_BORDER, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    this.add(panel);

    // Title
    const title = scene.add
      .text(panelX + panelW / 2, panelY + 24, 'Dice Pouch', {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: TEXT_COLORS.GOLD,
      })
      .setOrigin(0.5);
    this.add(title);

    // Filter buttons
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
      btn.onClick(() => {
        this.filterMode = mode;
        this.updateFilterButtons();
        this.renderDice();
      });
      this.add(btn);
      this.filterBtns.push(btn);
    }

    // Close button
    const closeBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - 30, 'Close', 120, 34);
    closeBtn.onClick(() => this.destroy());
    this.add(closeBtn);

    // Dice container
    this.diceContainer = scene.add.container(0, 0);
    this.add(this.diceContainer);

    this.updateFilterButtons();
    this.renderDice();

    this.setDepth(500);
    scene.add.existing(this);
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
    // Clear old
    for (const s of this.diceSprites) s.destroy();
    this.diceSprites = [];
    this.diceContainer.removeAll(true);

    const run = getRunState();
    const { panelX, panelY, panelW, panelH } = this;
    const startY = panelY + 80;
    const availH = panelH - 120;
    const summaryY = startY + 12;
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
        .text(panelX + panelW / 2, startY + availH / 2, 'No dice', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '16px',
          color: TEXT_COLORS.DISABLED,
        })
        .setOrigin(0.5);
      this.diceContainer.add(emptyText);
      return;
    }

    // Group dice by visual identity
    const markSpent = this.filterMode === 'all';
    const groups = this.groupDice(dice, markSpent);

    const spacing = 96;
    const rowStep = DICE.SIZE + 28;
    const cols = Math.max(1, Math.floor((panelW - 40) / spacing));
    const totalGroups = groups.length;
    const totalW = (Math.min(totalGroups, cols) - 1) * spacing;
    const gridStartX = panelX + panelW / 2 - totalW / 2;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridStartX + col * spacing;
      const y = gridStartY + row * rowStep;

      const sprite = new DiceSprite(this.scene, x, y, group.representative);

      // Dim spent dice in "all" mode
      if (this.filterMode === 'all' && group.isSpent) {
        sprite.setAlpha(0.4);
      }

      this.diceContainer.add(sprite);
      this.diceSprites.push(sprite);

      const countLabel = this.scene.add
        .text(x, y + DICE.SIZE / 2 + 12, getDiceGroupDisplayLabel(group.representative, group.dice.length), {
          fontFamily: FONTS.PRIMARY,
          fontSize: '12px',
          color: group.isSpent ? TEXT_COLORS.DISABLED : TEXT_COLORS.SECONDARY,
        })
        .setOrigin(0.5);
      this.diceContainer.add(countLabel);
    }

    // Summary text
    const summaryParts: string[] = [];
    if (this.filterMode === 'all') {
      summaryParts.push(`${selectAvailableDice(run).length} available, ${spentCount} spent`);
    } else {
      summaryParts.push(`${dice.length} dice`);
    }
    const countText = this.scene.add
      .text(panelX + panelW / 2, summaryY, summaryParts.join(''), {
        fontFamily: FONTS.PRIMARY,
        fontSize: '12px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5);
    this.diceContainer.add(countText);
  }
}
