import Phaser from 'phaser';
import { generateTextures } from '../art/textures';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Real art goes here, using the same keys as art/textures.ts, e.g.:
    // this.load.image('mosquito', 'assets/mosquito.png');
  }

  create(): void {
    generateTextures(this);
    this.scene.start('Menu');
  }
}
