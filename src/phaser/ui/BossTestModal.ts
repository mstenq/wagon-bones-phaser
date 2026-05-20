// ─── BossTestModal ───
// Developer profession: pick any boss and jump straight into a boss round.
// Scrolling/clipping matches ProfessionSelectScene (scene-level container + cover rects).

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { Button } from './Button';
import { devGetAllBosses, devStartBossRound } from '../../game/DevMode';
import type { BossDef } from '../../game/types';

const ROW_H = 34;
const ROW_GAP = 4;
const MODAL_DEPTH = 500;
const SCROLL_DEPTH = 501;
const CLIP_DEPTH = 502;
const CHROME_DEPTH = 503;
const CLOSE_DEPTH = 504;

export class BossTestModal extends GameObjects.Container {
  private scrollContainer!: Phaser.GameObjects.Container;
  private readonly sceneObjects: Phaser.GameObjects.GameObject[] = [];
  private contentHeight = 0;
  private scrollAreaTop = 0;
  private scrollAreaH = 0;
  private isDragging = false;
  private dragStartY = 0;
  private scrollStartY = 0;

  private wheelHandler?: (
    pointer: Phaser.Input.Pointer,
    gameObjects: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number,
    deltaZ: number,
  ) => void;
  private pointerDownHandler?: (pointer: Phaser.Input.Pointer) => void;
  private pointerMoveHandler?: (pointer: Phaser.Input.Pointer) => void;
  private pointerUpHandler?: () => void;

  constructor(scene: Scene, contentX: number, width: number, height: number) {
    super(scene, 0, 0);

    const bosses = [...devGetAllBosses()].sort((a, b) => a.name.localeCompare(b.name));
    const screenW = scene.scale.width;

    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, UI.MODAL_DIM_ALPHA);
    dim.fillRect(0, 0, screenW, height);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, screenW, height), Phaser.Geom.Rectangle.Contains);
    dim.setDepth(MODAL_DEPTH);
    this.add(dim);

    const panelW = Math.min(width - 40, 420);
    const panelH = Math.min(height - 60, 560);
    const panelX = contentX + (width - panelW) / 2;
    const panelY = (height - panelH) / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(UI.MODAL_BG, 1);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    panel.lineStyle(2, UI.MODAL_BORDER, 1);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    panel.setDepth(MODAL_DEPTH);
    this.track(panel);

    const title = scene.add
      .text(panelX + panelW / 2, panelY + 24, 'Test Boss', {
        fontFamily: FONTS.HEADING,
        fontSize: '22px',
        color: TEXT_COLORS.GOLD,
      })
      .setOrigin(0.5)
      .setDepth(CHROME_DEPTH);
    this.track(title);

    const hint = scene.add
      .text(panelX + panelW / 2, panelY + 48, 'Jump to boss round (round 3)', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5)
      .setDepth(CHROME_DEPTH);
    this.track(hint);

    const listTop = panelY + 64;
    const listBottom = panelY + panelH - 52;
    this.scrollAreaTop = listTop;
    this.scrollAreaH = listBottom - listTop;

    this.scrollContainer = scene.add.container(panelX + panelW / 2, listTop);
    this.scrollContainer.setDepth(SCROLL_DEPTH);
    this.track(this.scrollContainer);

    const btnW = panelW - 32;
    let rowY = ROW_H / 2 + 4;
    const startBoss = (boss: BossDef) => {
      devStartBossRound(boss.id);
      this.destroy();
      scene.scene.start('Game');
    };

    for (const boss of bosses) {
      const minLeg = boss.minimumLeg ?? 1;
      const label = minLeg > 1 ? `${boss.name} (leg ${minLeg}+)` : boss.name;
      const btn = new Button(scene, 0, rowY, label, btnW, ROW_H);
      btn.onClick(() => startBoss(boss));
      this.scrollContainer.add(btn);
      rowY += ROW_H + ROW_GAP;
    }

    this.contentHeight = rowY + ROW_H / 2;

    if (this.contentHeight <= this.scrollAreaH) {
      const offset = (this.scrollAreaH - this.contentHeight) / 2;
      this.scrollContainer.y = listTop + offset;
    }

    // Hide scrolled list outside viewport (ProfessionSelectScene-style bands)
    const clipTop = scene.add.graphics();
    clipTop.fillStyle(UI.MODAL_BG, 1);
    clipTop.fillRect(contentX, 0, width, listTop);
    clipTop.setDepth(CLIP_DEPTH);
    this.track(clipTop);

    const clipBottom = scene.add.graphics();
    clipBottom.fillStyle(UI.MODAL_BG, 1);
    clipBottom.fillRect(contentX, listBottom, width, height - listBottom);
    clipBottom.setDepth(CLIP_DEPTH);
    this.track(clipBottom);

    const headerCover = scene.add.graphics();
    headerCover.fillStyle(UI.MODAL_BG, 1);
    headerCover.fillRect(panelX, panelY, panelW, listTop - panelY);
    headerCover.setDepth(CHROME_DEPTH);
    this.track(headerCover);

    const footerCover = scene.add.graphics();
    footerCover.fillStyle(UI.MODAL_BG, 1);
    footerCover.fillRect(panelX, listBottom, panelW, panelY + panelH - listBottom);
    footerCover.setDepth(CHROME_DEPTH);
    this.track(footerCover);

    const panelFrame = scene.add.graphics();
    panelFrame.lineStyle(2, UI.MODAL_BORDER, 1);
    panelFrame.strokeRoundedRect(panelX, panelY, panelW, panelH, UI.MODAL_RADIUS);
    panelFrame.setDepth(CHROME_DEPTH);
    this.track(panelFrame);

    const listFrame = scene.add.graphics();
    listFrame.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.6);
    listFrame.strokeRect(panelX + 12, listTop, panelW - 24, this.scrollAreaH);
    listFrame.setDepth(CHROME_DEPTH);
    this.track(listFrame);

    if (this.contentHeight > this.scrollAreaH) {
      this.wheelHandler = (_pointer, _gos, _dx, dy) => {
        this.doScroll(dy);
      };
      this.pointerDownHandler = (pointer) => {
        if (pointer.x < panelX || pointer.x > panelX + panelW) return;
        if (pointer.y < listTop || pointer.y > listBottom) return;
        this.isDragging = true;
        this.dragStartY = pointer.y;
        this.scrollStartY = this.scrollContainer.y;
      };
      this.pointerMoveHandler = (pointer) => {
        if (!this.isDragging) return;
        const dy = pointer.y - this.dragStartY;
        this.scrollContainer.y = Phaser.Math.Clamp(
          this.scrollStartY + dy,
          this.scrollAreaTop + this.scrollAreaH - this.contentHeight,
          this.scrollAreaTop,
        );
      };
      this.pointerUpHandler = () => {
        this.isDragging = false;
      };

      scene.input.on('wheel', this.wheelHandler);
      scene.input.on('pointerdown', this.pointerDownHandler);
      scene.input.on('pointermove', this.pointerMoveHandler);
      scene.input.on('pointerup', this.pointerUpHandler);
    }

    const closeBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - 28, 'Close', 120, 32);
    closeBtn.setDepth(CLOSE_DEPTH);
    closeBtn.onClick(() => this.destroy());
    this.track(closeBtn);

    this.setDepth(MODAL_DEPTH);
    scene.add.existing(this);
  }

  private track(obj: Phaser.GameObjects.GameObject): void {
    this.sceneObjects.push(obj);
  }

  private doScroll(dy: number): void {
    const newY = this.scrollContainer.y - dy * 0.5;
    this.scrollContainer.y = Phaser.Math.Clamp(
      newY,
      this.scrollAreaTop + this.scrollAreaH - this.contentHeight,
      this.scrollAreaTop,
    );
  }

  private removeScrollInput(): void {
    if (!this.wheelHandler) return;
    this.scene.input.off('wheel', this.wheelHandler);
    this.scene.input.off('pointerdown', this.pointerDownHandler!);
    this.scene.input.off('pointermove', this.pointerMoveHandler!);
    this.scene.input.off('pointerup', this.pointerUpHandler!);
    this.wheelHandler = undefined;
    this.pointerDownHandler = undefined;
    this.pointerMoveHandler = undefined;
    this.pointerUpHandler = undefined;
  }

  destroy(fromScene?: boolean): void {
    this.removeScrollInput();
    for (const obj of this.sceneObjects) {
      obj.destroy();
    }
    this.sceneObjects.length = 0;
    super.destroy(fromScene);
  }
}
