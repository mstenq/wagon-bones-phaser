import { Scene } from 'phaser';
import allItems from '../../data/items';
import diceStickers from '../../data/dice_stickers';
import * as Phaser from 'phaser';
import { initAutoSave, tryRestoreAutoSaveOnBoot } from '../AutoSaveManager';
import { initAudioPreferences } from '../../game/AudioPreferences';
import { initGameplayPreferences } from '../../game/GameplayPreferences';
import { patchGameAudio } from '../GameAudio';

// Map sticker IDs to their PNG filenames (when they differ)
const STICKER_FILE_MAP: Record<string, string> = {
  golden_dollar: 'gold_dollar',
};

function hideLoadingOverlay(): void {
  document.getElementById('loading-overlay')?.remove();
}

export class Preloader extends Scene {
  constructor() {
    super('Preloader');
  }

  preload() {
    const progressEl = document.getElementById('loading-progress');
    this.load.on('progress', (value: number) => {
      if (progressEl) {
        progressEl.textContent = `${Math.round(value * 100)}%`;
      }
    });
    this.load.once('complete', hideLoadingOverlay);

    // Shop background only; game rounds lazy-load numbered backgrounds in GameScene
    this.load.image('bg_shop', 'assets/backgrounds/shop.png');

    // Tileable panel textures for sidebar / top bar UI
    for (const tex of ['black', 'blue', 'gray', 'green', 'red'] as const) {
      this.load.image(`tex_${tex}`, `assets/textures/${tex}.png`);
    }

    // Load sticker images
    for (const sticker of diceStickers) {
      const filename = STICKER_FILE_MAP[sticker.id] ?? sticker.id;
      this.load.image(`sticker_${sticker.id}`, `assets/stickers/${filename}.png`);
    }

    // Load dice faces from TexturePacker single-atlas JSON
    this.load.atlas('dice', 'assets/dice/dice.png', 'assets/dice/dice.json');

    // Load packs from TexturePacker single-atlas JSON
    this.load.atlas('packs', 'assets/packs/packs.png', 'assets/packs/packs.json');

    // Load item cards from TexturePacker single-atlas JSON
    this.load.atlas('items', 'assets/items/items.png', 'assets/items/items.json');

    // Load card template overlays (dynamic — derived from items that use cardTemplate)
    const templateIds = new Set(allItems.map((i) => i.cardTemplate).filter(Boolean));
    for (const tpl of templateIds) {
      this.load.image(`card_template_${tpl}`, `assets/card-templates/${tpl}.png`);
    }

    // Load trail guides from TexturePacker single-atlas JSON
    this.load.atlas('trail_guides', 'assets/trail-guides/trail_guides.png', 'assets/trail-guides/trail_guides.json');

    // Load supply cards from TexturePacker single-atlas JSON
    this.load.atlas('supplies', 'assets/supplies/supplies.png', 'assets/supplies/supplies.json');

    // Load frontier encounters from TexturePacker single-atlas JSON
    this.load.atlas(
      'frontier_encounters',
      'assets/frontier-encounters/frontier_encounters.png',
      'assets/frontier-encounters/frontier_encounters.json',
    );

    // Load permits from TexturePacker single-atlas JSON
    this.load.atlas('permits', 'assets/permits/permits.png', 'assets/permits/permits.json');

    // Load professions from TexturePacker single-atlas JSON
    this.load.atlas('professions', 'assets/professions/professions.png', 'assets/professions/professions.json');

    // Load boss portraits from TexturePacker single-atlas JSON
    this.load.atlas('bosses', 'assets/bosses/bosses.png', 'assets/bosses/bosses.json');

    this.load.image('icon_sort', 'assets/icons/sort.svg');
    this.load.image('icon_chevron_left', 'assets/icons/chevron-left.svg');
    this.load.image('icon_chevron_right', 'assets/icons/chevron-right.svg');
    this.load.image('icon_menu', 'assets/icons/menu.svg');
    this.load.image('icon_book', 'assets/icons/book-open-text.svg');

    // Load difficulty stake icons
    for (let level = 1; level <= 8; level++) {
      this.load.image(`difficulty_${level}`, `assets/difficulty/difficulty_${level}.png`);
    }

    // Load equipment modifier badges
    for (const modifier of ['cursed', 'perishable', 'leased'] as const) {
      this.load.image(`modifier_${modifier}`, `assets/equipment-modifiers/${modifier}.png`);
    }
    this.load.image('modifier_special', 'assets/equipment-modifiers/special.png');

    // Aura effect textures (registry definitions)
    this.load.image('effect_ember', 'assets/effects/ember.png');
    this.load.image('effect_sparkle', 'assets/effects/sparkle.png');
    this.load.image('effect_displacement_heat', 'assets/effects/displacement-heat.png');

    // Load sound effects
    this.load.audio('sfx_button', 'assets/sounds/button.ogg');
    this.load.audio('sfx_dice_roll', 'assets/sounds/diceRattleAndRoll.wav');
    this.load.audio('sfx_dice_rattle', 'assets/sounds/diceRattle.wav');
    this.load.audio('sfx_dice_land', 'assets/sounds/diceRoll.wav');
    this.load.audio('sfx_card1', 'assets/sounds/card1.ogg');
    this.load.audio('sfx_card3', 'assets/sounds/card3.ogg');
    this.load.audio('sfx_card_slide1', 'assets/sounds/cardSlide1.ogg');
    this.load.audio('sfx_card_slide2', 'assets/sounds/cardSlide2.ogg');
    this.load.audio('sfx_chips1', 'assets/sounds/chips1.ogg');
    this.load.audio('sfx_chips2', 'assets/sounds/chips2.ogg');
    this.load.audio('sfx_coin', 'assets/sounds/coin3.ogg');
    this.load.audio('sfx_highlight1', 'assets/sounds/highlight1.ogg');
    this.load.audio('sfx_highlight2', 'assets/sounds/highlight2.ogg');
    this.load.audio('sfx_multhit1', 'assets/sounds/multhit1.ogg');
    this.load.audio('sfx_multhit2', 'assets/sounds/multhit2.ogg');
    this.load.audio('sfx_whoosh', 'assets/sounds/whoosh.ogg');
    this.load.audio('sfx_whoosh2', 'assets/sounds/whoosh2.ogg');
    this.load.audio('sfx_tarot1', 'assets/sounds/tarot1.ogg');
    this.load.audio('sfx_tarot2', 'assets/sounds/tarot2.ogg');
    this.load.audio('sfx_cancel', 'assets/sounds/cancel.ogg');
    this.load.audio('sfx_foil1', 'assets/sounds/foil1.ogg');
    this.load.audio('sfx_win', 'assets/sounds/win.ogg');
    this.load.audio('sfx_timpani', 'assets/sounds/timpani.ogg');
    this.load.audio('sfx_generic1', 'assets/sounds/generic1.ogg');
    this.load.audio('sfx_explosion', 'assets/sounds/explosion1.ogg');
    this.load.audio('sfx_explosion_release', 'assets/sounds/explosion_release1.ogg');
    this.load.audio('sfx_negative', 'assets/sounds/negative.ogg');
    this.load.audio('sfx_glass1', 'assets/sounds/glass1.ogg');
    this.load.audio('sfx_paper1', 'assets/sounds/paper1.ogg');
    this.load.audio('sfx_card_fan', 'assets/sounds/cardFan2.ogg');
    this.load.audio('sfx_crumple1', 'assets/sounds/crumple1.ogg');
    this.load.audio('sfx_polychrome1', 'assets/sounds/polychrome1.ogg');
    this.load.audio('sfx_ambient_fire', 'assets/sounds/ambientFire1.ogg');
    this.load.audio('sfx_slice1', 'assets/sounds/slice1.ogg');
    this.load.audio('sfx_other1', 'assets/sounds/other1.ogg');

    // Background music
    this.load.audio('bg_music_1', 'assets/sounds/bg_music_1.mp3');
  }

  create() {
    initAudioPreferences();
    initGameplayPreferences();
    patchGameAudio();

    if (this.textures.exists('dice')) {
      this.textures.get('dice').setFilter(Phaser.Textures.FilterMode.NEAREST);
    }

    hideLoadingOverlay();

    const { width, height } = this.scale;
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1a2e, 1);
    bg.fillRect(0, 0, width, height);

    this.add
      .text(width / 2, height / 2, 'Starting...', {
        fontFamily: 'Arial',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.time.delayedCall(400, () => {
      initAutoSave(this.game);
      if (!tryRestoreAutoSaveOnBoot(this)) {
        this.scene.start('MainMenu', {});
      }
    });
  }
}
