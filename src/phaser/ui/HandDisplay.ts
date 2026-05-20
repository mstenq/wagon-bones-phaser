// ─── HandDisplay ───
// Shows the detected hand type name and score breakdown during SCORE phase.

import { GameObjects, Scene } from 'phaser';
import { ScoreResult } from '../../game/types';
import { TEXT_COLORS, FONTS } from '../../game/Constants';
import { formatScore } from '../../game/formatScore';

export class HandDisplay extends GameObjects.Container {
  private handName: GameObjects.Text;
  private scoreText: GameObjects.Text;
  private detailText: GameObjects.Text;

  constructor(scene: Scene, x: number, y: number) {
    super(scene, x, y);

    this.handName = scene.add
      .text(0, 0, '', {
        fontFamily: FONTS.HEADING,
        fontSize: '28px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5);

    this.scoreText = scene.add
      .text(0, 40, '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '22px',
        color: TEXT_COLORS.PRIMARY,
        align: 'center',
      })
      .setOrigin(0.5);

    this.detailText = scene.add
      .text(0, 70, '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '16px',
        color: TEXT_COLORS.MUTED,
        align: 'center',
      })
      .setOrigin(0.5);

    this.add([this.handName, this.scoreText, this.detailText]);
    this.setVisible(false);
    scene.add.existing(this);
  }

  showResult(result: ScoreResult): void {
    const hr = result.handResult;
    this.handName.setText(hr.name);
    this.scoreText.setText(`+${formatScore(result.miles)} miles`);
    this.detailText.setText(
      `(${formatScore(hr.baseMiles)} base + ${formatScore(result.totalValue)} value) × ${result.mult} mult`,
    );
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
  }
}
