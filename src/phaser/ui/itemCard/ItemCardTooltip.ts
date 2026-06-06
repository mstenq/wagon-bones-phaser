// ─── ItemCard hover tooltip ───

import { GameObjects, Scene } from 'phaser';
import type { EquipmentInstance } from '../../../game/ItemsSystem';
import type { ItemDisplayResult } from '../../../game/ItemsSystem';
import { getItemDisplayContext, type RoundHintContext, type ItemDisplayContext } from '../../../game/displayContext';
import { UI } from '../../../game/Constants';
import type { CardData, ItemCardLayout } from './itemCardTypes';
import {
  appendTooltipLine,
  buildTooltipLines,
  computeTooltipPosition,
  createTooltipBackground,
  createTooltipLayout,
  createTooltipTitle,
  getCardWorldHalfExtents,
  getTooltipDimensions,
  getTooltipMaxWidth,
  getTooltipTitleColor,
  type TooltipPlacement,
} from './itemCardTooltipRender';
import { trackCardTooltip } from './cardTooltipRegistry';

type DisplayResolver = (round: RoundHintContext | null, player: ItemDisplayContext) => ItemDisplayResult;

export class ItemCardTooltip {
  private readonly scene: Scene;
  private readonly card: GameObjects.Container;
  private readonly layout: ItemCardLayout;
  private readonly def: CardData;
  private getEquipment: () => EquipmentInstance | null;
  private getWorldPosition: () => { x: number; y: number };
  private tooltip: GameObjects.Container | null = null;
  private tooltipRound: RoundHintContext | null = null;
  private tooltipPlayer: ItemDisplayContext | null = null;
  private suppressTooltip = false;
  private interactionTooltipSuppressed = false;
  private faceDown = false;
  private pinned = false;
  private pinnedTooltipW = 0;
  private pinnedTooltipH = 0;
  private pinnedFollowHandler: (() => void) | null = null;
  private untrack: (() => void) | null = null;

  constructor(
    scene: Scene,
    card: GameObjects.Container,
    layout: ItemCardLayout,
    def: CardData,
    getEquipment: () => EquipmentInstance | null,
    getWorldPosition: () => { x: number; y: number },
  ) {
    this.scene = scene;
    this.card = card;
    this.layout = layout;
    this.def = def;
    this.getEquipment = getEquipment;
    this.getWorldPosition = getWorldPosition;
    this.untrack = trackCardTooltip(scene, this);
    this.card.once('destroy', () => {
      this.untrack?.();
      this.untrack = null;
      this.hide();
    });
  }

  setContext(round: RoundHintContext | null, player: ItemDisplayContext | null = null): void {
    this.tooltipRound = round;
    this.tooltipPlayer = player;
  }

  setSuppressTooltip(suppress: boolean): void {
    this.suppressTooltip = suppress;
    if (suppress) this.hide();
  }

  setInteractionTooltipSuppressed(suppressed: boolean): void {
    this.interactionTooltipSuppressed = suppressed;
    if (suppressed) this.hide();
  }

  setFaceDown(faceDown: boolean): void {
    this.faceDown = faceDown;
    if (faceDown) this.hide();
  }

  /** Side tooltip for mouse hover — hidden on pointerout unless pinned. */
  showHover(resolveDisplay: DisplayResolver): void {
    if (this.pinned) return;
    this.showInternal('side', false, resolveDisplay);
  }

  /** Centered above the card while action tabs are open (touch + click). */
  showActive(resolveDisplay: DisplayResolver): void {
    this.hide();
    this.showInternal('above', true, resolveDisplay);
  }

  /** Hide hover tooltip only; pinned active tooltip stays visible. */
  hideHover(): void {
    if (this.pinned) return;
    this.destroyTooltip();
  }

  hide(): void {
    this.pinned = false;
    this.stopPinnedFollow();
    this.destroyTooltip();
  }

  destroy(): void {
    this.untrack?.();
    this.untrack = null;
    this.hide();
  }

  private showInternal(placement: TooltipPlacement, pinned: boolean, resolveDisplay: DisplayResolver): void {
    if (this.suppressTooltip || this.interactionTooltipSuppressed || this.faceDown) return;
    if (this.tooltip) return;

    const player = this.tooltipPlayer ?? getItemDisplayContext();
    const display = resolveDisplay(this.tooltipRound, player);
    const lines = buildTooltipLines(display.tooltip, this.def, this.getEquipment());
    const maxContentWidth = getTooltipMaxWidth(this.scene.scale);

    const title = createTooltipTitle(this.scene, this.def.name, getTooltipTitleColor(this.def.rarity), maxContentWidth);
    let contentLayout = createTooltipLayout(title);
    for (const line of lines) {
      contentLayout = appendTooltipLine(this.scene, contentLayout, line, maxContentWidth);
    }

    const { width: tooltipW, height: tooltipH } = getTooltipDimensions(contentLayout);
    const bg = createTooltipBackground(this.scene, tooltipW, tooltipH);
    const depth = pinned ? UI.CARD_TOOLTIP_ACTIVE_DEPTH : UI.CARD_TOOLTIP_DEPTH;

    this.tooltip = this.scene.add.container(0, 0).setDepth(depth);
    this.tooltip.add([bg, ...contentLayout.children]);
    this.pinned = pinned;
    this.pinnedTooltipW = tooltipW;
    this.pinnedTooltipH = tooltipH;

    this.positionTooltip(placement);

    if (pinned) {
      this.startPinnedFollow();
    }
  }

  /** Scene-root positioning so tooltips aren't clipped by low-depth card bar containers. */
  private positionTooltip(placement: TooltipPlacement): void {
    if (!this.tooltip) return;

    const worldHalfExtents = getCardWorldHalfExtents(this.card, this.layout);
    const { x: worldX, y: worldY } = this.getWorldPosition();
    const { x, y } = computeTooltipPosition(
      worldX,
      worldY,
      this.layout,
      this.pinnedTooltipW,
      this.pinnedTooltipH,
      this.scene.scale,
      placement,
      worldHalfExtents,
    );
    this.tooltip.setPosition(x, y);
  }

  private startPinnedFollow(): void {
    if (this.pinnedFollowHandler) return;

    this.pinnedFollowHandler = () => {
      if (!this.tooltip || !this.pinned) return;
      this.positionTooltip('above');
    };
    this.scene.events.on('postupdate', this.pinnedFollowHandler);
  }

  private stopPinnedFollow(): void {
    if (!this.pinnedFollowHandler) return;
    this.scene.events.off('postupdate', this.pinnedFollowHandler);
    this.pinnedFollowHandler = null;
  }

  private destroyTooltip(): void {
    this.stopPinnedFollow();
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }
}
