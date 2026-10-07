// Sound: synthesized effects (WebAudio) plus one looping music track (assets/audio/the_big_fight.mp3, match screen only).
// Layout: master volume → compressor → speakers; a convolution reverb ("arena") and a soft-clip
// shaper for heavy hits feed the master; every one-shot is panned by where it happens on court.

// Internals live in the SOUND closure; only the names below are global (SND state, sfx one-shots, music + volume controls, panAt).
const SOUND = (() => {
  const SND = { ctx: null, on: true, master: null, noise: null, pan: 0, vol: 0.8 };
  SND.on = store.get(KEYS.sound) !== 'off';
  SND.vol = clamp(+(store.get(KEYS.volume) ?? 0.8), 0, 1);
  const BASE_GAIN = 0.6;
  /** Match music: decoded once, looped through its own gain node straight to the speakers (not the effects bus). */
  const BGM_URL = 'assets/audio/the_big_fight.mp3',
    BGM_GAIN = 0.5;
  SND.bgm = null; // gain node of the playing track
  SND.bgmSrc = null; // its looping source
  SND.bgmBuf = null; // decoded track, kept for later matches
  SND.bgmWant = false; // a match is open (guards a load that finishes after leaving)
  SND.bgmLoad = false; // fetch + decode in flight
  /** Music level for the current volume slider and sound toggle. */
  SND.mood = 1; // the director's music level (spec §2.15: × 0.8 Loose … × 1.15 Fever; the hush at set point × 0.5)
  const bgmLevel = () => BGM_GAIN * SND.vol * (SND.on ? 1 : 0) * SND.mood;
  /** Start the match music (fades in over 1 s). Needs SND.ctx (audioInit first); safe to call while playing or loading. */
  async function bgmStart() {
    const c = SND.ctx;
    SND.bgmWant = true;
    if (!c || SND.bgmSrc || SND.bgmLoad) return;
    try {
      if (!SND.bgmBuf) {
        SND.bgmLoad = true;
        SND.bgmBuf = await c.decodeAudioData(await (await fetch(BGM_URL)).arrayBuffer());
      }
    } catch (e) {
      console.warn('Match music failed to load', e);
      SND.bgmWant = false;
      return;
    } finally {
      SND.bgmLoad = false;
    }
    if (!SND.bgmWant || SND.bgmSrc) return;
    const g = c.createGain(),
      src = c.createBufferSource(),
      t = c.currentTime;
    src.buffer = SND.bgmBuf;
    src.loop = true;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(bgmLevel(), t + 1);
    src.connect(g);
    g.connect(c.destination);
    src.start();
    SND.bgm = g;
    SND.bgmSrc = src;
  }
  /** Fade the match music out over 0.6 s, then stop it. Safe when nothing plays. */
  function bgmStop() {
    SND.bgmWant = false;
    const g = SND.bgm,
      src = SND.bgmSrc;
    if (!g || !src) return;
    SND.bgm = SND.bgmSrc = null;
    const t = SND.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 0.6);
    setTimeout(() => {
      try {
        src.stop();
        g.disconnect();
      } catch (e) {
        /* already stopped */
      }
    }, 700);
  }
  /** Follow the sound toggle / volume slider. */
  function bgmSync() {
    if (SND.bgm) SND.bgm.gain.setTargetAtTime(bgmLevel(), SND.ctx.currentTime, 0.03);
  }
  /** The director's music level × (eased over ~1 s; only a change is sent to the audio graph). */
  function musicMood(k) {
    if (Math.abs(k - SND.mood) < 0.001) return;
    SND.mood = k;
    if (SND.bgm) SND.bgm.gain.setTargetAtTime(bgmLevel(), SND.ctx.currentTime, 0.33);
  }
  function audioInit() {
    try {
      if (SND.ctx) {
        SND.ctx.resume();
        return;
      }
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      const c = (SND.ctx = new C());
      SND.master = c.createGain();
      SND.master.gain.value = BASE_GAIN * SND.vol;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 8;
      comp.ratio.value = 6;
      comp.attack.value = 0.002;
      comp.release.value = 0.25;
      // slow-motion muffle: a low-pass on the whole mix (wide open normally)
      SND.lp = c.createBiquadFilter();
      SND.lp.type = 'lowpass';
      SND.lp.frequency.value = 20000;
      SND.lp.Q.value = 0.5;
      SND.master.connect(SND.lp);
      SND.lp.connect(comp);
      comp.connect(c.destination);
      // arena reverb: 2.4 s decaying noise with a short pre-delay
      const len = c.sampleRate * 2.4,
        ir = c.createBuffer(2, len, c.sampleRate),
        pre = Math.floor(c.sampleRate * 0.018);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = pre; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.4);
      }
      SND.rev = c.createConvolver();
      SND.rev.buffer = ir;
      SND.wet = c.createGain();
      SND.wet.gain.value = 0.5;
      SND.rev.connect(SND.wet);
      SND.wet.connect(SND.master);
      SND.shape = c.createWaveShaper();
      const cv = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) cv[i] = Math.tanh((i / 511.5 - 1) * 3.2);
      SND.shape.curve = cv;
      SND.shape.connect(SND.master);
      const n = c.sampleRate * 2;
      SND.noise = c.createBuffer(1, n, c.sampleRate);
      const d = SND.noise.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      SND.ctx = null;
    }
  }
  function toggleSound() {
    SND.on = !SND.on;
    store.set(KEYS.sound, SND.on ? 'on' : 'off');
    audioInit();
    bgmSync();
    const b = $('#snd');
    if (b) b.textContent = SND.on ? '🔊' : '🔇';
  }
  function setVolume(v) {
    SND.vol = clamp(v, 0, 1);
    store.set(KEYS.volume, SND.vol.toFixed(2));
    if (SND.master) SND.master.gain.setTargetAtTime(BASE_GAIN * SND.vol, SND.ctx.currentTime, 0.03);
    bgmSync();
  }
  const live = () => SND.ctx && SND.on && SND.ctx.state !== 'closed';
  /** Pan the next sounds to a screen x (0–1000 canvas units). */
  const panAt = X => (SND.pan = clamp((X - 520) / 620, -0.85, 0.85));
  /** Output for one sound: a stereo panner at the current pan, into the master bus. */
  function out() {
    const c = SND.ctx;
    if (!c.createStereoPanner) return SND.master;
    const p = c.createStereoPanner();
    p.pan.value = SND.pan;
    p.connect(SND.master);
    return p;
  }
  function env(g, t, a, d, v) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function osc(type, f0, f1, t, d, v, dest, a = 0.003) {
    const c = SND.ctx,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
    env(g, t, a, d, v);
    o.connect(g);
    (Array.isArray(dest) ? dest : [dest]).forEach(x => g.connect(x));
    o.start(t);
    o.stop(t + a + d + 0.05);
    return o;
  }
  function noiseAt(t, d, v, type, f0, f1, q, dest, a = 0.002) {
    const c = SND.ctx,
      s = c.createBufferSource(),
      fl = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = SND.noise;
    fl.type = type;
    fl.frequency.setValueAtTime(f0, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + d);
    fl.Q.value = q || 0.7;
    env(g, t, a, d, v);
    s.connect(fl);
    fl.connect(g);
    (Array.isArray(dest) ? dest : [dest]).forEach(x => g.connect(x));
    s.start(t, Math.random() * 0.3);
    s.stop(t + a + d + 0.05);
  }
  // legacy one-liners (centre-panned through out())
  function tone(f, d, type, v, f2, a = 0.004) {
    if (!live()) return;
    osc(type || 'sine', f, f2 || f, SND.ctx.currentTime, d, v, out(), a);
  }
  function nz(d, v, type, f, q, f2, a = 0.004) {
    if (!live()) return;
    noiseAt(SND.ctx.currentTime, d, v, type, f, f2, q, out(), a);
  }
  const vary = (x, p = 0.06) => x * (1 + (Math.random() * 2 - 1) * p); // tiny pitch variety so repeats don't sound robotic
  const now = () => SND.ctx.currentTime + 0.003;

  /* ---------- ball contacts ---------- */
  function boom(pow, block) {
    if (!live()) return;
    const t = now(),
      k = clamp(pow / 100, 0.45, 1.7),
      M = out(),
      Sh = SND.shape,
      Rv = SND.rev;
    if (block) {
      noiseAt(t - 0.002, 0.06, 0.55, 'bandpass', 1600, 900, 1.6, M);
      osc('square', 180, 70, t, 0.09, 0.12, Sh);
    }
    noiseAt(t, 0.045, 0.5 * k, 'highpass', 2600, null, 0.7, [M, Rv]);
    osc('sine', 150 + 20 * k, 30, t, 0.55 + 0.35 * k, 0.75 * Math.min(1.1, k), [Sh, Rv]);
    osc('triangle', 230, 55, t, 0.22 + 0.1 * k, 0.28 * k, Sh);
    noiseAt(t, 0.5 + 0.5 * k, 0.4 * k, 'lowpass', 2400, 90, 0.8, [M, Rv], 0.006);
    if (pow >= 95) {
      osc('sine', 55, 24, t + 0.03, 1.1, 0.45, Sh);
      noiseAt(t + 0.02, 1.2, 0.18, 'bandpass', 700, 160, 0.6, Rv, 0.02);
    }
    if (pow >= 110) [0, 0.07, 0.15].forEach((d, i) => noiseAt(t + d, 0.25, 0.22 - 0.05 * i, 'lowpass', 1400, 200, 0.8, [M, Rv]));
  }
  const sfx = {
    boom,
    toss: () => {
      if (!live()) return;
      const t = now();
      osc('sine', vary(520), 660, t, 0.07, 0.05, out());
      noiseAt(t, 0.05, 0.04, 'bandpass', 1400, 2400, 1.5, out());
    },
    /** Forearm pass: dull skin "thup". */
    bump: () => {
      if (!live()) return;
      const t = now(),
        o = out();
      noiseAt(t, 0.05, 0.3, 'lowpass', 700, 300, 1, o);
      noiseAt(t, 0.018, 0.12, 'bandpass', 2400, null, 1.2, o);
      osc('sine', vary(165), 85, t, 0.1, 0.26, [o, SND.rev]);
    },
    /** Overhead set: two quick fingertip taps and a soft pop. */
    set: () => {
      if (!live()) return;
      const t = now(),
        o = out();
      noiseAt(t, 0.02, 0.14, 'bandpass', vary(2100), null, 2.2, o);
      noiseAt(t + 0.012, 0.02, 0.1, 'bandpass', vary(1800), null, 2.2, o);
      osc('triangle', vary(470), 330, t, 0.06, 0.08, o);
    },
    /** Spike / serve contact: palm slap + body thump, harder and brighter with power, whoosh tail for fast balls. */
    hit: pow => {
      if (!live()) return;
      const k = clamp(pow / 100, 0.3, 1.5),
        t = now(),
        o = out();
      noiseAt(t, 0.012, 0.55 * k, 'highpass', 4200, null, 0.8, o); // crack
      noiseAt(t, 0.035, 0.45 * k, 'bandpass', vary(2800), 1600, 1.2, o); // slap
      noiseAt(t, 0.08 + 0.06 * k, 0.25 * k, 'highpass', 1300 - 400 * k, null, 0.7, [o, SND.rev]);
      osc('sine', vary(210 - 40 * k), 50, t, 0.12 + 0.1 * k, 0.3 * k, SND.shape); // body
      osc('square', 260 - 60 * k, 55, t, 0.1 + 0.1 * k, 0.06 * k, SND.shape);
      if (pow >= 70) noiseAt(t + 0.02, 0.25 + 0.2 * k, 0.1 * k, 'bandpass', 3200, 600, 1.4, [o, SND.rev], 0.03); // air
      if (pow >= 95) noiseAt(t, 0.4, 0.16, 'bandpass', 500, 3200, 0.8, SND.rev, 0.02);
    },
    /** Block contact: stiff hands thwack + deep thud + net rattle. */
    block: () => {
      if (!live()) return;
      const t = now(),
        o = out();
      noiseAt(t, 0.03, 0.5, 'bandpass', 1300, 800, 1.4, o);
      osc('sine', 125, 48, t, 0.2, 0.42, [SND.shape, SND.rev]);
      sfx.net(0.6);
    },
    /** Net shaking: short metallic buzz. */
    net: (v = 1) => {
      if (!live()) return;
      const t = now(),
        o = out();
      for (let i = 0; i < 4; i++) noiseAt(t + i * 0.03, 0.08, 0.09 * v, 'bandpass', vary(3400, 0.2), null, 6, o);
      osc('sawtooth', 190, 170, t, 0.25, 0.03 * v, o);
    },
    floor: pow => {
      if (!live()) return;
      const k = clamp(pow / 100, 0.2, 1.5),
        t = now(),
        o = out();
      osc('sine', 95, 38, t, 0.18 + 0.18 * k, 0.25 + 0.2 * k, [o, SND.rev]);
      noiseAt(t, 0.14, 0.12 * k, 'lowpass', 450, null, 1, o);
      noiseAt(t, 0.02, 0.15 * k, 'highpass', 2500, null, 0.8, o);
    },
    bounce: () => {
      if (!live()) return;
      const t = now(),
        o = out();
      osc('sine', vary(140), 70, t, 0.08, 0.12, o);
      noiseAt(t, 0.03, 0.06, 'lowpass', 900, null, 1, o);
    },

    /* ---------- players ---------- */
    /** Shoe squeak on a hard cut. */
    squeak: () => {
      if (!live()) return;
      const t = now(),
        o = out(),
        f = vary(2300, 0.15),
        s = osc('sine', f, f * 1.35, t, vary(0.09, 0.3), 0.035, o, 0.01);
      const lfo = SND.ctx.createOscillator(),
        lg = SND.ctx.createGain();
      lfo.frequency.value = 38;
      lg.gain.value = f * 0.05;
      lfo.connect(lg);
      lg.connect(s.frequency);
      lfo.start(t);
      lfo.stop(t + 0.2);
    },
    /** Landing from a jump (heavier for bigger jumps). */
    land: h => {
      if (!live()) return;
      const k = clamp(h / 90, 0.3, 1.2),
        t = now(),
        o = out();
      osc('sine', vary(90), 45, t, 0.12, 0.2 * k, o);
      noiseAt(t, 0.06, 0.07 * k, 'lowpass', 500, null, 1, o);
    },
    /** Dive: body hits the floor and skids. */
    slide: () => {
      if (!live()) return;
      const t = now(),
        o = out();
      osc('sine', 80, 40, t, 0.16, 0.3, o);
      noiseAt(t + 0.02, 0.35, 0.14, 'bandpass', 900, 350, 0.9, o, 0.02);
      if (Math.random() < 0.5) setTimeout(() => sfx.squeak(), 120);
    },
    /** Ball call: a short two-syllable vocal blip, pitch per player. */
    voice: (seed = 0, excited = false) => {
      if (!live()) return;
      const c = SND.ctx,
        t = now(),
        base = 150 + (seed % 7) * 18 + (excited ? 40 : 0),
        g = c.createGain(),
        f1 = c.createBiquadFilter(),
        f2 = c.createBiquadFilter();
      f1.type = f2.type = 'bandpass';
      f1.frequency.value = 750;
      f2.frequency.value = 1250;
      f1.Q.value = f2.Q.value = 5;
      f1.connect(g);
      f2.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.14, t + 0.14);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      g.connect(out());
      g.connect(SND.rev);
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.25, t + 0.1);
      o.frequency.linearRampToValueAtTime(base * (excited ? 1.5 : 1.1), t + 0.28);
      o.connect(f1);
      o.connect(f2);
      o.start(t);
      o.stop(t + 0.32);
    },

    whistle: () => {
      if (!live()) return;
      const t = now(),
        o = out(),
        s = osc('square', 2900, 2900, t, 0.3, 0.03, o),
        s2 = osc('sine', 3100, 3100, t, 0.3, 0.07, o),
        lfo = SND.ctx.createOscillator(),
        lg = SND.ctx.createGain();
      lfo.frequency.value = 42; // pea trill
      lg.gain.value = 70;
      lfo.connect(lg);
      lg.connect(s.frequency);
      lg.connect(s2.frequency);
      lfo.start(t);
      lfo.stop(t + 0.35);
    },

    /* ---------- anime specials ---------- */
    whoosh: () => nz(0.45, 0.22, 'bandpass', 300, 1.2, 3500, 0.05),
    /** Slow motion in/out: the mix goes muffled and a low rush sweeps in; it opens back up when time returns. */
    slowmo: on => {
      if (!live() || !SND.lp) return;
      const t = SND.ctx.currentTime;
      SND.lp.frequency.cancelScheduledValues(t);
      SND.lp.frequency.setTargetAtTime(on ? 700 : 20000, t, on ? 0.06 : 0.09);
      if (on) nz(0.7, 0.16, 'lowpass', 180, 0.8, 60, 0.12);
    },
    /** Heartbeat for a staged moment (lub-dub). */
    heart: (v = 1) => {
      if (!live()) return;
      const t = now();
      osc('sine', 62, 40, t, 0.16, 0.5 * v, [SND.shape]);
      osc('sine', 55, 36, t + 0.2, 0.14, 0.36 * v, [SND.shape]);
    },
    /** Anime cut: a sharp swish + low hit when the camera snaps to a new shot. */
    cutShot: () => {
      if (!live()) return;
      nz(0.12, 0.12, 'highpass', 3000, 0.7, null, 0.004);
      osc('triangle', 180, 90, now(), 0.12, 0.12, out());
    },
    swish: () => nz(0.22, 0.14, 'bandpass', 2600, 2, 700, 0.02),
    /** Technique stinger — flavour by pack. */
    tech: pack => {
      if (!live()) return;
      const t = now(),
        o = out(),
        R = SND.rev;
      if (pack === 'Attack') {
        noiseAt(t, 0.18, 0.2, 'bandpass', 800, 6000, 1.5, [o, R], 0.01); // blade slash
        osc('sawtooth', 220, 880, t, 0.16, 0.05, [o, R]);
        osc('sine', 1760, 1760, t + 0.14, 0.4, 0.05, R);
      } else if (pack === 'Serve') {
        noiseAt(t, 0.35, 0.16, 'bandpass', 300, 2600, 1.2, [o, R], 0.2); // charge-up
        osc('triangle', 330, 990, t, 0.35, 0.06, [o, R], 0.2);
      } else if (pack === 'Defense') {
        [262, 392, 523].forEach((f, i) => osc('sine', f, f, t + i * 0.02, 0.5, 0.07, [o, R], 0.02)); // shield "vwom"
        noiseAt(t, 0.25, 0.08, 'lowpass', 900, 300, 1, o);
      } else {
        [880, 1175, 1480, 1760].forEach((f, i) => osc('triangle', f, f, t + i * 0.05, 0.22, 0.05, [o, R])); // sparkle
      }
    },
    /** Captain's buff: ascending power-up, one more step per level. */
    buff: lv => {
      if (!live()) return;
      const t = now(),
        o = out();
      [392, 523, 659, 784, 1047].slice(0, 2 + lv).forEach((f, i) => osc('square', f, f, t + i * 0.07, 0.12, 0.035, [o, SND.rev]));
      osc('sine', 200, 800, t, 0.1 + 0.07 * (2 + lv), 0.04, o);
    },
    /** Block-break drill: grinding, rising whine under the hit-stop. */
    drill: (d = 0.56) => {
      if (!live()) return;
      const c = SND.ctx,
        t = now(),
        o = out(),
        s = osc('sawtooth', 90, 260, t, d, 0.12, [o, SND.shape], 0.02),
        fm = c.createOscillator(),
        fg = c.createGain();
      fm.frequency.value = 55;
      fg.gain.value = 60;
      fm.connect(fg);
      fg.connect(s.frequency);
      fm.start(t);
      fm.stop(t + d + 0.05);
      noiseAt(t, d, 0.12, 'bandpass', 1200, 4200, 2, o, 0.02);
    },
    /** Stinger: impact + bright chord (banners). */
    stinger: () => {
      if (!live()) return;
      const t = now(),
        R = SND.rev;
      osc('sine', 110, 45, t, 0.35, 0.3, SND.shape);
      noiseAt(t, 0.3, 0.14, 'bandpass', 500, 4000, 1, [SND.master, R], 0.02);
      [523, 659, 784, 1047].forEach(f => osc('sawtooth', f, f, t + 0.04, 0.45, 0.022, [SND.master, R], 0.01));
    },
    shatter: () => {
      if (!live()) return;
      const t = now(),
        o = out();
      for (let i = 0; i < 6; i++) noiseAt(t + i * 0.035, 0.12, 0.28 - i * 0.03, 'highpass', 3500 + i * 600, null, 1.2, [o, SND.rev]);
      [1760, 2350, 3130, 2640].forEach((f, i) => osc('triangle', f, f * 0.9, t + i * 0.05, 0.35, 0.06, [o, SND.rev]));
      osc('sine', 90, 35, t, 0.5, 0.35, SND.shape);
    },
    zap: () => {
      nz(0.12, 0.25, 'highpass', 3000, 0.8);
      tone(1800, 0.12, 'sawtooth', 0.05, 300);
    },
    thunder: () => {
      nz(0.9, 0.35, 'lowpass', 260, 0.7, 80, 0.01);
      tone(60, 0.6, 'sine', 0.3, 30);
    },
    /** In the zone: riser into a power chord with a shimmer. */
    zone: () => {
      if (!live()) return;
      const t = now(),
        R = SND.rev;
      noiseAt(t, 0.4, 0.12, 'bandpass', 400, 5000, 1.2, [SND.master, R], 0.3);
      [131, 196, 262, 392].forEach(f => osc('sawtooth', f, f, t + 0.35, 1.0, 0.035, [SND.shape, R], 0.02));
      [523, 659, 784, 1047].forEach((f, i) => osc('triangle', f, f, t + 0.35 + i * 0.08, 0.35, 0.07, [SND.master, R]));
    }
  };
  return { SND, sfx, audioInit, toggleSound, setVolume, bgmStart, bgmStop, panAt, musicMood };
})();
const { SND, sfx, audioInit, toggleSound, setVolume, bgmStart, bgmStop, panAt, musicMood } = SOUND;
