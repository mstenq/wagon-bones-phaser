// ─── RoundSelectScene ───
// Balatro-style "Choose your next Blind" screen — play vs. skip each round in a leg.

import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { runStore } from '../../game/store/runStore';
import { bindStore } from '../store/subscribe';
import { TEXT_COLORS, FONTS, GAMEPLAY } from '../../game/Constants';
import { createLayout, LayoutResult } from '../ui/SceneLayout';
import { createLegRoundPanels } from '../ui/RoundInfo';
import { TagTooltip } from '../ui/TagTooltip';
import { gameFacade } from '../../game/facade';
import type { ConsumableInstance, UseConsumableResult } from '../../game/facade/consumable';
import { canUseConsumableInShop } from '../../game/facade/consumable';
import type { ImmediateTagResult } from '../../game/facade/meta';
import { resolveTagDescription } from '../../data/trail_tags';
import { buildVictoryGameOverData } from './GameOver';
import { handleStandardConsumableResult } from './consumableResult';
import { bindScenePlaybackRunner } from '../playback/bindScenePlaybackRunner';
import type { PlaybackRunnerHandle } from '../playback/PlaybackRunner';
import { enqueueHandUpgrades, enqueueTagEarned } from '../../game/store/playbackEnqueue';
import { getRunState } from '../../game/store';
import { canAfford } from '../../game/store/economy';
import {
  selectBossPermitRerollLimit,
  selectCanBossPermitReroll,
  selectJourneyComplete,
  selectPurchasedPermitsRevision,
  selectSkipPreviewTagForRound,
  selectTagDescriptionContextForRound,
  selectSkippedTagForRound,
  selectTargetMiles,
} from '../../game/store/selectors/runSelectors';
import { sceneActions } from '../../game/store/sceneStore';
import { consumeAndStartImmediatePackOpens } from './immediatePackFlow';
const COL_DEPTH = 100;
const TOOLTIP_DEPTH = 400;

export class RoundSelectScene extends Scene {
  private layout!: LayoutResult;
  private tagTooltip = new TagTooltip();
  private playbackRunner: PlaybackRunnerHandle | null = null;

  constructor() {
    super('RoundSelect');
  }

  create() {
    this.scale.on('resize', this.onResize, this);
    bindStore(this, runStore, selectPurchasedPermitsRevision, () => this.scene.restart(), { fireImmediately: false });
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.tagTooltip.hide();
    });

    this.layout = createLayout(this, {
      bgKey: null,
      felt: true,
      sidebarTitle: 'TRAIL MAP',
    });
    this.layout.consumableBar.setCanUsePredicate((def) => canUseConsumableInShop(def));
    this.layout.consumableBar.on('consumable-used', (consumed: ConsumableInstance) => {
      this.handleConsumableUsed(consumed);
    });

    this.playbackRunner = bindScenePlaybackRunner(this, {
      scene: this,
      equipBar: this.layout.equipBar,
      consumableBar: this.layout.consumableBar,
      sidebar: this.layout.sidebar,
      getTagEarnedOrigin: (round) => this.getRoundColumnCenter(round),
      getTagStackAnchor: () => this.layout.tagStack.getStackAnchor(),
    });

    gameFacade.meta.ensureRoundSkipPreviewTags();
    sceneActions.syncRoundSelectFromRun(getRunState().roundSkipPreviewTags);

    this.buildRoundColumns();

    EventBus.emit(Events.SCENE_READY, this);
  }

  private onPermitBossReroll(): void {
    if (!gameFacade.meta.tryBossPermitReroll()) return;
    this.tagTooltip.hide();
    this.scene.restart();
  }

  private buildRoundColumns(): void {
    const run = getRunState();
    const { contentCX, contentW, contentTop, contentBottom, contentX } = this.layout;
    const titleY = contentTop + 28;
    this.add
      .text(contentCX, titleY, 'Choose Your Next Round', {
        fontFamily: FONTS.HEADING,
        fontSize: '30px',
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(0.5)
      .setDepth(COL_DEPTH);

    const colY = titleY + 44;
    const colH = contentBottom - colY - 14;

    createLegRoundPanels(this, {
      bounds: {
        x: contentCX - contentW / 2,
        y: colY,
        width: contentW,
        height: colH,
      },
      currentRound: run.round,
      leg: run.leg,
      difficulty: run.difficulty,
      permitScoreReduction: run.permitScoreReduction,
      skippedRoundsThisLeg: run.skippedRoundsThisLeg,
      getSkippedTagForRound: (r) => selectSkippedTagForRound(run, r),
      getSkipPreviewTagForRound: (r) => selectSkipPreviewTagForRound(run, r),
      showActions: true,
      depth: COL_DEPTH,
      onPlay: () => this.onPlay(),
      onSkip: () => this.onSkip(),
      onRerollBoss: () => this.onPermitBossReroll(),
      canRerollBoss: () => {
        const s = getRunState();
        return (
          selectBossPermitRerollLimit(s) !== 0 &&
          selectCanBossPermitReroll(s) &&
          canAfford(s, GAMEPLAY.BOSS_REROLL_COST)
        );
      },
      onTagHover: (tag, round, ax, ay) => {
        const run = getRunState();
        const desc = resolveTagDescription(tag, selectTagDescriptionContextForRound(run, round));
        this.tagTooltip.show(
          this,
          tag,
          desc,
          ax,
          ay,
          {
            minX: contentX + 4,
            maxX: contentX + contentW - 4,
            minY: contentTop + 4,
          },
          TOOLTIP_DEPTH,
        );
      },
      onTagHoverEnd: () => this.tagTooltip.hide(),
    });
  }

  private onPlay(): void {
    this.tagTooltip.hide();
    sceneActions.clearRoundSelect();
    this.scene.start('Game', {});
  }

  private onSkip(): void {
    const run = getRunState();
    const tagDef = selectSkipPreviewTagForRound(run, run.round);
    if (!tagDef) return;
    this.tagTooltip.hide();

    const skippedRound = run.round;
    const previewMeta = selectTagDescriptionContextForRound(run, skippedRound);

    gameFacade.meta.recordRoundSkipped(tagDef, previewMeta);
    const tagInstance = gameFacade.meta.grantTag(tagDef, previewMeta);
    gameFacade.meta.advanceRound(true);

    const finishSkip = () => this.processImmediateTagFlow(true);

    if (!gameFacade.meta.isImmediateTag(tagInstance.def.category)) {
      enqueueTagEarned(tagInstance.def.id, tagInstance.def.category, skippedRound);
      void this.playbackRunner?.drainMatching((cmd) => cmd.kind === 'tag-earned').then(finishSkip);
    } else {
      finishSkip();
    }
  }

  private processImmediateTagFlow(restartWhenDone: boolean): boolean {
    gameFacade.meta.processChangeOfGuardTags();

    const immediateResults = gameFacade.meta.processImmediateTags();
    for (const result of immediateResults) {
      if (result.type === 'money') {
        this.showImmediateResult(result);
      }
    }

    const handUpgrades = immediateResults
      .map((r) => r.handUpgrade)
      .filter((u): u is NonNullable<typeof u> => u != null);

    enqueueHandUpgrades(handUpgrades);
    if (handUpgrades.length > 0) {
      void this.playbackRunner
        ?.drainMatching((cmd) => cmd.kind === 'hand-upgrades')
        .then(() => this.continueAfterImmediateTags(restartWhenDone));
      return true;
    }

    return this.continueAfterImmediateTags(restartWhenDone);
  }

  private continueAfterImmediateTags(restartWhenDone: boolean): boolean {
    if (consumeAndStartImmediatePackOpens(this, 'RoundSelect')) {
      return true;
    }

    const equipTags = gameFacade.meta.consumeTagsByCategory('immediate_equipment');
    for (const tag of equipTags) {
      gameFacade.meta.processJunkPileTag(tag);
    }

    const run = getRunState();
    if (selectJourneyComplete(run)) {
      this.scene.start('GameOver', buildVictoryGameOverData(0, selectTargetMiles(run)));
      return true;
    }

    if (restartWhenDone || equipTags.length > 0) {
      this.scene.restart();
      return true;
    }

    return false;
  }

  private getRoundColumnCenter(round: number): { x: number; y: number } {
    const { contentCX, contentW, contentTop, contentBottom } = this.layout;
    const gap = 20;
    const colW = Math.min(220, (contentW - gap * 2) / 3);
    const totalW = colW * 3 + gap * 2;
    const startX = contentCX - contentW / 2 + (contentW - totalW) / 2;
    const colX = startX + (round - 1) * (colW + gap);
    const titleY = contentTop + 28;
    const colY = titleY + 44;
    const colH = contentBottom - colY - 14;
    return { x: colX + colW / 2, y: colY + colH / 2 };
  }

  private showImmediateResult(result: ImmediateTagResult): void {
    const { contentCX } = this.layout;
    let message = '';
    if (result.type === 'money' && result.amount) {
      message = `+$${result.amount}`;
    } else {
      return;
    }

    const text = this.add
      .text(contentCX, this.layout.contentTop + 80, `${result.tagDef.name}: ${message}`, {
        fontFamily: FONTS.HEADING,
        fontSize: '22px',
        color: TEXT_COLORS.GOLD,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(TOOLTIP_DEPTH);

    this.tweens.add({
      targets: text,
      y: text.y - 40,
      alpha: 0,
      duration: 1800,
      ease: 'Power2',
    });
  }

  private onResize(): void {
    this.scene.restart();
  }

  private handleConsumableUsed(consumed: ConsumableInstance): void {
    const result = gameFacade.consumable.use(consumed);
    this.handleConsumableResult(result);
  }

  private handleConsumableResult(result: UseConsumableResult): void {
    const bar = this.layout.consumableBar;
    handleStandardConsumableResult(this, this.layout.sidebar, result, 'RoundSelect', {
      x: bar.x + bar.width / 2,
      y: bar.y,
      sound: () => this.sound.play('sfx_cancel', { volume: 0.5 }),
    });
  }
}
