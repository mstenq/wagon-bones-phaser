import { Scene } from 'phaser';

export class Boot extends Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // No external assets needed — we generate everything with Graphics
  }

  create() {
    // Wait for web fonts to load before starting the game
    document.fonts.ready.then(() => {
      this.scene.start('Preloader', {});
    });
  }
}
