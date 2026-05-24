import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState, resetPlayerState } from '../../game/PlayerState';
import { COLORS, TEXT_COLORS, FONTS, GAMEPLAY } from '../../game/Constants';
import { formatScore } from '../../game/formatScore';
import type { DecimalSource } from '../../game/decimal';
import { Button } from '../ui/Button';
import { clearAutoSave } from '../AutoSaveManager';
import { getRunSeed } from '../../game/RunRng';

export interface GameOverData {
  won: boolean;
  victory?: boolean;
  /** Story complete — offer Keep Wandering (autosave preserved until Make Camp). */
  offerEndless?: boolean;
  /** Endless run cleared all legs (no continue). */
  endlessComplete?: boolean;
  totalMiles: DecimalSource;
  targetMiles: DecimalSource;
  leg?: number;
  round?: number;
}

export class GameOver extends Scene {
  constructor() {
    super('GameOver');
  }

  private sceneData: GameOverData;

  create(data: GameOverData) {
    if (!data.offerEndless) {
      clearAutoSave();
    }
    this.sceneData = data;
    const { width, height } = this.scale;

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    const bg = this.add.graphics();
    bg.fillStyle(data.won ? COLORS.BG_WIN : COLORS.BG_LOSE, 1);
    bg.fillRect(0, 0, width, height);

    const isStoryVictory = data.won && data.victory && data.offerEndless;
    const isEndlessComplete = data.won && data.victory && data.endlessComplete;
    const isVictory = isStoryVictory || isEndlessComplete;
    const title = isStoryVictory
      ? 'JOURNEY COMPLETE!'
      : isEndlessComplete
        ? 'THE HORIZON FADES'
        : data.won
          ? 'LANDMARK REACHED!'
          : 'TRAIL ENDS HERE';
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

    if (isStoryVictory) {
      this.add
        .text(width / 2, height * 0.41, 'You conquered all 8 legs of the trail!\nThe frontier still beckons…', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '22px',
          color: TEXT_COLORS.GOLD,
          align: 'center',
        })
        .setOrigin(0.5);
    } else if (isEndlessComplete) {
      this.add
        .text(width / 2, height * 0.41, `You wandered through all ${GAMEPLAY.MAX_LEGS} legs.`, {
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

    const runSeed = getRunSeed();
    let btnBaseY = height * 0.6;
    if (runSeed) {
      const seedY = height * infoY + (legLabel ? 70 : 44);
      this.add
        .text(width / 2, seedY, `Seed: ${runSeed}`, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '16px',
          color: TEXT_COLORS.MUTED,
          align: 'center',
        })
        .setOrigin(0.5);

      const copyBtn = new Button(this, width / 2, seedY + 34, 'Copy Seed', 150, 36);
      copyBtn.onClick(() => {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
        void navigator.clipboard.writeText(runSeed);
      });
      btnBaseY = Math.max(btnBaseY, seedY + 90);
    }

    if (isStoryVictory) {
      new Button(this, width / 2, btnBaseY, 'Keep Wandering', 220, 48).onClick(() => {
        const player = getPlayerState();
        player.endlessMode = true;
        player.storyVictoryPending = false;
        this.scene.start('TrailEvent', {});
      });
      new Button(this, width / 2, btnBaseY + 58, 'Make Camp', 220, 48).onClick(() => {
        clearAutoSave();
        resetPlayerState();
        this.scene.start('MainMenu', {});
      });
    } else {
      new Button(this, width / 2, btnBaseY, 'Play Again', 200, 48).onClick(() => {
        clearAutoSave();
        resetPlayerState();
        this.scene.start('MainMenu', {});
      });
    }

    EventBus.emit(Events.SCENE_READY, this);
  }

  private onResize(): void {
    this.scene.restart(this.sceneData);
  }
}

/** Build GameOver scene data after a round win that ends the journey arc. */
export function buildVictoryGameOverData(
  totalMiles: DecimalSource,
  targetMiles: DecimalSource,
): GameOverData {
  const player = getPlayerState();
  if (player.storyVictoryOffered) {
    return {
      won: true,
      victory: true,
      offerEndless: true,
      totalMiles,
      targetMiles,
      leg: GAMEPLAY.LEGS,
      round: GAMEPLAY.ROUNDS_PER_LEG,
    };
  }
  return {
    won: true,
    victory: true,
    endlessComplete: player.leg > GAMEPLAY.MAX_LEGS,
    totalMiles,
    targetMiles,
    leg: player.leg > GAMEPLAY.MAX_LEGS ? GAMEPLAY.MAX_LEGS : player.leg - 1,
    round: GAMEPLAY.ROUNDS_PER_LEG,
  };
}
