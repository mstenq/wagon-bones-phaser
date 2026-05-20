// ─── HUD ───
// Displays day counter, dice remaining, rerolls, miles, target at top of screen.

import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { formatScore } from '../../game/formatScore';

const HUD_Y = UI.HUD_Y;
const FONT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONTS.PRIMARY,
  fontSize: '18px',
  color: TEXT_COLORS.PRIMARY,
};

const LABEL_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: FONTS.PRIMARY,
  fontSize: '14px',
  color: TEXT_COLORS.MUTED,
};

export class HUD extends GameObjects.Container {
  private dayText: GameObjects.Text;
  private diceRemainingText: GameObjects.Text;
  private rerollsText: GameObjects.Text;
  private milesText: GameObjects.Text;
  private phaseText: GameObjects.Text;

  constructor(scene: Scene) {
    super(scene, 0, 0);

    const w = scene.scale.width;

    // Background bar
    const bg = scene.add.graphics();
    bg.fillStyle(COLORS.BG_PRIMARY, UI.HUD_ALPHA);
    bg.fillRect(0, 0, w, UI.HUD_HEIGHT);
    this.add(bg);

    this.dayText = this.createField(scene, w * 0.08, 'Day', '1 / 4');
    this.diceRemainingText = this.createField(scene, w * 0.24, 'Dice Left', '10');
    this.rerollsText = this.createField(scene, w * 0.4, 'Re-rolls', '3');
    this.milesText = this.createField(scene, w * 0.6, 'Miles', '0 / 300');
    this.phaseText = this.createField(scene, w * 0.82, 'Phase', 'DRAW');

    scene.add.existing(this);
    this.setDepth(100);
  }

  private createField(scene: Scene, x: number, label: string, value: string): GameObjects.Text {
    const lbl = scene.add.text(x, HUD_Y - 6, label, LABEL_STYLE).setOrigin(0.5, 1);
    const val = scene.add.text(x, HUD_Y + 8, value, FONT_STYLE).setOrigin(0.5, 0);
    this.add([lbl, val]);
    return val;
  }

  update(data: {
    day: number;
    maxDays: number;
    rerolls: number;
    miles: number;
    targetMiles: number;
    phase: string;
    diceRemaining: number;
    diceSpent: number;
  }): void {
    this.dayText.setText(`${data.day} / ${data.maxDays}`);
    this.diceRemainingText.setText(`${data.diceRemaining} (${data.diceSpent} spent)`);
    this.rerollsText.setText(`${data.rerolls}`);
    this.milesText.setText(`${formatScore(data.miles)} / ${formatScore(data.targetMiles)}`);
    this.phaseText.setText(data.phase);
  }
}
