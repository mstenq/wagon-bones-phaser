// ─── SeededRunModal ───
// Enter a custom run seed and embark from difficulty select.

import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS } from '../../game/Constants';
import { Button } from './Button';
import { createModalShell, finalizeModal } from './modalShell';

export class SeededRunModal extends GameObjects.Container {
  private seedInput: HTMLInputElement | null = null;

  constructor(scene: Scene, width: number, height: number, onEmbark: (seed: string) => void) {
    super(scene, 0, 0);

    const buttonH = 34;
    const buttonW = 120;
    const inputH = 36;
    const inputGap = 20;
    const panelHeight = 248;
    const { layout, dim, panel, title } = createModalShell(scene, 'Seeded Run', {
      contentX: 0,
      width,
      height,
      panelHeight,
      panelMaxWidth: 400,
    });
    const { panelX, panelY, panelW } = layout;
    const buttonRowY = panelY + panelHeight - 28 - buttonH / 2;

    const panelBlocker = scene.add.rectangle(
      panelX + panelW / 2,
      panelY + panelHeight / 2,
      panelW,
      panelHeight,
      0x000000,
      0,
    );
    panelBlocker.setInteractive();

    this.add([dim, panelBlocker, panel, title]);

    const hint = scene.add.text(
      panelX + panelW / 2,
      panelY + 64,
      'Enter a seed to replay the same run.\nLeave blank for a random seed.',
      {
        fontFamily: FONTS.PRIMARY,
        fontSize: '14px',
        color: TEXT_COLORS.MUTED,
        align: 'center',
        lineSpacing: 4,
      },
    );
    hint.setOrigin(0.5, 0);
    this.add(hint);

    const inputW = Math.min(300, panelW - 48);
    const inputX = panelX + (panelW - inputW) / 2;
    const inputY = buttonRowY - buttonH / 2 - inputGap - inputH;
    this.seedInput = this.createSeedInput(inputX, inputY, inputW, inputH);
    this.seedInput.placeholder = 'Type a run seed';
    this.seedInput.maxLength = 32;

    const close = () => this.destroy();

    const btnGap = 16;
    const cancelBtn = new Button(
      scene,
      panelX + panelW / 2 - buttonW / 2 - btnGap / 2,
      buttonRowY,
      'Cancel',
      buttonW,
      buttonH,
    );
    cancelBtn.onClick(close);
    this.add(cancelBtn);

    const embarkBtn = new Button(
      scene,
      panelX + panelW / 2 + buttonW / 2 + btnGap / 2,
      buttonRowY,
      'Embark',
      buttonW,
      buttonH,
    );
    embarkBtn.onClick(() => {
      const seed = this.seedInput?.value.trim() ?? '';
      close();
      onEmbark(seed);
    });
    this.add(embarkBtn);

    dim.on('pointerdown', close);

    this.once('destroy', () => this.destroySeedInput());
    finalizeModal(this, scene, 600);
  }

  private createSeedInput(x: number, y: number, w: number, h: number): HTMLInputElement {
    const container = this.scene.game.canvas.parentElement ?? document.body;
    const containerRect = container.getBoundingClientRect();
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();

    const input = document.createElement('input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.style.position = 'absolute';
    input.style.left = `${canvasRect.left - containerRect.left + x}px`;
    input.style.top = `${canvasRect.top - containerRect.top + y}px`;
    input.style.width = `${w}px`;
    input.style.height = `${h}px`;
    input.style.boxSizing = 'border-box';
    input.style.padding = '6px 10px';
    input.style.border = '1px solid #5a4a3a';
    input.style.borderRadius = '6px';
    input.style.background = '#1f1a14';
    input.style.color = '#e5d9c5';
    input.style.fontFamily = FONTS.PRIMARY;
    input.style.fontSize = '14px';
    input.style.zIndex = '10';
    container.appendChild(input);

    requestAnimationFrame(() => input.focus());
    return input;
  }

  private destroySeedInput(): void {
    if (!this.seedInput) return;
    this.seedInput.remove();
    this.seedInput = null;
  }
}
