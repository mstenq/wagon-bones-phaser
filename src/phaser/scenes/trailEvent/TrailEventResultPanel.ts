import type { Scene } from 'phaser';
import type { TrailEventDef, TrailEventEffect, TrailEventResult } from '../../../game/facade/trail';
import { gameFacade } from '../../../game/facade';
import { filterEquipmentEligibleForTrailSacrifice } from '../../../game/TrailEventsSystem';
import type { EquipmentInstance } from '../../../game/ItemsSystem';
import type { Die } from '../../../game/types';
import { resolveEquipmentList } from '../../../game/store/resolve';
import { COLORS, DICE, TEXT_COLORS, FONTS, UI } from '../../../game/Constants';
import { Button } from '../../ui/Button';
import { DiceSprite } from '../../ui/DiceSprite';
import { getDiceGroupDisplayLabel, groupDiceByVisualIdentity } from '../../ui/diceGrouping';
import type { LayoutResult } from '../../ui/SceneLayout';

const DICE_PREVIEW_SCALE = 0.95;
const DICE_GROUP_SPACING = 118;
const DICE_PREVIEW_ROW_HEIGHT = 128;
const RESULT_PANEL_PAD_X = 28;
const RESULT_PANEL_PAD_TOP = 28;
const RESULT_PANEL_PAD_BOTTOM = 24;
const RESULT_CONTINUE_SLOT_H = 56;
const DICE_EFFECT_GAP = 28;

export type TrailEventEffectLine = { text: string; color: string; negative: boolean };

export type TrailEventResultPanelDeps = {
  scene: Scene;
  shellLayout: LayoutResult | null;
  formatEffect: (
    effect: TrailEventEffect,
    negated: boolean,
    enhancedDiceBeforeCount?: number,
    equipmentBeforeCount?: number,
  ) => TrailEventEffectLine | null;
  showEquipmentPicker: (
    count: number,
    cx: number,
    y: number,
    equipmentOwnedBeforeChoice: EquipmentInstance[],
    onComplete: () => void,
  ) => void;
  animateDiceLoss: (lostDice: Die[], cx: number, cy: number) => void;
  playSound: (key: string) => void;
  onProceed: () => void;
};

interface GainedDiceFlyTarget {
  sprite: DiceSprite;
  count: number;
}

export type TrailEventResultShowOptions = {
  event: TrailEventDef;
  result: TrailEventResult;
  layout: Pick<LayoutResult, 'contentCX' | 'contentTop' | 'contentBottom' | 'contentW'>;
  gainedDice: Die[];
  lostDice: Die[];
  enhancedDiceBeforeCount: number;
  equipmentBeforeResolve: EquipmentInstance[];
  categoryColor: number;
  /** Reload after resolve — skip entry/loss animations and show panel immediately. */
  restored?: boolean;
};

export class TrailEventResultPanel {
  private container: Phaser.GameObjects.Container | null = null;
  private panelTop = 0;
  private continueBtn: Button | null = null;
  private continueInProgress = false;
  private gainedDiceFlyTargets: GainedDiceFlyTarget[] = [];

  constructor(private readonly deps: TrailEventResultPanelDeps) {}

  destroy(): void {
    this.continueBtn?.destroy();
    this.continueBtn = null;
    this.gainedDiceFlyTargets = [];
    this.container?.destroy();
    this.container = null;
    this.continueInProgress = false;
  }

  show(options: TrailEventResultShowOptions): void {
    this.destroy();

    const { scene } = this.deps;
    const {
      event,
      result,
      layout,
      gainedDice,
      lostDice,
      enhancedDiceBeforeCount,
      equipmentBeforeResolve,
      categoryColor,
      restored = false,
    } = options;
    const equipmentBeforeCount = equipmentBeforeResolve.length;
    const { contentCX, contentTop, contentBottom, contentW } = layout;
    const contentMidY = (contentTop + contentBottom) / 2;
    const panelW = Math.min(480, contentW - 48);

    this.container = scene.add.container(contentCX, 0);
    this.container.setAlpha(0);

    const equipment = resolveEquipmentList();
    const shieldEquip = equipment.find((e) => e.def.id === 'saint_elmos_shield');
    const repairKitEquip = gameFacade.trail.findTrailRepairKit();
    const negatesNegatives = result.negatedNegativeEffects ?? false;

    const effectLines: TrailEventEffectLine[] = [];
    for (const effect of result.effects) {
      const negated = gameFacade.trail.isNegativeEffect(effect) && negatesNegatives;
      const line = this.deps.formatEffect(effect, negated, enhancedDiceBeforeCount, equipmentBeforeCount);
      if (line) effectLines.push(line);
    }
    if (effectLines.length === 0) {
      effectLines.push({ text: 'Nothing happens.', color: TEXT_COLORS.MUTED, negative: false });
    }

    let y = RESULT_PANEL_PAD_TOP;

    const eventNameText = scene.add
      .text(0, y, event.name, {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: TEXT_COLORS.PRIMARY,
        align: 'center',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0);
    this.container.add(eventNameText);
    y += 34;

    const hadNegatedNegative = result.effects.some((e) => gameFacade.trail.isNegativeEffect(e) && negatesNegatives);
    let protectionText: string | null = null;
    if (hadNegatedNegative) {
      if (result.negationSource === 'omen_stone') {
        protectionText = '✨ Good Omen prevents the bad outcome! ✨';
      } else if (result.negationSource === 'saint_elmos_shield' && shieldEquip) {
        protectionText = `✨ ${shieldEquip.def.name} protects you! ✨`;
      } else if (result.negationSource === 'trail_repair_kit' && repairKitEquip) {
        const xm = repairKitEquip.state.xMult ?? 1;
        protectionText = `🔧 ${repairKitEquip.def.name} patches the trail (x${xm.toFixed(2)})`;
      }
    }
    if (protectionText) {
      const provText = scene.add
        .text(0, y, protectionText, {
          fontFamily: FONTS.HEADING,
          fontSize: '15px',
          color: TEXT_COLORS.GOLD,
          align: 'center',
          wordWrap: { width: panelW - RESULT_PANEL_PAD_X * 2 },
        })
        .setOrigin(0.5, 0);
      this.container.add(provText);
      y += provText.height + 10;
    }

    if (result.message) {
      const msgText = scene.add
        .text(0, y, `"${result.message}"`, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '16px',
          fontStyle: 'italic',
          color: TEXT_COLORS.SECONDARY,
          align: 'center',
          stroke: '#000000',
          strokeThickness: 2,
          wordWrap: { width: panelW - RESULT_PANEL_PAD_X * 2 },
        })
        .setOrigin(0.5, 0);
      this.container.add(msgText);
      y += msgText.height + 14;
    }

    for (let i = 0; i < effectLines.length; i++) {
      const line = effectLines[i]!;
      const txt = scene.add
        .text(0, y, line.text, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '16px',
          color: line.color,
          align: 'center',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0);

      if (line.negative && !negatesNegatives) {
        scene.tweens.add({
          targets: txt,
          x: txt.x + 3,
          duration: 50,
          yoyo: true,
          repeat: 3,
          delay: 300 + i * 150,
        });
      }

      this.container.add(txt);
      y += 28;
    }

    const diceStartLocalY = y + DICE_EFFECT_GAP;
    const diceSectionH = this.estimateDicePreviewHeight(gainedDice);
    if (diceSectionH > 0) {
      y = diceStartLocalY + diceSectionH + RESULT_PANEL_PAD_BOTTOM;
    } else {
      y += RESULT_PANEL_PAD_BOTTOM;
    }

    const panelH = y + RESULT_CONTINUE_SLOT_H;
    this.panelTop = contentMidY - panelH / 2;
    this.container.y = this.panelTop;

    const panel = scene.add.graphics();
    panel.fillStyle(COLORS.BG_PANEL, 0.95);
    panel.fillRoundedRect(-panelW / 2, 0, panelW, panelH, 12);
    panel.lineStyle(2, categoryColor, 0.75);
    panel.strokeRoundedRect(-panelW / 2, 0, panelW, panelH, 12);
    this.container.addAt(panel, 0);

    this.renderGainedDicePreview(gainedDice, diceStartLocalY, restored);
    if (!restored && lostDice.length > 0) {
      this.deps.animateDiceLoss(lostDice, contentCX, contentMidY);
    }

    if (restored) {
      this.container.setAlpha(1);
    } else {
      scene.tweens.add({
        targets: this.container,
        alpha: 1,
        duration: 400,
        ease: 'Power2',
      });

      const hasNegative = result.effects.some((e) => gameFacade.trail.isNegativeEffect(e));
      const hasPositive = result.effects.some((e) => !gameFacade.trail.isNegativeEffect(e));
      if (hasNegative && !negatesNegatives) {
        this.deps.playSound('sfx_negative');
      } else if (hasPositive) {
        this.deps.playSound('sfx_coin');
      }
    }

    const loseEquipEffect = result.effects.find(
      (e) => e.type === 'LOSE_EQUIPMENT_CHOICE' && !(gameFacade.trail.isNegativeEffect(e) && negatesNegatives),
    );
    const eligibleForSacrifice = filterEquipmentEligibleForTrailSacrifice(equipmentBeforeResolve, equipment);
    const sacrificableCount = eligibleForSacrifice.filter((e) => !gameFacade.trail.isEquipmentCursed(e)).length;
    const needsEquipChoice = loseEquipEffect && sacrificableCount > 0;
    const continueY = this.panelTop + panelH - 30;

    const showContinue = () => {
      this.continueBtn = new Button(scene, contentCX, continueY, 'Continue', { variant: 'primary', width: 220 });
      this.continueBtn.onClick(() => this.onContinue());
    };

    const showContinueFlow = () => {
      if (needsEquipChoice) {
        const pickerY = Math.min(this.panelTop + panelH + 16, contentBottom - 180);
        this.deps.showEquipmentPicker(
          loseEquipEffect.count ?? 1,
          contentCX,
          pickerY,
          equipmentBeforeResolve,
          showContinue,
        );
      } else {
        showContinue();
      }
    };

    if (restored) {
      showContinueFlow();
    } else {
      scene.time.delayedCall(800, showContinueFlow);
    }
  }

  private estimateDicePreviewHeight(gainedDice: Die[]): number {
    if (gainedDice.length === 0) return 0;
    const groups = groupDiceByVisualIdentity(gainedDice);
    const maxCols = 4;
    const rows = Math.ceil(groups.length / maxCols);
    const dieRadius = (DICE.SIZE * DICE_PREVIEW_SCALE) / 2;
    const topInset = dieRadius + 12;
    return topInset + rows * DICE_PREVIEW_ROW_HEIGHT;
  }

  /** Returns panel-local Y below the dice row, or `startLocalY` when there are no dice. */
  private renderGainedDicePreview(gainedDice: Die[], startLocalY: number, restored: boolean): number {
    if (!this.container || gainedDice.length === 0) {
      return startLocalY;
    }

    const groups = groupDiceByVisualIdentity(gainedDice);
    const maxCols = 4;
    const dieRadius = (DICE.SIZE * DICE_PREVIEW_SCALE) / 2;
    const firstRowCenterY = startLocalY + dieRadius + 12;
    const labelOffset = dieRadius + 18;
    let maxLocalBottom = firstRowCenterY;

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i]!;
      const col = i % maxCols;
      const row = Math.floor(i / maxCols);
      const rowCount = Math.min(groups.length - row * maxCols, maxCols);
      const rowStartX = -((rowCount - 1) * DICE_GROUP_SPACING) / 2;
      const localX = rowStartX + col * DICE_GROUP_SPACING;
      const dieLocalY = firstRowCenterY + row * DICE_PREVIEW_ROW_HEIGHT;

      const sprite = new DiceSprite(this.deps.scene, localX, dieLocalY, group.representative);
      this.container.add(sprite);
      this.gainedDiceFlyTargets.push({ sprite, count: group.dice.length });

      const label = this.deps.scene.add
        .text(localX, dieLocalY + labelOffset, getDiceGroupDisplayLabel(group.representative, group.dice.length), {
          fontFamily: FONTS.PRIMARY,
          fontSize: '13px',
          color: TEXT_COLORS.SECONDARY,
          align: 'center',
        })
        .setOrigin(0.5);
      this.container.add(label);

      const targetScale = DICE_PREVIEW_SCALE;
      if (restored) {
        sprite.setScale(targetScale);
      } else {
        sprite.setScale(0);
        this.deps.scene.tweens.add({
          targets: sprite,
          scaleX: targetScale,
          scaleY: targetScale,
          duration: 220,
          ease: 'Back.easeOut',
          delay: i * 100,
        });
        label.setAlpha(0);
        this.deps.scene.tweens.add({
          targets: label,
          alpha: 1,
          duration: 220,
          delay: i * 100,
        });
      }

      maxLocalBottom = dieLocalY + DICE_PREVIEW_ROW_HEIGHT;
    }

    return maxLocalBottom;
  }

  onContinue(): void {
    if (this.continueInProgress) return;
    this.continueInProgress = true;
    this.continueBtn?.setEnabled(false);

    if (this.gainedDiceFlyTargets.length === 0) {
      this.deps.onProceed();
      return;
    }

    if (this.container) {
      this.deps.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        duration: 200,
        ease: 'Power2',
      });
    }

    const pouchCenter = this.getPouchCenter();
    let flyIndex = 0;
    let completed = 0;
    let totalFlies = 0;
    for (const target of this.gainedDiceFlyTargets) {
      totalFlies += target.count;
    }

    const onFlyComplete = (sprite: DiceSprite, owned: boolean) => {
      if (!owned) {
        sprite.destroy();
      }
      completed++;
      if (completed === totalFlies) {
        this.deps.playSound('sfx_coin');
        this.destroy();
        this.deps.onProceed();
      }
    };

    for (const target of this.gainedDiceFlyTargets) {
      const worldStart = this.detachSpriteToWorld(target.sprite);

      for (let i = 0; i < target.count; i++) {
        const delay = flyIndex * 120;
        flyIndex++;

        const owned = i === 0;
        const sprite = owned
          ? target.sprite
          : new DiceSprite(this.deps.scene, worldStart.x, worldStart.y, target.sprite.dieData);

        if (!owned) {
          sprite.setScale(target.sprite.scaleX);
        }

        this.deps.scene.tweens.add({
          targets: sprite,
          x: pouchCenter.x,
          y: pouchCenter.y,
          scaleX: DICE_PREVIEW_SCALE * 0.3,
          scaleY: DICE_PREVIEW_SCALE * 0.3,
          alpha: 0.5,
          duration: 500,
          ease: 'Power2',
          delay,
          onComplete: () => onFlyComplete(sprite, owned),
        });
      }
    }
  }

  private detachSpriteToWorld(sprite: DiceSprite): { x: number; y: number } {
    const matrix = sprite.getWorldTransformMatrix();
    this.container?.remove(sprite);
    sprite.setPosition(matrix.tx, matrix.ty);
    this.deps.scene.add.existing(sprite);
    return { x: matrix.tx, y: matrix.ty };
  }

  private getPouchCenter(): { x: number; y: number } {
    const pouch = this.deps.shellLayout?.dicePouch;
    if (pouch) {
      return {
        x: pouch.x + UI.POUCH_SIZE / 2,
        y: pouch.y + UI.POUCH_SIZE / 2,
      };
    }
    const { width, height } = this.deps.scene.scale;
    return {
      x: width - UI.POUCH_MARGIN - UI.POUCH_SIZE / 2,
      y: height - UI.POUCH_MARGIN - UI.POUCH_SIZE / 2,
    };
  }
}
