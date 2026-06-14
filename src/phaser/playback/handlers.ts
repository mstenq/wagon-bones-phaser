// ─── Playback command handlers (Phaser) ───

import type { Scene } from 'phaser';
import type { ModifierFeedbackPayload, PlaybackCommand } from '../../game/playback/types';
import type { Decimal } from '../../game/decimal';
import { COLORS } from '../../game/Constants';
import type { HandType, ScoreResult, ScoreAnimEvent, TagCategory } from '../../game/types';
import { applyEquipmentModifierDestructions } from '../../game/EquipmentModifiers';
import { getRoundHintContext } from '../../game/displayContext';
import { roundActions } from '../../game/store/actions/roundActions';
import { selectHandStats } from '../../game/store/selectors/runSelectors';
import { getRunState } from '../../game/store/runStore';
import { animateAshfangTrailGuideEat } from '../animations/AshfangEatAnimation';
import { applyConsumableAnimEvents, playEquipmentCreatedPopIn } from '../animations/ConsumableAnimPlayback';
import {
  animateEquipmentFireDestruction,
  animateEquipmentFireDestructionSequence,
} from '../animations/EquipmentFireDestroyAnimation';
import { animateEquipmentPopIn } from '../animations/EquipmentPopInAnimation';
import { playHandUpgradeAnimation, playHandUpgradeMissAnimation } from '../animations/HandUpgradeAnimation';
import { playDieAnimEvents, playScoreAnimation } from '../animations/ScoreAnimation';
import { playCenterToast } from '../animations/ToastAnimation';
import { showTutorialModal } from '../ui/TutorialModal';
import { playTagEarnedFlyIn } from './tagEarnedPlayback';
import { isTutorialMessageId, resolveTutorialMessage } from '../../data/tutorialMessages';
import { isTutorialSeen, markTutorialSeen } from '../../game/TutorialPreferences';
import { selectTargetMiles } from '../../game/store/selectors/runSelectors';
import type { ConsumableBar } from '../ui/ConsumableBar';
import type { DiceSprite } from '../ui/DiceSprite';
import type { EquipmentBar } from '../ui/EquipmentBar';
import type { Sidebar } from '../ui/Sidebar';

export interface PlaybackHandlerContext {
  scene: Scene;
  equipBar: EquipmentBar;
  consumableBar: ConsumableBar;
  sidebar: Sidebar;
  getDiceSprites: () => DiceSprite[];
  destroyDice: (diceIds: string[]) => Promise<void>;
  /** Resolved after score layout tweens finish (GameScene enterScorePhase). */
  scoreLayoutGate: { promise: Promise<void> } | null;
  setAnimating: (value: boolean) => void;
  onDiceAdded: (dieIds: string[]) => void;
  onScoreComplete: () => void;
  showFloatingText?: (message: string, color: number) => void;
  getTagEarnedOrigin?: (round: number) => { x: number; y: number };
  getTagStackAnchor?: () => { x: number; y: number };
}

export function isAutoDrainCommand(command: PlaybackCommand): boolean {
  if (command.kind === 'score-events' && command.label === 'round-end-held') return false;
  if (command.kind === 'day-end-destructions') return false;
  return true;
}

export function playPlaybackCommand(ctx: PlaybackHandlerContext, command: PlaybackCommand): Promise<void> {
  switch (command.kind) {
    case 'dice-added':
      ctx.onDiceAdded(command.dieIds);
      return Promise.resolve();
    case 'round-start-destructions':
      return playRoundStartDestructions(ctx, command.entries);
    case 'round-start-trail-guide-eats':
      return playRoundStartTrailGuideEats(ctx, command.events);
    case 'round-start-equipment-created':
      return animateEquipmentPopIn(ctx.scene, ctx.equipBar, command.count);
    case 'equipment-created':
      return animateEquipmentPopIn(ctx.scene, ctx.equipBar, command.equipmentIndices.length);
    case 'equipment-created-count':
      return playEquipmentCreatedPopIn(ctx.scene, ctx.equipBar, command.count);
    case 'equipment-destroyed':
      return new Promise((resolve) => {
        animateEquipmentFireDestruction(ctx.scene, ctx.equipBar, command.sourceIdx, command.victimIdx, () => resolve());
      });
    case 'consumable-playback':
      return applyConsumableAnimEvents(ctx.scene, ctx.equipBar, command.events, {
        destroyDice: ctx.destroyDice,
      }).then(() => playEquipmentCreatedPopIn(ctx.scene, ctx.equipBar, command.equipmentCreatedCount));
    case 'score':
      return playScorePlayback(ctx, command.result);
    case 'score-events':
      return playScoreEventsPlayback(ctx, command.events, command.label);
    case 'hand-upgrades':
      return playHandUpgradesPlayback(ctx, command.upgrades);
    case 'hand-upgrade-misses':
      return playHandUpgradeMissesPlayback(ctx, command.misses);
    case 'day-end-destructions':
      return playDayEndDestructionsPlayback(ctx, command.indices, command.destroyedNames, command.holdMs);
    case 'tag-earned':
      return playTagEarnedPlayback(ctx, command.tagId, command.category, command.round);
    case 'modifier-feedback':
      return playModifierFeedbackPlayback(ctx, command.payload, command.applyDestruction);
    case 'toast':
      return playCenterToast(ctx.scene, command.message, command.tone);
    case 'tutorial':
      return playTutorialPlayback(ctx, command.tutorialId);
    default:
      return Promise.resolve();
  }
}

function playTutorialPlayback(ctx: PlaybackHandlerContext, tutorialId: string): Promise<void> {
  if (!isTutorialMessageId(tutorialId) || isTutorialSeen(tutorialId)) {
    return Promise.resolve();
  }
  const run = getRunState();
  const message = resolveTutorialMessage(tutorialId, { targetMiles: selectTargetMiles(run) });
  return showTutorialModal(ctx.scene, message).then(() => {
    markTutorialSeen(tutorialId);
  });
}

function playRoundStartDestructions(
  ctx: PlaybackHandlerContext,
  entries: { sourceIdx: number; victimIdx: number }[],
): Promise<void> {
  if (entries.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    animateEquipmentFireDestructionSequence(ctx.scene, ctx.equipBar, entries, resolve);
  });
}

function playRoundStartTrailGuideEats(
  ctx: PlaybackHandlerContext,
  events: Extract<PlaybackCommand, { kind: 'round-start-trail-guide-eats' }>['events'],
): Promise<void> {
  if (events.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    animateAshfangTrailGuideEat(ctx.scene, ctx.consumableBar, ctx.equipBar, events, resolve);
  });
}

async function playScorePlayback(ctx: PlaybackHandlerContext, result: ScoreResult): Promise<void> {
  if (ctx.scoreLayoutGate) {
    await ctx.scoreLayoutGate.promise;
  }

  ctx.setAnimating(true);

  if (result.handUpgrades && result.handUpgrades.length > 0) {
    refreshScoreSidebarHandLevel(result);
  }

  await new Promise<void>((resolve) => {
    playScoreAnimation({
      scene: ctx.scene,
      diceSprites: ctx.getDiceSprites(),
      result,
      sidebar: ctx.sidebar,
      equipBar: ctx.equipBar,
      consumableBar: ctx.consumableBar,
      onComplete: () => {
        ctx.equipBar.setHintRound(getRoundHintContext());
        resolve();
      },
    });
  });

  ctx.setAnimating(false);
  ctx.onScoreComplete();
}

function playScoreEventsPlayback(
  ctx: PlaybackHandlerContext,
  events: ScoreAnimEvent[],
  label?: 'round-end-held',
): Promise<void> {
  if (events.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    playDieAnimEvents({
      scene: ctx.scene,
      diceSprites: ctx.getDiceSprites(),
      events,
      consumableBar: ctx.consumableBar,
      equipBar: ctx.equipBar,
      endSession: label === 'round-end-held',
      onComplete: () => resolve(),
    });
  });
}

function playHandUpgradeMissesPlayback(
  ctx: PlaybackHandlerContext,
  misses: NonNullable<Extract<PlaybackCommand, { kind: 'hand-upgrade-misses' }>['misses']>,
): Promise<void> {
  if (misses.length === 0) return Promise.resolve();
  return (async () => {
    if (ctx.scoreLayoutGate) {
      await ctx.scoreLayoutGate.promise;
    }
    await new Promise<void>((resolve) => {
      playHandUpgradeMissAnimation({
        scene: ctx.scene,
        equipBar: ctx.equipBar,
        misses,
        onComplete: () => resolve(),
      });
    });
  })();
}

function playHandUpgradesPlayback(
  ctx: PlaybackHandlerContext,
  upgrades: NonNullable<Extract<PlaybackCommand, { kind: 'hand-upgrades' }>['upgrades']>,
): Promise<void> {
  if (upgrades.length === 0) return Promise.resolve();
  return (async () => {
    if (ctx.scoreLayoutGate) {
      await ctx.scoreLayoutGate.promise;
    }
    await new Promise<void>((resolve) => {
      playHandUpgradeAnimation({
        scene: ctx.scene,
        sidebar: ctx.sidebar,
        upgrades,
        onComplete: () => resolve(),
      });
    });
  })();
}

function playDayEndDestructionsPlayback(
  ctx: PlaybackHandlerContext,
  indices: number[],
  destroyedNames: string[],
  holdMs: number,
): Promise<void> {
  if (indices.length === 0) return Promise.resolve();

  const sorted = [...indices].sort((a, b) => a - b);

  return new Promise((resolve) => {
    const playNext = (remaining: number[]) => {
      if (remaining.length === 0) {
        for (const name of destroyedNames) {
          ctx.showFloatingText?.(`💥 ${name} destroyed!`, 0xff4444);
        }
        if (holdMs > 0) {
          ctx.scene.time.delayedCall(holdMs, () => resolve());
        } else {
          resolve();
        }
        return;
      }

      const idx = remaining[0];
      const rest = remaining.slice(1).map((i) => (i > idx ? i - 1 : i));

      animateEquipmentFireDestruction(
        ctx.scene,
        ctx.equipBar,
        idx,
        idx,
        () => {
          roundActions.applyEndOfRoundDestructions([idx]);
          ctx.scene.time.delayedCall(200, () => playNext(rest));
        },
        { deferStateUpdate: true },
      );
    };

    playNext(sorted);
  });
}

function playTagEarnedPlayback(
  ctx: PlaybackHandlerContext,
  tagId: string,
  category: string,
  round: number,
): Promise<void> {
  const origin = ctx.getTagEarnedOrigin?.(round);
  const anchor = ctx.getTagStackAnchor?.();
  if (!origin || !anchor) return Promise.resolve();

  return new Promise((resolve) => {
    playTagEarnedFlyIn(ctx.scene, tagId, category as TagCategory, origin.x, origin.y, anchor.x, anchor.y, resolve);
  });
}

function playModifierFeedbackPlayback(
  ctx: PlaybackHandlerContext,
  payload: ModifierFeedbackPayload,
  _applyDestruction = true,
): Promise<void> {
  const { leasePaid, perished, leaseDefaulted } = payload;
  const hasDestroy = perished.length > 0 || leaseDefaulted.length > 0;
  const modifierResult = {
    leasePaid,
    perished,
    leaseDefaulted,
    destroyedIndices: [] as number[],
  };

  return new Promise((resolve) => {
    const showModifierFeedback = () => {
      for (const { equipmentName, cost } of leasePaid) {
        ctx.showFloatingText?.(`-$${cost} lease: ${equipmentName}`, COLORS.GOLD);
      }
      ctx.equipBar.flashLeasedUpkeepPaid(leasePaid.map((p) => p.index));

      if (!hasDestroy) {
        applyEquipmentModifierDestructions(modifierResult);
      }
      ctx.equipBar.setHintRound(getRoundHintContext());
      ctx.equipBar.flashPerishableWarnings();
      resolve();
    };

    if (hasDestroy) {
      ctx.equipBar.animateModifierDestructions(modifierResult, showModifierFeedback);
    } else {
      showModifierFeedback();
    }
  });
}

/** Sidebar hand display for score playback (mirrors GameScene.enterScorePhase). */
export function prepareScoreSidebar(result: ScoreResult, roundScoreBefore: Decimal): void {
  const handType = result.handResult.type as HandType;
  const stats = selectHandStats(getRunState(), handType);
  const matchingUpgrades = result.handUpgrades?.filter((u) => u.handType === handType) ?? [];
  const handLevel = matchingUpgrades.length > 0 ? matchingUpgrades[0].oldLevel : stats.level;
  roundActions.setSidebarOverlay({
    title: 'SCORING',
    handName: result.handResult.name,
    handLevel,
  });
  result.roundScoreBefore = roundScoreBefore;
}

function refreshScoreSidebarHandLevel(result: ScoreResult): void {
  const handType = result.handResult.type as HandType;
  const stats = selectHandStats(getRunState(), handType);
  roundActions.setSidebarOverlay({
    title: 'SCORING',
    handName: result.handResult.name,
    handLevel: stats.level,
  });
}
