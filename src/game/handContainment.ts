import { HandType } from './types';

/** Hand types that can contain weaker hand types as sub-components. */
type HandsWithContainment = Extract<
  HandType,
  | HandType.FIVE_OF_A_KIND
  | HandType.FOUR_OF_A_KIND
  | HandType.FULL_HOUSE
  | HandType.THREE_OF_A_KIND
  | HandType.TWO_PAIR
  | HandType.FIVE_STRAIGHT
  | HandType.FOUR_STRAIGHT
  | HandType.FLUSH_FIVE
  | HandType.FLUSH_HOUSE
  | HandType.STRAIGHT_FLUSH
>;

const CONTAINMENT: Record<HandsWithContainment, HandType[]> = {
  FIVE_OF_A_KIND: [HandType.FIVE_OF_A_KIND, HandType.THREE_OF_A_KIND, HandType.PAIR, HandType.FOUR_OF_A_KIND],
  FOUR_OF_A_KIND: [HandType.THREE_OF_A_KIND, HandType.PAIR, HandType.TWO_PAIR],
  FULL_HOUSE: [HandType.THREE_OF_A_KIND, HandType.PAIR, HandType.TWO_PAIR],
  THREE_OF_A_KIND: [HandType.PAIR],
  TWO_PAIR: [HandType.PAIR],
  FIVE_STRAIGHT: [HandType.FOUR_STRAIGHT],
  FOUR_STRAIGHT: [],
  FLUSH_FIVE: [HandType.FIVE_OF_A_KIND, HandType.FOUR_OF_A_KIND, HandType.THREE_OF_A_KIND, HandType.PAIR],
  FLUSH_HOUSE: [HandType.FULL_HOUSE, HandType.THREE_OF_A_KIND, HandType.PAIR, HandType.TWO_PAIR],
  STRAIGHT_FLUSH: [HandType.FIVE_STRAIGHT, HandType.FOUR_STRAIGHT],
};

/** True when `played` is exactly `required` or a stronger hand that contains `required`. */
export function handTypeContains(played: HandType | null, required: HandType): boolean {
  if (!played) return false;
  if (played === required) return true;
  return CONTAINMENT[played as HandsWithContainment]?.includes(required) ?? false;
}
