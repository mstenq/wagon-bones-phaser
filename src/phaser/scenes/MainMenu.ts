import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { resetAllGameStores } from '../../game/store';
import { COLORS, TEXT_COLORS, FONTS } from '../../game/Constants';
import { Button } from '../ui/Button';
import { clearAutoSave } from '../AutoSaveManager';
import { ensureBackgroundMusic } from '../BackgroundMusic';

export class MainMenu extends Scene {
  constructor() {
    super('MainMenu');
  }

  create() {
    const { width, height } = this.scale;

    ensureBackgroundMusic(this);

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.BG_PRIMARY, 1);
    bg.fillRect(0, 0, width, height);

    // Title
    this.add
      .text(width / 2, height * 0.31, 'WAGON BONES', {
        fontFamily: FONTS.HEADING,
        fontSize: '64px',
        color: TEXT_COLORS.GOLD,
        stroke: '#000000',
        strokeThickness: 6,
        align: 'center',
      })
      .setOrigin(0.5);

    // Subtitle
    this.add
      .text(width / 2, height * 0.42, 'A Dice Rolling Journey', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '22px',
        color: TEXT_COLORS.SECONDARY,
        align: 'center',
      })
      .setOrigin(0.5);

    // Start button
    new Button(this, width / 2, height * 0.57, 'Start Journey', 220, 52).onClick(() => {
      clearAutoSave();
      resetAllGameStores();
      this.scene.start('ProfessionSelect', {});
    });

    EventBus.emit(Events.SCENE_READY, this);
  }

  private onResize(): void {
    this.scene.restart();
  }
}
