// ─── SpyglassTrailPreview ───
// Static circular spy preview — image baked to a canvas texture (cover crop + circle clip).

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, TRAIL_EVENT } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { getScoutsSpyglassInvestigateMiles } from '../../game/TrailEventsSystem';
import { computeCoverCrop, trailEventSpyImageKey, trailEventSpyImagePath } from '../../game/trailEventAssets';
import { Button } from './Button';
import type { LayoutResult } from './SceneLayout';

export interface SpyglassTrailPreviewCallbacks {
  onAvoid: () => void;
  onInvestigate: () => void;
}

const BAKED_VIEW_PREFIX = 'spyglass_baked_';

export class SpyglassTrailPreview {
  private readonly toDestroy: Phaser.GameObjects.GameObject[] = [];

  private constructor(private readonly scene: Scene) {}

  static show(
    scene: Scene,
    layout: Pick<LayoutResult, 'contentX' | 'contentW' | 'contentCX' | 'contentTop' | 'contentBottom'>,
    eventId: string,
    callbacks: SpyglassTrailPreviewCallbacks,
  ): SpyglassTrailPreview {
    const preview = new SpyglassTrailPreview(scene);
    const { contentW, contentCX, contentTop, contentBottom } = layout;
    const controlsH = 112;
    const maxRadius = TRAIL_EVENT.SPYGLASS_VIEW_RADIUS;
    const maxDiameter = Math.min(contentW - 48, contentBottom - contentTop - controlsH - 88);
    const viewRadius = Math.min(maxRadius, maxDiameter / 2);
    const viewDiameter = Math.round(viewRadius * 2);
    const circleY = contentTop + 72 + viewRadius;

    preview.track(
      scene.add
        .text(contentCX, contentTop + 12, "Scout's Spyglass", {
          fontFamily: FONTS.HEADING,
          fontSize: '22px',
          color: TEXT_COLORS.PRIMARY,
          stroke: '#000000',
          strokeThickness: 2,
          align: 'center',
        })
        .setOrigin(0.5, 0)
        .setDepth(10),
    );

    preview.track(
      scene.add
        .text(contentCX, contentTop + 40, 'View from the spyglass — details stay hidden until you commit.', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '14px',
          color: TEXT_COLORS.SECONDARY,
          align: 'center',
          wordWrap: { width: contentW - 48 },
        })
        .setOrigin(0.5, 0)
        .setDepth(10),
    );

    const ring = scene.add.graphics().setDepth(7);
    ring.lineStyle(3, COLORS.GOLD, 1);
    ring.strokeCircle(contentCX, circleY, viewRadius);
    ring.lineStyle(1, 0xffffff, 0.35);
    ring.strokeCircle(contentCX, circleY, viewRadius - 2);
    preview.track(ring);

    const investigateMiles = getScoutsSpyglassInvestigateMiles(getPlayerState());

    const btnW = Math.min(360, contentW - 48);
    const btnY = contentBottom - 96;
    preview.track(new Button(scene, contentCX, btnY, 'Avoid', btnW, 44).setDepth(10).onClick(callbacks.onAvoid));
    preview.track(
      new Button(scene, contentCX, btnY + 52, `Investigate (+${investigateMiles} miles)`, btnW, 44)
        .setDepth(10)
        .onClick(callbacks.onInvestigate),
    );

    const imageKey = trailEventSpyImageKey(eventId);
    const onReady = () => preview.showBakedCircleView(contentCX, circleY, viewDiameter, imageKey, eventId);
    if (scene.textures.exists(imageKey)) {
      onReady();
    } else {
      scene.load.image(imageKey, trailEventSpyImagePath(eventId));
      scene.load.once('complete', onReady);
      scene.load.once('loaderror', onReady);
      scene.load.start();
    }

    scene.events.once('shutdown', () => preview.destroy());
    return preview;
  }

  private track(obj: Phaser.GameObjects.GameObject): void {
    this.toDestroy.push(obj);
  }

  private bakeCircularTexture(sourceKey: string, eventId: string, diameter: number): string | null {
    const bakedKey = `${BAKED_VIEW_PREFIX}${eventId}_${diameter}`;
    if (this.scene.textures.exists(bakedKey)) {
      return bakedKey;
    }

    const source = this.scene.textures.get(sourceKey);
    const srcImage = source.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const srcW = srcImage.width;
    const srcH = srcImage.height;
    if (!srcW || !srcH) return null;

    const { cropX, cropY, cropW, cropH } = computeCoverCrop(srcW, srcH, diameter, diameter);

    const canvas = document.createElement('canvas');
    canvas.width = diameter;
    canvas.height = diameter;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, diameter, diameter);
    ctx.save();
    ctx.beginPath();
    ctx.arc(diameter / 2, diameter / 2, diameter / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(srcImage, cropX, cropY, cropW, cropH, 0, 0, diameter, diameter);
    ctx.restore();

    if (this.scene.textures.exists(bakedKey)) {
      this.scene.textures.remove(bakedKey);
    }
    this.scene.textures.addCanvas(bakedKey, canvas);
    return bakedKey;
  }

  private showBakedCircleView(cx: number, cy: number, diameter: number, imageKey: string, eventId: string): void {
    const bakedKey = this.bakeCircularTexture(imageKey, eventId, diameter);
    if (!bakedKey) return;

    const view = this.scene.add.image(cx, cy, bakedKey).setDepth(5);
    view.setDisplaySize(diameter, diameter);
    view.setOrigin(0.5, 0.5);
    this.track(view);
  }

  destroy(): void {
    for (const obj of this.toDestroy) {
      obj.destroy();
    }
    this.toDestroy.length = 0;
  }
}
