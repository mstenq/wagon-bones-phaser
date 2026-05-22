import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { resetPlayerState } from '../../game/PlayerState';
import { COLORS, TEXT_COLORS, FONTS } from '../../game/Constants';
import { formatScore } from '../../game/formatScore';
import { Button } from '../ui/Button';
import { clearAutoSave } from '../AutoSaveManager';

interface GameOverData {
  won: boolean;
  victory?: boolean;
  totalMiles: number;
  targetMiles: number;
  leg?: number;
  round?: number;
}

export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  private sceneData: GameOverData;

  create(data: GameOverData) {
    clearAutoSave();
    this.sceneData = data;
    const { width, height } = this.scale;

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    const bg = this.add.graphics();
    bg.fillStyle(data.won ? COLORS.BG_WIN : COLORS.BG_LOSE, 1);
    bg.fillRect(0, 0, width, height);

    const isVictory = data.won && data.victory;
    const title = isVictory ? 'JOURNEY COMPLETE!' : data.won ? 'LANDMARK REACHED!' : 'TRAIL ENDS HERE';
    const color = data.won ? TEXT_COLORS.WIN : TEXT_COLORS.LOSE;

    this.add
      .text(width / 2, height * 0.3, title, {
        fontFamily: FONTS.HEADING,
        fontSize: isVictory ? '56px' : '48px',
        color,
        stroke: '#000000',
        strokeThickness: 6,
        align: 'center',
      })
      .setOrigin(0.5);

    if (isVictory) {
      this.add
        .text(width / 2, height * 0.41, 'You conquered all 8 legs of the trail!', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '22px',
          color: TEXT_COLORS.GOLD,
          align: 'center',
        })
        .setOrigin(0.5);
    }

    const milesLabel = `${formatScore(data.totalMiles)} / ${formatScore(data.targetMiles)} miles`;
    const legLabel = data.leg ? `Leg ${data.leg}${data.round ? ` — Round ${data.round}` : ''}` : '';
    const infoY = isVictory ? 0.48 : 0.42;

    this.add
      .text(width / 2, height * infoY, milesLabel, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '28px',
        color: TEXT_COLORS.PRIMARY,
        align: 'center',
      })
      .setOrigin(0.5);

    if (legLabel) {
      this.add
        .text(width / 2, height * infoY + 36, legLabel, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '18px',
          color: TEXT_COLORS.SECONDARY,
          align: 'center',
        })
        .setOrigin(0.5);
    }

    new Button(this, width / 2, height * 0.6, 'Play Again', 200, 48).onClick(() => {
      clearAutoSave();
      resetPlayerState();
      this.scene.start('MainMenu');
    });

    EventBus.emit(Events.SCENE_READY, this);
  }

  private onResize(): void {
    this.scene.restart(this.sceneData);
  }
}
