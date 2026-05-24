// ─── ScoreAnimation ───
// Balatro-style sequential dice scoring: each die shakes and adds to the
// running miles/mult tally shown in the sidebar. Equipment that contributes
// gets wiggled. Sounds play on each step.

import { Scene } from 'phaser';
import { DiceSprite } from '../ui/DiceSprite';
import { ScoreAnimEvent, ScoreResult, ScoreAnimPopupType } from '../../game/types';
import { ConsumableDef, getConsumableDefById, getConsumableTexturePrefix } from '../../game/ConsumablesSystem';
import diceEnhancements from '../../data/dice_enhancements';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import { ensureAuraTextures } from '../ui/AuraFX';
import { ANIM } from '../../game/Constants';
import { formatScore } from '../../game/formatScore';
import { addScore, multiplyScore, D } from '../../game/scoreMath';

// ─── Floating Score Popup ───

const POPUP_MILES_COLOR = '#4488ff';
const POPUP_MULT_COLOR = '#ff4444';
const POPUP_XMULT_COLOR = '#ff4444';
const POPUP_MONEY_COLOR = '#ffd700';
const POPUP_SUPPLY_COLOR = '#9c27b0';
const POPUP_ENHANCE_COLOR = '#55ddff';
const POPUP_CRACK_COLOR = '#cfe4ff';
const POPUP_BALANCE_COLOR = '#e8c547';

const ENHANCEMENT_NAMES = new Map(diceEnhancements.map((e) => [e.id, e.name]));

/**
 * Spawn a short-lived text popup that scales up, shakes, and fades out.
 * @param direction 'up' pops above (dice), 'down' pops below (equipment)
 */
function floatingText(
  scene: Scene,
  x: number,
  y: number,
  text: string,
  color: string,
  direction: 'up' | 'down' = 'up',
): void {
  const offsetY = direction === 'up' ? -40 : 48;
  const driftY = direction === 'up' ? -18 : 18;

  const txt = scene.add
    .text(x, y + offsetY, text, {
      fontFamily: 'Arial Black',
      fontSize: '18px',
      color,
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    })
    .setOrigin(0.5)
    .setDepth(200)
    .setScale(0.3)
    .setAlpha(1);

  // Pop in with scale + slight shake
  scene.tweens.add({
    targets: txt,
    scaleX: 1.2,
    scaleY: 1.2,
    duration: 100,
    ease: 'Back.easeOut',
    onComplete: () => {
      // Quick shake
      const origX = txt.x;
      scene.tweens.chain({
        targets: txt,
        tweens: [
          { x: origX - 2, duration: 30 },
          { x: origX + 2, duration: 30 },
          { x: origX - 1, duration: 30 },
          { x: origX, duration: 30 },
        ],
      });

      // Settle scale then drift + fade out
      scene.tweens.add({
        targets: txt,
        scaleX: 1,
        scaleY: 1,
        duration: 80,
        ease: 'Sine.easeOut',
        onComplete: () => {
          scene.tweens.add({
            targets: txt,
            y: txt.y + driftY,
            alpha: 0,
            duration: 300,
            delay: 50,
            ease: 'Sine.easeIn',
            onComplete: () => txt.destroy(),
          });
        },
      });
    },
  });
}

/** Format a floating popup for a scoring contribution */
function popupForDie(scene: Scene, sprite: DiceSprite, type: ScoreAnimPopupType, value: number): void {
  if (type === 'miles') {
    floatingText(scene, sprite.x, sprite.y, `+${formatScore(value)} mi`, POPUP_MILES_COLOR, 'up');
  } else if (type === 'mult') {
    floatingText(scene, sprite.x, sprite.y, `+${value} mult`, POPUP_MULT_COLOR, 'up');
  } else if (type === 'xmult') {
    floatingText(scene, sprite.x, sprite.y, `x${value} mult`, POPUP_XMULT_COLOR, 'up');
  } else if (type === 'money') {
    floatingText(scene, sprite.x, sprite.y, `+$${value}`, POPUP_MONEY_COLOR, 'up');
  } else if (type === 'supply') {
    floatingText(scene, sprite.x, sprite.y, `+Supply Card`, POPUP_SUPPLY_COLOR, 'up');
  } else if (type === 'trail_guide') {
    floatingText(scene, sprite.x, sprite.y, `+Trail Guide`, POPUP_SUPPLY_COLOR, 'up');
  } else if (type === 'crack') {
    floatingText(scene, sprite.x, sprite.y, 'CRACK!', POPUP_CRACK_COLOR, 'up');
  }
}

/** Fly a consumable card from a die into the consumable bar. */
function animateGrantToConsumableBar(
  scene: Scene,
  fromX: number,
  fromY: number,
  def: ConsumableDef,
  consumableBar: ConsumableBar,
  onComplete: () => void,
): void {
  const prefix = getConsumableTexturePrefix(def.category);
  const textureKey = `${prefix}${def.id}`;
  if (!scene.textures.exists(textureKey)) {
    consumableBar.refresh();
    onComplete();
    return;
  }

  const targetX = consumableBar.x + consumableBar.width / 2;
  const targetY = consumableBar.y + consumableBar.height / 2;
  const ghost = scene.add.image(fromX, fromY, textureKey).setDepth(180).setScale(0.35);

  scene.tweens.add({
    targets: ghost,
    x: targetX,
    y: targetY,
    scaleX: 0.12,
    scaleY: 0.12,
    alpha: 0.85,
    duration: 480,
    ease: 'Power2',
    onComplete: () => {
      ghost.destroy();
      consumableBar.refresh();
      onComplete();
    },
  });
}

function popupForEquip(
  scene: Scene,
  equipBar: EquipmentBar,
  equipIndex: number,
  type: ScoreAnimPopupType,
  value: number,
): void {
  const card = equipBar.getCardByEquipIndex(equipIndex);
  if (!card) return;
  // Cards are children of the EquipmentBar container — offset by bar's world position
  const wx = equipBar.x + card.x;
  const wy = equipBar.y + card.y;
  if (type === 'miles') {
    floatingText(scene, wx, wy, `+${formatScore(value)} mi`, POPUP_MILES_COLOR, 'down');
  } else if (type === 'mult') {
    floatingText(scene, wx, wy, `+${value} mult`, POPUP_MULT_COLOR, 'down');
  } else if (type === 'xmult') {
    floatingText(scene, wx, wy, `x${value} mult`, POPUP_XMULT_COLOR, 'down');
  } else if (type === 'money') {
    floatingText(scene, wx, wy, `+$${value}`, POPUP_MONEY_COLOR, 'down');
  } else if (type === 'supply') {
    floatingText(scene, wx, wy, `+Supply Card`, POPUP_SUPPLY_COLOR, 'down');
  }
}

export interface ScoreAnimationConfig {
  scene: Scene;
  diceSprites: DiceSprite[];
  result: ScoreResult;
  sidebar: Sidebar;
  equipBar: EquipmentBar;
  consumableBar: ConsumableBar;
  lockedDiceIds: Set<string>;
  contentCX: number;
  onComplete: () => void;
}

/** Wiggle an equipment card */
function wiggleEquipCard(scene: Scene, equipBar: EquipmentBar, equipIndex: number): void {
  const card = equipBar.getCardByEquipIndex(equipIndex);
  if (!card) return;
  const origX = card.x;
  scene.tweens.add({
    targets: card,
    x: origX - 3,
    duration: 40,
    yoyo: true,
    repeat: 2,
    ease: 'Sine.easeInOut',
    onComplete: () => {
      card.x = origX;
    },
  });
}

/** Shake a die sprite in place */
function shakeDieSprite(scene: Scene, sprite: DiceSprite): void {
  const origX = sprite.x;
  const origY = sprite.y;
  const shakeDuration = 60;
  const shakeCount = 3;
  const shakeIntensity = 3;

  let shakeStep = 0;
  scene.time.addEvent({
    delay: shakeDuration,
    repeat: shakeCount * 2 - 1,
    callback: () => {
      shakeStep++;
      if (shakeStep % 2 === 1) {
        sprite.x = origX + (Math.random() > 0.5 ? shakeIntensity : -shakeIntensity);
        sprite.y = origY + (Math.random() > 0.5 ? 1 : -1);
      } else {
        sprite.x = origX;
        sprite.y = origY;
      }
    },
  });

  scene.time.delayedCall(shakeDuration * shakeCount * 2, () => {
    sprite.x = origX;
    sprite.y = origY;
    scene.tweens.add({
      targets: sprite,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 100,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  });
}

/** Get the sound to play for a given popup type */
function getSoundForType(type: string, stepIdx: number): { key: string; config: object } {
  switch (type) {
    case 'mult':
      return { key: 'sfx_multhit1', config: { volume: 0.3, detune: stepIdx * 50 } };
    case 'xmult':
      return { key: 'sfx_multhit2', config: { volume: 0.4, detune: -100 } };
    case 'money':
      return { key: 'sfx_coin', config: { volume: 0.4 } };
    case 'supply':
    case 'trail_guide':
      return { key: 'sfx_tarot1', config: { volume: 0.5 } };
    case 'enhance':
      return { key: 'sfx_foil1', config: { volume: 0.35 } };
    case 'crack':
      return { key: 'sfx_glass1', config: { volume: 0.6, detune: stepIdx * 20 } };
    case 'balance':
      return { key: 'sfx_multhit1', config: { volume: 0.45, detune: -50 } };
    default: // miles
      return { key: 'sfx_chips2', config: { volume: 0.3, detune: stepIdx * 80 } };
  }
}

function animateDieCrack(scene: Scene, sprite: DiceSprite, onComplete: () => void): void {
  ensureAuraTextures(scene);
  const matrix = sprite.getWorldTransformMatrix();
  const worldX = matrix.tx;
  const worldY = matrix.ty;

  const shardEmitter = scene.add.particles(worldX, worldY, 'aura_soft', {
    speed: { min: 70, max: 240 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.35, end: 0 },
    alpha: { start: 1, end: 0 },
    lifespan: { min: 220, max: 520 },
    frequency: -1,
    quantity: 18,
    tint: [0xddeeff, 0xb7d6ff, 0x9fc2ff, 0xffffff],
    blendMode: 'ADD',
  });
  shardEmitter.setDepth(450);
  shardEmitter.explode(18);

  const mistEmitter = scene.add.particles(worldX, worldY, 'aura_soft', {
    speed: { min: 10, max: 80 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.3, end: 0 },
    alpha: { start: 0.45, end: 0 },
    lifespan: { min: 300, max: 700 },
    frequency: -1,
    quantity: 10,
    tint: [0x9fc2ff, 0xcfe4ff, 0xffffff],
    blendMode: 'NORMAL',
  });
  mistEmitter.setDepth(449);
  mistEmitter.explode(10);

  scene.tweens.add({
    targets: sprite,
    scaleX: 0.15,
    scaleY: 0.15,
    alpha: 0,
    angle: sprite.angle + (Math.random() * 32 - 16),
    y: sprite.y - 10,
    duration: 220,
    ease: 'Cubic.easeIn',
    onComplete: () => {
      sprite.setVisible(false);
      sprite.disableInteractive();
      sprite.setActive(false);
      scene.time.delayedCall(500, () => {
        shardEmitter.destroy();
        mistEmitter.destroy();
      });
      onComplete();
    },
  });
}

export function playScoreAnimation(config: ScoreAnimationConfig): void {
  const { scene, diceSprites, result, sidebar, equipBar, consumableBar, lockedDiceIds, contentCX, onComplete } = config;
  const scoringIds = new Set(result.handResult.scoringDice.map((d) => d.id));
  const playedNonScoringSprites = diceSprites.filter(
    (s) => lockedDiceIds.has(s.dieData.id) && !scoringIds.has(s.dieData.id),
  );
  const heldSprites = diceSprites.filter((s) => !lockedDiceIds.has(s.dieData.id));

  // Build sprite lookup maps
  const dieSpriteMap = new Map<string, DiceSprite>();
  for (const s of diceSprites) dieSpriteMap.set(s.dieData.id, s);

  // ─── Step 0: Separate played vs held dice ───
  const HELD_DROP_Y = 80;
  const SEPARATION_DURATION = 350;
  const SPACING = 70;

  if (heldSprites.length > 0) {
    const totalW = (heldSprites.length - 1) * SPACING;
    const startX = contentCX - totalW / 2;
    const rollY = scene.scale.height * 0.5;

    for (let i = 0; i < heldSprites.length; i++) {
      const s = heldSprites[i];
      const count = heldSprites.length;
      let arcY = 0;
      let arcRot = 0;
      if (count > 1) {
        const t = i / (count - 1) - 0.5;
        arcY = -12 * (1 - 4 * t * t);
        arcRot = t * 0.08;
      }
      scene.tweens.add({
        targets: s,
        x: startX + i * SPACING,
        y: rollY + HELD_DROP_Y + arcY,
        rotation: arcRot,
        alpha: 0.5,
        duration: SEPARATION_DURATION,
        ease: 'Back.easeOut',
      });
    }
  }

  for (const s of playedNonScoringSprites) {
    scene.tweens.add({
      targets: s,
      alpha: 0.5,
      duration: SEPARATION_DURATION,
      ease: 'Sine.easeOut',
    });
  }

  scene.time.delayedCall(SEPARATION_DURATION + 150, beginScoring);

  function beginScoring(): void {
    const handBaseMiles = result.handResult.baseMiles;
    const handBaseMult = result.handResult.baseMult;

    let currentMiles = handBaseMiles;
    let currentMult = handBaseMult;

    sidebar.setMilesAnimated(currentMiles);
    sidebar.setMultAnimated(currentMult);
    scene.sound.play('sfx_chips1', { volume: 0.5 });

    // Play all events sequentially in the exact order they were scored
    const events = result.animEvents;
    let eventIdx = 0;
    let lastDieId: string | null = null;

    function processNextEvent() {
      if (eventIdx >= events.length) {
        finishScoring();
        return;
      }

      const evt = events[eventIdx];
      const dieId =
        evt.dieId ??
        (evt.target.kind === 'die' ? evt.target.dieId : evt.target.kind === 'both' ? evt.target.dieId : null);

      const finishEvent = () => {
        eventIdx++;
        scene.time.delayedCall(ANIM.SCORE_SUBSTEP_DELAY, processNextEvent);
      };

      // Shake die when we encounter a new die target
      if (dieId && dieId !== lastDieId) {
        lastDieId = dieId;
        const sprite = dieSpriteMap.get(dieId);
        if (sprite) {
          shakeDieSprite(scene, sprite);
        }
        scene.time.delayedCall(420, () => animateEvent(evt, eventIdx, finishEvent));
      } else {
        animateEvent(evt, eventIdx, finishEvent);
      }
    }

    // ─── Core event animator ───

    function animateEvent(evt: (typeof events)[0], stepIdx: number, done: () => void): void {
      const { target, popupType, value } = evt;

      // Special: strip enhancement from die (Graverobber)
      if (popupType === 'strip') {
        if (target.kind === 'die' || target.kind === 'both') {
          const sprite = dieSpriteMap.get(target.dieId);
          if (sprite) {
            // Flash white then redraw as standard die
            scene.tweens.add({
              targets: sprite,
              alpha: 0.3,
              duration: 80,
              yoyo: true,
              ease: 'Sine.easeInOut',
              onComplete: () => {
                sprite.setDieData({ ...sprite.dieData, enhancement: null });
              },
            });
          }
        }
        scene.sound.play('sfx_chips1', { volume: 0.2, detune: -200 });
        scene.time.delayedCall(120, done);
        return;
      }

      // Special: apply enhancement to die (Lucky Find, Golden Spike, etc.)
      if (popupType === 'enhance') {
        if (target.kind === 'die' || target.kind === 'both') {
          const sprite = dieSpriteMap.get(target.dieId);
          if (sprite) {
            shakeDieSprite(scene, sprite);
            const enhancement = evt.enhancement ?? null;
            const label = enhancement ? (ENHANCEMENT_NAMES.get(enhancement) ?? enhancement) : 'Enhanced';
            floatingText(scene, sprite.x, sprite.y, `+${label}`, POPUP_ENHANCE_COLOR, 'up');
            scene.time.delayedCall(120, () => {
              sprite.setDieData({ ...sprite.dieData, enhancement });
            });
          }
        }
        if (target.kind === 'equip' || target.kind === 'both') {
          wiggleEquipCard(scene, equipBar, target.equipIndex);
        }
        const sfx = getSoundForType('enhance', stepIdx);
        scene.sound.play(sfx.key, sfx.config);
        scene.time.delayedCall(200, done);
        return;
      }

      // Special: die crack and shatter (diamond crack, moonshine, trail destroys)
      if (popupType === 'crack') {
        if (target.kind === 'die' || target.kind === 'both') {
          const sprite = dieSpriteMap.get(target.dieId);
          if (sprite) {
            const sfx = getSoundForType('crack', stepIdx);
            scene.sound.play(sfx.key, sfx.config);
            popupForDie(scene, sprite, 'crack', value);
            animateDieCrack(scene, sprite, () => {
              dieSpriteMap.delete(target.dieId);
              done();
            });
            return;
          }
        }
        done();
        return;
      }

      // Trail guide from blue moon — popup on die, then fly card into consumable bar
      if (popupType === 'trail_guide') {
        const sprite = target.kind === 'die' || target.kind === 'both' ? dieSpriteMap.get(target.dieId) : undefined;
        const def = evt.consumableId ? getConsumableDefById(evt.consumableId) : null;
        if (sprite) {
          popupForDie(scene, sprite, 'trail_guide', value);
        }
        const sfx = getSoundForType('trail_guide', stepIdx);
        scene.sound.play(sfx.key, sfx.config);
        if (sprite && def) {
          animateGrantToConsumableBar(scene, sprite.x, sprite.y, def, consumableBar, done);
        } else {
          consumableBar.refresh();
          done();
        }
        return;
      }

      // Accountant profession: average miles and mult before final multiply
      if (popupType === 'balance') {
        const balanced = D(evt.decimalValue ?? value);
        const milesPos = sidebar.getMilesPillWorldPos();
        const multPos = sidebar.getMultPillWorldPos();
        const midX = (milesPos.x + multPos.x) / 2;
        const midY = (milesPos.y + multPos.y) / 2;
        floatingText(scene, midX, midY, 'Balance!', POPUP_BALANCE_COLOR, 'up');
        scene.sound.play('sfx_multhit1', { volume: 0.45, detune: -50 });
        scene.time.delayedCall(180, () => {
          sidebar.setMilesAnimated(balanced);
          sidebar.setMultAnimated(balanced);
          sidebar.shakeMilesPill();
          sidebar.shakeMultPill(true);
          currentMiles = balanced;
          currentMult = balanced;
          scene.time.delayedCall(450, done);
        });
        return;
      }

      // Show popup on die if target involves a die
      if (target.kind === 'die' || target.kind === 'both') {
        const sprite = dieSpriteMap.get(target.dieId);
        if (sprite && popupType !== 'trail_guide') {
          popupForDie(scene, sprite, popupType, value);
        }
      }

      // Wiggle and popup on equipment if target involves equip
      if (target.kind === 'equip' || target.kind === 'both') {
        wiggleEquipCard(scene, equipBar, target.equipIndex);
        popupForEquip(scene, equipBar, target.equipIndex, popupType, value);
      }

      // Update sidebar running totals with shake feedback
      if (popupType === 'miles') {
        currentMiles = addScore(currentMiles, value);
        sidebar.setMilesAnimated(currentMiles);
        sidebar.shakeMilesPill();
      } else if (popupType === 'mult') {
        currentMult = addScore(currentMult, value);
        sidebar.setMultAnimated(currentMult);
        sidebar.shakeMultPill(false);
      } else if (popupType === 'xmult') {
        currentMult = multiplyScore(currentMult, value);
        sidebar.setMultAnimated(currentMult);
        sidebar.shakeMultPill(true);
      }

      // Refresh consumable bar on supply card grants
      if (popupType === 'supply') {
        consumableBar.refresh();
      }

      // Play sound
      const sfx = getSoundForType(popupType, stepIdx);
      scene.sound.play(sfx.key, sfx.config);
      done();
    }

    // ─── Finish ───

    function finishScoring() {
      scene.time.delayedCall(ANIM.SCORE_FINAL_FLASH_DELAY, () => {
        sidebar.updateData({ milesBase: 0, mult: 0 });
        sidebar.setRoundScoreAnimated(addScore(result.roundScoreBefore ?? D(0), result.miles));
        scene.sound.play('sfx_timpani', { volume: 0.5 });
        scene.time.delayedCall(ANIM.SCORE_COMPLETE_DELAY + 400, onComplete);
      });
    }

    // Start scoring
    scene.time.delayedCall(ANIM.SCORE_STEP_DELAY, processNextEvent);
  }
}

export interface DieAnimEventsConfig {
  scene: Scene;
  diceSprites: DiceSprite[];
  events: ScoreAnimEvent[];
  onComplete: () => void;
}

/** Play money (and other die-target) popups on dice sprites — e.g. gold held at round end. */
export function playDieAnimEvents(config: DieAnimEventsConfig): void {
  const { scene, diceSprites, events, onComplete } = config;
  if (events.length === 0) {
    onComplete();
    return;
  }

  const dieSpriteMap = new Map<string, DiceSprite>();
  for (const s of diceSprites) dieSpriteMap.set(s.dieData.id, s);

  let eventIdx = 0;
  let lastDieId: string | null = null;

  const processNextEvent = () => {
    if (eventIdx >= events.length) {
      scene.time.delayedCall(ANIM.SCORE_SUBSTEP_DELAY, onComplete);
      return;
    }

    const evt = events[eventIdx];
    const dieId =
      evt.dieId ??
      (evt.target.kind === 'die' ? evt.target.dieId : evt.target.kind === 'both' ? evt.target.dieId : null);

    const runEvent = () => {
      if (dieId) {
        const sprite = dieSpriteMap.get(dieId);
        if (sprite) {
          popupForDie(scene, sprite, evt.popupType, evt.value);
        }
      }
      const sfx = getSoundForType(evt.popupType, eventIdx);
      scene.sound.play(sfx.key, sfx.config);
      eventIdx++;
      scene.time.delayedCall(ANIM.SCORE_SUBSTEP_DELAY, processNextEvent);
    };

    if (dieId && dieId !== lastDieId) {
      lastDieId = dieId;
      const sprite = dieSpriteMap.get(dieId);
      if (sprite) shakeDieSprite(scene, sprite);
      scene.time.delayedCall(420, runEvent);
    } else {
      runEvent();
    }
  };

  scene.time.delayedCall(ANIM.SCORE_STEP_DELAY, processNextEvent);
}
