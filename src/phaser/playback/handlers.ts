// ─── Playback command handlers (Phaser) ───

import type { Scene } from 'phaser';
import type { ModifierFeedbackPayload, PlaybackCommand } from '../../game/playback/types';
import type { Decimal } from '../../game/decimal';
import type { HandType, ScoreResult } from '../../game/types';
import type { ScoreAnimEvent } from '../../game/types';
import { applyEquipmentModifierDestructions } from '../../game/EquipmentModifiers';
import { getRoundHintContext } from '../../game/displayContext';
import { roundActions } from '../../game/store/actions/roundActions';
import { selectHandStats } from '../../game/store/selectors/runSelectors';
import { getRunState } from '../../game/store/runStore';
import { applyConsumableAnimEvents, playEquipmentCreatedPopIn } from '../animations/ConsumableAnimPlayback';
import {
  animateEquipmentFireDestruction,
  animateEquipmentFireDestructionSequence,
} from '../animations/EquipmentFireDestroyAnimation';
import { animateEquipmentPopIn } from '../animations/EquipmentPopInAnimation';
import { playHandUpgradeAnimation } from '../animations/HandUpgradeAnimation';
import { playDieAnimEvents, playScoreAnimation } from '../animations/ScoreAnimation';
import { playCenterToast } from '../animations/ToastAnimation';
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
}

export function isAutoDrainCommand(command: PlaybackCommand): boolean {
  if (command.kind === 'score-events' && command.label === 'round-end-held') return false;
  return true;
}

export function playPlaybackCommand(ctx: PlaybackHandlerContext, command: PlaybackCommand): Promise<void> {
  switch (command.kind) {
    case 'dice-added':
      ctx.onDiceAdded(command.dieIds);
      return Promise.resolve();
    case 'round-start-destructions':
      animateEquipmentFireDestructionSequence(ctx.scene, ctx.equipBar, command.entries);
      return Promise.resolve();
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
      return playScoreEventsPlayback(ctx, command.events);
    case 'hand-upgrades':
      return playHandUpgradesPlayback(ctx, command.upgrades);
    case 'tag-earned':
      return Promise.resolve();
    case 'modifier-feedback':
      return playModifierFeedbackPlayback(ctx, command.payload);
    case 'toast':
      return playCenterToast(ctx.scene, command.message, command.tone);
    default:
      return Promise.resolve();
  }
}

async function playScorePlayback(ctx: PlaybackHandlerContext, result: ScoreResult): Promise<void> {
  if (ctx.scoreLayoutGate) {
    await ctx.scoreLayoutGate.promise;
  }

  ctx.setAnimating(true);

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

  if (result.handUpgrades && result.handUpgrades.length > 0) {
    await new Promise<void>((resolve) => {
      playHandUpgradeAnimation({
        scene: ctx.scene,
        sidebar: ctx.sidebar,
        upgrades: result.handUpgrades!,
        onComplete: () => resolve(),
      });
    });
  }

  ctx.setAnimating(false);
  ctx.onScoreComplete();
}

function playScoreEventsPlayback(ctx: PlaybackHandlerContext, events: ScoreAnimEvent[]): Promise<void> {
  if (events.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    playDieAnimEvents({
      scene: ctx.scene,
      diceSprites: ctx.getDiceSprites(),
      events,
      consumableBar: ctx.consumableBar,
      equipBar: ctx.equipBar,
      onComplete: () => resolve(),
    });
  });
}

function playHandUpgradesPlayback(
  ctx: PlaybackHandlerContext,
  upgrades: NonNullable<Extract<PlaybackCommand, { kind: 'hand-upgrades' }>['upgrades']>,
): Promise<void> {
  if (upgrades.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    playHandUpgradeAnimation({
      scene: ctx.scene,
      sidebar: ctx.sidebar,
      upgrades,
      onComplete: () => resolve(),
    });
  });
}

function playModifierFeedbackPlayback(ctx: PlaybackHandlerContext, payload: ModifierFeedbackPayload): Promise<void> {
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
  roundActions.setSidebarOverlay({
    title: 'SCORING',
    handName: result.handResult.name,
    handLevel: stats.level,
  });
  result.roundScoreBefore = roundScoreBefore;
}
