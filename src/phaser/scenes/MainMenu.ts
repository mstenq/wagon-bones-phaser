import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { resetAllGameStores } from '../../game/store';
import { COLORS } from '../../game/Constants';
import { Button } from '../ui/Button';
import { OptionsModal } from '../ui/OptionsModal';
import { clearAutoSave } from '../AutoSaveManager';
import { ensureBackgroundMusic } from '../BackgroundMusic';
import { applyFitBackgroundImage } from '../ui/SceneLayout';

export class MainMenu extends Scene {
  constructor() {
    super('MainMenu');
  }

  create() {
    const { width, height } = this.scale;

    ensureBackgroundMusic(this);

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    const screen = { x: 0, y: 0, w: width, h: height };

    const backdrop = this.add.graphics();
    backdrop.fillStyle(COLORS.BG_PRIMARY, 1);
    backdrop.fillRect(0, 0, width, height);
    backdrop.setDepth(-2);

    const bg = this.add.image(0, 0, 'bg_main_menu');
    const imageBounds = applyFitBackgroundImage(bg, screen);
    bg.setDepth(-1);

    const startY = imageBounds.y + imageBounds.h * 0.80;
    const buttonGap = 14;

    new Button(this, width / 2, startY, 'Start Journey', { variant: 'primary', size: 'xl', width: 220 }).onClick(
      () => {
        clearAutoSave();
        resetAllGameStores();
        this.scene.start('ProfessionSelect', {});
      },
    );

    const optionsY = startY + 52 / 2 + buttonGap + 48 / 2;
    new Button(this, width / 2, optionsY, 'Options', { variant: 'secondary', size: 'lg', width: 220 }).onClick(
      () => new OptionsModal(this, 0, width, height),
    );

    EventBus.emit(Events.SCENE_READY, this);
  }

  private onResize(): void {
    this.scene.restart();
  }
}
