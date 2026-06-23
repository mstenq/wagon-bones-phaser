// ─── RoundSelectScene ───
// Balatro-style "Choose your next Blind" screen — play vs. skip each round in a leg.

import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { runStore } from '../../game/store/runStore';
import { bindStore } from '../store/subscribe';
import { TEXT_COLORS, FONTS, GAMEPLAY } from '../../game/Constants';
import type { LayoutResult } from '../ui/SceneLayout';
import { createLegRoundPanels, computeLegRoundPanelGeometry } from '../ui/RoundInfo';
import { TagTooltip } from '../ui/TagTooltip';
import { createRunSceneShell } from './runSceneShell';
import { gameFacade } from '../../game/facade';
import type { ImmediateTagResult } from '../../game/facade/meta';
import { resolveTagDescription } from '../../data/trail_tags';
import { getTagDisplayContext } from '../../game/displayContext';
import { buildVictoryGameOverData } from './GameOver';
import { consumeAndStartImmediatePackOpens } from './immediatePackFlow';
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
import { tryEnqueueTutorial } from '../../game/tutorialEnqueue';

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

    const shell = createRunSceneShell(this, {
      layout: {
        bgKey: null,
        felt: true,
        sidebarTitle: 'TRAIL MAP',
      },
      consumableReturnScene: 'RoundSelect',
      playback: {
        getTagEarnedOrigin: (round) => this.getRoundColumnCenter(round),
        getTagStackAnchor: () => this.layout.tagStack.getStackAnchor(),
      },
    });
    this.layout = shell.layout;
    this.playbackRunner = shell.playbackRunner;

    gameFacade.meta.ensureRoundSkipPreviewTags();
    sceneActions.syncRoundSelectFromRun(getRunState().roundSkipPreviewTags);

    this.buildRoundColumns();
    this.enqueueRoundSelectTutorials();

    EventBus.emit(Events.SCENE_READY, this);
  }

  private enqueueRoundSelectTutorials(): void {
    const run = getRunState();
    if (run.leg === 1 && run.round === 1) {
      tryEnqueueTutorial('round_select_intro');
      return;
    }
    if (run.leg === 1 && run.round === 2) {
      tryEnqueueTutorial('round_choice_intro');
      return;
    }
    if (run.leg === 1 && run.round === GAMEPLAY.ROUNDS_PER_LEG) {
      tryEnqueueTutorial('beat_showdown_advance');
      return;
    }
    if (run.leg === 2) {
      tryEnqueueTutorial('reach_oregon');
    }
  }

  private onPermitBossReroll(): void {
    if (!gameFacade.meta.tryBossPermitReroll()) return;
    this.tagTooltip.hide();
    this.scene.restart();
  }

  private getRoundPanelLayout() {
    const { contentCX, contentW, contentTop, contentBottom } = this.layout;
    const isPortrait = this.layout.layoutMode === 'topbar';
    const titleY = contentTop + (isPortrait ? 14 : 28);
    const panelsY = titleY + (isPortrait ? 28 : 44);
    const panelsH = contentBottom - panelsY - (isPortrait ? 8 : 14);
    return {
      isPortrait,
      titleY,
      bounds: {
        x: contentCX - contentW / 2,
        y: panelsY,
        width: contentW,
        height: panelsH,
      },
      layout: isPortrait ? ('rows' as const) : ('columns' as const),
    };
  }

  private buildRoundColumns(): void {
    const run = getRunState();
    const { contentCX, contentX, contentW, contentTop } = this.layout;
    const panelLayout = this.getRoundPanelLayout();
    const titleFontSize = panelLayout.isPortrait ? `${Math.max(16, Math.floor(16 * this.layout.uiScale))}px` : '30px';

    this.add
      .text(contentCX, panelLayout.titleY, 'Choose Your Next Round', {
        fontFamily: FONTS.HEADING,
        fontSize: titleFontSize,
        color: TEXT_COLORS.PRIMARY,
      })
      .setOrigin(0.5)
      .setDepth(COL_DEPTH);

    createLegRoundPanels(this, {
      bounds: panelLayout.bounds,
      layout: panelLayout.layout,
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
        const meta = selectTagDescriptionContextForRound(run, round);
        const desc = resolveTagDescription(tag, getTagDisplayContext(run, { round, surveyorHand: meta.surveyorHand }));
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
    const panelLayout = this.getRoundPanelLayout();
    const run = getRunState();
    const geometry = computeLegRoundPanelGeometry(panelLayout.bounds, {
      layout: panelLayout.layout,
      currentRound: run.round,
      showActions: true,
      skippedRoundsThisLeg: run.skippedRoundsThisLeg,
    });
    const slot = geometry.panels.find((panel) => panel.round === round);
    if (!slot) {
      return { x: this.layout.contentCX, y: panelLayout.bounds.y + panelLayout.bounds.height / 2 };
    }
    return { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 };
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
}
