// ─── Tutorial popup copy — drip-fed at gameplay milestones ───

import { GAMEPLAY } from '../game/Constants';
import { formatScore } from '../game/formatScore';
import type { DecimalSource } from '../game/decimal';

export const TUTORIAL_MESSAGE_IDS = [
  'round_select_intro',
  'first_round_play',
  'reroll_intro',
  'days_rerolls_limit',
  'shop_welcome',
  'consumable_slots',
  'shop_extras',
  'round_choice_intro',
  'beat_showdown_advance',
  'reach_oregon',
  'equipment_order',
  'consumable_use',
  'loaded_dice_intro',
] as const;

export type TutorialMessageId = (typeof TUTORIAL_MESSAGE_IDS)[number];

export interface TutorialMessageContext {
  targetMiles?: DecimalSource;
}

function formatTargetMiles(targetMiles?: DecimalSource): string {
  if (targetMiles === undefined) return '300';
  return formatScore(targetMiles);
}

const STATIC_MESSAGES = {
  round_select_intro: (ctx: TutorialMessageContext) =>
    `Your goal is to travel enough miles to complete each round on the trail. This Mile Marker needs ${formatTargetMiles(ctx.targetMiles)} miles — select it to start!`,
  first_round_play: (ctx: TutorialMessageContext) =>
    `Dice are selected at random from your pouch, click roll to roll them. Select up to 5 dice and press Score Hand — each hand type earns miles multiplied by Mult. Reach ${formatTargetMiles(ctx.targetMiles)} miles before you run out of travel days. Hand details live in Journey Info → Trail Knowledge.`,
  reroll_intro: 'Select the dice you want to keep, and reroll the rest to make better hands. Try it!',
  days_rerolls_limit:
    'Reminder: travel days and rerolls are limited each round. Plan ahead so you can still reach the mile goal.',
  shop_welcome: `Nice win! The Shop is where you spend earnings on equipment and supplies. You can carry up to ${GAMEPLAY.MAX_EQUIPMENT_SLOTS} equipment and ${GAMEPLAY.MAX_CONSUMABLE_SLOTS} consumables — pick what fits your run.`,
  consumable_slots: `Supply cards go in your consumable slots (up to ${GAMEPLAY.MAX_CONSUMABLE_SLOTS}). Use them during rounds to buff dice before you score.`,
  shop_extras:
    'Permits passively upgrade your run when you can afford them — they restock after each Showdown. Booster Packs are worth checking every visit too.',
  round_choice_intro:
    'The River Ford pays money if you play it, or skip it to earn a Tag with a unique effect. Watch the Showdown — it has a special ability to plan around.',
  beat_showdown_advance:
    'Beat the Showdown to advance to the next leg. Rounds get tougher as you push toward Oregon City.',
  reach_oregon: 'Reach Oregon City on leg 8 to win the trail. Choose your next round when you are ready.',
  equipment_order: 'You can drag equipment to reorder it. Equipment triggers left to right — position matters!',
  consumable_use: "Select dice and press USE on a supply card to enhance them. Don't let consumables sit unused!",
  loaded_dice_intro:
    'Loaded dice have a 1 in 3 chance to roll your Loaded Die Number. Change it in the lower-left corner — tap the value or use +/− to adjust before you roll.',
} satisfies Record<TutorialMessageId, string | ((ctx: TutorialMessageContext) => string)>;

export function resolveTutorialMessage(id: TutorialMessageId, ctx: TutorialMessageContext = {}): string {
  const entry = STATIC_MESSAGES[id];
  if (typeof entry === 'function') return entry(ctx);
  return entry;
}

export function isTutorialMessageId(value: string): value is TutorialMessageId {
  return (TUTORIAL_MESSAGE_IDS as readonly string[]).includes(value);
}
