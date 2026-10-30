import Phaser from 'phaser';
import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { StageScene } from './scenes/StageScene';
import { HUDScene } from './scenes/HUDScene';
import { GameOverScene } from './scenes/GameOverScene';
import { EvolutionScene } from './scenes/EvolutionScene';
import { TransitionScene } from './scenes/TransitionScene';
import { PauseScene } from './scenes/PauseScene';
import { WorldMapScene } from './scenes/WorldMapScene';
import { VictoryScene } from './scenes/VictoryScene';
import { BestiaryScene } from './scenes/BestiaryScene';
import { SkyScene } from './scenes/SkyScene';
import { DeepScene } from './scenes/DeepScene';
import { HiveScene } from './scenes/HiveScene';
import { RunReportScene } from './scenes/RunReportScene';
import { GeneBankScene } from './scenes/GeneBankScene';
import { OptionsScene } from './scenes/OptionsScene';
import { RecordsScene } from './scenes/RecordsScene';
import { Sfx } from './audio/Sfx';
import { GameState } from './state/GameState';
import { PALETTES, Settings } from './state/Settings';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#07110b',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { gamepad: true },
  scene: [BootScene, MenuScene, StageScene, HUDScene, EvolutionScene, TransitionScene, PauseScene, WorldMapScene, SkyScene, DeepScene, HiveScene, VictoryScene, GameOverScene, BestiaryScene, RunReportScene, GeneBankScene, OptionsScene, RecordsScene],
});

// indicator ring colours follow the colour-blind setting (read every frame by the stage)
Settings.onChange(() => Object.assign(COLORS, Settings.colorBlind ? PALETTES.colorBlind : PALETTES.normal));

// comfort options: every camera shake and flash in the game goes through these two methods, so
// switching them off here covers all of them
const Camera = Phaser.Cameras.Scene2D.Camera.prototype;
const shake = Camera.shake;
const flash = Camera.flash;
Camera.shake = function (this: Phaser.Cameras.Scene2D.Camera, ...args: Parameters<typeof shake>) {
  return Settings.effect('shake') ? shake.apply(this, args) : this;
};
Camera.flash = function (this: Phaser.Cameras.Scene2D.Camera, ...args: Parameters<typeof flash>) {
  return Settings.effect('flashes') ? flash.apply(this, args) : this;
};

// browsers only allow audio after a user gesture
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => Sfx.unlock());

// handy for poking at the game from the dev console
if (import.meta.env.DEV) Object.assign(window, { game, GameState });
