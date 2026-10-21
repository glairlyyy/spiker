// Island sound (spec §4.37 5, T-334): synthesized ambience on the career map — nothing to download. It shares sfx.js's AudioContext
// and master bus (so the volume slider applies) and follows the sound toggle (SND.on). Layers, mixed by what lies under the camera:
// sea (water near the coast), gulls (the harbor, a little along the coast), murmur (towns and markets), thuds (ball on a court near
// the courts and venues), wind (the Spine and the highlands, and any wide view), insects (night, by MapModel.clock). Footsteps while
// you walk (avatar3d's WALK.onStep) and soft clicks on the hub's buttons. Started by the map (mapMount), stopped — every node
// stopped and disconnected, the context suspended — as soon as the map is gone. Presentation only: Math.random, never R().

const Ambience = (() => {
  const S = { on: false, bus: null, lay: null, nodes: new Set(), iv: 0, t: 0, walk: null, step: 0, click: 0, w: null };
  const MAP_M = 0.5, // metres per map unit (js/map3d/geo3d.mjs)
    TICK = 200, // ms between mixes
    GAIN = { sea: 0.22, murmur: 0.12, wind: 0.16, insects: 0.035 }, // each looped layer at full weight (into the master bus)
    COURTS = ['sand', 'dunes', 'pier', 'street']; // SPOTS with courts (plus every venue)
  const ctx = () => (SND.ctx && SND.ctx.state !== 'closed' ? SND.ctx : null);
  const keep = n => (S.nodes.add(n), n);
  /** A looped noise layer: noise → filter → gain (0) → the bus. */
  function noiseLayer(c, type, f, q) {
    const src = keep(c.createBufferSource()),
      fl = keep(c.createBiquadFilter()),
      g = keep(c.createGain());
    src.buffer = SND.noise;
    src.loop = true;
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    g.gain.value = 0;
    src.connect(fl);
    fl.connect(g);
    g.connect(S.bus);
    src.start(0, Math.random() * 1.5);
    return { src, fl, g };
  }
  /** The night insects: a high tone, amplitude-pulsed by a fast square LFO, into a gain (0) → the bus. */
  function insectLayer(c) {
    const o = keep(c.createOscillator()),
      am = keep(c.createGain()),
      lfo = keep(c.createOscillator()),
      depth = keep(c.createGain()),
      g = keep(c.createGain());
    o.frequency.value = 4300;
    lfo.type = 'square';
    lfo.frequency.value = 19;
    depth.gain.value = 0.5;
    am.gain.value = 0.5;
    g.gain.value = 0;
    lfo.connect(depth);
    depth.connect(am.gain);
    o.connect(am);
    am.connect(g);
    g.connect(S.bus);
    o.start();
    lfo.start();
    return { g, o };
  }
  /** One short sound into the bus (it stops itself): an oscillator glide or a filtered noise burst. */
  function blip(c, t, { type = 'sine', f0, f1, d, v, nz = null }) {
    const g = c.createGain(),
      p = c.createStereoPanner ? c.createStereoPanner() : null;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + Math.min(0.02, d / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    if (p) {
      p.pan.value = (Math.random() * 2 - 1) * 0.6;
      g.connect(p);
      p.connect(S.bus);
    } else g.connect(S.bus);
    let s;
    if (nz) {
      s = c.createBufferSource();
      const fl = c.createBiquadFilter();
      s.buffer = SND.noise;
      fl.type = nz.type;
      fl.frequency.value = nz.f;
      fl.Q.value = nz.q || 0.8;
      s.connect(fl);
      fl.connect(g);
      s.start(t, Math.random());
    } else {
      s = c.createOscillator();
      s.type = type;
      s.frequency.setValueAtTime(f0, t);
      s.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + d);
      s.connect(g);
      s.start(t);
    }
    s.stop(t + d + 0.05);
    s.onended = () => {
      try {
        g.disconnect();
        if (p) p.disconnect();
      } catch (e) {
        /* already gone */
      }
    };
  }
  const SOUNDS = {
    thud: (c, t, k) => {
      blip(c, t, { f0: 150 + Math.random() * 30, f1: 55, d: 0.16, v: 0.12 * k });
      blip(c, t, { d: 0.04, v: 0.05 * k, nz: { type: 'bandpass', f: 1800, q: 1.2 } });
    },
    gull: (c, t, k) => {
      const n = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++)
        blip(c, t + i * 0.22, { type: 'triangle', f0: 1500 + Math.random() * 300, f1: 950, d: 0.18, v: 0.035 * k });
    },
    step: (c, t, k) => {
      blip(c, t, { d: 0.05, v: 0.07 * k, nz: { type: 'lowpass', f: 520 + Math.random() * 200, q: 0.9 } });
      blip(c, t, { f0: 95, f1: 60, d: 0.06, v: 0.05 * k });
    },
    click: c => {
      const t = c.currentTime + 0.003;
      blip(c, t, { d: 0.012, v: 0.05, nz: { type: 'highpass', f: 3200 } });
      blip(c, t, { f0: 1900, f1: 1500, d: 0.03, v: 0.025 });
    }
  };
  /** The map point under the camera and how far out it is: { p, d } or null (no 3D map). */
  function view() {
    const v = MapView.m3 && MapView.m3.info ? MapView.m3.info().view : null;
    return v ? { p: [v.x / MAP_M, v.z / MAP_M], d: v.d } : null;
  }
  /** 0–1 time of day: the map's clock (T-332) when it exists; else night on the week's last day. */
  function clock(run) {
    if (typeof MapModel.clock === 'function') return MapModel.clock(run);
    return City.days(run) <= 1 ? 0.9 : 0.45;
  }
  const near = (p, q, r) => clamp(1 - Math.hypot(p[0] - q[0], p[1] - q[1]) / r, 0, 1);
  /** Distance from p to the nearest edge of polygon P. */
  function edge(p, P) {
    let best = Infinity;
    for (let i = 0; i < P.length; i++) {
      const [ax, ay] = P[i],
        [bx, by] = P[(i + 1) % P.length],
        dx = bx - ax,
        dy = by - ay,
        L2 = dx * dx + dy * dy || 1,
        t = clamp(((p[0] - ax) * dx + (p[1] - ay) * dy) / L2, 0, 1);
      best = Math.min(best, Math.hypot(p[0] - ax - dx * t, p[1] - ay - dy * t));
    }
    return best;
  }
  /** The layers' weights (0–1) at map point p, view distance d (m), time of day k. Pure. */
  function weights(run, p, d, k) {
    const land = City.onLand(p),
      sea = land ? clamp(1 - edge(p, CITY.coast) / 260, 0, 1) : 1,
      far = clamp((d - 140) / 320, 0, 1),
      night = k >= 0.78 || k <= 0.1 ? 1 : 0,
      town = { city: 1, oldtown: 1, fishing: 0.9, shacks: 0.8, works: 0.5, campus: 0.6, compound: 0.3, terrace: 0.35, beach: 0.4 };
    let murmur = 0,
      gulls = sea * 0.2,
      courts = 0;
    for (const D of DISTRICTS) {
      if (inPoly(p, MapModel.districtPoly(D))) murmur = Math.max(murmur, town[D.style] || 0);
      if (D.id === 'wu-harbor' && D.poly.x != null) gulls = Math.max(gulls, near(p, [D.poly.x, D.poly.y], 320)); // the quays and the fish market
    }
    for (const id of COURTS) if (SPOTS[id] && SPOTS[id].at) courts = Math.max(courts, near(p, City.at(run, id), 220));
    for (const v of Object.values(VENUES)) courts = Math.max(courts, near(p, v.at, 220));
    const relief = typeof reliefAt === 'function' ? reliefAt(p) : 0,
      wind = clamp(relief / 60 + (City.regionAt(p) === 'shu' ? 0.25 : 0) + far * 0.5, 0, 1),
      local = 1 - 0.75 * far;
    return {
      sea: sea * (0.5 + 0.5 * local),
      gulls: gulls * local * (night ? 0.15 : 1),
      murmur: murmur * local * (night ? 0.35 : 1),
      thuds: courts * local * (night ? 0.3 : 1),
      wind,
      insects: night * (land ? 1 - 0.6 * murmur : 0.2) * (0.4 + 0.6 * local)
    };
  }
  function tick() {
    const c = ctx();
    if (!S.on) return;
    if (G.view !== 'career' || !document.querySelector('#mapwrap') || !c) return stop();
    const run = typeof RUN !== 'undefined' ? RUN : null,
      v = view();
    S.t += TICK / 1000;
    const W = run && v ? weights(run, v.p, v.d, clock(run)) : { sea: 0, gulls: 0, murmur: 0, thuds: 0, wind: 0, insects: 0 },
      t = c.currentTime,
      L = S.lay;
    S.w = W;
    S.bus.gain.setTargetAtTime(SND.on ? 1 : 0, t, 0.1);
    L.sea.g.gain.setTargetAtTime(GAIN.sea * W.sea * (0.65 + 0.35 * Math.sin(S.t * 0.9)), t, 0.4); // the waves come and go
    L.murmur.g.gain.setTargetAtTime(GAIN.murmur * W.murmur * (0.8 + 0.4 * Math.random()), t, 0.25);
    L.murmur.fl.frequency.setTargetAtTime(420 + 260 * Math.random(), t, 0.3);
    L.wind.g.gain.setTargetAtTime(GAIN.wind * W.wind * (0.6 + 0.4 * Math.sin(S.t * 0.37)), t, 0.6);
    L.wind.fl.frequency.setTargetAtTime(380 + 520 * (0.5 + 0.5 * Math.sin(S.t * 0.23)), t, 0.8);
    L.insects.g.gain.setTargetAtTime(GAIN.insects * W.insects * (Math.random() < 0.7 ? 1 : 0.2), t, 0.08);
    if (!SND.on) return;
    if (W.thuds > 0.05 && Math.random() < 0.35 * W.thuds) SOUNDS.thud(c, t + Math.random() * 0.15, W.thuds);
    if (W.gulls > 0.1 && Math.random() < 0.06 * W.gulls) SOUNDS.gull(c, t + Math.random() * 0.1, W.gulls);
  }
  /** Resume the context on the first gesture (a page load without one starts it suspended). */
  function wake() {
    if (S.on && SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
  }
  function onClick(e) {
    const c = ctx();
    if (!S.on || !SND.on || !c || !e.target.closest || !e.target.closest('.hub button')) return;
    if (Date.now() - S.click > 40) SOUNDS.click(c);
    S.click = Date.now();
  }
  /** Start with the map (idempotent). */
  function start() {
    if (S.on || typeof document === 'undefined') return;
    audioInit();
    const c = ctx();
    if (!c || !SND.master || !SND.noise) return;
    S.on = true;
    S.bus = keep(c.createGain());
    S.bus.gain.value = SND.on ? 1 : 0;
    S.bus.connect(SND.master);
    S.lay = {
      sea: noiseLayer(c, 'lowpass', 420, 0.6),
      murmur: noiseLayer(c, 'bandpass', 520, 0.9),
      wind: noiseLayer(c, 'bandpass', 600, 1.3),
      insects: insectLayer(c)
    };
    S.iv = setInterval(tick, TICK);
    addEventListener('pointerdown', wake, true);
    addEventListener('keydown', wake, true);
    addEventListener('click', onClick, true);
    tick();
  }
  /** Stop: every node stopped and disconnected, the listeners gone, the context suspended unless a match is using it. */
  function stop() {
    if (!S.on) return;
    S.on = false;
    clearInterval(S.iv);
    removeEventListener('pointerdown', wake, true);
    removeEventListener('keydown', wake, true);
    removeEventListener('click', onClick, true);
    for (const n of S.nodes) {
      try {
        if (n.stop) n.stop();
      } catch (e) {
        /* not started / already stopped */
      }
      try {
        n.disconnect();
      } catch (e) {
        /* already disconnected */
      }
    }
    S.nodes.clear();
    S.bus = S.lay = S.w = null;
    if (SND.ctx && SND.ctx.state === 'running' && G.view !== 'match') SND.ctx.suspend().catch(() => {});
  }
  /** Footsteps from your walk (avatar3d's WALK; at most one every 90 ms — a time-lapse walk would rattle). */
  function bind(W) {
    S.walk = W;
    W.onStep = gait => {
      const c = ctx();
      if (!S.on || !SND.on || !c || Date.now() - S.step < 90) return;
      S.step = Date.now();
      SOUNDS.step(c, c.currentTime + 0.003, clamp(gait / 4, 0.5, 1));
    };
  }
  return {
    start,
    stop,
    bind,
    weights,
    /** Live nodes (0 when stopped) and whether it plays — for the UI smoke and QA. */
    nodes: () => S.nodes.size,
    get on() {
      return S.on;
    },
    /** The last mix (QA): the layers' weights. */
    mix: () => S.w && { ...S.w }
  };
})();
