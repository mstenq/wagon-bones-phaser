// ─── RoundSelectScene ───
// Balatro-style "Choose your next Blind" screen — play vs. skip each round in a leg.

import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState } from '../../game/PlayerState';
import { TEXT_COLORS, FONTS } from '../../game/Constants';
import { createLayout, LayoutResult } from '../ui/SceneLayout';
import { createLegRoundPanels, type RoundInfoPanel } from '../ui/RoundInfo';
import { TagTooltip } from '../ui/TagTooltip';
import {
  refreshRoundSkipPreviewTags,
  grantTag,
  processImmediateTags,
  getPackDefIdForTag,
  type ImmediateTagResult,
} from '../../game/TagSystem';
import { getPackDefById } from '../../game/BoosterPackSystem';
const COL_DEPTH = 100;
const TOOLTIP_DEPTH = 400;

export class RoundSelectScene extends Scene {
  private layout!: LayoutResult;
  private tagTooltip = new TagTooltip();
  private roundPanels: RoundInfoPanel[] = [];

  constructor() {
    super('RoundSelect');
  }

  create() {
    const player = getPlayerState();

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.tagTooltip.hide();
    });

    this.layout = createLayout(this, {
      bgKey: null,
      felt: true,
      sidebarTitle: 'TRAIL MAP',
    });

    refreshRoundSkipPreviewTags(player);

    this.buildRoundColumns();

    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildRoundColumns(): void {
    const player = getPlayerState();
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

    this.roundPanels = createLegRoundPanels(this, {
      bounds: {
        x: contentCX - contentW / 2,
        y: colY,
        width: contentW,
        height: colH,
      },
      currentRound: player.round,
      leg: player.leg,
      permitScoreReduction: player.permitScoreReduction,
      skippedRoundsThisLeg: player.skippedRoundsThisLeg,
      getSkippedTagForRound: (r) => player.getSkippedTagForRound(r),
      getSkipPreviewTagForRound: (r) => player.getSkipPreviewTagForRound(r),
      showActions: true,
      depth: COL_DEPTH,
      onPlay: () => this.onPlay(),
      onSkip: () => this.onSkip(),
      onTagHover: (tag, ax, ay) => {
        this.tagTooltip.show(this, tag, ax, ay, {
          minX: contentX + 4,
          maxX: contentX + contentW - 4,
          minY: contentTop + 4,
        }, TOOLTIP_DEPTH);
      },
      onTagHoverEnd: () => this.tagTooltip.hide(),
    });
  }

  private onPlay(): void {
    this.tagTooltip.hide();
    this.scene.start('Game');
  }

  private onSkip(): void {
    const player = getPlayerState();
    const tagDef = player.getSkipPreviewTagForRound(player.round);
    if (!tagDef) return;
    this.tagTooltip.hide();

    const skippedRound = player.round;

    player.recordRoundSkipped(tagDef);
    const tagInstance = grantTag(tagDef);
    player.advanceRound(true);

    EventBus.emit(Events.TAG_EARNED, { tag: tagInstance, round: skippedRound });
    EventBus.emit(Events.ROUND_SKIPPED, { tag: tagInstance, round: skippedRound });

    const immediateResults = processImmediateTags(player);
    for (const result of immediateResults) {
      this.showImmediateResult(result);
    }

    const packTags = player.consumeTagsByCategory('immediate_pack');
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

    if (player.journeyComplete) {
      this.scene.start('GameOver', { won: true, victory: true });
      return;
    }

    this.scene.restart();
  }

  private showImmediateResult(result: ImmediateTagResult): void {
    const { contentCX } = this.layout;
    let message = '';
    if (result.type === 'money' && result.amount) {
      message = `+$${result.amount}`;
    } else if (result.type === 'upgrade' && result.handType) {
      message = `${result.handType} +${result.levelsGained} levels`;
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
