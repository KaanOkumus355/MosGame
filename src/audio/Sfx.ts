/**
 * Every sound in the game is synthesised with the Web Audio API: no audio files. To swap in real
 * sound files later, replace the body of a case in `play()` (or route it to Phaser's loader).
 */

export type SfxName =
  | 'eat' | 'eatBig' | 'golden' | 'drink' | 'hurt' | 'bite' | 'crit' | 'defeat' | 'stun'
  | 'evolve' | 'pick' | 'fusion' | 'metamorph' | 'dash' | 'spit' | 'breath' | 'tongue'
  | 'swat' | 'slam' | 'howl' | 'web' | 'spear' | 'warn' | 'secondwind' | 'death' | 'shield'
  | 'pack' | 'frenzy' | 'ui' | 'pause' | 'squeak' | 'heartbeat'
  | 'march' | 'capture' | 'lostRegion' | 'surge' | 'roar' | 'bioweapon' | 'convert' | 'victory' | 'lose';

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  freqEnd?: number;
  dur: number;
  vol?: number;
  delay?: number;
  attack?: number;
  /** Vibrato depth in Hz (0 = none). */
  vibrato?: number;
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  delay?: number;
  filter?: BiquadFilterType;
  freq?: number;
  freqEnd?: number;
  q?: number;
}

/** Minimum seconds between two plays of the same sound (keeps magnet/combo spam pleasant). */
const THROTTLE: Partial<Record<SfxName, number>> = {
  eat: 0.05, eatBig: 0.07, squeak: 0.15, drink: 0.22, bite: 0.12, stun: 0.3, warn: 1, march: 0.15, web: 0.1, spear: 0.1, hurt: 0.1, crit: 0.12, defeat: 0.1,
};
const MAX_VOICES = 28;
/** Frequent sounds that get a random pitch wobble. */
const VARIED = new Set<SfxName>(['eat', 'eatBig', 'bite', 'crit', 'squeak', 'hurt', 'drink']);
const STORAGE_KEY = 'swarm-to-sovereign-audio';
/** Overall output level at full master volume (keeps headroom for many voices). */
const MASTER_GAIN = 0.55;

/** Pentatonic scale used for the ambient plucks (semitone offsets). */
const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16];

export interface AmbientDef {
  /** Root frequency of the drone. */
  root: number;
  wave: OscillatorType;
  /** Seconds between plucks (min, max). */
  pluckEvery: [number, number];
}

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<SfxName, number>();
  private voices = 0;
  private ambientNodes: AudioNode[] = [];
  private ambientTimer: number | null = null;
  /** Mute switches (S / U); the volumes below survive muting. */
  sfxOn = true;
  musicOn = true;
  /** 0..1, set with the Options sliders. */
  sfxVolume = 1;
  musicVolume = 1;
  /** Scales everything (on top of the effects and music sliders). */
  masterVolume = 1;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      if (typeof saved.sfxOn === 'boolean') this.sfxOn = saved.sfxOn;
      if (typeof saved.musicOn === 'boolean') this.musicOn = saved.musicOn;
      if (typeof saved.sfxVolume === 'number') this.sfxVolume = Math.min(1, Math.max(0, saved.sfxVolume));
      if (typeof saved.musicVolume === 'number') this.musicVolume = Math.min(1, Math.max(0, saved.musicVolume));
      if (typeof saved.masterVolume === 'number') this.masterVolume = Math.min(1, Math.max(0, saved.masterVolume));
    } catch {
      // storage unavailable: keep defaults
    }
  }

  /** Browsers only allow audio after a user gesture; call this from input handlers. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.masterLevel();
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxLevel();
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicLevel();
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  // squared so the slider feels even to the ear
  private sfxLevel(): number {
    return this.sfxOn ? this.sfxVolume ** 2 : 0;
  }

  private masterLevel(): number {
    return MASTER_GAIN * this.masterVolume ** 2;
  }

  setMasterVolume(v: number): void {
    this.masterVolume = Math.min(1, Math.max(0, v));
    if (this.ctx) this.master.gain.setTargetAtTime(this.masterLevel(), this.ctx.currentTime, 0.02);
    this.save();
  }

  private musicLevel(): number {
    return this.musicOn ? this.musicVolume ** 2 : 0;
  }

  setSfx(on: boolean): void {
    this.sfxOn = on;
    if (this.ctx) this.sfxGain.gain.setTargetAtTime(this.sfxLevel(), this.ctx.currentTime, 0.02);
    this.save();
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (this.ctx) this.musicGain.gain.setTargetAtTime(this.musicLevel(), this.ctx.currentTime, 0.1);
    this.save();
  }

  /** Slider volume (0..1); moving a slider also unmutes. */
  setSfxVolume(v: number): void {
    this.sfxVolume = Math.min(1, Math.max(0, v));
    this.setSfx(true);
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.min(1, Math.max(0, v));
    this.setMusic(true);
  }

  private save(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sfxOn: this.sfxOn, musicOn: this.musicOn, sfxVolume: this.sfxVolume, musicVolume: this.musicVolume, masterVolume: this.masterVolume }),
      );
    } catch {
      // ignore
    }
  }

  // ------------------------------------------------------------ building blocks

  private tone(o: ToneOpts, out: AudioNode = this.sfxGain): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t0 + o.dur);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 6;
      lg.gain.value = o.vibrato;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + o.dur);
    }
    const vol = o.vol ?? 0.2;
    const attack = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(out);
    this.track(osc);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  private noise(o: NoiseOpts): void {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'lowpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t0);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.2, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(this.sfxGain);
    this.track(src);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.02);
  }

  private track(node: AudioScheduledSourceNode): void {
    this.voices++;
    node.onended = () => this.voices--;
  }

  private arp(notes: number[], step: number, o: Partial<ToneOpts> = {}): void {
    notes.forEach((f, i) => this.tone({ type: 'triangle', dur: step * 2.2, vol: 0.14, ...o, freq: f, delay: (o.delay ?? 0) + i * step }));
  }

  // ------------------------------------------------------------ the sounds

  /** Plays a sound. `pitch` scales frequencies (e.g. smaller prey = higher blip). */
  play(name: SfxName, pitch = 1): void {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    if (this.voices > MAX_VOICES) return;
    const now = this.ctx.currentTime;
    const gap = THROTTLE[name] ?? 0.04;
    if (now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    // the sounds you hear hundreds of times a run get a little random pitch so they never repeat exactly
    const p = VARIED.has(name) ? pitch * (1 + (Math.random() - 0.5) * 0.16) : pitch;
    const variant = Math.floor(Math.random() * 4);

    switch (name) {
      case 'eat':
        // four little mouth sounds: snap, chomp, crunch, gulp
        if (variant === 0) this.tone({ type: 'square', freq: 620 * p, freqEnd: 940 * p, dur: 0.07, vol: 0.07 });
        else if (variant === 1) {
          this.tone({ type: 'triangle', freq: 520 * p, freqEnd: 380 * p, dur: 0.06, vol: 0.09 });
          this.noise({ dur: 0.04, vol: 0.05, filter: 'bandpass', freq: 2600 * p, q: 3 });
        } else if (variant === 2) {
          this.noise({ dur: 0.06, vol: 0.08, filter: 'bandpass', freq: 3400 * p, q: 4 });
          this.tone({ type: 'square', freq: 760 * p, freqEnd: 680 * p, dur: 0.04, vol: 0.04 });
        } else this.tone({ type: 'sine', freq: 440 * p, freqEnd: 820 * p, dur: 0.09, vol: 0.09 });
        break;
      case 'eatBig':
        if (variant % 2 === 0) {
          this.tone({ type: 'triangle', freq: 260 * p, freqEnd: 520 * p, dur: 0.14, vol: 0.18 });
          this.noise({ dur: 0.08, vol: 0.12, filter: 'bandpass', freq: 1400, q: 2 });
        } else {
          // a big wet gulp
          this.tone({ type: 'sine', freq: 180 * p, freqEnd: 420 * p, dur: 0.18, vol: 0.2 });
          this.tone({ type: 'triangle', freq: 330 * p, freqEnd: 160 * p, dur: 0.1, vol: 0.08, delay: 0.1 });
          this.noise({ dur: 0.1, vol: 0.08, filter: 'lowpass', freq: 900 });
        }
        break;
      case 'squeak':
        // startled prey: a quick high chirp or two
        this.tone({ type: 'sine', freq: 1500 * p, freqEnd: 2300 * p, dur: 0.06, vol: 0.05, vibrato: 40 });
        if (variant > 1) this.tone({ type: 'sine', freq: 1700 * p, freqEnd: 2500 * p, dur: 0.05, vol: 0.04, delay: 0.08 });
        break;
      case 'golden':
        this.arp([1046, 1318, 1568, 2093], 0.05, { vol: 0.1, type: 'sine' });
        break;
      case 'drink':
        this.tone({ type: 'sine', freq: 340, freqEnd: 190, dur: 0.12, vol: 0.08 });
        break;
      case 'heartbeat':
        // lub-dub, low and soft
        this.tone({ type: 'sine', freq: 72, freqEnd: 46, dur: 0.12, vol: 0.32 });
        this.tone({ type: 'sine', freq: 64, freqEnd: 40, dur: 0.14, vol: 0.22, delay: 0.17 });
        break;
      case 'hurt':
        this.noise({ dur: 0.2, vol: 0.3, freq: 900, freqEnd: 150 });
        this.tone({ type: 'sine', freq: 170, freqEnd: 55, dur: 0.22, vol: 0.3 });
        break;
      case 'bite':
        this.noise({ dur: 0.06, vol: 0.18, filter: 'bandpass', freq: 2200 * p, q: 3 });
        this.tone({ type: variant % 2 ? 'square' : 'triangle', freq: 230 * p, freqEnd: 110 * p, dur: 0.07, vol: 0.08 });
        break;
      case 'crit':
        this.noise({ dur: 0.09, vol: 0.25, filter: 'bandpass', freq: 3000, q: 2 });
        this.tone({ type: 'sawtooth', freq: 400, freqEnd: 120, dur: 0.12, vol: 0.1 });
        break;
      case 'defeat':
        this.tone({ type: 'sawtooth', freq: 210, freqEnd: 45, dur: 0.38, vol: 0.14 });
        this.noise({ dur: 0.3, vol: 0.18, freq: 600, freqEnd: 120 });
        break;
      case 'stun':
        this.tone({ type: 'triangle', freq: 1300, freqEnd: 650, dur: 0.12, vol: 0.08 });
        break;
      case 'evolve':
        this.arp([523, 659, 784, 1046], 0.08);
        break;
      case 'pick':
        this.arp([784, 1175], 0.07, { vol: 0.16 });
        break;
      case 'fusion':
        this.arp([392, 523, 659, 784, 1046, 1568], 0.06, { vol: 0.15 });
        this.tone({ type: 'sine', freq: 1568, dur: 0.9, vol: 0.06, delay: 0.36, vibrato: 12, attack: 0.1 });
        break;
      case 'metamorph':
        this.tone({ type: 'sawtooth', freq: 90, freqEnd: 900, dur: 1.15, vol: 0.12, attack: 0.3 });
        this.noise({ dur: 1.1, vol: 0.08, filter: 'bandpass', freq: 300, freqEnd: 4000, q: 1.5 });
        this.arp([523, 659, 784, 1046, 1318], 0.07, { delay: 1.15, vol: 0.16 });
        break;
      case 'dash':
        this.noise({ dur: 0.2, vol: 0.18, filter: 'highpass', freq: 3500, freqEnd: 700 });
        break;
      case 'spit':
        this.tone({ type: 'square', freq: 950, freqEnd: 280, dur: 0.11, vol: 0.08 });
        break;
      case 'breath':
        this.noise({ dur: 0.55, vol: 0.25, filter: 'bandpass', freq: 500, freqEnd: 1600, q: 0.8 });
        break;
      case 'tongue':
        this.tone({ type: 'sine', freq: 180 * p, freqEnd: 760 * p, dur: 0.12, vol: 0.14 });
        break;
      case 'swat':
        this.noise({ dur: 0.1, vol: 0.4, freq: 2000, freqEnd: 300 });
        this.tone({ type: 'sine', freq: 130, freqEnd: 45, dur: 0.15, vol: 0.25 });
        break;
      case 'slam':
        this.tone({ type: 'sine', freq: 90, freqEnd: 28, dur: 0.45, vol: 0.45 });
        this.noise({ dur: 0.35, vol: 0.25, freq: 500, freqEnd: 80 });
        break;
      case 'howl':
        this.tone({ type: 'sine', freq: 380, freqEnd: 560, dur: 0.5, vol: 0.08, attack: 0.15, vibrato: 8 });
        this.tone({ type: 'sine', freq: 560, freqEnd: 340, dur: 0.7, vol: 0.07, delay: 0.45, vibrato: 10 });
        break;
      case 'web':
        this.noise({ dur: 0.12, vol: 0.12, filter: 'highpass', freq: 5000, freqEnd: 1500 });
        break;
      case 'spear':
        this.noise({ dur: 0.15, vol: 0.35, filter: 'bandpass', freq: 1800, freqEnd: 600, q: 2 });
        break;
      case 'warn':
        this.tone({ type: 'sine', freq: 880, dur: 0.06, vol: 0.05 });
        break;
      case 'secondwind':
        this.arp([262, 392, 523, 784], 0.09, { type: 'sine', vol: 0.16 });
        break;
      case 'death':
        [440, 330, 247, 165].forEach((f, i) => this.tone({ type: 'triangle', freq: f, freqEnd: f * 0.9, dur: 0.28, vol: 0.15, delay: i * 0.2 }));
        this.noise({ dur: 0.9, vol: 0.12, freq: 700, freqEnd: 100, delay: 0.1 });
        break;
      case 'shield':
        this.tone({ type: 'sine', freq: 1200, freqEnd: 1800, dur: 0.15, vol: 0.1 });
        break;
      case 'pack':
        this.tone({ type: 'sawtooth', freq: 900, freqEnd: 1400, dur: 0.25, vol: 0.07, vibrato: 30 });
        this.tone({ type: 'sawtooth', freq: 700, freqEnd: 1200, dur: 0.25, vol: 0.06, delay: 0.12, vibrato: 30 });
        break;
      case 'frenzy':
        this.tone({ type: 'sawtooth', freq: 70, freqEnd: 140, dur: 0.6, vol: 0.2 });
        this.noise({ dur: 0.6, vol: 0.2, freq: 300, freqEnd: 1200 });
        break;
      case 'ui':
        this.tone({ type: 'square', freq: 1000, dur: 0.035, vol: 0.05 });
        break;
      case 'pause':
        this.tone({ type: 'triangle', freq: 600, freqEnd: 400, dur: 0.1, vol: 0.1 });
        break;
      case 'march':
        this.tone({ type: 'triangle', freq: 220, freqEnd: 330, dur: 0.09, vol: 0.08 });
        break;
      case 'capture':
        this.arp([523, 784], 0.08, { vol: 0.13 });
        break;
      case 'lostRegion':
        this.arp([392, 311], 0.12, { vol: 0.13, type: 'sawtooth' });
        break;
      case 'surge':
        this.tone({ type: 'sine', freq: 200, freqEnd: 800, dur: 0.5, vol: 0.15, attack: 0.1 });
        break;
      case 'roar':
        this.tone({ type: 'sawtooth', freq: 110, freqEnd: 55, dur: 0.9, vol: 0.2, vibrato: 6 });
        this.noise({ dur: 0.9, vol: 0.2, freq: 400, freqEnd: 150 });
        break;
      case 'bioweapon':
        for (let i = 0; i < 6; i++) this.tone({ type: 'sine', freq: 300 + Math.random() * 500, dur: 0.08, vol: 0.06, delay: i * 0.06 });
        this.noise({ dur: 0.5, vol: 0.1, filter: 'bandpass', freq: 800, q: 4 });
        break;
      case 'convert':
        this.arp([659, 784, 988], 0.07, { type: 'sine', vol: 0.12 });
        break;
      case 'victory':
        [523, 523, 523, 659, 784, 659, 784, 1046].forEach((f, i) =>
          this.tone({ type: 'square', freq: f, dur: i === 7 ? 0.8 : 0.16, vol: 0.08, delay: [0, 0.15, 0.3, 0.45, 0.75, 0.95, 1.1, 1.3][i] }),
        );
        break;
      case 'lose':
        [[300, 290], [280, 265], [255, 240], [235, 180]].forEach(([a, b], i) =>
          this.tone({ type: 'sawtooth', freq: a, freqEnd: b, dur: i === 3 ? 1 : 0.35, vol: 0.09, delay: i * 0.38, vibrato: i === 3 ? 6 : 0 }),
        );
        break;
    }
  }

  // ------------------------------------------------------------ ambient bed

  /** Starts a quiet drone + pentatonic plucks for a stage. Replaces any previous ambient. */
  startAmbient(def: AmbientDef): void {
    this.stopAmbient();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const bed = ctx.createGain();
    bed.gain.value = 0.0001;
    bed.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 2);
    bed.connect(this.musicGain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.connect(bed);
    for (const detune of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = def.wave;
      o.frequency.value = def.root;
      o.detune.value = detune;
      o.connect(lp);
      o.start();
      this.ambientNodes.push(o);
    }
    // slow filter sweep so the drone breathes
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    this.ambientNodes.push(lfo, bed);

    const pluck = () => {
      if (!this.ctx) return;
      const step = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
      this.tone({ type: 'triangle', freq: def.root * 4 * Math.pow(2, step / 12), dur: 1.4, vol: 0.035, attack: 0.01 }, this.musicGain);
      const [a, b] = def.pluckEvery;
      this.ambientTimer = window.setTimeout(pluck, (a + Math.random() * (b - a)) * 1000);
    };
    this.ambientTimer = window.setTimeout(pluck, 1500);
  }

  stopAmbient(): void {
    if (this.ambientTimer !== null) window.clearTimeout(this.ambientTimer);
    this.ambientTimer = null;
    const ctx = this.ctx;
    for (const n of this.ambientNodes) {
      if (n instanceof OscillatorNode) n.stop(ctx ? ctx.currentTime + 0.5 : 0);
      if (n instanceof GainNode && ctx) n.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    }
    this.ambientNodes = [];
  }
}

export const Sfx = new SfxEngine();
