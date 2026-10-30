export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** You can eat anything smaller than this fraction of your size. */
export const EDIBLE_RATIO = 0.9;
/** Anything with an attack bigger than this multiple of your size can hurt you. */
export const DANGER_RATIO = 1.1;


export const FONT = '"Trebuchet MS", "Segoe UI", Arial, sans-serif';

export const COLORS = {
  edible: 0x9dff6a,
  danger: 0xff4040,
  host: 0xff77b0,
  dna: 0x8be9fd,
  hp: 0xff5566,
  growth: 0xb4f05a,
  stun: 0xb58cff,
  /** Fightable but not (yet) dangerous. */
  fight: 0xffa726,
};
