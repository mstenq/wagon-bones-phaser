// ─── Equipment fire destruction animation ───
// Shared by round-start effects (Funeral Pyre, Haunted Totem) and consumables (Skin Walker).

import * as Phaser from 'phaser';
import type { Scene } from 'phaser';
import { ANIM } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { ensureAuraTextures } from '../ui/AuraFX';
import type { EquipmentBar } from '../ui/EquipmentBar';

export interface EquipmentFireDestruction {
  sourceIdx: number;
  victimIdx: number;
}

export interface EquipmentFireDestructionOptions {
  /** When true, only plays visuals — caller removes victims from state after the batch. */
  deferStateUpdate?: boolean;
  /** When true, skips shaking the source card (caller already shook it). */
  skipSourceShake?: boolean;
}

function shakeEquipmentSourceCard(scene: Scene, equipBar: EquipmentBar, sourceIndex: number): void {
  const sourceCard = equipBar.getCardByEquipIndex(sourceIndex);
  if (!sourceCard) return;

  const sourceOrigX = sourceCard.x;
  scene.tweens.add({
    targets: sourceCard,
    x: sourceOrigX - 3,
    duration: 50,
    yoyo: true,
    repeat: 5,
    ease: 'Sine.easeInOut',
    onComplete: () => {
      sourceCard.x = sourceOrigX;
    },
  });
}

/** Animate one equipment card burning away; splices victim from player state on completion. */
export function animateEquipmentFireDestruction(
  scene: Scene,
  equipBar: EquipmentBar,
  sourceIndex: number,
  victimIndex: number,
  onComplete?: () => void,
  options: EquipmentFireDestructionOptions = {},
): void {
  ensureAuraTextures(scene);
  const sourceCard = equipBar.getCardByEquipIndex(sourceIndex);
  const victimCard = equipBar.getCardByEquipIndex(victimIndex);
  if (!sourceCard || !victimCard) {
    if (!options.deferStateUpdate) {
      const player = getPlayerState();
      player.equipment.splice(victimIndex, 1);
      equipBar.refresh();
    }
    onComplete?.();
    return;
  }

  if (!options.skipSourceShake) {
    shakeEquipmentSourceCard(scene, equipBar, sourceIndex);
  }

  const victimMatrix = victimCard.getWorldTransformMatrix();
  const victimWorldX = victimMatrix.tx;
  const victimWorldY = victimMatrix.ty;

  const fireSound = scene.sound.add('sfx_ambient_fire', { volume: 1.5 });
  fireSound.play();

  const fireEmitter = scene.add.particles(victimWorldX, victimWorldY, 'aura_soft', {
    speed: { min: 20, max: 60 },
    angle: { min: -110, max: -70 },
    scale: { start: 0.8, end: 0 },
    alpha: { start: 0.9, end: 0 },
    lifespan: { min: 500, max: 900 },
    frequency: 30,
    quantity: 3,
    tint: [0xff2200, 0xff4500, 0xff6600, 0xffaa00, 0xffdd00],
    blendMode: 'ADD',
    emitZone: {
      type: 'random',
      source: new Phaser.Geom.Rectangle(-40, -50, 80, 100),
    } as any,
    maxAliveParticles: 40,
  });
  fireEmitter.setDepth(500);

  const finishDestruction = () => {
    if (!options.deferStateUpdate) {
      const player = getPlayerState();
      player.equipment.splice(victimIndex, 1);
      equipBar.refresh();
    }
    onComplete?.();
  };

  const fadeOutFireSound = (then: () => void) => {
    scene.tweens.add({
      targets: fireSound,
      volume: 0,
      duration: ANIM.EQUIP_FIRE_DESTROY_SOUND_FADE_MS,
      onComplete: () => {
        fireSound.stop();
        fireSound.destroy();
        then();
      },
    });
  };

  scene.time.delayedCall(ANIM.EQUIP_FIRE_DESTROY_BUILDUP_MS, () => {
    scene.sound.play('sfx_slice1', { volume: 0.7 });

    scene.tweens.add({
      targets: victimCard,
      alpha: 0,
      scaleX: 0.3,
      scaleY: 0.3,
      rotation: victimCard.rotation + 0.3,
      duration: ANIM.EQUIP_FIRE_DESTROY_SLICE_MS,
      ease: 'Power2',
    });

    const sparkEmitter = scene.add.particles(victimWorldX, victimWorldY, 'aura_soft', {
      speed: { min: 80, max: 180 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: { min: 300, max: 600 },
      frequency: -1,
      quantity: 20,
      tint: [0xff4400, 0xffaa00, 0xffdd00],
      blendMode: 'ADD',
    });
    sparkEmitter.setDepth(500);
    sparkEmitter.explode(20);

    scene.time.delayedCall(ANIM.EQUIP_FIRE_DESTROY_CLEANUP_MS, () => {
      fireEmitter.stop();
      scene.time.delayedCall(1000, () => {
        fireEmitter.destroy();
        sparkEmitter.destroy();
      });

      fadeOutFireSound(() => {
        scene.time.delayedCall(ANIM.EQUIP_FIRE_DESTROY_COMPLETE_HOLD_MS, finishDestruction);
      });
    });
  });
}

/** Animate multiple destructions in order, adjusting indices after each splice. */
export function animateEquipmentFireDestructionSequence(
  scene: Scene,
  equipBar: EquipmentBar,
  destructions: EquipmentFireDestruction[],
  onComplete?: () => void,
): void {
  if (destructions.length === 0) {
    onComplete?.();
    return;
  }

  const { sourceIdx, victimIdx } = destructions[0];
  const remaining = destructions.slice(1).map((d) => ({
    sourceIdx: d.sourceIdx > victimIdx ? d.sourceIdx - 1 : d.sourceIdx,
    victimIdx: d.victimIdx > victimIdx ? d.victimIdx - 1 : d.victimIdx,
  }));

  animateEquipmentFireDestruction(scene, equipBar, sourceIdx, victimIdx, () => {
    scene.time.delayedCall(200, () => {
      animateEquipmentFireDestructionSequence(scene, equipBar, remaining, onComplete);
    });
  });
}

/** Animate multiple destructions at once; splices all victims after every visual completes. */
export function animateEquipmentFireDestructionParallel(
  scene: Scene,
  equipBar: EquipmentBar,
  destructions: EquipmentFireDestruction[],
  onComplete?: () => void,
): void {
  if (destructions.length === 0) {
    onComplete?.();
    return;
  }

  const victimIndices = [...destructions.map((d) => d.victimIdx)].sort((a, b) => b - a);
  const sourceIndices = [...new Set(destructions.map((d) => d.sourceIdx))];

  for (const sourceIdx of sourceIndices) {
    shakeEquipmentSourceCard(scene, equipBar, sourceIdx);
  }

  let completed = 0;
  const checkDone = () => {
    completed++;
    if (completed < destructions.length) return;

    const player = getPlayerState();
    for (const idx of victimIndices) {
      if (idx >= 0 && idx < player.equipment.length) {
        player.equipment.splice(idx, 1);
      }
    }
    equipBar.refresh();
    onComplete?.();
  };

  for (const { sourceIdx, victimIdx } of destructions) {
    animateEquipmentFireDestruction(scene, equipBar, sourceIdx, victimIdx, checkDone, {
      deferStateUpdate: true,
      skipSourceShake: true,
    });
  }
}
