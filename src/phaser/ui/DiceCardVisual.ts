import { GameObjects, Scene } from 'phaser';
import { FONTS, UI } from '../../game/Constants';
import type { Die } from '../../game/types';
import type { CardTemplate } from '../../data/items';
import diceEnhancements from '../../data/dice_enhancements';
import pipEnhancements from '../../data/pip_enhancements';
import { DiceSprite } from './DiceSprite';

const ENHANCEMENT_INFO = new Map(diceEnhancements.map((e) => [e.id, e]));
const STICKER_INFO = new Map(pipEnhancements.map((s) => [s.id, s]));

export interface DiceCardVisualOptions {
  cardWidth: number;
  cardHeight: number;
  cornerRadius?: number;
  cardTemplate?: CardTemplate | null;
  showAuraLabel?: boolean;
  showStickerLabel?: boolean;
  interactive?: boolean;
}

export interface DiceCardVisualResult {
  templateImage: GameObjects.Image | null;
  diceSprite: DiceSprite;
  titleText: GameObjects.Text;
  stickerText: GameObjects.Text | null;
}

/** Shared dice card rendering used in shop and booster pack scenes. */
export function addDiceCardVisual(
  scene: Scene,
  parent: GameObjects.Container,
  die: Die,
  options: DiceCardVisualOptions,
): DiceCardVisualResult {
  const {
    cardWidth,
    cardHeight,
    cornerRadius = UI.CARD_RADIUS,
    cardTemplate = 'white-text',
    showAuraLabel = false,
    showStickerLabel = true,
    interactive = true,
  } = options;

  const enhInfo = die.enhancement ? ENHANCEMENT_INFO.get(die.enhancement) : null;
  const enhName = enhInfo ? enhInfo.name : 'Standard';

  const titleText = scene.add
    .text(0, -cardHeight / 2 + 16, enhName, {
      fontFamily: FONTS.HEADING,
      fontSize: '15px',
      color: '#d8dbe8',
      align: 'center',
    })
    .setOrigin(0.5, 0);
  parent.add(titleText);

  const diceSprite = new DiceSprite(scene, 0, -8, die, { showAuraLabel });
  if (!interactive) {
    diceSprite.disableInteractive();
  }
  parent.add(diceSprite);

  let stickerText: GameObjects.Text | null = null;
  if (showStickerLabel && die.sticker) {
    const stickerInfo = STICKER_INFO.get(die.sticker);
    const stickerLabel = stickerInfo ? stickerInfo.name : die.sticker.replace(/_/g, ' ');
    stickerText = scene.add
      .text(0, cardHeight / 2 - 12, stickerLabel, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: '#c2c6d8',
        align: 'center',
      })
      .setOrigin(0.5, 1);
    parent.add(stickerText);
  }

  let templateImage: GameObjects.Image | null = null;
  if (cardTemplate) {
    const overlayKey = `card_template_${cardTemplate}`;
    if (scene.textures.exists(overlayKey)) {
      const roundedOverlayKey = `${overlayKey}_rounded_${Math.round(cardWidth)}x${Math.round(cardHeight)}_r${Math.round(cornerRadius)}`;
      if (!scene.textures.exists(roundedOverlayKey)) {
        const overlaySrc = scene.textures.get(overlayKey).getSourceImage() as HTMLImageElement;
        const overlayCanvas = scene.textures.createCanvas(roundedOverlayKey, cardWidth, cardHeight)!;
        const oCtx = overlayCanvas.getContext();

        oCtx.beginPath();
        oCtx.moveTo(cornerRadius, 0);
        oCtx.lineTo(cardWidth - cornerRadius, 0);
        oCtx.arcTo(cardWidth, 0, cardWidth, cornerRadius, cornerRadius);
        oCtx.lineTo(cardWidth, cardHeight - cornerRadius);
        oCtx.arcTo(cardWidth, cardHeight, cardWidth - cornerRadius, cardHeight, cornerRadius);
        oCtx.lineTo(cornerRadius, cardHeight);
        oCtx.arcTo(0, cardHeight, 0, cardHeight - cornerRadius, cornerRadius);
        oCtx.lineTo(0, cornerRadius);
        oCtx.arcTo(0, 0, cornerRadius, 0, cornerRadius);
        oCtx.closePath();
        oCtx.clip();

        const oScale = Math.max(cardWidth / overlaySrc.width, cardHeight / overlaySrc.height);
        const oDrawW = overlaySrc.width * oScale;
        const oDrawH = overlaySrc.height * oScale;
        const oDx = (cardWidth - oDrawW) / 2;
        const oDy = (cardHeight - oDrawH) / 2;
        oCtx.drawImage(overlaySrc, oDx, oDy, oDrawW, oDrawH);

        overlayCanvas.refresh();
      }

      templateImage = scene.add.image(0, 0, roundedOverlayKey).setOrigin(0.5);
      parent.add(templateImage);
    }
  }

  return { templateImage, diceSprite, titleText, stickerText };
}
