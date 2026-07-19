// ─── PayoutScene ───
// Shows a Balatro-style payout breakdown after winning a round.
// Displays round reward, remaining days bonus, and interest earned,
// then lets the player collect and proceed to the shop.

import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { gameFacade } from '../../game/facade';
import { getRunState } from '../../game/store';
import { selectProfession, selectStoryVictoryOffered } from '../../game/store/selectors/runSelectors';
import { COLORS, TEXT_COLORS, FONTS, GAMEPLAY } from '../../game/Constants';
import { formatScore } from '../../game/formatScore';
import { milesFromSave } from '../../game/scoreMath';
import { Button } from '../ui/Button';
import { buildVictoryGameOverData } from './GameOver';
import { recordEquipmentVictory, recordStoryVictory } from '../../game/UserStats';
import { resolveEquipmentList } from '../../game/store/resolve';
import { getSceneState, sceneActions } from '../../game/store/sceneStore';
import type { LayoutResult } from '../ui/SceneLayout';
import type { DecimalSource } from '../../game/decimal';
import type { PayoutBreakdown, PayoutPresentationState } from '../../game/store/types';
import { createRunSceneShell } from './runSceneShell';
import { consumeAndStartImmediatePackOpens } from './immediatePackFlow';

export interface PayoutData {
  totalMiles: DecimalSource;
  targetMiles: DecimalSource;
  daysRemaining: number;
  rerollsRemaining: number;
  leg: number;
  round: number;
  isVictory: boolean;
}

/** @deprecated Use sceneStore.payout; kept for resize typing during migration. */
export type { PayoutBreakdown };

function presentationToView(p: PayoutPresentationState): PayoutData {
  return {
    totalMiles: milesFromSave(p.totalMilesSave),
    targetMiles: milesFromSave(p.targetMilesSave),
    daysRemaining: p.daysRemaining,
    rerollsRemaining: p.rerollsRemaining,
    leg: p.leg,
    round: p.round,
    isVictory: p.isVictory,
  };
}

export class PayoutScene extends Scene {
  constructor() {
    super('Payout');
  }

  create(_data: PayoutData = {} as PayoutData) {
    const payoutState = getSceneState().payout;
    if (!payoutState) {
      throw new Error('PayoutScene requires sceneStore.payout (set before scene.start)');
    }

    const data = presentationToView(payoutState.presentation);
    const payout = payoutState.breakdown;
    const investmentBonus = payoutState.presentation.investmentBonus;

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    const shell = createRunSceneShell(this, {
      layout: { bgKey: null, felt: true, sidebarTitle: 'PAYOUT' },
      consumableReturnScene: 'Payout',
    });
    this.buildPayoutPanel(shell.layout, payout, data, investmentBonus);

    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildPayoutPanel(
    layout: LayoutResult,
    payout: PayoutBreakdown,
    data: PayoutData,
    investmentBonus: number,
  ): void {
    const { contentCX, contentTop, contentBottom, contentW } = layout;
    const contentMidY = (contentTop + contentBottom) / 2;

    const roundLabel = data.round === GAMEPLAY.ROUNDS_PER_LEG ? 'Boss Defeated!' : 'Round Complete!';
    this.add
      .text(contentCX, contentTop + 36, roundLabel, {
        fontFamily: FONTS.HEADING,
        fontSize: '42px',
        color: TEXT_COLORS.WIN,
        stroke: '#000000',
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.add
      .text(contentCX, contentTop + 88, `Leg ${data.leg} — Round ${data.round}/${GAMEPLAY.ROUNDS_PER_LEG}`, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '18px',
        color: TEXT_COLORS.SECONDARY,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.add
      .text(contentCX, contentTop + 118, `${formatScore(data.totalMiles)} / ${formatScore(data.targetMiles)} miles`, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '22px',
        color: TEXT_COLORS.SCORE_GREEN,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(20);

    const panelW = Math.min(420, contentW - 48);
    const rowH = 40;
    const rows = this.buildPayoutRows(payout, data, investmentBonus);
    const panelH = rows.length * rowH + 60;
    const panelX = contentCX - panelW / 2;
    const panelY = contentMidY - panelH / 2 + 20;

    const panel = this.add.graphics().setDepth(10);
    panel.fillStyle(COLORS.BG_PANEL, 0.95);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    panel.lineStyle(2, COLORS.PANEL_BORDER, 0.8);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);

    this.add
      .text(contentCX, panelY + 22, `Collect Earnings: $${payout.total + investmentBonus}`, {
        fontFamily: FONTS.HEADING,
        fontSize: '22px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(20);

    const divY = panelY + 42;
    panel.lineStyle(1, COLORS.PANEL_BORDER, 0.5);
    panel.lineBetween(panelX + 20, divY, panelX + panelW - 20, divY);

    const rowStartY = divY + 16;
    const leftX = panelX + 24;
    const rightX = panelX + panelW - 24;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const y = rowStartY + i * rowH;

      this.add
        .text(leftX, y, row.label, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '16px',
          color: row.highlight ? TEXT_COLORS.GOLD : TEXT_COLORS.PRIMARY,
        })
        .setDepth(20);

      this.add
        .text(rightX, y, row.amount, {
          fontFamily: FONTS.HEADING,
          fontSize: '18px',
          color: row.amountColor ?? TEXT_COLORS.MONEY,
        })
        .setOrigin(1, 0)
        .setDepth(20);
    }

    const btnY = Math.min(panelY + panelH + 30, contentBottom - 36);
    new Button(this, contentCX, btnY, 'Collect & Continue', {
      variant: 'primary',
      size: 'xl',
      width: 260,
      height: 50,
    }).onClick(() => {
      const journeyDone = gameFacade.meta.collectPayout(payout.total, investmentBonus);

      sceneActions.clearPayout();

      if (journeyDone) {
        const run = getRunState();
        if (selectStoryVictoryOffered(run) && run.professionId) {
          recordStoryVictory(run.professionId, run.difficulty);
          const heldIds = resolveEquipmentList(run).map((e) => e.def.id);
          recordEquipmentVictory(heldIds, run.difficulty);
        }
      }

      if (this.processImmediateTagFlowAfterPayout(journeyDone)) {
        return;
      }

      if (journeyDone) {
        this.scene.start('GameOver', buildVictoryGameOverData(data.totalMiles, data.targetMiles));
      } else {
        this.scene.start('TrailEvent', {});
      }
    });
  }

  private processImmediateTagFlowAfterPayout(journeyDone: boolean): boolean {
    gameFacade.meta.processChangeOfGuardTags();
    gameFacade.meta.processImmediateTags();

    if (consumeAndStartImmediatePackOpens(this, journeyDone ? 'RoundSelect' : 'TrailEvent')) {
      return true;
    }

    const equipTags = gameFacade.meta.consumeTagsByCategory('immediate_equipment');
    for (const tag of equipTags) {
      gameFacade.meta.processJunkPileTag(tag);
    }

    return false;
  }

  private buildPayoutRows(
    payout: PayoutBreakdown,
    data: PayoutData,
    investmentBonus = 0,
  ): { label: string; amount: string; highlight?: boolean; amountColor?: string }[] {
    const rows: { label: string; amount: string; highlight?: boolean; amountColor?: string }[] = [];
    const run = getRunState();
    const profession = selectProfession(run);

    const roundName =
      data.round === GAMEPLAY.ROUNDS_PER_LEG
        ? 'Defeat the Boss'
        : data.round === 2
          ? 'Complete Round 2'
          : 'Complete Round 1';
    if (payout.roundReward === 0 && run.difficulty >= 2 && data.round === 1) {
      rows.push({
        label: 'Thin Supplies',
        amount: 'No reward',
        highlight: true,
        amountColor: TEXT_COLORS.ERROR_RED,
      });
    } else {
      rows.push({ label: roundName, amount: `$${payout.roundReward}`, highlight: true });
    }

    if (payout.dayBonus > 0) {
      rows.push({
        label: `Remaining Day${payout.dayBonus !== 1 ? 's' : ''} ($1 each)`,
        amount: `$${payout.dayBonus}`,
      });
    }

    const noInterest = !!(profession?.modifiers as Record<string, unknown>)?.noInterest;
    if (!noInterest) {
      if (payout.interest > 0) {
        rows.push({
          label: `Interest ($1 per $${GAMEPLAY.INTEREST_PER}, $${run.interestCap / GAMEPLAY.INTEREST_PER} max)`,
          amount: `$${payout.interest}`,
        });
      } else if (payout.savingsAccountInterest === 0) {
        rows.push({
          label: `Interest ($1 per $${GAMEPLAY.INTEREST_PER})`,
          amount: '$0',
        });
      }
      if (payout.savingsAccountInterest > 0) {
        rows.push({
          label: `Savings Account ($${payout.savingsAccountRate} per $${payout.savingsAccountChunk})`,
          amount: `$${payout.savingsAccountInterest}`,
        });
      }
    }

    if (payout.rerollBonus > 0) {
      rows.push({
        label: `Unused Rerolls ($1 each)`,
        amount: `$${payout.rerollBonus}`,
      });
    }

    if (payout.equipmentMoney > 0) {
      rows.push({
        label: `Equipment Bonus`,
        amount: `$${payout.equipmentMoney}`,
        highlight: true,
      });
    }

    if (payout.tithe > 0) {
      const tithePercent = (profession?.modifiers as Record<string, unknown> | undefined)?.tithePercent ?? 10;
      rows.push({
        label: `Tithing (${tithePercent}% of $${payout.titheBankBalance})`,
        amount: `-$${payout.tithe}`,
        amountColor: TEXT_COLORS.ERROR_RED,
      });
    }

    if (investmentBonus > 0) {
      rows.push({
        label: 'Bounty Payout',
        amount: `$${investmentBonus}`,
        highlight: true,
      });
    }

    return rows;
  }

  private onResize(): void {
    this.scene.restart({});
  }
}
