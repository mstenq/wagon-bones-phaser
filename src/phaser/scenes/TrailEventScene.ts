// ─── TrailEventScene ───
// Narrative event scene that occurs between rounds (after payout, before shop).
// Shows a trail event with choices, resolves effects, and animates results.

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { gameFacade } from '../../game/facade';
import type { TrailEventChoice, TrailEventDef, TrailEventEffect, TrailEventResult } from '../../game/facade/trail';
import { filterEquipmentEligibleForTrailSacrifice } from '../../game/TrailEventsSystem';
import type { EquipmentInstance } from '../../game/ItemsSystem';
import type { Die } from '../../game/types';
import { resolveEquipmentList } from '../../game/store/resolve';
import { selectEffectiveDays, selectEffectiveRerolls } from '../../game/store/selectors/runSelectors';
import { COLORS, TEXT_COLORS, FONTS, TRAIL_EVENT } from '../../game/Constants';
import { trailEventImageKey, trailEventImagePath } from '../../game/trailEventAssets';
import { Button } from '../ui/Button';
import { ItemCard } from '../ui/ItemCard';
import type { LayoutResult } from '../ui/SceneLayout';
import { computeLayoutMetrics } from '../ui/SceneLayout';
import { rngFloat } from '../../game/RunRng';
import type { TrailEventSaveData } from '../../game/SaveLoad';
import { getSceneState, sceneActions } from '../../game/store/sceneStore';
import { getRunState, runActions } from '../../game/store/runStore';
import { flushAutoSave } from '../AutoSaveManager';
import { SpyglassTrailPreview } from '../ui/SpyglassTrailPreview';
import type { Sidebar } from '../ui/Sidebar';
import { createRunSceneShell } from './runSceneShell';
import { TrailEventResultPanel } from './trailEvent/TrailEventResultPanel';

// Category color mapping for event card border
const CATEGORY_COLORS: Record<string, number> = {
  positive: 0x44aa44,
  wagon_damage: 0xaa6633,
  weather: 0x6688cc,
  animal: 0x88aa44,
  bandits: 0xcc4444,
  navigation: 0x9966cc,
  water: 0x4488cc,
  stranger: 0xccaa44,
  uneventful: 0x888888,
  demon_hunter: 0x880088,
};

export class TrailEventScene extends Scene {
  private sidebar!: Sidebar;
  private shellLayout: LayoutResult | null = null;

  private currentEvent: TrailEventDef;
  private resolved: boolean = false;
  private spyglassRevealed: boolean = false;
  private choiceButtons: Button[] = [];
  private eventContainer: Phaser.GameObjects.Container | null = null;
  private resultPanel: TrailEventResultPanel | null = null;
  private resolvedContinueBtn: Button | null = null;

  constructor() {
    super('TrailEvent');
  }

  init(
    data: {
      restoreTrail?: TrailEventSaveData;
      eventId?: string;
      spyglassRevealed?: boolean;
      resolved?: boolean;
    } = {},
  ) {
    // Always reset scene state to prevent stale data from previous runs
    this.currentEvent = null!;
    this.resolved = false;
    this.spyglassRevealed = false;
    const sceneTrail = getSceneState().trailEvent;
    if (sceneTrail) {
      return;
    }

    if (data.eventId) {
      const event = gameFacade.trail.getEventById(data.eventId);
      if (event) {
        this.currentEvent = event;
        this.spyglassRevealed = data.spyglassRevealed ?? false;
        this.resolved = data.resolved ?? false;
      }
    }
  }

  private syncTrailToStore(): void {
    const eventId = this.currentEvent?.id ?? getSceneState().trailEvent?.eventId;
    if (!eventId) return;
    const slice = {
      eventId,
      resolved: this.resolved,
      spyglassRevealed: this.spyglassRevealed,
    };
    if (getSceneState().trailEvent) {
      sceneActions.patchTrailEvent(slice);
    } else {
      sceneActions.enterTrailEvent(slice);
    }
    sceneActions.enterScene('TrailEvent');
    if (gameFacade.trail.hasScoutsSpyglass() && !this.spyglassRevealed) {
      runActions.patch({ pendingTrailEventId: eventId });
    } else {
      runActions.patch({ pendingTrailEventId: null });
    }
  }

  private hydrateTrailFromStore(): void {
    const trail = getSceneState().trailEvent;
    if (!trail) return;
    const event = gameFacade.trail.getEventById(trail.eventId);
    if (!event) throw new Error(`Unknown trail event: ${trail.eventId}`);
    this.currentEvent = event;
    this.resolved = trail.resolved;
    this.spyglassRevealed = trail.spyglassRevealed;
  }

  create() {
    if (getSceneState().trailEvent) {
      this.hydrateTrailFromStore();
      if (this.currentEvent) gameFacade.trail.markSeen(this.currentEvent.id);
    }

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.resultPanel?.destroy();
      this.resultPanel = null;
    });

    // Standard layout with sidebar, equip bar, consumable bar, pouch
    const shell = createRunSceneShell(this, {
      layout: { bgKey: null, felt: true, sidebarTitle: 'TRAIL' },
      consumableReturnScene: 'TrailEvent',
      consumableFailureSound: () => this.safePlaySound('sfx_cancel', { volume: 0.5 }),
    });
    const layout = shell.layout;
    this.shellLayout = layout;
    this.sidebar = layout.sidebar;

    // Select / preview trail event (persist across resize restarts)
    if (!this.currentEvent) {
      if (gameFacade.trail.hasScoutsSpyglass()) {
        const pendingId = getSceneState().trailEvent?.eventId ?? getRunState().pendingTrailEventId;
        if (!pendingId) {
          this.currentEvent = gameFacade.trail.selectEvent();
          gameFacade.trail.markSeen(this.currentEvent.id);
          this.syncTrailToStore();
        } else {
          const event = gameFacade.trail.getEventById(pendingId);
          if (!event) throw new Error(`Unknown trail event: ${pendingId}`);
          this.currentEvent = event;
        }
        if (!this.spyglassRevealed) {
          this.syncTrailToStore();
          this.buildSpyglassPreview(layout);
          flushAutoSave();
          EventBus.emit(Events.SCENE_READY, this);
          return;
        }
        runActions.patch({ pendingTrailEventId: null });
      } else {
        this.currentEvent = gameFacade.trail.selectEvent();
        gameFacade.trail.markSeen(this.currentEvent.id);
        this.syncTrailToStore();
      }
      // Persist the seen-set update immediately so a refresh within the
      // 10s autosave window can't restore a snapshot that allows a repeat.
      flushAutoSave();
    }

    if (gameFacade.trail.hasScoutsSpyglass() && !this.spyglassRevealed) {
      this.syncTrailToStore();
      this.buildSpyglassPreview(layout);
      EventBus.emit(Events.SCENE_READY, this);
      return;
    }

    this.syncTrailToStore();

    const onDisplayReady = () => {
      if (this.resolved) {
        this.rebuildResolvedResult(layout);
        return;
      }
      this.buildEventDisplay(layout);
    };

    // Load event image dynamically if not already cached
    const imageKey = trailEventImageKey(this.currentEvent.id);
    if (!this.textures.exists(imageKey)) {
      this.load.image(imageKey, trailEventImagePath(this.currentEvent.id));
      this.load.once('complete', () => onDisplayReady());
      this.load.once('loaderror', () => onDisplayReady());
      this.load.start();
    } else {
      onDisplayReady();
    }

    EventBus.emit(Events.SCENE_READY, this);
  }

  private resolveSpyglassPreviewEvent(): TrailEventDef {
    const eventId = getSceneState().trailEvent?.eventId ?? this.currentEvent?.id;
    const event = eventId ? gameFacade.trail.getEventById(eventId) : this.currentEvent;
    if (!event) {
      throw new Error('Spyglass preview missing trail event');
    }
    this.currentEvent = event;
    return event;
  }

  private buildSpyglassPreview(
    layout: Pick<LayoutResult, 'contentX' | 'contentW' | 'contentCX' | 'contentTop' | 'contentBottom'>,
  ): void {
    const event = this.resolveSpyglassPreviewEvent();
    SpyglassTrailPreview.show(this, layout, event.id, {
      onAvoid: () => {
        gameFacade.trail.applySpyglassAvoid();
        this.proceedToNextScene();
      },
      onInvestigate: () => {
        const committed = this.resolveSpyglassPreviewEvent();
        gameFacade.trail.applySpyglassInvestigate();
        this.currentEvent = committed;
        this.spyglassRevealed = true;
        runActions.patch({ pendingTrailEventId: null });
        sceneActions.patchTrailEvent({ spyglassRevealed: true, eventId: committed.id });
        this.scene.restart({
          eventId: committed.id,
          spyglassRevealed: true,
          resolved: this.resolved,
        });
      },
    });
  }

  private buildEventDisplay(
    layout: Pick<LayoutResult, 'contentX' | 'contentW' | 'contentCX' | 'contentTop' | 'contentBottom'>,
  ): void {
    const { contentW, contentCX, contentTop } = layout;
    const event = this.currentEvent;

    this.eventContainer = this.add.container(0, 0);

    // ─── Event card panel ───
    const panelW = Math.min(560, contentW - 40);
    const panelX = contentCX - panelW / 2;
    const panelTop = contentTop + 4;

    const categoryColor = CATEGORY_COLORS[event.category] ?? 0x555588;

    // Panel background
    const panel = this.add.graphics();
    this.eventContainer.add(panel);

    // Event image (load dynamically if available)
    const imageKey = trailEventImageKey(event.id);
    let imageY = panelTop + 20;
    let imageHeight = 0;

    if (this.textures.exists(imageKey)) {
      const img = this.add.image(contentCX, imageY + 80, imageKey);
      const maxImgW = panelW - 40;
      const maxImgH = 160;
      const imgScale = Math.min(maxImgW / img.width, maxImgH / img.height, 1);
      img.setScale(imgScale);
      img.setOrigin(0.5, 0.5);
      imageHeight = img.displayHeight + 16;
      this.eventContainer.add(img);
    }

    // Event name
    const nameY = imageY + imageHeight + 8;
    const nameText = this.add
      .text(contentCX, nameY, event.name, {
        fontFamily: FONTS.HEADING,
        fontSize: '28px',
        color: TEXT_COLORS.PRIMARY,
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.eventContainer.add(nameText);

    // Category tag
    const tagY = nameY + 36;
    const tagText = this.add
      .text(contentCX, tagY, event.category.replace(/_/g, ' ').toUpperCase(), {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: '#' + categoryColor.toString(16).padStart(6, '0'),
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.eventContainer.add(tagText);

    // Description
    const descY = tagY + 22;
    const descText = this.add
      .text(contentCX, descY, event.description, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '16px',
        color: TEXT_COLORS.SECONDARY,
        align: 'center',
        wordWrap: { width: panelW - 60 },
        lineSpacing: 4,
      })
      .setOrigin(0.5, 0);
    this.eventContainer.add(descText);

    // ─── Choice buttons ───
    const choicesY = descY + descText.height + 28;
    const availableChoices = gameFacade.trail.getAvailableChoices(event);

    this.choiceButtons = [];
    for (let i = 0; i < availableChoices.length; i++) {
      const choice = availableChoices[i];
      const btnY = choicesY + i * 56;
      const btnW = Math.min(380, panelW - 60);
      const btn = new Button(this, contentCX, btnY, choice.label, btnW, 44);
      btn.onClick(() => this.onChoiceSelected(choice));
      this.choiceButtons.push(btn);
      this.eventContainer.add(btn);
    }

    // Finalize panel height
    const lastBtnY = choicesY + (availableChoices.length - 1) * 56;
    const panelH = lastBtnY - panelTop + 60;
    panel.clear();
    panel.fillStyle(COLORS.BG_PANEL, 0.95);
    panel.fillRoundedRect(panelX, panelTop, panelW, panelH, 12);
    panel.lineStyle(2, categoryColor, 0.8);
    panel.strokeRoundedRect(panelX, panelTop, panelW, panelH, 12);
  }

  private onChoiceSelected(choice: TrailEventChoice): void {
    const run = getRunState();
    const diceIdsBefore = new Set(run.dice.map((d) => d.id));

    this.resolved = true;

    const enhancedDiceBeforeCount = run.dice.filter(
      (d) => d.enhancement !== null || d.sticker !== null || d.aura !== null,
    ).length;
    const equipmentBeforeResolve = [...resolveEquipmentList(run)];

    for (const btn of this.choiceButtons) {
      btn.setEnabled(false);
    }

    const result = gameFacade.trail.resolveChoice(this.currentEvent, choice.id, () => rngFloat('trail'));
    const gainedDice = getRunState().dice.filter((d) => !diceIdsBefore.has(d.id));

    sceneActions.patchTrailEvent({
      resolved: true,
      selectedChoiceId: choice.id,
      resolvedDisplay: {
        choiceId: choice.id,
        outcomeIndex: result.outcomeIndex,
        gainedDiceIds: gainedDice.map((d) => d.id),
        enhancedDiceBeforeCount,
        equipmentCountBeforeResolve: equipmentBeforeResolve.length,
        negatedNegativeEffects: result.negatedNegativeEffects,
        negationSource: result.negationSource,
        message: result.message,
      },
    });

    runActions.patch({
      trailEventModifiers: result.modifiers,
      ...(result.modifiers.skipNextShop ? { skipNextShop: true } : {}),
    });

    flushAutoSave();

    this.fadeOutEventCard(() => {
      this.showResult(result, enhancedDiceBeforeCount, equipmentBeforeResolve, gainedDice);
    });
  }

  private fadeOutEventCard(onComplete: () => void): void {
    if (!this.eventContainer) {
      onComplete();
      return;
    }

    this.tweens.add({
      targets: this.eventContainer,
      alpha: 0,
      duration: 250,
      ease: 'Power2',
      onComplete: () => {
        for (const btn of this.choiceButtons) {
          btn.destroy();
        }
        this.choiceButtons = [];
        this.eventContainer?.destroy();
        this.eventContainer = null;
        onComplete();
      },
    });
  }

  private rebuildResolvedResult(layout: LayoutResult): void {
    const trail = getSceneState().trailEvent;
    if (!trail?.resolvedDisplay) {
      this.showResolvedContinueFallback(layout);
      return;
    }

    const display = trail.resolvedDisplay;
    const result = gameFacade.trail.buildTrailEventResultFromResolvedDisplay(this.currentEvent, display);
    const gainedDiceIds = new Set(display.gainedDiceIds);
    const gainedDice = getRunState().dice.filter((d) => gainedDiceIds.has(d.id));
    const equipment = resolveEquipmentList();
    const equipmentBeforeResolve = equipment.slice(0, display.equipmentCountBeforeResolve);

    this.showResult(result, display.enhancedDiceBeforeCount, equipmentBeforeResolve, gainedDice, { restored: true });
  }

  private showResult(
    result: TrailEventResult,
    enhancedDiceBeforeCount: number,
    equipmentBeforeResolve: EquipmentInstance[],
    gainedDice: Die[],
    options?: { restored?: boolean },
  ): void {
    const layout = this.shellLayout ?? this.getContentLayout();
    const categoryColor = CATEGORY_COLORS[this.currentEvent.category] ?? 0x555588;

    this.resultPanel?.destroy();
    this.resultPanel = new TrailEventResultPanel({
      scene: this,
      shellLayout: this.shellLayout,
      formatEffect: (effect, negated, enhancedCount, equipCount) =>
        this.formatEffect(effect, negated, enhancedCount, equipCount),
      showEquipmentPicker: (count, cx, y, ownedBefore, onComplete) =>
        this.showEquipmentPicker(count, cx, y, ownedBefore, onComplete),
      animateDiceLossEffects: (effects, cx, baseY, enhancedCount) =>
        this.animateDiceLossEffects(effects, cx, baseY, enhancedCount),
      playSound: (key) => this.safePlaySound(key),
      onProceed: () => this.proceedToNextScene(),
    });

    this.resultPanel.show({
      event: this.currentEvent,
      result,
      layout,
      gainedDice,
      enhancedDiceBeforeCount,
      equipmentBeforeResolve,
      categoryColor,
      restored: options?.restored,
    });

    const run = getRunState();
    this.sidebar.updateData({
      daysRemaining: selectEffectiveDays(run),
      rerolls: selectEffectiveRerolls(run),
    });
  }

  private showEquipmentPicker(
    count: number,
    cx: number,
    y: number,
    equipmentOwnedBeforeChoice: EquipmentInstance[],
    onComplete: () => void,
  ): void {
    let remaining = count;
    const equipment = resolveEquipmentList();
    const eligible = filterEquipmentEligibleForTrailSacrifice(equipmentOwnedBeforeChoice, equipment);
    const initialSacrificable = eligible.filter((e) => !gameFacade.trail.isEquipmentCursed(e)).length;
    remaining = Math.min(count, initialSacrificable);

    if (remaining === 0) {
      onComplete();
      return;
    }

    const promptText = this.add
      .text(cx, y, `Choose ${remaining} equipment to sacrifice:`, {
        fontFamily: FONTS.HEADING,
        fontSize: '16px',
        color: TEXT_COLORS.ERROR_RED,
        align: 'center',
      })
      .setOrigin(0.5, 0);

    const cardContainer = this.add.container(0, 0);
    const cardScale = 0.7;
    const spacing = 130;

    const buildCards = () => {
      cardContainer.removeAll(true);
      const currentEquipment = resolveEquipmentList();
      const eligibleEquipment = filterEquipmentEligibleForTrailSacrifice(equipmentOwnedBeforeChoice, currentEquipment);
      const eligibleSet = new Set(eligibleEquipment);
      const sacrificableIndices = currentEquipment
        .map((e, idx) => (eligibleSet.has(e) && !gameFacade.trail.isEquipmentCursed(e) ? idx : -1))
        .filter((idx) => idx >= 0);

      if (sacrificableIndices.length === 0 || remaining === 0) {
        promptText.destroy();
        cardContainer.destroy();
        onComplete();
        return;
      }

      promptText.setText(`Choose ${remaining} equipment to sacrifice:`);

      const totalW = (sacrificableIndices.length - 1) * spacing;
      const startX = cx - totalW / 2;

      for (let slot = 0; slot < sacrificableIndices.length; slot++) {
        const equipIndex = sacrificableIndices[slot]!;
        const equipItem = currentEquipment[equipIndex]!;
        const card = new ItemCard(this, startX + slot * spacing, y + 110, equipItem.def, {
          mode: 'compact',
          cardScale,
          equipment: equipItem,
        });
        card.setTooltipContext(null, null);
        card.setDepth(200);

        card.on('pointerover', () => {
          card.setScale(cardScale * 1.1);
        });
        card.on('pointerout', () => {
          card.setScale(cardScale);
        });

        card.on('pointerdown', () => {
          if (equipIndex >= 0) {
            gameFacade.trail.destroyEquipment(equipIndex);
          }
          remaining--;

          this.tweens.add({
            targets: card,
            alpha: 0,
            scaleX: 0,
            scaleY: 0,
            duration: 300,
            ease: 'Power2',
            onComplete: () => {
              this.safePlaySound('sfx_explosion');

              if (remaining <= 0) {
                promptText.destroy();
                cardContainer.destroy();
                onComplete();
              } else {
                buildCards();
              }
            },
          });
        });

        cardContainer.add(card);
      }
    };

    buildCards();
  }

  private animateDiceLossEffects(
    effects: TrailEventEffect[],
    cx: number,
    baseY: number,
    enhancedDiceBeforeCount: number,
  ): void {
    for (const effect of effects) {
      if (effect.type !== 'LOSE_RANDOM_DICE') continue;
      const actualLost = Math.min(effect.count ?? 1, enhancedDiceBeforeCount);
      if (actualLost === 0) continue;
      for (let i = 0; i < Math.min(actualLost, 5); i++) {
        const dieX = cx + (i - Math.min(actualLost, 5) / 2) * 50;
        this.time.delayedCall(200 + i * 150, () => {
          this.animateDiceLoss(dieX, baseY);
        });
      }
    }
  }

  private animateDiceLoss(x: number, y: number): void {
    const dieGfx = this.add.graphics();
    dieGfx.fillStyle(0xcc4444, 1);
    dieGfx.fillRoundedRect(x - 18, y - 18, 36, 36, 6);
    dieGfx.lineStyle(2, 0xff6666, 1);
    dieGfx.strokeRoundedRect(x - 18, y - 18, 36, 36, 6);

    const dieText = this.add.text(x, y, '💀', { fontSize: '18px' }).setOrigin(0.5);

    this.tweens.add({
      targets: [dieGfx, dieText],
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 600,
      ease: 'Power2',
      delay: 100,
      onComplete: () => {
        dieGfx.destroy();
        dieText.destroy();
      },
    });

    for (let p = 0; p < 4; p++) {
      const particle = this.add.text(x, y, '•', { fontSize: '12px', color: '#ff4444' }).setOrigin(0.5);
      this.tweens.add({
        targets: particle,
        x: x + (Math.random() - 0.5) * 80,
        y: y + (Math.random() - 0.5) * 60,
        alpha: 0,
        duration: 500,
        ease: 'Power2',
        onComplete: () => particle.destroy(),
      });
    }

    this.safePlaySound('sfx_explosion');
  }

  private formatEffect(
    effect: TrailEventEffect,
    negated: boolean,
    enhancedDiceBeforeCount?: number,
    equipmentBeforeCount?: number,
  ): { text: string; color: string; negative: boolean } | null {
    const negative = gameFacade.trail.isNegativeEffect(effect);
    let color = negative ? TEXT_COLORS.ERROR_RED : TEXT_COLORS.SCORE_GREEN;
    if (negated) color = TEXT_COLORS.MUTED;

    let text = '';
    switch (effect.type) {
      case 'LOSE_MONEY':
        text = `Lost $${effect.amount}`;
        break;
      case 'LOSE_MONEY_PERCENT':
        text = `Lost ${effect.percent}% of money`;
        break;
      case 'GAIN_MONEY':
        text = `Gained $${effect.amount}`;
        break;
      case 'LOSE_DAYS':
        text = `Lost ${effect.amount} day${(effect.amount ?? 1) > 1 ? 's' : ''} next round`;
        break;
      case 'LOSE_REROLLS':
        text = `Lost ${effect.amount} reroll${(effect.amount ?? 1) > 1 ? 's' : ''} next round`;
        break;
      case 'LOSE_REROLLS_PER_DAY':
        text = `Lose ${effect.amount} reroll${(effect.amount ?? 1) > 1 ? 's' : ''} per day next round`;
        break;
      case 'LOSE_HAND_SIZE':
        text = `Hand size reduced by ${effect.amount} next round`;
        break;
      case 'LOSE_RANDOM_DICE': {
        const available = enhancedDiceBeforeCount ?? 0;
        if (available === 0 && !negated) {
          const lostAmount = (effect.count ?? 1) * TRAIL_EVENT.AMOUNT_PER_MISSING_DIE;
          text = `No enhanced dice to sacrifice. Lost $${lostAmount} instead.`;
          color = TEXT_COLORS.ERROR_RED;
        } else {
          const lost = Math.min(effect.count ?? 0, available);
          text = `Lost ${lost} enhanced dice from pouch`;
        }
        break;
      }
      case 'GAIN_DICE':
        text = `Gained ${effect.count} dice`;
        break;
      case 'BOSS_UPGRADE':
        text = `Boss target x${effect.multiplier}`;
        break;
      case 'SCORE_MULTIPLIER':
        text = `Score target x${effect.multiplier} next round`;
        break;
      case 'DISABLE_REROLL_DAY1':
        text = 'No rerolls on Day 1 next round';
        break;
      case 'STANDARD_DICE_DAY1':
        text = 'Only standard dice Day 1 next round';
        break;
      case 'DIAMOND_CRACK_DOUBLED':
        text = 'Diamond crack chance doubled next round';
        break;
      case 'LUCKY_ODDS_HALVED':
        text = 'Lucky odds halved next round';
        break;
      case 'SCORED_DICE_DESTROY_CHANCE':
        text = `${Math.round((effect.chance ?? 0) * 100)}% chance scored dice are destroyed`;
        break;
      case 'SKIP_NEXT_SHOP':
        text = 'Shop skipped this round!';
        break;
      case 'DESTROY_EQUIPMENT':
        text = 'An equipment was destroyed!';
        break;
      case 'ADD_AURA_TO_RANDOM_DICE':
        text = `Added ${effect.aura} aura to a die`;
        break;
      case 'GAIN_RANDOM_EQUIPMENT':
        text = 'Gained a random equipment!';
        break;
      case 'GAIN_TRAIL_GUIDES':
        text = `Gained ${effect.count} trail guide${(effect.count ?? 1) > 1 ? 's' : ''}`;
        break;
      case 'USE_MEDICINE':
        text = 'Used medicine to recover';
        break;
      case 'GAIN_RANDOM_SUPPLY_CARD':
        text = 'Gained a random supply card';
        break;
      case 'GAIN_FRONTIER_ENCOUNTER':
        text = 'Gained a frontier encounter card';
        break;
      case 'GAIN_MEDICINE_CARD':
        text = 'Gained a medicine card';
        break;
      case 'LOSE_ALL_SUPPLY_CARDS':
        text = 'Lost all supply cards!';
        break;
      case 'LOSE_EQUIPMENT_CHOICE':
        if ((equipmentBeforeCount ?? 0) === 0 && !negated) {
          const lostAmount = (effect.count ?? 1) * TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP;
          text = `No equipment to sacrifice. Lost $${lostAmount} instead.`;
          color = TEXT_COLORS.ERROR_RED;
        } else {
          text = 'Must choose equipment to lose';
        }
        break;
      case 'LOSE_RANDOM_EQUIPMENT':
        if ((equipmentBeforeCount ?? 0) === 0 && !negated) {
          const lostAmount = (effect.count ?? 1) * TRAIL_EVENT.AMOUNT_PER_MISSING_EQUIP;
          text = `No equipment to sacrifice. Lost $${lostAmount} instead.`;
          color = TEXT_COLORS.ERROR_RED;
        } else {
          text = 'Lost a random equipment!';
        }
        break;
      case 'LOSE_MONEY_PER_DAY':
        text = `Lose $${effect.amount} per day next round`;
        break;
      case 'LOSE_ALL_REROLLS':
        text = 'No rerolls next round!';
        break;
      case 'LOSE_EQUIPMENT_SLOT_PERMANENT':
        text = 'Lost an equipment slot permanently!';
        break;
      case 'FLAT_MILES_PENALTY':
        text = `−${effect.amount} miles penalty next round`;
        break;
      case 'GAIN_SPECIFIC_SUPPLY_CARD':
        text = `Gained ${effect.id ?? 'a supply card'}`;
        break;
      case 'LOSE_RANDOM_SUPPLY_CARD':
        text = 'Lost a supply card';
        break;
      default: {
        const unknown = effect as { type: string };
        text = unknown.type.replace(/_/g, ' ').toLowerCase();
        break;
      }
    }

    if (negated) {
      text = `${text} (negated)`;
    }

    return { text, color, negative };
  }

  /** Old saves resolved before `resolvedDisplay` existed — bare Continue only. */
  private showResolvedContinueFallback(layout: Pick<LayoutResult, 'contentCX' | 'contentBottom'>): void {
    this.resolvedContinueBtn = new Button(this, layout.contentCX, layout.contentBottom - 28, 'Continue', 200, 44);
    this.resolvedContinueBtn.onClick(() => this.proceedToNextScene());
  }

  private proceedToNextScene(): void {
    const skipShop = getRunState().skipNextShop;
    this.resultPanel?.destroy();
    this.resultPanel = null;
    this.resolvedContinueBtn?.destroy();
    this.resolvedContinueBtn = null;
    this.currentEvent = null!;
    this.resolved = false;
    this.spyglassRevealed = false;
    sceneActions.clearTrailEvent();
    runActions.patch({ pendingTrailEventId: null, ...(skipShop ? { skipNextShop: false } : {}) });
    if (skipShop) {
      this.scene.start('RoundSelect', {});
    } else {
      this.scene.start('Shop', {});
    }
  }

  private getContentLayout() {
    const { width, height } = this.scale;
    const metrics = computeLayoutMetrics(width, height);
    return {
      contentX: metrics.contentX,
      contentW: metrics.contentW,
      contentCX: metrics.contentCX,
      sidebarW: metrics.sidebarW,
      contentTop: metrics.contentTop,
      contentBottom: metrics.contentBottom,
    };
  }

  private safePlaySound(key: string, config?: Phaser.Types.Sound.SoundConfig): void {
    if (this.sound && this.cache?.audio?.exists(key)) {
      this.sound.play(key, config ?? { volume: 0.4 });
    }
  }

  private onResize(): void {
    this.syncTrailToStore();
    this.scene.restart({});
  }
}
