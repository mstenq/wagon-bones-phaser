// ─── Center-screen toast feedback (consumables, trail events, etc.) ───

import type { Scene } from 'phaser';
import type { ToastTone } from '../../game/playback/types';
import { getContentLayoutCenter } from '../ui/SceneLayout';

const TOAST_SUCCESS_COLOR = '#55dd88';
const TOAST_FAILURE_COLOR = '#ff6644';

/** Brief centered popup with scale + fade (matches score floating-text feel). */
export function playCenterToast(scene: Scene, message: string, tone: ToastTone): Promise<void> {
  const color = tone === 'success' ? TOAST_SUCCESS_COLOR : TOAST_FAILURE_COLOR;
  const { cx, cy } = getContentLayoutCenter(scene);
  const wrapWidth = Math.min(scene.scale.width * 0.55, 480);

  scene.sound.play(tone === 'success' ? 'sfx_coin' : 'sfx_cancel', { volume: 0.5 });

  return new Promise((resolve) => {
    const txt = scene.add
      .text(cx, cy, message, {
        fontFamily: 'Arial Black',
        fontSize: '22px',
        color,
        stroke: '#000000',
        strokeThickness: 4,
        align: 'center',
        fixedWidth: wrapWidth,
        wordWrap: { width: wrapWidth },
      })
      .setOrigin(0.5)
      .setDepth(2000)
      .setScale(0.3)
      .setAlpha(1);

    scene.tweens.add({
      targets: txt,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 120,
      ease: 'Back.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: txt,
          y: cy - 24,
          alpha: 0,
          duration: 900,
          delay: 400,
          ease: 'Sine.easeIn',
          onComplete: () => {
            txt.destroy();
            resolve();
          },
        });
      },
    });
  });
}
