// ─── Score animation timings UI metadata (No Phaser imports) ───

import type { ScoreAnimTimings } from './ScoreAnimTimings';

export type ScoreAnimTimingFieldMeta = {
  key: keyof ScoreAnimTimings;
  /** Short label shown in the preferences panel. */
  title: string;
  /** Plain-language explanation of what changing this value does. */
  description: string;
  /** ms, px, count, or multiplier — shown beside the input when helpful. */
  unit?: string;
};

export type ScoreAnimTimingGroupMeta = {
  id: string;
  title: string;
  /** Optional intro for the whole section. */
  blurb?: string;
  fields: ScoreAnimTimingFieldMeta[];
};

/** Grouped, human-readable catalog for the score anim preferences UI. */
export const SCORE_ANIM_TIMING_GROUPS: ScoreAnimTimingGroupMeta[] = [
  {
    id: 'hand-pace',
    title: 'Hand scoring pace',
    blurb: 'How fast the game steps through each +miles, +mult, and equipment proc while you score a hand. Start here.',
    fields: [
      {
        key: 'SCORE_SUBSTEP_DELAY',
        title: 'Gap between scoring steps',
        description:
          'Wait after each scoring event before the next one plays — every die pip, equipment mult, and sidebar update. Lower = snappier hands; higher = easier to read each hit.',
        unit: 'ms',
      },
      {
        key: 'SCORE_STEP_DELAY',
        title: 'Pause before scoring starts',
        description:
          'One-time beat after you press Score, before the first event fires. Does not repeat between later steps (see gap between scoring steps).',
        unit: 'ms',
      },
      {
        key: 'SCORE_ACCEL_DIE_PREAMBLE_MS',
        title: 'Pause when switching dice',
        description:
          'Extra wait when the animation moves to a new die: shake plays, then this delay, then that die’s miles/mult pop. Equipment-only steps do not get this pause.',
        unit: 'ms',
      },
      {
        key: 'SCORE_ACCEL_AGAIN_DELAY',
        title: 'Hold after “Again!”',
        description:
          'How long Silver Bullets-style equipment retriggers linger on “Again!” before the queue continues. Only affects retrigger events, not normal +mult pops.',
        unit: 'ms',
      },
    ],
  },
  {
    id: 'big-hand-accel',
    title: 'Big-hand speed-up',
    blurb:
      'When a hand generates many animation events, gaps compress so scoring does not drag. These control when and how aggressively that kicks in.',
    fields: [
      {
        key: 'SCORE_ACCEL_MIN_EVENTS',
        title: 'Start compressing after N events',
        description:
          'Hands with this many events or fewer keep full gaps. Above this count, step delays begin shrinking.',
        unit: 'events',
      },
      {
        key: 'SCORE_ACCEL_FULL_AT',
        title: 'Reach max compression at N events',
        description:
          'Event count where gap compression stops increasing. Between “start compressing” and this value, speed-up ramps up linearly.',
        unit: 'events',
      },
      {
        key: 'SCORE_ACCEL_MAX',
        title: 'Max compression multiplier',
        description:
          'Fastest allowed speed-up at huge hands. 2 = half the gaps; 3 = one-third. Cannot shrink gaps below the minimum gap floor.',
        unit: '×',
      },
      {
        key: 'SCORE_ACCEL_MIN_GAP_MS',
        title: 'Minimum gap floor',
        description:
          'Smallest allowed delay between steps after compression. Prevents enormous hands from becoming a blur of instant pops.',
        unit: 'ms',
      },
    ],
  },
  {
    id: 'hand-finish',
    title: 'End-of-hand wrap-up',
    blurb: 'Timing after the last scoring event, when the sidebar flashes the round total and control returns to you.',
    fields: [
      {
        key: 'SCORE_FINAL_FLASH_DELAY',
        title: 'Pause before round-total flash',
        description: 'Beat after the last +mi/+mult event, before the sidebar shows the big round score flash.',
        unit: 'ms',
      },
      {
        key: 'SCORE_COMPLETE_DELAY',
        title: 'Round total on screen',
        description: 'How long the round total stays visible with the timpani hit before the animation fully ends.',
        unit: 'ms',
      },
      {
        key: 'SCORE_ROUND_TOTAL_DELAY',
        title: 'Extra beat after round total',
        description:
          'Additional hold after the round total display before gameplay UI unlocks. Added on top of round total on screen.',
        unit: 'ms',
      },
    ],
  },
  {
    id: 'popups',
    title: 'Floating score text',
    blurb:
      'The +miles, +mult, and xmult labels that pop above dice or below equipment. Visual only — the queue does not wait for these to finish.',
    fields: [
      {
        key: 'POPUP_POP_IN_MS',
        title: 'Pop-in duration',
        description: 'How quickly the text scales up from small to its punch size when it appears.',
        unit: 'ms',
      },
      {
        key: 'POPUP_SHAKE_STEP_MS',
        title: 'Text wiggle step',
        description: 'Duration of each left-right wiggle during the pop-in settle. Four steps total.',
        unit: 'ms',
      },
      {
        key: 'POPUP_SETTLE_MS',
        title: 'Shrink to normal size',
        description: 'Time to ease from the punch scale back to normal before the text drifts away.',
        unit: 'ms',
      },
      {
        key: 'POPUP_FADE_DELAY_MS',
        title: 'Wait before fade',
        description: 'Idle time after settle before the text starts drifting and fading out.',
        unit: 'ms',
      },
      {
        key: 'POPUP_FADE_MS',
        title: 'Drift and fade out',
        description: 'How long the text takes to float away and disappear.',
        unit: 'ms',
      },
    ],
  },
  {
    id: 'equipment',
    title: 'Equipment card motion',
    blurb: 'Wiggle when gear contributes, plus the heavier shake used for “Again!” retriggers.',
    fields: [
      {
        key: 'WIGGLE_OFFSET',
        title: 'Wiggle distance',
        description: 'How far the equipment card slides left-right on a normal scoring proc.',
        unit: 'px',
      },
      {
        key: 'WIGGLE_DURATION_MS',
        title: 'Wiggle half-cycle',
        description: 'Time for one side-to-side leg of the card wiggle (yoyo doubles the motion).',
        unit: 'ms',
      },
      {
        key: 'WIGGLE_REPEAT',
        title: 'Wiggle repeats',
        description: 'How many extra wiggle cycles after the first. Also used for consumable bar wiggles.',
        unit: 'count',
      },
      {
        key: 'AGAIN_STEP_MS',
        title: '“Again!” jitter tick',
        description: 'Interval between each jitter frame during the aggressive Again shake.',
        unit: 'ms',
      },
      {
        key: 'AGAIN_JITTER_STEPS',
        title: '“Again!” jitter count',
        description: 'Number of jitter ticks before the card does its scale punch.',
        unit: 'count',
      },
      {
        key: 'AGAIN_POS_INTENSITY',
        title: '“Again!” position shake',
        description: 'How far the card jumps in pixels during the Again jitter.',
        unit: 'px',
      },
      {
        key: 'AGAIN_ROT_INTENSITY',
        title: '“Again!” rotation shake',
        description: 'Max twist in degrees applied during the Again jitter.',
        unit: 'deg',
      },
      {
        key: 'AGAIN_SCALE_MULT',
        title: '“Again!” scale punch',
        description: 'Peak scale multiplier for the card pop after jitter (1.14 = 14% larger).',
        unit: '×',
      },
      {
        key: 'AGAIN_SCALE_PUNCH_MS',
        title: '“Again!” punch duration',
        description: 'Time for the scale punch up and back after jitter.',
        unit: 'ms',
      },
    ],
  },
  {
    id: 'dice-shake',
    title: 'Dice shake on score',
    blurb: 'Motion when a die is first highlighted during scoring. Does not affect equipment-only steps.',
    fields: [
      {
        key: 'DIE_SHAKE_DURATION_MS',
        title: 'Shake tick interval',
        description: 'Milliseconds between each jiggle frame while the die rattles in place.',
        unit: 'ms',
      },
      {
        key: 'DIE_SHAKE_COUNT',
        title: 'Shake cycles',
        description: 'How many full shake cycles run before the die scale punch.',
        unit: 'count',
      },
      {
        key: 'DIE_SHAKE_INTENSITY',
        title: 'Shake distance',
        description: 'How far the die nudges horizontally during each shake tick.',
        unit: 'px',
      },
      {
        key: 'DIE_PUNCH_MS',
        title: 'Die scale punch',
        description: 'Duration of the die’s grow-and-shrink punch after shaking.',
        unit: 'ms',
      },
      {
        key: 'DICE_SCORE_PUNCH_MULT',
        title: 'Die punch scale',
        description: 'Peak size multiplier for the die punch after shake (1.2 = 20% larger).',
        unit: '×',
      },
      {
        key: 'DICE_SCORE_LAYOUT_DURATION',
        title: 'Score line layout tween',
        description: 'How long dice take to slide into the score row when you press Score.',
        unit: 'ms',
      },
    ],
  },
  {
    id: 'special-events',
    title: 'Special scoring events',
    blurb: 'Less common moments: enhancements, cracks, strips, grants, and Accountant balance.',
    fields: [
      {
        key: 'ENHANCE_SYNC_WAIT_MS',
        title: 'Enhance: before sprite update',
        description:
          'After the “+Lucky” (etc.) label on an enhance event, wait this long before the die face actually changes.',
        unit: 'ms',
      },
      {
        key: 'ENHANCE_FINISH_WAIT_MS',
        title: 'Enhance: before next step',
        description:
          'Total hold on an enhance event before the scoring queue advances. Runs after the sprite sync wait.',
        unit: 'ms',
      },
      {
        key: 'STRIP_FLASH_MS',
        title: 'Strip: flash duration',
        description: 'Graverobber-style strip — how long the die flashes dim before redrawn as a plain die.',
        unit: 'ms',
      },
      {
        key: 'STRIP_WAIT_MS',
        title: 'Strip: before next step',
        description: 'Pause after the strip flash before the next scoring event.',
        unit: 'ms',
      },
      {
        key: 'CRACK_SHRINK_MS',
        title: 'Crack: shatter tween',
        description: 'How long the die takes to shrink away when it cracks (diamond, moonshine, etc.).',
        unit: 'ms',
      },
      {
        key: 'CRACK_CLEANUP_MS',
        title: 'Crack: cleanup delay',
        description: 'Extra wait after the shrink before the destroyed die is removed from the row.',
        unit: 'ms',
      },
      {
        key: 'GRANT_FLY_IN_MS',
        title: 'Card fly-in to bar',
        description:
          'Duration when a supply or trail guide card flies from a die or equipment into the consumable bar.',
        unit: 'ms',
      },
      {
        key: 'BALANCE_FIRST_WAIT_MS',
        title: 'Balance: after “Balance!”',
        description:
          'Accountant profession — pause after the Balance! label before miles and mult snap to the average.',
        unit: 'ms',
      },
      {
        key: 'BALANCE_SECOND_WAIT_MS',
        title: 'Balance: after numbers change',
        description: 'Accountant profession — pause after sidebar pills update before the next scoring step.',
        unit: 'ms',
      },
    ],
  },
];

/** Flat list of keys in UI order (groups, then fields). */
export function listScoreAnimTimingKeysGrouped(): (keyof ScoreAnimTimings)[] {
  return SCORE_ANIM_TIMING_GROUPS.flatMap((group) => group.fields.map((field) => field.key));
}
