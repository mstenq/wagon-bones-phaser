// ─── Ashfang trail guide eat animation ───
// Trail guides fly from the consumable bar into Ashfang's equipment card at round start.

import type { Scene } from 'phaser';
import type { TrailGuideEatEvent } from '../../game/effects/lifecycle/onRoundStart';
import { getConsumableAtlasKey } from '../../game/ConsumablesSystem';
import { FONT_NUMBER, UI } from '../../game/Constants';
import { formatXMult } from '../../game/formatScore';
import { getScoreAnimTimings } from '../../game/ScoreAnimTimings';
import type { ConsumableBar } from '../ui/ConsumableBar';
import type { EquipmentBar } from '../ui/EquipmentBar';

const POPUP_XMULT_COLOR = '#ff4444';
const FLY_STAGGER_MS = 80;
const GHOST_START_SCALE = 0.35;
const GHOST_END_SCALE = 0.12;

function getEquipCardWorldPos(equipBar: EquipmentBar, equipIndex: number): { x: number; y: number } | null {
  const card = equipBar.getCardByEquipIndex(equipIndex);
  if (!card) return null;
  return { x: equipBar.x + card.x, y: equipBar.y + card.y };
}

function wiggleEquipCard(scene: Scene, equipBar: EquipmentBar, equipIndex: number): void {
  const T = getScoreAnimTimings();
  const card = equipBar.getCardByEquipIndex(equipIndex);
  if (!card) return;
  const origX = card.x;
  scene.tweens.add({
    targets: card,
    x: origX - T.WIGGLE_OFFSET,
    duration: T.WIGGLE_DURATION_MS,
    yoyo: true,
    repeat: T.WIGGLE_REPEAT,
    ease: 'Sine.easeInOut',
    onComplete: () => {
      card.x = origX;
    },
  });
}

function floatingXMultGain(scene: Scene, x: number, y: number, xMultGained: number): void {
  const label = scene.add
    .text(x, y + 40, `+x${formatXMult(xMultGained)} mult`, {
      fontFamily: FONT_NUMBER,
      fontSize: '18px',
      color: POPUP_XMULT_COLOR,
      stroke: '#000000',
      strokeThickness: 3,
    })
    .setOrigin(0.5, 0)
    .setDepth(UI.SCORE_POPUP_DEPTH)
    .setAlpha(0)
    .setScale(0.5);

  scene.tweens.add({
    targets: label,
    alpha: 1,
    scaleX: 1.1,
    scaleY: 1.1,
    y: y + 20,
    duration: 200,
    ease: 'Back.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: label,
        alpha: 0,
        y: y,
        duration: 400,
        delay: 300,
        onComplete: () => label.destroy(),
      });
    },
  });
}

function animateOneGhost(
  scene: Scene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  defId: string,
  staggerMs: number,
): Promise<void> {
  const textureKey = getConsumableAtlasKey('trail_guide');
  const frame = `${defId}.png`;
  if (!scene.textures.getFrame(textureKey, frame)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    scene.time.delayedCall(staggerMs, () => {
      scene.sound.play('sfx_whoosh1', { volume: 0.35 });

      const ghost = scene.add
        .image(fromX, fromY, textureKey, frame)
        .setDepth(UI.SCORE_POPUP_DEPTH)
        .setScale(GHOST_START_SCALE);

      const T = getScoreAnimTimings();
      scene.tweens.add({
        targets: ghost,
        x: toX,
        y: toY,
        scaleX: GHOST_END_SCALE,
        scaleY: GHOST_END_SCALE,
        alpha: 0.85,
        duration: T.GRANT_FLY_IN_MS,
        ease: 'Power2',
        onComplete: () => {
          ghost.destroy();
          resolve();
        },
      });
    });
  });
}

function animateTrailGuideEatEvent(
  scene: Scene,
  consumableBar: ConsumableBar,
  equipBar: EquipmentBar,
  event: TrailGuideEatEvent,
): Promise<void> {
  const target = getEquipCardWorldPos(equipBar, event.equipIndex);
  if (!target || event.eaten.length === 0) return Promise.resolve();

  const flyPromises = event.eaten.map((entry, i) => {
    const from = consumableBar.getSlotWorldCenter(entry.slotIndex, event.priorConsumableCount);
    return animateOneGhost(scene, from.x, from.y, target.x, target.y, entry.defId, i * FLY_STAGGER_MS);
  });

  return Promise.all(flyPromises).then(() => {
    scene.sound.play('sfx_dog_bark', { volume: 0.5 });
    wiggleEquipCard(scene, equipBar, event.equipIndex);
    if (event.xMultGained > 0) {
      floatingXMultGain(scene, target.x, target.y, event.xMultGained);
    }
  });
}

/** Play Ashfang eating trail guides at round start (parallel fly with stagger, woosh + bark). */
export function animateAshfangTrailGuideEat(
  scene: Scene,
  consumableBar: ConsumableBar,
  equipBar: EquipmentBar,
  events: TrailGuideEatEvent[],
  onComplete: () => void,
): void {
  if (events.length === 0) {
    onComplete();
    return;
  }

  let chain = Promise.resolve();
  for (const event of events) {
    chain = chain.then(() => animateTrailGuideEatEvent(scene, consumableBar, equipBar, event));
  }
  void chain.then(onComplete);
}
