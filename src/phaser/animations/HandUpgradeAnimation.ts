// ─── HandUpgradeAnimation ───
// Plays a Balatro-style hand upgrade display when a hand level increases.
// Shows the hand name + level, then ticks up base miles, base mult, and level
// with scale pop and sound effects. Downgrades (Trickster) tick downward with sad SFX.

import { Scene } from 'phaser';
import { Sidebar } from '../ui/Sidebar';
import { HandUpgradeInfo } from '../../game/types';
import { FONTS, TEXT_COLORS, COLORS, UI } from '../../game/Constants';

const TICK_DELAY = 500; // ms between each animated value change
const HOLD_DELAY = 1500; // ms to hold the final values before fading out

export interface HandUpgradeAnimConfig {
  scene: Scene;
  sidebar: Sidebar;
  upgrades: HandUpgradeInfo[];
  onComplete: () => void;
}

/**
 * Play the hand upgrade animation sequence. Multiple upgrades are shown one after another.
 */
export function playHandUpgradeAnimation(config: HandUpgradeAnimConfig): void {
  const { scene, sidebar, upgrades, onComplete } = config;

  let upgradeIdx = 0;

  function playNext() {
    if (upgradeIdx >= upgrades.length) {
      onComplete();
      return;
    }
    animateOneUpgrade(scene, sidebar, upgrades[upgradeIdx], () => {
      upgradeIdx++;
      playNext();
    });
  }

  playNext();
}

function animateOneUpgrade(scene: Scene, sidebar: Sidebar, upgrade: HandUpgradeInfo, onDone: () => void): void {
  const isDowngrade = upgrade.newLevel < upgrade.oldLevel;
  const isTopBar = sidebar.getLayoutMode() === 'topbar';
  const chromeW = isTopBar ? scene.scale.width : sidebar.getSidebarWidth();
  const cx = chromeW / 2;
  const pad = isTopBar ? 8 : UI.SIDEBAR_PADDING;

  const container = scene.add.container(sidebar.x, sidebar.y).setDepth(250);

  const panelW = chromeW - pad * 2;
  const panelH = 100;
  const panelY = sidebar.getHandUpgradeY() - panelH / 2 + 20;
  const panelX = pad;

  const strokeColor = isDowngrade ? 0xaa4444 : 0x4488ff;

  const bg = scene.add.graphics();
  bg.fillStyle(COLORS.SIDEBAR_SECTION, 0.95);
  bg.fillRoundedRect(panelX, panelY, panelW, panelH, 8);
  bg.lineStyle(2, strokeColor, 0.8);
  bg.strokeRoundedRect(panelX, panelY, panelW, panelH, 8);
  container.add(bg);

  const nameText = scene.add
    .text(cx, panelY + 16, upgrade.handName, {
      fontFamily: FONTS.HEADING,
      fontSize: '18px',
      color: isDowngrade ? '#cc6666' : TEXT_COLORS.GOLD,
      align: 'center',
    })
    .setOrigin(0.5)
    .setAlpha(0);
  container.add(nameText);

  const levelText = scene.add
    .text(cx, panelY + 38, `Lvl. ${upgrade.oldLevel}`, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '13px',
      color: TEXT_COLORS.SECONDARY,
      align: 'center',
    })
    .setOrigin(0.5)
    .setAlpha(0);
  container.add(levelText);

  const milesLabel = scene.add
    .text(panelX + 12, panelY + 58, 'Miles:', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    })
    .setAlpha(0);
  container.add(milesLabel);

  const milesText = scene.add
    .text(panelX + 55, panelY + 56, `${upgrade.oldBaseMiles}`, {
      fontFamily: FONTS.HEADING,
      fontSize: '16px',
      color: isDowngrade ? '#aa6666' : '#4488ff',
    })
    .setOrigin(0, 0)
    .setAlpha(0);
  container.add(milesText);

  const multLabel = scene.add
    .text(cx + 10, panelY + 58, 'Mult:', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    })
    .setAlpha(0);
  container.add(multLabel);

  const multText = scene.add
    .text(cx + 48, panelY + 56, `${upgrade.oldBaseMult}`, {
      fontFamily: FONTS.HEADING,
      fontSize: '16px',
      color: isDowngrade ? '#cc5555' : '#ff4444',
    })
    .setOrigin(0, 0)
    .setAlpha(0);
  container.add(multText);

  const arrowMiles = scene.add
    .text(milesText.x + milesText.width + 4, panelY + 56, '', {
      fontFamily: FONTS.HEADING,
      fontSize: '16px',
      color: isDowngrade ? '#aa4444' : '#66ccff',
    })
    .setOrigin(0, 0)
    .setAlpha(0);
  container.add(arrowMiles);

  const arrowMult = scene.add
    .text(multText.x + multText.width + 4, panelY + 56, '', {
      fontFamily: FONTS.HEADING,
      fontSize: '16px',
      color: isDowngrade ? '#aa4444' : '#ff6666',
    })
    .setOrigin(0, 0)
    .setAlpha(0);
  container.add(arrowMult);

  scene.tweens.add({
    targets: [nameText, levelText, milesLabel, milesText, multLabel, multText],
    alpha: 1,
    duration: 200,
    ease: 'Sine.easeOut',
    onComplete: () => {
      scene.sound.play(isDowngrade ? 'sfx_negative' : 'sfx_card1', { volume: 0.4 });
      scene.time.delayedCall(400, () => {
        tickMiles();
      });
    },
  });

  function scalePop(target: Phaser.GameObjects.Text) {
    scene.tweens.add({
      targets: target,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 80,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  function formatDiff(diff: number): string {
    return diff > 0 ? `+${diff}` : `${diff}`;
  }

  function tickMiles() {
    milesText.setText(`${upgrade.newBaseMiles}`);
    const diff = upgrade.newBaseMiles - upgrade.oldBaseMiles;
    if (diff !== 0) {
      arrowMiles.setText(formatDiff(diff)).setAlpha(1);
    }
    scalePop(milesText);
    scene.sound.play(isDowngrade ? 'sfx_cancel' : 'sfx_multhit1', {
      volume: 0.6,
      detune: isDowngrade ? -100 : 0,
    });
    scene.time.delayedCall(TICK_DELAY, tickMult);
  }

  function tickMult() {
    multText.setText(`${upgrade.newBaseMult}`);
    const diff = upgrade.newBaseMult - upgrade.oldBaseMult;
    if (diff !== 0) {
      arrowMult.setText(formatDiff(diff)).setAlpha(1);
    }
    scalePop(multText);
    scene.sound.play(isDowngrade ? 'sfx_multhit2' : 'sfx_multhit1', {
      volume: 0.6,
      detune: isDowngrade ? -150 : 50,
    });
    scene.time.delayedCall(TICK_DELAY, tickLevel);
  }

  function tickLevel() {
    levelText.setText(`Lvl. ${upgrade.newLevel}`);
    scalePop(levelText);
    scene.sound.play(isDowngrade ? 'sfx_negative' : 'sfx_polychrome1', {
      volume: 0.6,
      detune: isDowngrade ? -80 : 0,
    });
    scalePop(nameText);
    scene.time.delayedCall(HOLD_DELAY, fadeOut);
  }

  function fadeOut() {
    scene.tweens.add({
      targets: container,
      alpha: 0,
      duration: 300,
      ease: 'Sine.easeIn',
      onComplete: () => {
        container.destroy();
        onDone();
      },
    });
  }
}
