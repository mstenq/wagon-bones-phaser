// ─── Button interaction animation (wiggle) ───
// Pure helpers — no Phaser imports.

import { ANIM } from '../../game/Constants';

export type ButtonAnimPhase = {
  scale: number;
  y: number;
  rotation: number;
};

export type ButtonAnimConfig = {
  rest: ButtonAnimPhase;
  hover: ButtonAnimPhase;
  press: ButtonAnimPhase;
  hoverEase: string;
  pressEase: string;
  releaseEase: string;
  clickPunchScale: number;
};

const BUTTON_ANIM: ButtonAnimConfig = {
  rest: { scale: 1, y: 0, rotation: 0 },
  hover: { scale: 1, y: -1, rotation: 0 },
  press: { scale: 0.94, y: 1, rotation: 0 },
  hoverEase: 'Back.easeOut',
  pressEase: 'Power2',
  releaseEase: 'Elastic.easeOut',
  clickPunchScale: 1.05,
};

export function getButtonAnimPreset(): ButtonAnimConfig {
  return BUTTON_ANIM;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function widthFactor(buttonWidth: number): number {
  const effectiveWidth = Math.max(buttonWidth, ANIM.BTN_WIGGLE_WIDTH_MIN);
  return ANIM.BTN_WIGGLE_WIDTH_REF / effectiveWidth;
}

/** Width-aware hover tilt — wider buttons rotate less. */
export function computeWiggleHoverRotation(buttonWidth: number): number {
  const widthScaled = ANIM.BTN_WIGGLE_HOVER_ANGLE_MAX * widthFactor(buttonWidth);
  const randomAmount =
    ANIM.BTN_WIGGLE_HOVER_RANDOM_MIN +
    Math.random() * (ANIM.BTN_WIGGLE_HOVER_RANDOM_MAX - ANIM.BTN_WIGGLE_HOVER_RANDOM_MIN);
  const magnitude = clamp(widthScaled * randomAmount, ANIM.BTN_WIGGLE_HOVER_ANGLE_MIN, ANIM.BTN_WIGGLE_HOVER_ANGLE_MAX);
  const sign = Math.random() < 0.5 ? -1 : 1;
  return magnitude * sign;
}

/** Width-aware hover scale — ~10% on narrow buttons, ~4% on wide (options menu rows). */
export function computeWiggleHoverScale(buttonWidth: number): number {
  const bonus = clamp(
    ANIM.BTN_HOVER_SCALE_BONUS_MAX * widthFactor(buttonWidth),
    ANIM.BTN_HOVER_SCALE_BONUS_MIN,
    ANIM.BTN_HOVER_SCALE_BONUS_MAX,
  );
  return 1 + bonus;
}

export function computeWigglePressRotation(hoverRotation: number): number {
  if (hoverRotation === 0) return 0;
  return -hoverRotation * ANIM.BTN_WIGGLE_PRESS_ROTATION_FACTOR;
}
