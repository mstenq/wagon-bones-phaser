// ─── HandUpgradeAnimation ───
// Plays a Balatro-style hand upgrade display when a hand level increases.
// Shows the hand name + level, then ticks up base miles, base mult, and level
// with scale pop and sound effects.

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
  const sidebarW = sidebar.getSidebarWidth();
  const cx = sidebarW / 2;

  // ─── Create overlay container positioned relative to sidebar ───
  const container = scene.add.container(sidebar.x, sidebar.y).setDepth(250);

  // Background panel
  const panelW = sidebarW - UI.SIDEBAR_PADDING * 2;
  const panelH = 100;
  // Position above the miles/mult pills area (use getHandUpgradeY from sidebar)
  const panelY = sidebar.getHandUpgradeY() - panelH / 2 + 20;
  const panelX = UI.SIDEBAR_PADDING;

  const bg = scene.add.graphics();
  bg.fillStyle(COLORS.SIDEBAR_SECTION, 0.95);
  bg.fillRoundedRect(panelX, panelY, panelW, panelH, 8);
  bg.lineStyle(2, 0x4488ff, 0.8);
  bg.strokeRoundedRect(panelX, panelY, panelW, panelH, 8);
  container.add(bg);

  // Hand name
  const nameText = scene.add
    .text(cx, panelY + 16, upgrade.handName, {
      fontFamily: FONTS.HEADING,
      fontSize: '18px',
      color: TEXT_COLORS.GOLD,
      align: 'center',
    })
    .setOrigin(0.5)
    .setAlpha(0);
  container.add(nameText);

  // Level text (starts with old level)
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

  // Miles value
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
      color: '#4488ff',
    })
    .setOrigin(0, 0)
    .setAlpha(0);
  container.add(milesText);

  // Mult value
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
      color: '#ff4444',
    })
    .setOrigin(0, 0)
    .setAlpha(0);
  container.add(multText);

  // Arrow text for showing increment direction
  const arrowMiles = scene.add
    .text(milesText.x + milesText.width + 4, panelY + 56, '', {
      fontFamily: FONTS.HEADING,
      fontSize: '16px',
      color: '#66ccff',
    })
    .setOrigin(0, 0)
    .setAlpha(0);
  container.add(arrowMiles);

  const arrowMult = scene.add
    .text(multText.x + multText.width + 4, panelY + 56, '', {
      fontFamily: FONTS.HEADING,
      fontSize: '16px',
      color: '#ff6666',
    })
    .setOrigin(0, 0)
    .setAlpha(0);
  container.add(arrowMult);

  // ─── Animation sequence ───

  // Step 1: Fade in name + level
  scene.tweens.add({
    targets: [nameText, levelText, milesLabel, milesText, multLabel, multText],
    alpha: 1,
    duration: 200,
    ease: 'Sine.easeOut',
    onComplete: () => {
      scene.sound.play('sfx_card1', { volume: 0.4 });

      // Step 2: After a beat, tick up miles
      scene.time.delayedCall(400, () => {
        tickUpMiles();
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

  function tickUpMiles() {
    milesText.setText(`${upgrade.newBaseMiles}`);
    const diff = upgrade.newBaseMiles - upgrade.oldBaseMiles;
    if (diff > 0) {
      arrowMiles.setText(`+${diff}`).setAlpha(1);
    }
    scalePop(milesText);
    scene.sound.play('sfx_multhit1', { volume: 0.6, detune: 0 });

    // Step 3: tick up mult
    scene.time.delayedCall(TICK_DELAY, tickUpMult);
  }

  function tickUpMult() {
    multText.setText(`${upgrade.newBaseMult}`);
    const diff = upgrade.newBaseMult - upgrade.oldBaseMult;
    if (diff > 0) {
      arrowMult.setText(`+${diff}`).setAlpha(1);
    }
    scalePop(multText);
    scene.sound.play('sfx_multhit1', { volume: 0.6, detune: 50 });

    // Step 4: tick up level
    scene.time.delayedCall(TICK_DELAY, tickUpLevel);
  }

  function tickUpLevel() {
    levelText.setText(`Lvl. ${upgrade.newLevel}`);
    scalePop(levelText);
    scene.sound.play('sfx_polychrome1', { volume: 0.6, detune: 0 });

    // Also pop the name for extra juice
    scalePop(nameText);

    // Step 5: hold then fade out
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
