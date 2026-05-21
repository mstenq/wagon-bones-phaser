// ─── Phaser Game Config ───
// Centralized Phaser.Types.Core.GameConfig — the single source of truth
// for canvas size, renderer, and scene list.

import { AUTO, Scale } from 'phaser';
import { GAME } from './Constants';

import { Boot } from '../phaser/scenes/Boot';
import { Preloader } from '../phaser/scenes/Preloader';
import { MainMenu } from '../phaser/scenes/MainMenu';
import { ProfessionSelectScene } from '../phaser/scenes/ProfessionSelectScene';
import { ShopScene } from '../phaser/scenes/ShopScene';
import { RoundSelectScene } from '../phaser/scenes/RoundSelectScene';
import { BoosterPackScene } from '../phaser/scenes/BoosterPackScene';
import { DiceSelectionScene } from '../phaser/scenes/DiceSelectionScene';
import { GameScene } from '../phaser/scenes/GameScene';
import { PayoutScene } from '../phaser/scenes/PayoutScene';
import { TrailEventScene } from '../phaser/scenes/TrailEventScene';
import { GameOver } from '../phaser/scenes/GameOver';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  width: GAME.WIDTH,
  height: GAME.HEIGHT,
  parent: 'game-container',
  backgroundColor: GAME.BACKGROUND_COLOR,
  scale: {
    mode: Scale.RESIZE,
    autoCenter: Scale.CENTER_BOTH,
  },
  scene: [
    Boot,
    Preloader,
    MainMenu,
    ProfessionSelectScene,
    ShopScene,
    RoundSelectScene,
    BoosterPackScene,
    DiceSelectionScene,
    GameScene,
    PayoutScene,
    TrailEventScene,
    GameOver,
  ],
};
