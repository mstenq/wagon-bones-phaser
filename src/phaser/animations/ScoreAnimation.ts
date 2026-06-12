// ─── ScoreAnimation ───
// Balatro-style sequential dice scoring: each die shakes and adds to the
// running miles/mult tally shown in the sidebar. Equipment that contributes
// gets wiggled. Sounds play on each step.

import { Scene } from 'phaser';
import { DiceSprite } from '../ui/DiceSprite';
import { Die, ScoreAnimEvent, ScoreResult, ScoreAnimPopupType } from '../../game/types';
import { ConsumableDef, getConsumableAtlasKey, getConsumableDefById } from '../../game/ConsumablesSystem';
import diceEnhancements from '../../data/dice_enhancements';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import { ensureAuraTextures } from '../ui/AuraFX';
import { FONT_NUMBER, UI } from '../../game/Constants';
import { getScoreAnimTimings } from '../../game/ScoreAnimTimings';
import { getRoundState } from '../../game/store/roundStore';
import { resolveDieById } from '../../game/store/roundResolve';
import { formatScore, formatXMult } from '../../game/formatScore';
import { endScoreAnimSession, pacingForFollowUp, pacingForHandScore, type ScoreAnimPacing } from './scoreAnimPacing';
import { addScore, multiplyScore, D } from '../../game/scoreMath';
import { milesToSave } from '../../game/scoreMath';
import { roundActions } from '../../game/store/actions/roundActions';
import { consumableActions } from '../../game/store/actions/consumableActions';
import { setDieEnhancement } from '../../game/DiceSystem';

// ─── Floating Score Popup ───

const POPUP_MILES_COLOR = '#4488ff';
const POPUP_MULT_COLOR = '#ff4444';
const POPUP_XMULT_COLOR = '#ff4444';
const POPUP_MONEY_COLOR = '#ffd700';
const POPUP_SUPPLY_COLOR = '#9c27b0';
const POPUP_ENHANCE_COLOR = '#55ddff';
const POPUP_CRACK_COLOR = '#cfe4ff';
const POPUP_BALANCE_COLOR = '#e8c547';
const POPUP_AGAIN_COLOR = '#ffffff';

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
  const T = getScoreAnimTimings();
  const offsetY = direction === 'up' ? -40 : 48;
  const driftY = direction === 'up' ? -18 : 18;

  const txt = scene.add
    .text(x, y + offsetY, text, {
      fontFamily: FONT_NUMBER,
      fontSize: '18px',
      color,
      stroke: '#000000',
      strokeThickness: 3,
      align: 'center',
    })
    .setOrigin(0.5)
    .setDepth(UI.SCORE_POPUP_DEPTH)
    .setScale(0.3)
    .setAlpha(1);

  // Pop in with scale + slight shake
  scene.tweens.add({
    targets: txt,
    scaleX: 1.2,
    scaleY: 1.2,
    duration: T.POPUP_POP_IN_MS,
    ease: 'Back.easeOut',
    onComplete: () => {
      // Quick shake
      const origX = txt.x;
      scene.tweens.chain({
        targets: txt,
        tweens: [
          { x: origX - 2, duration: T.POPUP_SHAKE_STEP_MS },
          { x: origX + 2, duration: T.POPUP_SHAKE_STEP_MS },
          { x: origX - 1, duration: T.POPUP_SHAKE_STEP_MS },
          { x: origX, duration: T.POPUP_SHAKE_STEP_MS },
        ],
      });

      // Settle scale then drift + fade out
      scene.tweens.add({
        targets: txt,
        scaleX: 1,
        scaleY: 1,
        duration: T.POPUP_SETTLE_MS,
        ease: 'Sine.easeOut',
        onComplete: () => {
          scene.tweens.add({
            targets: txt,
            y: txt.y + driftY,
            alpha: 0,
            duration: T.POPUP_FADE_MS,
            delay: T.POPUP_FADE_DELAY_MS,
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
    floatingText(scene, sprite.x, sprite.y, `x${formatXMult(value)} mult`, POPUP_XMULT_COLOR, 'up');
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
  const textureSource = { key: getConsumableAtlasKey(def.category), frame: `${def.id}.png` };
  if (!scene.textures.getFrame(textureSource.key, textureSource.frame)) {
    onComplete();
    return;
  }

  const targetX = consumableBar.x + consumableBar.width / 2;
  const targetY = consumableBar.y + consumableBar.height / 2;
  const ghost = scene.add
    .image(fromX, fromY, textureSource.key, textureSource.frame)
    .setDepth(UI.SCORE_POPUP_DEPTH)
    .setScale(0.35);

  const T = getScoreAnimTimings();
  scene.tweens.add({
    targets: ghost,
    x: targetX,
    y: targetY,
    scaleX: 0.12,
    scaleY: 0.12,
    alpha: 0.85,
    duration: T.GRANT_FLY_IN_MS,
    ease: 'Power2',
    onComplete: () => {
      ghost.destroy();
      onComplete();
    },
  });
}

function getEquipCardWorldPos(equipBar: EquipmentBar, equipIndex: number): { x: number; y: number } | null {
  const card = equipBar.getCardByEquipIndex(equipIndex);
  if (!card) return null;
  return { x: equipBar.x + card.x, y: equipBar.y + card.y };
}

function applyConsumableGrant(consumableId?: string): ConsumableDef | null {
  if (!consumableId) return null;
  const def = getConsumableDefById(consumableId);
  if (!def) return null;
  return consumableActions.addConsumable(def) ? def : null;
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
    floatingText(scene, wx, wy, `x${formatXMult(value)} mult`, POPUP_XMULT_COLOR, 'down');
  } else if (type === 'money') {
    floatingText(scene, wx, wy, `+$${value}`, POPUP_MONEY_COLOR, 'down');
  } else if (type === 'supply') {
    floatingText(scene, wx, wy, `+Supply Card`, POPUP_SUPPLY_COLOR, 'down');
  } else if (type === 'again') {
    floatingText(scene, wx, wy, 'Again!', POPUP_AGAIN_COLOR, 'down');
  }
}

function popupForConsumable(
  scene: Scene,
  consumableBar: ConsumableBar,
  consumableIndex: number,
  type: ScoreAnimPopupType,
  value: number,
): void {
  const card = consumableBar.getCardAt(consumableIndex);
  if (!card) return;
  const wx = consumableBar.x + card.x;
  const wy = consumableBar.y + card.y;
  if (type === 'xmult') {
    floatingText(scene, wx, wy, `x${formatXMult(value)} mult`, POPUP_XMULT_COLOR, 'down');
  }
}

export interface ScoreAnimationConfig {
  scene: Scene;
  diceSprites: DiceSprite[];
  result: ScoreResult;
  sidebar: Sidebar;
  equipBar: EquipmentBar;
  consumableBar: ConsumableBar;
  onComplete: () => void;
}

/** Wiggle an equipment card */
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

/** Wiggle a consumable bar card */
function wiggleConsumableCard(scene: Scene, consumableBar: ConsumableBar, consumableIndex: number): void {
  const T = getScoreAnimTimings();
  const card = consumableBar.getCardAt(consumableIndex);
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

/** Aggressive shake for retrigger "Again!" — position, rotation, and scale punch. */
function shakeEquipCardAgain(scene: Scene, equipBar: EquipmentBar, equipIndex: number): void {
  const T = getScoreAnimTimings();
  const card = equipBar.getCardByEquipIndex(equipIndex);
  if (!card) return;

  scene.tweens.killTweensOf(card);

  const origX = card.x;
  const origY = card.y;
  const origAngle = card.angle;
  const origScaleX = card.scaleX;
  const origScaleY = card.scaleY;

  const stepMs = T.AGAIN_STEP_MS;
  const jitterSteps = T.AGAIN_JITTER_STEPS;
  const posIntensity = T.AGAIN_POS_INTENSITY;
  const rotIntensity = T.AGAIN_ROT_INTENSITY;

  let step = 0;
  scene.time.addEvent({
    delay: stepMs,
    repeat: jitterSteps - 1,
    callback: () => {
      step++;
      if (step % 2 === 1) {
        card.x = origX + (Math.random() > 0.5 ? posIntensity : -posIntensity);
        card.y = origY + (Math.random() > 0.5 ? 6 : -6);
        card.angle = origAngle + (Math.random() * rotIntensity * 2 - rotIntensity);
      } else {
        card.x = origX;
        card.y = origY;
        card.angle = origAngle;
      }
    },
  });

  scene.time.delayedCall(stepMs * jitterSteps, () => {
    card.setPosition(origX, origY);
    card.angle = origAngle;
    scene.tweens.add({
      targets: card,
      scaleX: origScaleX * T.AGAIN_SCALE_MULT,
      scaleY: origScaleY * T.AGAIN_SCALE_MULT,
      duration: T.AGAIN_SCALE_PUNCH_MS,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => {
        card.setScale(origScaleX, origScaleY);
      },
    });
  });
}

/** Shake a die sprite in place */
function shakeDieSprite(scene: Scene, sprite: DiceSprite): void {
  const T = getScoreAnimTimings();
  const origX = sprite.x;
  const origY = sprite.y;
  const origScaleX = sprite.scaleX;
  const origScaleY = sprite.scaleY;
  const punchScaleX = origScaleX * T.DICE_SCORE_PUNCH_MULT;
  const punchScaleY = origScaleY * T.DICE_SCORE_PUNCH_MULT;
  const shakeDuration = T.DIE_SHAKE_DURATION_MS;
  const shakeCount = T.DIE_SHAKE_COUNT;
  const shakeIntensity = T.DIE_SHAKE_INTENSITY;

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
      scaleX: punchScaleX,
      scaleY: punchScaleY,
      duration: T.DIE_PUNCH_MS,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  });
}

function playAgainRetrigger(
  scene: Scene,
  equipBar: EquipmentBar,
  equipIndex: number,
  value: number,
  stepIdx: number,
  pacing: ScoreAnimPacing,
  done: () => void,
): void {
  if (pacing.trimFx) {
    wiggleEquipCard(scene, equipBar, equipIndex);
  } else {
    shakeEquipCardAgain(scene, equipBar, equipIndex);
  }
  popupForEquip(scene, equipBar, equipIndex, 'again', value);
  const sfx = getSoundForType('again', stepIdx);
  scene.sound.play(sfx.key, sfx.config);
  pacing.wait(scene, getScoreAnimTimings().SCORE_ACCEL_AGAIN_DELAY, done);
}

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
    case 'again':
      return { key: 'sfx_multhit2', config: { volume: 0.35, detune: 120 } };
    default: // miles
      return { key: 'sfx_chips2', config: { volume: 0.3, detune: stepIdx * 80 } };
  }
}

function animateDieCrack(scene: Scene, sprite: DiceSprite, onComplete: () => void): void {
  const T = getScoreAnimTimings();
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
    duration: T.CRACK_SHRINK_MS,
    ease: 'Cubic.easeIn',
    onComplete: () => {
      sprite.setVisible(false);
      sprite.disableInteractive();
      sprite.setActive(false);
      scene.time.delayedCall(T.CRACK_CLEANUP_MS, () => {
        shardEmitter.destroy();
        mistEmitter.destroy();
      });
      onComplete();
    },
  });
}

function resolveDieForScoreSprite(dieId: string, scoringDieById: Map<string, Die>): Die | undefined {
  const round = getRoundState();
  // Prefer run collection (post-score mutations like green contagion) over handResult snapshot.
  const fromRun = round ? resolveDieById(dieId, round) : undefined;
  return fromRun ?? scoringDieById.get(dieId);
}

function applyEnhanceAnimToDie(base: Die, evt: ScoreAnimEvent): Die {
  const next = { ...base };
  if (evt.enhancement !== undefined) {
    setDieEnhancement(next, evt.enhancement);
  }
  if (evt.sticker !== undefined) {
    next.sticker = evt.sticker;
  }
  if (evt.aura !== undefined) {
    next.aura = evt.aura;
  }
  return next;
}

function syncDieSpriteFromScore(sprite: DiceSprite, dieId: string, scoringDieById: Map<string, Die>): void {
  const die = resolveDieForScoreSprite(dieId, scoringDieById);
  if (!die) return;
  scoringDieById.set(dieId, die);
  sprite.setDieData(die);
}

function syncDieSpriteFromEnhanceEvent(
  sprite: DiceSprite,
  dieId: string,
  evt: ScoreAnimEvent,
  scoringDieById: Map<string, Die>,
): void {
  const base = resolveDieForScoreSprite(dieId, scoringDieById) ?? sprite.dieData;
  const die = applyEnhanceAnimToDie(base, evt);
  scoringDieById.set(dieId, die);
  sprite.setDieData(die);
}

function syncAllDieSpritesFromScore(diceSprites: DiceSprite[], scoringDieById: Map<string, Die>): void {
  for (const sprite of diceSprites) {
    syncDieSpriteFromScore(sprite, sprite.dieData.id, scoringDieById);
  }
}

export function playScoreAnimation(config: ScoreAnimationConfig): void {
  const { scene, diceSprites, result, sidebar, equipBar, consumableBar, onComplete } = config;

  // Build sprite lookup maps
  const dieSpriteMap = new Map<string, DiceSprite>();
  for (const s of diceSprites) dieSpriteMap.set(s.dieData.id, s);

  const scoringDieById = new Map(result.handResult.scoringDice.map((d) => [d.id, d]));

  beginScoring();

  function beginScoring(): void {
    const T = getScoreAnimTimings();
    const handBaseMiles = result.handResult.baseMiles;
    const handBaseMult = result.handResult.baseMult;

    let currentMiles = handBaseMiles;
    let currentMult = handBaseMult;

    sidebar.setMilesAnimated(currentMiles);
    sidebar.setMultAnimated(currentMult);
    scene.sound.play('sfx_chips1', { volume: 0.5 });

    // Play all events sequentially in the exact order they were scored
    const events = result.animEvents;
    const pacing = pacingForHandScore(events.length);
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
        pacing.wait(scene, T.SCORE_SUBSTEP_DELAY, processNextEvent);
      };

      const runEvent = () => animateEvent(evt, eventIdx, finishEvent);

      // Shake die when we encounter a new die target (skip preamble when compressed)
      if (dieId && dieId !== lastDieId) {
        lastDieId = dieId;
        if (!pacing.trimFx) {
          const sprite = dieSpriteMap.get(dieId);
          if (sprite) {
            shakeDieSprite(scene, sprite);
          }
          pacing.wait(scene, T.SCORE_ACCEL_DIE_PREAMBLE_MS, runEvent);
        } else {
          runEvent();
        }
      } else {
        runEvent();
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
              duration: T.STRIP_FLASH_MS,
              yoyo: true,
              ease: 'Sine.easeInOut',
              onComplete: () => syncDieSpriteFromScore(sprite, target.dieId, scoringDieById),
            });
          }
        }
        scene.sound.play('sfx_chips1', { volume: 0.2, detune: -200 });
        pacing.wait(scene, T.STRIP_WAIT_MS, done);
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
            pacing.wait(scene, T.ENHANCE_SYNC_WAIT_MS, () =>
              syncDieSpriteFromEnhanceEvent(sprite, target.dieId, evt, scoringDieById),
            );
          }
        }
        if (target.kind === 'equip' || target.kind === 'both') {
          wiggleEquipCard(scene, equipBar, target.equipIndex);
        }
        const sfx = getSoundForType('enhance', stepIdx);
        scene.sound.play(sfx.key, sfx.config);
        pacing.wait(scene, T.ENHANCE_FINISH_WAIT_MS, done);
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
          animateGrantToConsumableBar(scene, sprite.x, sprite.y, def, consumableBar, () => {
            applyConsumableGrant(evt.consumableId);
            done();
          });
        } else {
          applyConsumableGrant(evt.consumableId);
          done();
        }
        return;
      }

      // Supply/frontier grant animation into consumable bar.
      if (popupType === 'supply') {
        const sprite = target.kind === 'die' || target.kind === 'both' ? dieSpriteMap.get(target.dieId) : undefined;
        const def = evt.consumableId ? getConsumableDefById(evt.consumableId) : null;
        if (sprite) {
          popupForDie(scene, sprite, 'supply', value);
        }
        if (target.kind === 'equip' || target.kind === 'both') {
          wiggleEquipCard(scene, equipBar, target.equipIndex);
          popupForEquip(scene, equipBar, target.equipIndex, 'supply', value);
        }
        const sfx = getSoundForType('supply', stepIdx);
        scene.sound.play(sfx.key, sfx.config);

        const fromPos = sprite
          ? { x: sprite.x, y: sprite.y }
          : target.kind === 'equip' || target.kind === 'both'
            ? getEquipCardWorldPos(equipBar, target.equipIndex)
            : null;

        if (fromPos && def) {
          animateGrantToConsumableBar(scene, fromPos.x, fromPos.y, def, consumableBar, () => {
            applyConsumableGrant(evt.consumableId);
            done();
          });
        } else {
          applyConsumableGrant(evt.consumableId);
          done();
        }
        return;
      }

      // Retrigger equipment: "Again!" on the causing card (no sidebar update)
      if (popupType === 'again') {
        if (target.kind === 'equip') {
          playAgainRetrigger(scene, equipBar, target.equipIndex, value, stepIdx, pacing, done);
        } else {
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
        pacing.wait(scene, T.BALANCE_FIRST_WAIT_MS, () => {
          sidebar.setMilesAnimated(balanced);
          sidebar.setMultAnimated(balanced);
          sidebar.shakeMilesPill();
          sidebar.shakeMultPill(true);
          currentMiles = balanced;
          currentMult = balanced;
          pacing.wait(scene, T.BALANCE_SECOND_WAIT_MS, done);
        });
        return;
      }

      // Show popup on die if target involves a die
      if (target.kind === 'die' || target.kind === 'both') {
        const sprite = dieSpriteMap.get(target.dieId);
        if (sprite) {
          popupForDie(scene, sprite, popupType, value);
        }
      }

      // Wiggle and popup on equipment if target involves equip
      if (target.kind === 'equip' || target.kind === 'both') {
        wiggleEquipCard(scene, equipBar, target.equipIndex);
        popupForEquip(scene, equipBar, target.equipIndex, popupType, value);
      }

      // Wiggle and popup on consumable bar card (Surveyor's Scope)
      if (target.kind === 'consumable') {
        wiggleConsumableCard(scene, consumableBar, target.consumableIndex);
        popupForConsumable(scene, consumableBar, target.consumableIndex, popupType, value);
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
      // Play sound
      const sfx = getSoundForType(popupType, stepIdx);
      scene.sound.play(sfx.key, sfx.config);
      done();
    }

    // ─── Finish ───

    function finishScoring() {
      syncAllDieSpritesFromScore(diceSprites, scoringDieById);
      pacing.wait(scene, T.SCORE_FINAL_FLASH_DELAY, () => {
        roundActions.setSidebarOverlay({ milesBaseSave: milesToSave(0), multSave: milesToSave(0) });
        sidebar.setRoundScoreAnimated(addScore(result.roundScoreBefore ?? D(0), result.miles));
        scene.sound.play('sfx_timpani', { volume: 0.5 });
        pacing.wait(scene, T.SCORE_COMPLETE_DELAY + T.SCORE_ROUND_TOTAL_DELAY, onComplete);
      });
    }

    // Start scoring
    scene.time.delayedCall(pacing.gapMs(T.SCORE_STEP_DELAY), processNextEvent);
  }
}

export interface DieAnimEventsConfig {
  scene: Scene;
  diceSprites: DiceSprite[];
  events: ScoreAnimEvent[];
  consumableBar?: ConsumableBar;
  equipBar?: EquipmentBar;
  /** Clear the hand score session after this playback (round-end held payout). */
  endSession?: boolean;
  onComplete: () => void;
}

/** Play die-target popups (money, trail guide fly-in, retrigger "Again!", …) — e.g. round-end held rewards. */
export function playDieAnimEvents(config: DieAnimEventsConfig): void {
  const { scene, diceSprites, events, consumableBar, equipBar, endSession, onComplete } = config;
  if (events.length === 0) {
    if (endSession) endScoreAnimSession();
    onComplete();
    return;
  }

  const finish = () => {
    if (endSession) endScoreAnimSession();
    onComplete();
  };

  const T = getScoreAnimTimings();
  const pacing = pacingForFollowUp(events.length);

  const dieSpriteMap = new Map<string, DiceSprite>();
  for (const s of diceSprites) dieSpriteMap.set(s.dieData.id, s);

  let eventIdx = 0;
  let lastDieId: string | null = null;

  const finishEvent = () => {
    eventIdx++;
    pacing.wait(scene, T.SCORE_SUBSTEP_DELAY, processNextEvent);
  };

  const animateEvent = (evt: ScoreAnimEvent, stepIdx: number, done: () => void): void => {
    const { target, popupType, value } = evt;

    if (popupType === 'trail_guide') {
      const sprite = target.kind === 'die' || target.kind === 'both' ? dieSpriteMap.get(target.dieId) : undefined;
      const def = evt.consumableId ? getConsumableDefById(evt.consumableId) : null;
      if (sprite) {
        popupForDie(scene, sprite, 'trail_guide', value);
      }
      const sfx = getSoundForType('trail_guide', stepIdx);
      scene.sound.play(sfx.key, sfx.config);
      if (sprite && def && consumableBar) {
        animateGrantToConsumableBar(scene, sprite.x, sprite.y, def, consumableBar, () => {
          applyConsumableGrant(evt.consumableId);
          done();
        });
      } else {
        applyConsumableGrant(evt.consumableId);
        pacing.wait(scene, T.SCORE_SUBSTEP_DELAY, done);
      }
      return;
    }

    if (popupType === 'supply') {
      const sprite = target.kind === 'die' || target.kind === 'both' ? dieSpriteMap.get(target.dieId) : undefined;
      const def = evt.consumableId ? getConsumableDefById(evt.consumableId) : null;
      if (sprite) {
        popupForDie(scene, sprite, 'supply', value);
      }
      if (equipBar && (target.kind === 'equip' || target.kind === 'both')) {
        wiggleEquipCard(scene, equipBar, target.equipIndex);
        popupForEquip(scene, equipBar, target.equipIndex, 'supply', value);
      }
      const sfx = getSoundForType('supply', stepIdx);
      scene.sound.play(sfx.key, sfx.config);
      const fromPos = sprite
        ? { x: sprite.x, y: sprite.y }
        : equipBar && (target.kind === 'equip' || target.kind === 'both')
          ? getEquipCardWorldPos(equipBar, target.equipIndex)
          : null;
      if (fromPos && def && consumableBar) {
        animateGrantToConsumableBar(scene, fromPos.x, fromPos.y, def, consumableBar, () => {
          applyConsumableGrant(evt.consumableId);
          done();
        });
      } else {
        applyConsumableGrant(evt.consumableId);
        pacing.wait(scene, T.SCORE_SUBSTEP_DELAY, done);
      }
      return;
    }

    if (popupType === 'again') {
      if (equipBar && target.kind === 'equip') {
        playAgainRetrigger(scene, equipBar, target.equipIndex, value, stepIdx, pacing, done);
      } else {
        done();
      }
      return;
    }

    const dieId = evt.dieId ?? (target.kind === 'die' ? target.dieId : target.kind === 'both' ? target.dieId : null);
    if (dieId) {
      const sprite = dieSpriteMap.get(dieId);
      if (sprite) {
        popupForDie(scene, sprite, popupType, value);
      }
    }
    const sfx = getSoundForType(popupType, stepIdx);
    scene.sound.play(sfx.key, sfx.config);
    done();
  };

  const processNextEvent = () => {
    if (eventIdx >= events.length) {
      pacing.wait(scene, T.SCORE_SUBSTEP_DELAY, finish);
      return;
    }

    const evt = events[eventIdx];
    const dieId =
      evt.dieId ??
      (evt.target.kind === 'die' ? evt.target.dieId : evt.target.kind === 'both' ? evt.target.dieId : null);

    const runEvent = () => animateEvent(evt, eventIdx, finishEvent);

    if (dieId && dieId !== lastDieId) {
      lastDieId = dieId;
      if (!pacing.trimFx) {
        const sprite = dieSpriteMap.get(dieId);
        if (sprite) shakeDieSprite(scene, sprite);
        pacing.wait(scene, T.SCORE_ACCEL_DIE_PREAMBLE_MS, runEvent);
      } else {
        runEvent();
      }
    } else {
      runEvent();
    }
  };

  scene.time.delayedCall(pacing.gapMs(T.SCORE_STEP_DELAY), processNextEvent);
}
