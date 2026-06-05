// ─── Dev-only GameScene controls (loaded die target + dev win) ───

import type { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { gameFacade } from '../../../game/facade';
import { getRunState } from '../../../game/store/runStore';
import { isDevMode } from '../../../game/DevMode';
import { COLORS, FONTS, TEXT_COLORS, UI } from '../../../game/Constants';
import { Button } from '../../ui/Button';

export type GameSceneDevPanelDeps = {
  scene: Scene;
  getSidebarW: () => number;
  onDevWin: () => void;
};

export class GameSceneDevPanel {
  private loadedDiceValueBg!: Phaser.GameObjects.Graphics;
  private loadedDiceValueText!: Phaser.GameObjects.Text;
  private loadedDiceValueHitArea!: Phaser.GameObjects.Zone;
  private loadedDiceDecBtn!: Button;
  private loadedDiceIncBtn!: Button;
  private loadedDicePicker: Phaser.GameObjects.Container | null = null;
  private devWinBtn: Button | null = null;

  constructor(private readonly deps: GameSceneDevPanelDeps) {}

  build(): void {
    this.buildLoadedDiceControl();
    if (isDevMode()) {
      const devBtnX = this.deps.scene.scale.width - 70;
      this.devWinBtn = new Button(this.deps.scene, devBtnX, 280, 'Dev Win', 120, 32)
        .setColor(0x553388, 0x7744aa)
        .onClick(() => this.deps.onDevWin());
      this.devWinBtn.setDepth(100);
    } else {
      this.devWinBtn = null;
    }
  }

  getDevWinBtn(): Button | null {
    return this.devWinBtn;
  }

  update(): void {
    this.updateLoadedDiceControl();
  }

  destroyPicker(): void {
    if (!this.loadedDicePicker) return;
    this.loadedDicePicker.destroy();
    this.loadedDicePicker = null;
    this.updateLoadedDiceControl();
  }

  private buildLoadedDiceControl(): void {
    const { height } = this.deps.scene.scale;
    const controlLeft = this.deps.getSidebarW() + UI.FELT_PADDING + 6;
    const controlY = height - UI.POUCH_MARGIN - UI.POUCH_SIZE / 2;
    const boxWidth = 44;
    const boxHeight = 28;
    const boxCenterX = controlLeft + 50;

    this.deps.scene.add
      .text(controlLeft, controlY - 26, 'Loaded Die Number', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.SECONDARY,
      })
      .setOrigin(0, 0.5)
      .setDepth(50);

    this.loadedDiceDecBtn = new Button(this.deps.scene, controlLeft + 12, controlY, '-', 24, 24).onClick(() => {
      this.adjustLoadedDieTarget(-1);
    });
    this.loadedDiceDecBtn.setDepth(50);
    this.loadedDiceDecBtn.setLabelFontSize(14);

    this.loadedDiceValueBg = this.deps.scene.add.graphics().setDepth(50);
    this.loadedDiceValueBg.fillStyle(COLORS.BG_PANEL, 1);
    this.loadedDiceValueBg.fillRoundedRect(boxCenterX - boxWidth / 2, controlY - boxHeight / 2, boxWidth, boxHeight, 6);
    this.loadedDiceValueBg.lineStyle(1, COLORS.PANEL_BORDER, 1);
    this.loadedDiceValueBg.strokeRoundedRect(
      boxCenterX - boxWidth / 2,
      controlY - boxHeight / 2,
      boxWidth,
      boxHeight,
      6,
    );

    this.loadedDiceValueHitArea = this.deps.scene.add
      .zone(boxCenterX, controlY, boxWidth, boxHeight)
      .setOrigin(0.5)
      .setDepth(52)
      .setInteractive({ useHandCursor: true });
    this.loadedDiceValueHitArea.on('pointerdown', () => this.toggleLoadedDicePicker());

    this.loadedDiceValueText = this.deps.scene.add
      .text(boxCenterX, controlY, '-', {
        fontFamily: FONTS.HEADING,
        fontSize: '16px',
        color: TEXT_COLORS.PRIMARY,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.loadedDiceIncBtn = new Button(this.deps.scene, controlLeft + 88, controlY, '+', 24, 24).onClick(() => {
      this.adjustLoadedDieTarget(1);
    });
    this.loadedDiceIncBtn.setDepth(50);
    this.loadedDiceIncBtn.setLabelFontSize(14);

    this.updateLoadedDiceControl();
  }

  private adjustLoadedDieTarget(delta: number): void {
    const { syncLucky, rawTarget: current } = gameFacade.dice.getLoadedDieDisplay();
    if (syncLucky) return;

    let nextValue: number | null;
    if (delta > 0) {
      nextValue = current === null ? 1 : Math.min(12, current + 1);
    } else {
      nextValue = current === null ? null : current === 1 ? null : current - 1;
    }

    gameFacade.dice.setLoadedDieTarget(nextValue);
    this.updateLoadedDiceControl();
    this.destroyPicker();
  }

  private updateLoadedDiceControl(): void {
    if (!this.loadedDiceValueText || !this.loadedDiceDecBtn || !this.loadedDiceIncBtn || !this.loadedDiceValueBg)
      return;

    const { syncLucky, target } = gameFacade.dice.getLoadedDieDisplay();

    if (syncLucky) {
      this.loadedDiceValueText.setText('🍀');
      this.loadedDiceValueText.setColor(TEXT_COLORS.GOLD);
    } else {
      this.loadedDiceValueText.setText(target === null ? '-' : String(target));
      this.loadedDiceValueText.setColor(target === null ? TEXT_COLORS.SECONDARY : TEXT_COLORS.PRIMARY);
    }
    this.loadedDiceDecBtn.setEnabled(!syncLucky && target !== null);
    this.loadedDiceIncBtn.setEnabled(!syncLucky && (target === null || target < 12));

    this.loadedDiceValueBg.clear();
    this.loadedDiceValueBg.fillStyle(COLORS.BG_PANEL, 1);
    this.loadedDiceValueBg.fillRoundedRect(
      this.loadedDiceValueHitArea.x - 22,
      this.loadedDiceValueHitArea.y - 14,
      44,
      28,
      6,
    );
    this.loadedDiceValueBg.lineStyle(1, this.loadedDicePicker ? COLORS.GOLD : COLORS.PANEL_BORDER, 1);
    this.loadedDiceValueBg.strokeRoundedRect(
      this.loadedDiceValueHitArea.x - 22,
      this.loadedDiceValueHitArea.y - 14,
      44,
      28,
      6,
    );
  }

  private toggleLoadedDicePicker(): void {
    if (this.loadedDicePicker) {
      this.destroyPicker();
      return;
    }

    this.loadedDicePicker = this.buildLoadedDicePicker();
    this.updateLoadedDiceControl();
  }

  private buildLoadedDicePicker(): Phaser.GameObjects.Container {
    const controlX = this.loadedDiceValueHitArea.x;
    const controlY = this.loadedDiceValueHitArea.y;
    const { hasLuckyNumberGear: showLuckySync, rawTarget } = gameFacade.dice.getLoadedDieDisplay();
    const run = getRunState();
    const panelWidth = 208;
    const panelHeight = showLuckySync ? 248 : 214;
    const sidebarW = this.deps.getSidebarW();
    const panelX = Phaser.Math.Clamp(
      controlX - panelWidth / 2,
      sidebarW + 12,
      this.deps.scene.scale.width - panelWidth - 12,
    );
    const panelY = controlY - panelHeight - 14;
    const panelCenterX = panelX + panelWidth / 2;
    const picker = this.deps.scene.add.container(0, 0).setDepth(500);

    const panel = this.deps.scene.add.graphics();
    panel.fillStyle(COLORS.BG_PANEL, 0.98);
    panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 10);
    panel.lineStyle(2, COLORS.PANEL_BORDER, 1);
    panel.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 10);
    picker.add(panel);

    const title = this.deps.scene.add
      .text(panelCenterX, panelY + 16, 'Pick Loaded Number', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.SECONDARY,
      })
      .setOrigin(0.5, 0.5);
    picker.add(title);

    const oddsNote = this.deps.scene.add
      .text(panelCenterX, panelY + 40, gameFacade.dice.getLoadedDieOddsNote(), {
        fontFamily: FONTS.PRIMARY,
        fontSize: '10px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
        wordWrap: { width: panelWidth - 28 },
      })
      .setOrigin(0.5, 0.5);
    picker.add(oddsNote);

    const cols = 4;
    const cellWidth = 34;
    const cellHeight = 26;
    const cellGap = 8;
    const gridWidth = cols * cellWidth + (cols - 1) * cellGap;
    const gridStartX = panelX + (panelWidth - gridWidth) / 2 + cellWidth / 2;
    const gridStartY = panelY + 72 + cellHeight / 2;
    const syncLucky = run.loadedDieSyncLucky && showLuckySync;
    const selected = syncLucky ? null : rawTarget;

    for (let value = 1; value <= 12; value++) {
      const col = (value - 1) % cols;
      const row = Math.floor((value - 1) / cols);
      const button = new Button(
        this.deps.scene,
        gridStartX + col * (cellWidth + cellGap),
        gridStartY + row * (cellHeight + cellGap),
        String(value),
        cellWidth,
        cellHeight,
      ).onClick(() => {
        gameFacade.dice.setLoadedDieTarget(value);
        this.destroyPicker();
      });
      button.setDepth(501);
      button.setLabelFontSize(13);
      if (selected === value) {
        button.setColor(COLORS.GOLD, COLORS.GOLD);
        button.setEnabled(false);
      }
      picker.add(button);
    }

    let clearBtnY = panelY + panelHeight - 24;
    if (showLuckySync) {
      const syncBtnY = panelY + panelHeight - 58;
      const syncBtn = new Button(
        this.deps.scene,
        panelCenterX,
        syncBtnY,
        'Sync Loaded Die with Lucky Number',
        panelWidth - 28,
        26,
      ).onClick(() => {
        gameFacade.dice.setLoadedDieSyncLucky(true);
        this.destroyPicker();
      });
      syncBtn.setDepth(501);
      syncBtn.setLabelFontSize(10);
      if (syncLucky) {
        syncBtn.setColor(COLORS.GOLD, COLORS.GOLD);
        syncBtn.setEnabled(false);
      }
      picker.add(syncBtn);
      clearBtnY = panelY + panelHeight - 24;
    }

    const clearBtn = new Button(this.deps.scene, panelCenterX, clearBtnY, 'Clear', 86, 26).onClick(() => {
      gameFacade.dice.setLoadedDieTarget(null);
      this.destroyPicker();
    });
    clearBtn.setDepth(501);
    clearBtn.setLabelFontSize(13);
    clearBtn.setEnabled(syncLucky || selected !== null);
    picker.add(clearBtn);

    return picker;
  }
}
