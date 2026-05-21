// ─── PayoutScene ───
// Shows a Balatro-style payout breakdown after winning a round.
// Displays round reward, remaining days bonus, and interest earned,
// then lets the player collect and proceed to the shop.

import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState, PayoutBreakdown } from '../../game/PlayerState';
import { COLORS, TEXT_COLORS, FONTS, GAMEPLAY } from '../../game/Constants';
import { processBossPayoutTags, grantTag } from '../../game/TagSystem';
import { getTrailTagById } from '../../data/trail_tags';
import { formatScore } from '../../game/formatScore';
import { Button } from '../ui/Button';

export interface PayoutData {
  totalMiles: number;
  targetMiles: number;
  daysRemaining: number;
  rerollsRemaining: number;
  leg: number;
  round: number;
  isVictory: boolean;
}

export class PayoutScene extends Scene {
  private sceneData: PayoutData;

  constructor() {
    super('Payout');
  }

  create(data: PayoutData) {
    this.sceneData = data;
    const { width, height } = this.scale;
    const player = getPlayerState();

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => this.scale.off('resize', this.onResize, this));

    // Background
    const bg = this.add.graphics();
    bg.fillStyle(COLORS.BG_WIN, 1);
    bg.fillRect(0, 0, width, height);

    // Title
    const roundLabel = data.round === GAMEPLAY.ROUNDS_PER_LEG ? 'Boss Defeated!' : 'Round Complete!';
    this.add
      .text(width / 2, height * 0.12, roundLabel, {
        fontFamily: FONTS.HEADING,
        fontSize: '42px',
        color: TEXT_COLORS.WIN,
        stroke: '#000000',
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5);

    // Subtitle — leg/round info
    this.add
      .text(width / 2, height * 0.19, `Leg ${data.leg} — Round ${data.round}/${GAMEPLAY.ROUNDS_PER_LEG}`, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '18px',
        color: TEXT_COLORS.SECONDARY,
        align: 'center',
      })
      .setOrigin(0.5);

    // Miles scored
    this.add
      .text(
        width / 2,
        height * 0.25,
        `${formatScore(data.totalMiles)} / ${formatScore(data.targetMiles)} miles`,
        {
        fontFamily: FONTS.PRIMARY,
        fontSize: '22px',
        color: TEXT_COLORS.SCORE_GREEN,
        align: 'center',
      })
      .setOrigin(0.5);

    // Calculate payout
    const payout = player.calculatePayout(data.daysRemaining, data.rerollsRemaining);

    let investmentBonus = 0;
    if (data.round === GAMEPLAY.ROUNDS_PER_LEG) {
      investmentBonus = processBossPayoutTags(player);
      const profMods = player.profession?.modifiers as Record<string, unknown> | undefined;
      if (profMods?.doubleTagOnBoss) {
        const twinWagonDef = getTrailTagById('tag_twin_wagon');
        if (twinWagonDef) grantTag(twinWagonDef);
      }
    }

    // ─── Payout Panel ───
    const panelW = 420;
    const rowH = 40;
    const rows = this.buildPayoutRows(payout, data, investmentBonus);
    const panelH = rows.length * rowH + 60; // header + rows + padding
    const panelX = width / 2 - panelW / 2;
    const panelY = height * 0.32;

    // Panel background
    const panel = this.add.graphics();
    panel.fillStyle(COLORS.BG_PANEL, 0.95);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 12);
    panel.lineStyle(2, COLORS.PANEL_BORDER, 0.8);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 12);

    // Panel title
    this.add
      .text(width / 2, panelY + 22, `Collect Earnings: $${payout.total + investmentBonus}`, {
        fontFamily: FONTS.HEADING,
        fontSize: '22px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
      })
      .setOrigin(0.5);

    // Divider
    const divY = panelY + 42;
    panel.lineStyle(1, COLORS.PANEL_BORDER, 0.5);
    panel.lineBetween(panelX + 20, divY, panelX + panelW - 20, divY);

    // Payout rows
    const rowStartY = divY + 16;
    const leftX = panelX + 24;
    const rightX = panelX + panelW - 24;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const y = rowStartY + i * rowH;

      // Label
      this.add.text(leftX, y, row.label, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '16px',
        color: row.highlight ? TEXT_COLORS.GOLD : TEXT_COLORS.PRIMARY,
      });

      // Amount
      this.add
        .text(rightX, y, row.amount, {
          fontFamily: FONTS.HEADING,
          fontSize: '18px',
          color: row.amountColor ?? TEXT_COLORS.MONEY,
        })
        .setOrigin(1, 0);
    }

    // Collect button
    const btnY = panelY + panelH + 30;
    new Button(this, width / 2, btnY, 'Collect & Continue', 260, 50).onClick(() => {
      // Apply payout
      player.economy.earn(payout.total + investmentBonus);

      // Advance round
      const journeyDone = player.advanceRound();

      if (journeyDone) {
        this.scene.start('GameOver', {
          won: true,
          victory: true,
          totalMiles: data.totalMiles,
          targetMiles: data.targetMiles,
          leg: GAMEPLAY.LEGS,
          round: GAMEPLAY.ROUNDS_PER_LEG,
        });
      } else {
        this.scene.start('TrailEvent');
      }
    });

    EventBus.emit(Events.SCENE_READY, this);
  }

  private buildPayoutRows(
    payout: PayoutBreakdown,
    data: PayoutData,
    investmentBonus = 0,
  ): { label: string; amount: string; highlight?: boolean; amountColor?: string }[] {
    const rows: { label: string; amount: string; highlight?: boolean; amountColor?: string }[] = [];
    const player = getPlayerState();

    // Round reward
    const roundName =
      data.round === GAMEPLAY.ROUNDS_PER_LEG
        ? 'Defeat the Boss'
        : data.round === 2
          ? 'Complete Round 2'
          : 'Complete Round 1';
    if (payout.roundReward === 0 && player.difficulty >= 2 && data.round === 1) {
      rows.push({
        label: 'Thin Supplies',
        amount: 'No reward',
        highlight: true,
        amountColor: TEXT_COLORS.ERROR_RED,
      });
    } else {
      rows.push({ label: roundName, amount: `$${payout.roundReward}`, highlight: true });
    }

    // Days remaining
    if (payout.dayBonus > 0) {
      rows.push({
        label: `Remaining Day${payout.dayBonus !== 1 ? 's' : ''} ($1 each)`,
        amount: `$${payout.dayBonus}`,
      });
    }

    // Interest (hidden for outlaw / noInterest professions)
    const noInterest = !!(player.profession?.modifiers as Record<string, unknown>)?.noInterest;
    if (!noInterest) {
      if (payout.interest > 0) {
        rows.push({
          label: `Interest ($1 per $${GAMEPLAY.INTEREST_PER}, $${player.interestCap / 5} max)`,
          amount: `$${payout.interest}`,
        });
      } else {
        rows.push({
          label: `Interest ($1 per $${GAMEPLAY.INTEREST_PER})`,
          amount: '$0',
        });
      }
    }

    // Outlaw reroll bonus
    if (payout.rerollBonus > 0) {
      rows.push({
        label: `Unused Rerolls ($1 each)`,
        amount: `$${payout.rerollBonus}`,
      });
    }

    // Equipment end-of-round money (e.g. Payday)
    if (payout.equipmentMoney > 0) {
      rows.push({
        label: `Equipment Bonus`,
        amount: `$${payout.equipmentMoney}`,
        highlight: true,
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
    this.scene.restart(this.sceneData);
  }
}
