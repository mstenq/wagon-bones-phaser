import { Display, Game } from 'phaser';
import { gameConfig } from './config';

const StartGame = (parent: string) => {
  const game = new Game({ ...gameConfig, parent });
  Display.Canvas.TouchAction(game.canvas);
  return game;
};

export default StartGame;
