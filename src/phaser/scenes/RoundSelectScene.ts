// ─── RoundSelectScene ───
// Balatro-style "Choose your next Blind" screen — play vs. skip each round in a leg.

import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { TEXT_COLORS, FONTS, TAG_STACK, GAMEPLAY } from '../../game/Constants';
import { createLayout, LayoutResult } from '../ui/SceneLayout';
import { createLegRoundPanels } from '../ui/RoundInfo';
import { TagTooltip } from '../ui/TagTooltip';
import {
  ensureRoundSkipPreviewTags,
  grantTag,
  processImmediateTags,
  processChangeOfGuardTags,
  processJunkPileTag,
  getPackDefIdForTag,
  isImmediateTag,
  type ImmediateTagResult,
} from '../../game/TagSystem';
import { resolveTagDescription } from '../../data/trail_tags';
import type { TrailTagInstance } from '../../game/types';
import { playHandUpgradeAnimation } from '../animations/HandUpgradeAnimation';
import { getPackDefById } from '../../game/BoosterPackSystem';
import { buildVictoryGameOverData } from './GameOver';
import { bossActions, getRunState, progressionActions, tagActions } from '../../game/store';
import { canAfford } from '../../game/store/economy';
import {
  selectBossPermitRerollLimit,
  selectCanBossPermitReroll,
  selectJourneyComplete,
  selectSkipPreviewTagForRound,
  selectTagDescriptionContextForRound,
  selectSkippedTagForRound,
  selectTargetMiles,
} from '../../game/store/selectors/runSelectors';
import { sceneActions } from '../../game/store/sceneStore';
const COL_DEPTH = 100;
const TOOLTIP_DEPTH = 400;

const TAG_FLY_COLORS: Record<string, number> = {
  shop: 0x44aa44,
  shop_aura: 0x9966cc,
  boss: 0xcc4444,
  next_round: 0xcc8844,
  meta: 0xcccccc,
};

export class RoundSelectScene extends Scene {
  private layout!: LayoutResult;
  private tagTooltip = new TagTooltip();
  private readonly onPermitsChanged = () => this.scene.restart();

  constructor() {
    super('RoundSelect');
  }

  create() {
    this.scale.on('resize', this.onResize, this);
    EventBus.on(Events.PERMITS_CHANGED, this.onPermitsChanged);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      EventBus.off(Events.PERMITS_CHANGED, this.onPermitsChanged);
      this.tagTooltip.hide();
    });

    this.layout = createLayout(this, {
      bgKey: null,
      felt: true,
      sidebarTitle: 'TRAIL MAP',
    });

    ensureRoundSkipPreviewTags();
    sceneActions.syncRoundSelectFromRun(getRunState().roundSkipPreviewTags);

    this.buildRoundColumns();

    EventBus.emit(Events.SCENE_READY, this);
  }

  private onPermitBossReroll(): void {
    if (!bossActions.tryBossPermitReroll()) return;
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

    tagActions.recordRoundSkipped(tagDef, previewMeta);
    const tagInstance = grantTag(tagDef, previewMeta);
    progressionActions.advanceRound(true);

    EventBus.emit(Events.TAG_EARNED, { tag: tagInstance, round: skippedRound });
    EventBus.emit(Events.ROUND_SKIPPED, { tag: tagInstance, round: skippedRound });

    const finishSkip = () => this.finishAfterSkip();

    if (!isImmediateTag(tagInstance.def.category)) {
      this.playTagEarnedAnimation(tagInstance, skippedRound, finishSkip);
    } else {
      finishSkip();
    }
  }

  private finishAfterSkip(): void {
    processChangeOfGuardTags();

    const immediateResults = processImmediateTags();
    for (const result of immediateResults) {
      if (result.type === 'money') {
        this.showImmediateResult(result);
      }
    }

    const handUpgrades = immediateResults
      .map((r) => r.handUpgrade)
      .filter((u): u is NonNullable<typeof u> => u != null);

    if (handUpgrades.length > 0) {
      playHandUpgradeAnimation({
        scene: this,
        sidebar: this.layout.sidebar,
        upgrades: handUpgrades,
        onComplete: () => this.continueAfterImmediateTags(),
      });
      return;
    }

    this.continueAfterImmediateTags();
  }

  private continueAfterImmediateTags(): void {
    const packTags = tagActions.consumeTagsByCategory('immediate_pack');
    if (packTags.length > 0) {
      const packTag = packTags[0];
      const packDefId = getPackDefIdForTag(packTag.def.id);
      const packDef = packDefId ? getPackDefById(packDefId) : undefined;
      if (packDef) {
        this.scene.start('BoosterPack', {
          packDef,
          returnScene: 'RoundSelect',
          free: true,
        });
        return;
      }
    }

    const equipTags = tagActions.consumeTagsByCategory('immediate_equipment');
    for (const tag of equipTags) {
      processJunkPileTag(tag);
    }

    const run = getRunState();
    if (selectJourneyComplete(run)) {
      this.scene.start('GameOver', buildVictoryGameOverData(0, selectTargetMiles(run)));
      return;
    }

    this.scene.restart();
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

  private playTagEarnedAnimation(tag: TrailTagInstance, round: number, onComplete: () => void): void {
    const { x: fromX, y: fromY } = this.getRoundColumnCenter(round);
    const anchor = this.layout.tagStack.getStackAnchor();
    const color = TAG_FLY_COLORS[tag.def.category] ?? 0x888888;
    const half = TAG_STACK.BADGE_SIZE / 2;

    const tempBadge = this.add.graphics();
    tempBadge.fillStyle(color, 1);
    tempBadge.fillRoundedRect(-half, -half, TAG_STACK.BADGE_SIZE, TAG_STACK.BADGE_SIZE, TAG_STACK.BADGE_RADIUS);
    tempBadge.setPosition(fromX, fromY);
    tempBadge.setDepth(TOOLTIP_DEPTH);

    this.tweens.add({
      targets: tempBadge,
      x: anchor.x,
      y: anchor.y,
      scaleX: { from: 1.5, to: 1 },
      scaleY: { from: 1.5, to: 1 },
      duration: 600,
      ease: 'Back.easeIn',
      onComplete: () => {
        tempBadge.destroy();
        onComplete();
      },
    });
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
