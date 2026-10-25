#!/usr/bin/env node
// UI smoke test (T-231): opens the real page in headless Chromium and walks every screen once — title, a new career's hub,
// the four sheets, the squad strip, every place card, the Encyclopedia, the VFX lab, a simmed court match's result card and a Monster game to its result.
// Fails on any page error or Debug-log error line. Not part of `npm test` (it needs Chromium): `npm run test:ui`.
// Playwright is the preinstalled one (local node_modules, else the global install) — never `playwright install`.
const http = require('http'),
  fs = require('fs'),
  path = require('path'),
  { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
function playwright() {
  try {
    return require('playwright');
  } catch {
    return require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  }
}
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
};
/** A static file server for the repo on a free port (the page reads node_modules three on localhost). */
function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(ROOT)) return res.writeHead(403).end();
    fs.readFile(p, (err, buf) => {
      if (err) return res.writeHead(404).end();
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok(srv)));
}

const steps = [];
/** Week time (days) as "day d, hh:00" for the step notes. */
const City_h = w => `day ${Math.floor(w) + 1}, ${String(Math.round((w % 1) * 24)).padStart(2, '0')}:00`;
const step = async (name, fn) => {
  if (process.env.UI_ONLY && !process.env.UI_ONLY.split('|').some(k => name.includes(k)) && name !== 'title screen') return; // UI_ONLY=Monster: one step alone ('new career|running clock': several)
  const t0 = Date.now();
  try {
    const note = await fn();
    steps.push([true, name, Date.now() - t0, note || '']);
  } catch (e) {
    steps.push([false, name, Date.now() - t0, String((e && e.message) || e).split('\n')[0]]);
  }
};

(async () => {
  const srv = await serve(),
    url = `http://localhost:${srv.address().port}/index.html`,
    { chromium } = playwright(),
    browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }),
    pg = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
    errors = [];
  pg.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  pg.setDefaultTimeout(60000);
  const ev = (fn, arg) => pg.evaluate(fn, arg);

  await step('title screen', async () => {
    await pg.goto(url);
    await pg.waitForFunction(() => document.querySelector('#app') && document.querySelector('#app').textContent.length > 20);
  });
  await step('new career → hub', async () => {
    await ev(() => openCareer());
    await pg.waitForFunction(() => typeof CR !== 'undefined' && CR && CR.draft);
    await ev(() => crStart());
    await pg.waitForFunction(() => document.querySelector('.career.hub'));
    // out of the story's first scenes and week 1's campus fence, into an ordinary training week
    await ev(() => {
      RUN.story = { ...(RUN.story || {}), cur: null, meet: null };
      RUN.mode.story = false;
      RUN.week = 6;
      RUN.event = null;
      RUN.clock = City.freshClock();
      RUN.money = 3000;
      CLOCK.scale = 3; // the running clock (spec §4.43): a game hour in 3 s, not 90 (walks play in real time)
      MapView.CLK.hold = true; // (…and idle hours don't pass between the steps: the running clock's own step lets them)
      renderCareer();
    });
  });
  for (const k of ['me', 'people', 'world', 'season'])
    await step(`sheet ${k}`, async () => {
      await ev(k => hubOpen(k), k);
      const txt = await ev(() => (document.querySelector('.hub .sheet') || {}).textContent || '');
      await ev(() => hubOpen(null));
      if (txt.length < 20) throw new Error('the sheet did not render');
      // the Me sheet (spec §4.33): the body's four bars, then the court skills with the swing gauge
      if (k === 'me' && !(/Strength/.test(txt) && /Flexibility/.test(txt) && /Swing/.test(txt) && /Power/.test(txt)))
        throw new Error('the Me sheet has no body / court / swing');
    });
  await step('squad strip (spec §4.36): a close teammate in the top bar, a click opens their card', async () => {
    const r = await ev(() => {
      const m = Run.mates(RUN)[0];
      Rel.push(RUN, Rel.key(RUN.youId, m.id), m.id, 'event', 30, m.id);
      renderCareer();
      const b = document.querySelectorAll('.hub .tbar .tcircle .tcm');
      if (!b.length) return 'no strip';
      if (!b[0].classList.contains('mate') || !b[0].querySelector('.bbar')) return 'no teammate ring / bond bar';
      b[0].click();
      const ok = CW.sheet === 'people' && CW.person === m.id;
      hubOpen(null);
      return ok ? '' : 'the click did not open their card';
    });
    if (r) throw new Error(r);
  });
  await step('every place card', () =>
    ev(() => {
      const ids = [
        ...Object.keys(SPOTS),
        ...RUN.teams.map((t, i) => `hq${i}`),
        ...Object.keys(VENUES).map(v => `venue:${v}`),
        MapModel.ptId(City.pos(RUN))
      ];
      const bad = [];
      for (const id of ids) {
        try {
          if (!spotPanel(RUN, id)) bad.push(`${id}: empty`);
        } catch (e) {
          bad.push(`${id}: ${e.message}`);
        }
      }
      // day orders (spec §4.33): a kit place lists its orders (one ink primary), Stretch at home and at any map point
      const hb = spotPanel(RUN, 'harbor'),
        pt = spotPanel(RUN, MapModel.ptId(City.pos(RUN)));
      if (!/Heavy sets/.test(hb) || !/Haul crates/.test(hb) || (hb.match(/btn ord hot/g) || []).length > 1) bad.push('harbor: orders');
      if (!/Stretch/.test(spotPanel(RUN, 'home')) || !/Stretch/.test(pt)) bad.push('Stretch at home / a point');
      for (const id of ids.filter(i => !i.startsWith('pt:')))
        // every place (T-355): its 1/2/3 h picker and the order, cost → result
        if (!/Stretch/.test(spotPanel(RUN, id)) || !/seg hrs/.test(spotPanel(RUN, id))) bad.push(`${id}: no Stretch`);
      mapPick('venue:arena'); // and one rendered for real
      if (!document.querySelector('#spot').textContent.includes('Court match')) bad.push('venue card: no court match');
      mapPick(null);
      if (bad.length) throw new Error(bad.join('; '));
      return `${ids.length} cards`;
    })
  );
  await step('island map (spec §4.37): hover a named figure → their name; a night-time map', async () => {
    await pg.waitForFunction(() => MapView.m3 && MapView.m3.info().calls > 0, null, { timeout: 120000 });
    await ev(() => {
      for (const id of Object.keys(SPOTS)) if (SPOTS[id].at) RUN.fog.push(City.at(RUN, id));
      RUN.fog.push(...CITY.hq);
      renderCareer();
      if (document.querySelector('[onclick="briefDone()"]')) briefDone(); // the week's brief card covers the map
      const p = MapView.model.life.people.find(q => q.g !== 'grey' && q.spot);
      if (p) MapView.select(p.spot);
    });
    // a named figure on screen and not under a card or a pin, the camera at rest
    const hit = await pg
      .waitForFunction(
        () => {
          const c = document.querySelector('#mapwrap canvas'),
            r = c.getBoundingClientRect(),
            v = JSON.stringify(MapView.m3.info().view),
            still = window.__mapView === v; // the camera has finished its flight (frames are slow here)
          window.__mapView = v;
          if (!still) return null;
          for (const q of MapView.model.life.people) {
            const s = q.g !== 'grey' && MapView.m3.figureAt(q.id),
              x = s && r.left + s[0],
              y = s && r.top + s[1];
            if (s && s[0] > 20 && s[1] > 20 && s[0] < r.width - 20 && s[1] < r.height - 20 && document.elementFromPoint(x, y) === c)
              return { id: q.id, name: People.find(RUN, q.id).name, x, y };
          }
          return null;
        },
        null,
        { timeout: 60000 }
      )
      .then(h => h.jsonValue())
      .catch(async () => {
        const d = await ev(() => MapView.m3 && { life: MapView.m3.info().life, clock: MapView.m3.clock(), view: MapView.m3.info().view });
        throw new Error(`no named figure to hover: ${JSON.stringify(d)}`);
      });
    const f = hit,
      at = [hit.x, hit.y];
    await pg.mouse.move(at[0], at[1]);
    await pg.waitForFunction(() => document.querySelector('.maptip') && document.querySelector('.maptip').style.display === 'block', null, {
      timeout: 60000
    });
    const tip = await ev(() => document.querySelector('.maptip').textContent);
    if (!tip.includes(f.name)) throw new Error(`the tip shows "${tip}", not ${f.name}`);
    await pg.mouse.move(2, 2);
    // the week spent: night falls on the map (the sun down, the night lights on)
    await ev(() => {
      RUN.clock.day = 8;
      renderCareer();
      MapView.m3.setClock(MapModel.weekTime(RUN) - 0.1);
    });
    await pg.waitForFunction(() => MapView.m3.clock().lit > 0.6, null, { timeout: 30000 });
    const n = await ev(() => MapView.m3.info().night);
    await ev(() => {
      RUN.clock = City.freshClock();
      RUN.dayLog = [];
      renderCareer();
    });
    return `tip: ${tip.slice(0, 60)}; night lights ${n.win} windows, ${n.lamp} lamps, ${n.flood} courts`;
  });
  await step(
    'facilities (spec §4.40, T-351): no pins; hover a gym → it lights up with its tag; a click → its popup beside it',
    async () => {
      const pins = await ev(() => document.querySelectorAll('.mpin, .pin').length);
      if (pins) throw new Error(`${pins} pins in the DOM`);
      await ev(() => {
        mapPick(null);
        const a = City.at(RUN, 'weiPower');
        RUN.fog.push(a.slice());
        renderCareer();
        MapView.m3.setView({ x: a[0] * 0.5, z: a[1] * 0.5, d: 90 });
      });
      const p = await pg
        .waitForFunction(
          () => {
            const c = document.querySelector('#mapwrap canvas'),
              r = c.getBoundingClientRect(),
              v = JSON.stringify(MapView.m3.info().view),
              still = window.__facView === v;
            window.__facView = v;
            const s = still && MapView.m3.facilityAt('weiPower');
            return s && document.elementFromPoint(r.left + s[0], r.top + s[1]) === c ? [r.left + s[0], r.top + s[1]] : null;
          },
          null,
          { timeout: 60000 }
        )
        .then(h => h.jsonValue());
      await pg.mouse.move(p[0], p[1]);
      await pg.waitForFunction(
        () => MapView.m3.facHover().id === 'weiPower' && document.querySelector('.mtag').style.display !== 'none',
        null,
        {
          timeout: 60000
        }
      );
      const tag = await ev(() => document.querySelector('.mtag').textContent);
      if (!/Dynasty Strength Center/.test(tag) || !/walk|Here/.test(tag)) throw new Error(`tag: ${tag}`);
      await pg.mouse.click(p[0], p[1]);
      await pg.waitForFunction(() => CW.spot === 'weiPower' && document.querySelector('#spot.open'), null, { timeout: 60000 });
      const side = await ev(() => {
        const a = document.querySelector('.maplay .manchor').getBoundingClientRect(),
          c = document.querySelector('#spot').getBoundingClientRect();
        return c.left >= a.right || c.right <= a.left
          ? 'beside'
          : `over (${Math.round(a.left)}–${Math.round(a.right)} vs ${Math.round(c.left)}–${Math.round(c.right)})`;
      });
      await ev(() => mapPick(null));
      await pg.mouse.move(2, 2);
      if (side !== 'beside') throw new Error(`the popup is not beside the building: ${side}`);
      return `tag: ${tag}; popup ${side}`;
    }
  );
  await step('the figure menu (T-340): right-click a figure → the menu → Talk → a diary line', async () => {
    await ev(() => MapView.m3.setClock(Math.floor(MapModel.weekTime(RUN)) + 0.5)); // noon: people stand at their places (it holds there)
    const hit = await pg
      .waitForFunction(
        () => {
          if (CW.lock || document.querySelector('.hubmodal')) return null;
          const c = document.querySelector('#mapwrap canvas'),
            r = c.getBoundingClientRect(),
            v = JSON.stringify(MapView.m3.info().view),
            tod = MapView.m3.clock().tod,
            still = window.__mapView2 === v; // the camera at rest (frames are slow here)
          window.__mapView2 = v;
          if (!still || tod < 0.34 || tod > 0.74) return null;
          for (const q of MapView.model.life.people) {
            const R0 = Encounter.row(RUN, q.id, 'talk'),
              s = R0 && !R0.why && MapView.m3.figureAt(q.id),
              x = s && r.left + s[0],
              y = s && r.top + s[1];
            if (s && s[0] > 20 && s[1] > 20 && s[0] < r.width - 20 && s[1] < r.height - 20 && document.elementFromPoint(x, y) === c)
              return { id: q.id, x, y };
          }
          return null;
        },
        null,
        { timeout: 60000 }
      )
      .then(h => h.jsonValue());
    for (let i = 0; i < 4; i++) {
      // (they hop and jog: aim where the figure is now)
      const at = await ev(h => {
        const s = MapView.figureAt(h.id);
        return s || [h.x, h.y];
      }, hit);
      await pg.mouse.move(at[0], at[1]);
      await pg.mouse.click(at[0], at[1], { button: 'right', force: true });
      if (await pg.waitForFunction(() => document.getElementById('figmenu'), null, { timeout: 8000 }).catch(() => null)) break;
    }
    if (!(await ev(() => !!document.getElementById('figmenu')))) {
      const d = await ev(id => ({ fig: CW.fig, lock: !!CW.lock, off: Encounter.menuOff(RUN), who: !!Encounter.who(RUN, id) }), hit.id);
      throw new Error(`no menu after a right-click: ${JSON.stringify(d)}`);
    }
    const m = await ev(() => ({
      rows: document.querySelectorAll('#figmenu .fmo > li').length,
      pri: document.querySelectorAll('#figmenu .btn.hot').length,
      txt: document.getElementById('figmenu').textContent
    }));
    if (m.rows !== 5 || m.pri !== 1 || !/Talk/.test(m.txt) || !/Card/.test(m.txt))
      throw new Error(`menu: ${m.rows} rows, ${m.pri} primaries: ${m.txt.slice(0, 120)}`);
    await pg.keyboard.press('1'); // Talk: walk over, then their line and the diary's
    await pg.waitForFunction(() => CW.lock && CW.lock.phase === 'greet', null, { timeout: 90000 });
    const g = await ev(() => ({ box: document.querySelector('#actlock').textContent, log: RUN.log.slice(0, 2).map(l => l.t) }));
    if (!g.log.some(t => g.box.includes(t.replace(/ \(.*\)$/, '')))) throw new Error(`the box: ${g.box.slice(0, 120)}`);
    await pg.keyboard.press('Space');
    await pg.waitForFunction(() => !CW.lock, null, { timeout: 30000 });
    return g.log[0].slice(0, 70);
  });
  await step('the day in hours (T-353): the 24 h strip, train 3 h, walk, Sleep 6 h, a new day', async () => {
    await pg.waitForFunction(() => MapView.m3 && MapView.m3.info().calls > 0, null, { timeout: 240000 }); // (the map's first frames hold the page)
    const pref = await ev(() => {
      const was = Encounter.pref();
      Encounter.setPref('never'); // (no road stop in this step)
      RUN.clock = City.freshClock();
      RUN.dayLog = [];
      RUN.event = null;
      RUN.sta = RUN.staMax;
      RUN.injury = null;
      City.moveTo(RUN, City.at(RUN, 'harbor').slice());
      CW.briefWeek = briefKey(RUN);
      renderCareer();
      return was;
    });
    const bad = [];
    const r0 = await ev(() => {
      const st = document.querySelector('.wrail .dstrip');
      CW.hrs = 3;
      mapPick('harbor');
      const card = document.querySelector('#spot').textContent,
        seg = [...document.querySelectorAll('#spot .seg.hrs .btn')]
          .map(b => b.textContent + (b.classList.contains('on') ? '*' : ''))
          .join(','),
        ghost = document.querySelectorAll('.wrail .dstrip .db.ghost').length;
      return { strip: !!st && !!st.querySelector('.dnow'), seg, heavy: /Heavy sets[\s\S]*3 h/.test(card), ghost };
    });
    if (!r0.strip) bad.push('no 24 h strip with the hour now');
    if (r0.seg !== '2 h,3 h*,4 h') bad.push(`hour picker: ${r0.seg}`);
    if (!r0.heavy) bad.push('Heavy sets does not show 3 h');
    if (!r0.ghost) bad.push('no ghost block for the selected order');
    await ev(() => mapGo('harbor', 'heavy', 3));
    await pg.waitForFunction(() => !CW.lock, null, { timeout: 180000 });
    const r1 = await ev(() => ({
      log: RUN.clock.log.map(b => `${b.k}:${b.h}`).join(','),
      done: document.querySelectorAll('.wrail .dstrip .db.done').length
    }));
    if (!/train:3/.test(r1.log) || !r1.done) bad.push(`trained 3 h: ${JSON.stringify(r1)}`);
    const h0 = await ev(() => {
      RUN.event = null; // (a session may raise a gift's ask: spec §4.35)
      const h = City.hour(RUN),
        p = City.at(RUN, 'acaGym');
      mapTravel(p[0], p[1]);
      return h;
    });
    await pg.waitForFunction(() => !CW.lock, null, { timeout: 180000 });
    const h1 = await ev(() => City.hour(RUN));
    if (!(h1 > h0)) bad.push(`the walk did not move the clock (${h0} → ${h1})`);
    const r2 = await ev(() => {
      RUN.event = null;
      RUN.sta = 20;
      mapPick('home');
      const txt = document.querySelector('#spot').textContent,
        pri = document.querySelectorAll('#spot .btn.hot').length;
      return { sleep: ['8', '6', '4'].every(h => txt.includes(`Sleep ${h} h`)), pri };
    });
    if (!r2.sleep || r2.pri !== 1) bad.push(`home card: ${JSON.stringify(r2)}`);
    await ev(() => mapGo('home', null, 6));
    await pg.waitForFunction(() => !CW.lock, null, { timeout: 180000 });
    const r3 = await ev(() => ({
      day: RUN.clock.day,
      track: document.querySelectorAll('.wrail #wdays .dslot.done').length,
      head: document.querySelector('.wrail .wweek .wh').textContent,
      clock: (document.getElementById('mapclock') || {}).textContent || ''
    }));
    if (r3.day !== 2 || r3.track !== 1 || !/Tue/.test(r3.head)) bad.push(`after the sleep: ${JSON.stringify(r3)}`);
    await ev(p => {
      Encounter.setPref(p);
      mapPick(null);
      RUN.clock = City.freshClock();
      RUN.dayLog = [];
      RUN.sta = RUN.staMax;
      renderCareer();
    }, pref);
    if (bad.length) throw new Error(bad.join('; '));
    return `${r1.log} · walk ${h0} → ${h1} h · slept 6 h: ${r3.head.trim()} · map clock ${r3.clock}`;
  });
  await step(
    'the running clock (T-365): pause / speeds, idle time runs, Space pauses, a session fast-forwards, Esc cuts it short',
    async () => {
      const bad = [];
      await pg.waitForFunction(() => MapView.m3 && MapView.m3.info().calls > 0, null, { timeout: 240000 });
      await ev(() => {
        RUN.clock = City.freshClock();
        RUN.dayLog = [];
        RUN.event = null;
        RUN.sta = RUN.staMax;
        RUN.injury = null;
        CW.spot = null;
        CW.briefWeek = briefKey(RUN);
        City.moveTo(RUN, City.at(RUN, 'harbor').slice());
        renderCareer();
        MapView.m3.jump();
        MapView.CLK.hold = false;
        MapView.setWalk(4);
        renderCareer();
      });
      const ui = await ev(() => ({
        pause: !!document.getElementById('tpause'),
        sp: [...document.querySelectorAll('.mapwalk .tsp')].map(b => b.textContent + (b.classList.contains('on') ? '*' : '')).join(',')
      }));
      if (!ui.pause || ui.sp !== '×1,×2,×4*') bad.push(`the clock's controls: ${JSON.stringify(ui)}`);
      const h0 = await ev(() => City.hour(RUN));
      await pg.waitForTimeout(3000);
      const h1 = await ev(() => City.hour(RUN));
      if (!(h1 > h0)) bad.push(`idle time did not run (${h0} → ${h1}: ${await ev(() => MapView.stopped() || 'runs')})`);
      await pg.keyboard.press('Space');
      const h2 = await ev(() => City.hour(RUN));
      await pg.waitForTimeout(1500);
      const p = await ev(() => ({
        h: City.hour(RUN),
        paused: MapView.CLK.paused,
        btn: document.getElementById('tpause').getAttribute('aria-pressed')
      }));
      if (!p.paused || p.h !== h2 || p.btn !== 'true') bad.push(`Space did not pause: ${JSON.stringify(p)}`);
      await pg.keyboard.press('Space');
      await ev(() => {
        MapView.setWalk(1);
        mapGo('harbor', 'heavy', 4);
      });
      await pg.waitForFunction(() => CW.lock && CW.lock.phase === 'ff' && document.getElementById('ffbadge'), null, { timeout: 60000 });
      const badge = await ev(() => document.getElementById('ffbadge').textContent);
      if (!/⏩/.test(badge)) bad.push(`no ⏩ badge: ${badge}`);
      await pg.waitForFunction(() => CW.lock && CW.lock.ff && CW.lock.ff.done > 1.2, null, { timeout: 60000 });
      await pg.keyboard.press('Escape');
      await pg.waitForFunction(() => !CW.lock || CW.lock.phase === 'done', null, { timeout: 30000 });
      const r = await ev(() => ({
        line: RUN.log[0] && RUN.log[0].t,
        train: RUN.clock.log
          .filter(b => b.k === 'train')
          .map(b => b.h)
          .join()
      }));
      if (!/stopped after/.test(r.line || '') || !/^[1-3]$/.test(r.train))
        bad.push(`Esc did not cut the session short: ${JSON.stringify(r)}`);
      await ev(() => {
        if (CW.lock) lockEnd();
        MapView.CLK.hold = true;
        RUN.clock = City.freshClock();
        RUN.sta = RUN.staMax;
        renderCareer();
      });
      if (bad.length) throw new Error(bad.join('; '));
      return `idle +${Math.round((h1 - h0) * 60)} game min in 3 s at ×4 · ${badge} · ${r.line}`;
    }
  );
  await step('street level (T-336a): zoom down at the gym, walk with a click, zoom back out', async () => {
    const back = await ev(() => City.pos(RUN).slice()); // (put back at the end: the road step walks from there)
    const at = await ev(() => {
      RUN.clock = City.freshClock();
      RUN.dayLog = [];
      CW.spot = null;
      City.moveTo(RUN, ROADS.nodes.jW1.slice()); // the junction on the main road by the Dynasty Strength Center
      renderCareer();
      MapView.m3.jump(); // (no walk there: frames are slow here)
      return City.pos(RUN).slice();
    });
    await pg.waitForFunction(() => !MapView.busy() && !CW.lock, null, { timeout: 60000 });
    await ev(() => {
      const y = MapView.m3.youPos();
      MapView.m3.setView({ x: y[0], z: y[2], d: 6.7 });
    });
    await pg
      .waitForFunction(() => MapView.m3.street() > 0.95 && MapView.m3.info().ring && MapView.m3.info().ring.on, null, { timeout: 120000 })
      .catch(async () => {
        throw new Error(
          `not at street level: ${JSON.stringify(await ev(() => ({ s: MapView.m3.street(), view: MapView.m3.info().view, ring: MapView.m3.info().ring })))}`
        );
      });
    // streaming (T-364): only the near blocks drawn in full once they are ready; the "Loading…" pill comes and goes
    await pg
      .waitForFunction(
        () => {
          const s = MapView.m3.info().stream;
          return s && s.on && s.near > 0 && !s.hold;
        },
        null,
        { timeout: 120000 }
      )
      .catch(async () => {
        throw new Error(`the near blocks never showed: ${JSON.stringify(await ev(() => MapView.m3.info().stream))}`);
      });
    const pill = await ev(() => {
      MapView.streamWait(true);
      const t = (document.querySelector('#mapwrap .mapload') || {}).textContent;
      MapView.streamWait(false);
      return [t, !!document.querySelector('#mapwrap .mapload')];
    });
    if (pill[0] !== 'Loading…' || pill[1]) throw new Error(`the Loading pill: ${pill}`);
    const st = await ev(() => ({
      ms: MapView.m3.bench(3),
      ring: MapView.m3.info().ring,
      vrm: MapView.m3.info().life.vrm,
      stream: MapView.m3.info().stream
    }));
    // a click on the ground ahead: a map-point travel (the same rules as the point card's Walk)
    const c = await ev(() => {
      const r = document.querySelector('#mapwrap canvas').getBoundingClientRect();
      return [r.left + r.width * 0.5, r.top + r.height * 0.4];
    });
    await pg.mouse.move(c[0], c[1]);
    await pg.waitForTimeout(3000); // (the hover pick runs every few frames: nobody under the pointer before the click)
    await pg.mouse.click(c[0], c[1]);
    await pg
      .waitForFunction(p => City.pos(RUN)[0] !== p[0] || City.pos(RUN)[1] !== p[1], at, { timeout: 30000 })
      .catch(() => {
        throw new Error(`the click did not travel (street ${MapView.m3 && MapView.m3.street()})`);
      });
    await ev(() => MapView.m3.jump()); // (the walk itself shows in QA; here only its end)
    await pg.waitForFunction(() => !MapView.busy() && !CW.lock, null, { timeout: 120000 });
    const days = await ev(() => City.hour(RUN) - DAY.wake);
    await ev(() => MapView.m3.setView({ d: 110 })); // (back out to the map, as the walk camera leaves it)
    await ev(p => {
      City.moveTo(RUN, p);
      renderCareer();
      MapView.m3.jump();
    }, back);
    await pg.waitForFunction(() => MapView.m3.street() === 0 && !MapView.m3.info().ring.on && !MapView.m3.info().stream.on, null, {
      timeout: 120000
    });
    return `${st.ms} ms a frame at street level (ring ${st.ring.lots} lots, ${Math.round(st.ring.tris / 1000)}k tris, built in ${st.ring.ms} ms; ${st.vrm} VRMs; ${st.stream.near} near blocks); the walk took ${days} h`;
  });
  // the living island, Agent E (spec §4.37 3–5): a stop on the road, the short cut, the island's sound
  await step('the road (T-333): a stop on the way — the card over the map, Space walks on', async () => {
    await pg.waitForFunction(() => typeof ROAD !== 'undefined' && ROAD.mod && MapView.m3, null, { timeout: 60000 });
    const c = await ev(() => {
      RUN.clock = City.freshClock();
      RUN.event = null;
      for (const id of Object.keys(SPOTS)) City.reveal(RUN, City.at(RUN, id));
      for (const h of CITY.hq) City.reveal(RUN, h);
      const N = Encounter.near(RUN),
        c = N.find(x => x.kind === 'circle') || N[0],
        from = City.pos(RUN),
        to = Object.keys(SPOTS)
          .map(id => City.at(RUN, id))
          .filter(p => City.onLand(p) && !City.outside(RUN, p) && Math.hypot(p[0] - from[0], p[1] - from[1]) > 4 * ENC.min)
          .sort((a, b) => Math.hypot(a[0] - from[0], a[1] - from[1]) - Math.hypot(b[0] - from[0], b[1] - from[1]))[0]; // a short walk
      if (!c || !to) return null;
      MapView.setWalk(4); // (a software GPU: frames are slow)
      LOCK.max = 120000; // (let the walk reach the stop)
      Encounter.force = c.key; // (the hash would decide in play)
      mapTravel(to[0], to[1]);
      return c.kind;
    });
    if (!c) throw new Error('nobody on the map to meet');
    await pg.waitForFunction(() => CW.lock && CW.lock.phase === 'enc', null, { timeout: 90000 });
    const r = await ev(() => ({
      txt: document.querySelector('#actlock').textContent,
      held: !!ROAD.mod.WALK.held,
      pri: document.querySelectorAll('#actlock .fmenu .btn.hot').length
    }));
    if (!/Walk on/.test(r.txt) || r.pri !== 1) throw new Error(`encounter card: ${r.txt.slice(0, 160)} (${r.pri} primaries)`);
    await pg.keyboard.press('Space');
    await pg.waitForFunction(() => !CW.lock, null, { timeout: 90000 });
    await ev(() => (Encounter.force = null));
    return `${c}, ${r.held ? 'stopped mid-walk' : 'met on arrival'}`;
  });
  await step('effort (T-335): a short cut on the place card (R)', async () => {
    const alt = await ev(() => {
      RUN.clock = City.freshClock();
      for (const id of Object.keys(SPOTS)) {
        CW.spot = id;
        roadSync(RUN);
        if (!ROAD.alt) continue;
        mapPick(id);
        const ok = document.querySelectorAll('#spot .proute .seg .btn').length === 2;
        return ok ? id : `${id}: no route row`;
      }
      CW.spot = null;
      return '';
    });
    if (alt && / /.test(alt)) throw new Error(alt);
    if (alt) {
      await pg.keyboard.press('r');
      const r = await ev(() => [ROAD.route, (ROAD.mod.WALK.routes || []).length]);
      if (r[0] !== 'alt' || r[1] !== 2) throw new Error(`R: ${r}`);
      await ev(() => mapPick(null));
    }
    await ev(() => {
      Encounter.setPref('never'); // (the steps after this are not about the road: a hashed stop would hold their walk)
      MapView.setWalk(1);
      LOCK.max = 20000;
    });
    return alt ? `short cut at ${alt}` : 'no short cut offered';
  });
  await step('street level inside the gym (T-336b): the station prompt shows, its key F runs the day', async () => {
    await pg.waitForFunction(() => MapView.m3 && MapView.m3.interiors && MapView.m3.interiors(), null, { timeout: 300000 });
    await ev(() => {
      RUN.clock = City.freshClock();
      RUN.event = null;
      City.reveal(RUN, SPOTS.weiPower.at);
      Encounter.setPref('never'); // (no road stop on the way in)
      if (typeof briefKey === 'function') CW.briefWeek = briefKey(RUN); // (the week's brief closed: the prompt stays off over it)
      RUN.pos = MapModel.landmarks(RUN)
        .find(l => l.id === 'weiPower')
        .at.slice(); // (display: you stand in the gym — its hall beside the place's point, T-351; the day's rules run from the prompt below)
      renderCareer();
      MapView.m3.jump(); // (no walk there)
    });
    await pg.waitForFunction(() => !MapView.m3.busy(), null, { timeout: 300000 });
    await ev(() => {
      const y = MapView.m3.youPos();
      MapView.m3.setView({ x: y[0], z: y[2], d: 6.7 }); // down to street level (T-336a)
    });
    await pg.waitForFunction(() => MapView.m3.interiors().shown && document.querySelector('#stprompt .fmb'), null, { timeout: 300000 });
    const p = await ev(() => ({
      txt: document.querySelector('#stprompt').textContent,
      kbd: !!document.querySelector('#stprompt kbd'),
      i: MapView.m3.interiors(),
      days: City.wt(RUN)
    }));
    if (!/Heavy sets/.test(p.txt) || !p.kbd) throw new Error(`prompt: ${p.txt.slice(0, 120)}`);
    await pg.keyboard.press('f');
    await pg.waitForFunction(d => City.wt(RUN) > d, p.days, { timeout: 20000 });
    await pg.waitForFunction(() => !CW.lock, null, { timeout: 300000 });
    const t = await ev(() => ({ ms: MapView.m3.bench(3), street: MapView.m3.street() }));
    if (t.street < 0.5) throw new Error(`the day lifted the camera off street level (${t.street})`);
    await ev(() => MapView.m3.setView({ d: 110 }));
    return `cut ${p.i.cut}, roof ${p.i.alpha}, ${City_h(p.days)} → ${City_h(await ev(() => City.wt(RUN)))}, street ${t.street.toFixed(2)} after, ${t.ms} ms a frame`;
  });
  await step(
    'street level everywhere (T-361): at the Seaside Inn street level opens, its room is built, the bed offers Sleep (T-362)',
    async () => {
      await ev(() => {
        RUN.clock = City.freshClock();
        RUN.event = null;
        City.reveal(RUN, SPOTS.hotelWu.at);
        City.moveTo(RUN, City.at(RUN, 'hotelWu').slice()); // (you stand inside: MapModel.inside → the bed)
        renderCareer();
        MapView.m3.jump();
      });
      await pg.waitForFunction(() => !MapView.m3.busy(), null, { timeout: 300000 });
      await ev(() => {
        const y = MapView.m3.youPos();
        MapView.m3.setView({ x: y[0], z: y[2], d: 6.7 });
      });
      await pg.waitForFunction(
        () => MapView.m3.street() > 0.95 && MapView.m3.interiors().built.includes('hotelWu') && document.querySelector('#stprompt .fmb'),
        null,
        { timeout: 300000 }
      );
      const p = await ev(() => ({
        txt: document.querySelector('#stprompt').textContent,
        n: document.querySelectorAll('#stprompt .btn').length,
        i: MapView.m3.interiors(),
        ring: MapView.m3.info().ring
      }));
      if (!/Sleep 8 h/.test(p.txt) || p.n !== 3) throw new Error(`bed prompt: ${p.txt.slice(0, 120)}`);
      await ev(() => MapView.m3.setView({ d: 110 }));
      return `built ${p.i.built.join(', ')} (${p.i.tris} tris), cut ${p.i.cut}, ring ${p.ring.lots} lots`;
    }
  );
  await step('island sound (T-334): the map plays; leaving it frees every node and no AudioContext runs', async () => {
    const on = await ev(() => ({ on: Ambience.on, n: Ambience.nodes(), mix: Ambience.mix() }));
    if (!on.on || !on.n) throw new Error(`no ambience on the map: ${JSON.stringify(on)}`);
    await ev(() => navigate('menu'));
    await pg.waitForTimeout(800);
    const off = await ev(() => ({ on: Ambience.on, n: Ambience.nodes(), st: SND.ctx && SND.ctx.state }));
    await ev(() => openCareer());
    await pg.waitForFunction(() => document.querySelector('.career.hub'));
    if (off.on || off.n || off.st === 'running') throw new Error(`left running: ${JSON.stringify(off)}`);
    return `${on.n} nodes, then ${off.n} (${off.st || 'no context'})`;
  });
  await step('simmed court match → result card', async () => {
    await ev(() => {
      RUN.event = null; // (the week's one event comes after a first day: the drill above may have raised it)
      mapCourt('arena', 'open', true);
    });
    await pg.waitForFunction(() => CW.lock && CW.lock.phase === 'res', null, { timeout: 90000 });
    const txt = await ev(() => document.querySelector('#actlock').textContent);
    if (!/Top 3/i.test(txt)) throw new Error('no result card');
    await pg.keyboard.press('Space');
    // the team chat (spec §4.36 2): after a match you played, the teammates' messages and one reply; Space = Stay quiet
    const chat = await ev(() => (CW.lock && CW.lock.chat ? document.querySelector('#actlock').textContent : ''));
    if (chat && !/Team chat[\s\S]*Back them[\s\S]*Stay quiet/.test(chat)) throw new Error(`team chat: ${chat.slice(0, 120)}`);
    if (chat) await pg.keyboard.press('Space');
    if (await ev(() => !!CW.lock)) throw new Error('Space did not close the card');
    return chat ? 'team chat shown' : 'no chat';
  });
  await step('played court match → no prompts in a rally → skip → result card', async () => {
    await ev(() => {
      RUN.clock = City.freshClock();
      RUN.injury = null;
      RUN.event = null;
      mapCourt('arena', 'open', false);
    });
    await pg.waitForFunction(() => typeof R3D !== 'undefined' && R3D && A && A.m && !A.hold, null, { timeout: 120000 });
    // match prep (spec §2.26, §2.33): both teams; your side's hand (one card yours, the captain fills the rest); theirs hidden
    await pg
      .waitForFunction(() => A.prep && $('#prep') && !$('#prep').hidden && /Their hand/.test($('#prep').textContent), null, {
        timeout: 10000
      })
      .catch(() => {}); // (the card can paint a frame after A.m — the check below says what was there)
    const pre = await ev(() => (A.prep && $('#prep') && !$('#prep').hidden ? $('#prep').textContent : ''));
    if (!/Their hand: hidden/.test(pre) || !/the captain plays the rest|Click a card to play it/.test(pre))
      // (you as captain: all 5 yours)
      throw new Error(`career match prep: ${pre.replace(/\s+/g, ' ').slice(0, 400)}`);
    await pg.keyboard.press('Enter');
    if (await ev(() => A.prep)) throw new Error('Enter did not start the match');
    await ev(() => {
      A.hold = true; // frames by hand (the 3D clock is slow on a software GPU)
      for (let i = 0; i < 3000; i++) {
        step(16);
        R3D.poseAll(0.016);
        if (A.beats && A.bi < A.beats.length && $('#prompts .pchip')) throw new Error('a chip during a rally (T-264: no rally prompts)');
      }
    });
    await ev(() => skipMatch());
    await pg.waitForFunction(() => /Top 3/i.test((document.querySelector('#over') || {}).textContent || ''), null, { timeout: 10000 });
    const row = await ev(() => document.querySelector('#over').textContent);
    if (/Your plays/.test(row)) throw new Error('the removed Your plays row is back');
    await ev(() => leaveMatch());
  });
  await step('the drone (T-339): buy it at the Cargo Shed, a Pickup on a beach point → the field venue, a call', async () => {
    await pg.waitForFunction(() => document.querySelector('.career.hub'), null, { timeout: 60000 });
    const buy = await ev(() => {
      if (CW.lock) lockEnd(); // (the last match's result / team chat)
      CW.lock = null;
      Object.assign(RUN, { days: 7, event: null, money: 3000, sta: 100, injury: null, drone: null });
      MapView.setWalk(4); // (a software GPU: frames are slow)
      LOCK.max = 120000;
      mapPick('cargo');
      const t = document.querySelector('#spot').textContent,
        b = document.querySelector('#spot .btn.hot');
      if (!/Buy the drone/.test(t) || !b) return `cargo card: ${t.slice(0, 160)}`;
      b.click();
      return '';
    });
    if (buy) throw new Error(buy);
    await pg.waitForFunction(() => !CW.lock || CW.lock.phase === 'done', null, { timeout: 120000, polling: 200 });
    await ev(() => CW.lock && lockEnd());
    if (!(await ev(() => City.drone(RUN) === 'own'))) throw new Error('not bought');
    const pt = await ev(() => {
      Object.assign(RUN, { days: 7, event: null, sta: 100, injury: null });
      for (const q of Encounter.people(RUN))
        for (const [dx, dy] of [
          [40, 0],
          [0, 40],
          [-40, 0],
          [0, -40],
          [70, 70],
          [-70, 70]
        ]) {
          const p = MapModel.ptOf(MapModel.ptId([q.at[0] + dx, q.at[1] + dy])),
            P = Encounter.pickup(RUN, p);
          if (!P.why && P.g.k === 'sand') {
            mapPick(MapModel.ptId(p));
            return p;
          }
        }
      return null;
    });
    if (!pt) throw new Error('no beach point with a crew around');
    const row = await ev(() => (document.querySelector('#spot .ppick') || {}).textContent || '');
    if (!/Pickup[\s\S]*Sand/.test(row) || /needs/.test(row)) throw new Error(`pickup row: ${row.slice(0, 160)}`);
    await pg.keyboard.press('p'); // P: the pickup (printed on the row)
    await pg.waitForFunction(() => typeof R3D !== 'undefined' && R3D && A && A.m && !A.hold, null, { timeout: 120000 });
    const v = await ev(() => ({ venue: A.venue, g: A.ground && A.ground.k, mg: A.m.ground && A.m.ground.k, wind: A.m.wind }));
    if (v.venue !== 'field' || v.g !== 'sand' || v.mg !== 'sand') throw new Error(`field: ${JSON.stringify(v)}`);
    if (await ev(() => !!A.prep)) await pg.keyboard.press('Enter');
    await ev(() => {
      A.hold = true;
      for (let i = 0; i < 400; i++) {
        step(16);
        R3D.poseAll(0.016);
      }
      ACTS.label({ k: 'label', t: 'Foot fault', big: 1, call: 'foot', at: { x: COURT_LINES.end, z: 0.3 } }, null, { X: 0, Y: 0 });
      if (!A.call || A.call.k !== 'foot') throw new Error('no call on the field');
      A.hold = false;
    });
    await pg.waitForTimeout(800); // frames run on the field with the call up (any page error fails the run)
    await ev(() => skipMatch());
    await pg.waitForFunction(() => /Top 3/i.test((document.querySelector('#over') || {}).textContent || ''), null, { timeout: 30000 });
    await ev(() => leaveMatch());
    await pg.waitForFunction(() => document.querySelector('.career.hub'), null, { timeout: 60000 });
    const log = await ev(() => RUN.log.slice(0, 3).map(l => l.t));
    if (!log.some(t => /Pickup game with/.test(t))) throw new Error(`diary: ${log.join(' | ').slice(0, 200)}`);
    return `${v.g}${v.wind ? `, wind ${v.wind}` : ''} · ${log.find(t => /Pickup game/.test(t)).slice(0, 60)}`;
  });
  await step('transport (T-356, a career): buy the bike at the Harbor Market; a far card lists the rides; take the bus', async () => {
    await pg.waitForFunction(() => document.querySelector('.career.hub'), null, { timeout: 60000 });
    const buy = await ev(() => {
      if (CW.lock) lockEnd();
      CW.lock = null;
      Object.assign(RUN, { event: null, money: 3000, sta: 100, injury: null, ride: null, rep: {} });
      RUN.clock = City.freshClock();
      RUN.pos = City.at(RUN, 'market').map(Math.round);
      MapView.setWalk(4);
      LOCK.max = 120000;
      mapPick('market');
      const t = document.querySelector('#spot').textContent,
        b = document.querySelector('#spot .btn.ord.hot');
      if (!/Buy the bike/.test(t) || !/Buy the scooter/.test(t) || !b) return `market card: ${t.slice(0, 200)}`;
      b.click();
      return '';
    });
    if (buy) throw new Error(buy);
    await pg.waitForFunction(() => !CW.lock, null, { timeout: 120000, polling: 200 });
    if (!(await ev(() => City.owns(RUN, 'bike')))) throw new Error('the bike not bought');
    const row = await ev(() => {
      RUN.pos = City.at(RUN, 'home').map(Math.round);
      RUN.clock = City.freshClock();
      mapPick('harbor');
      return (document.querySelector('#spot .pride') || {}).textContent || '';
    });
    if (!/Bus[\s\S]*arrive[\s\S]*Bike/.test(row) || !/Scooter[\s\S]*Harbor Market/.test(row))
      throw new Error(`ride row: ${row.slice(0, 240)}`);
    await ev(() => [...document.querySelectorAll('#spot .pride .btn')].find(b => /^Bus/.test(b.textContent)).click());
    let aboard = false; // T-357: your bus on the map while you ride (vehicles3d)
    for (let i = 0; i < 600 && (await ev(() => !!CW.lock)); i++) {
      if (!aboard) aboard = await ev(() => !!(MapView.m3 && MapView.m3.info().vehicles && MapView.m3.info().vehicles.mine === 'bus'));
      await pg.waitForTimeout(200);
    }
    const V = await ev(() => MapView.m3 && MapView.m3.info().vehicles);
    if (V && (!aboard || !V.fixed)) throw new Error(`the bus on the map: aboard ${aboard}, ${JSON.stringify(V)}`);
    const r = await ev(() => ({
      at: City.pos(RUN).join(','),
      to: City.at(RUN, 'harbor').map(Math.round).join(','),
      b: RUN.clock.log.slice(-1)[0].label
    }));
    if (r.at !== r.to || r.b !== 'Bus') throw new Error(`the bus: ${JSON.stringify(r)}`);
    return row.replace(/\s+/g, ' ').slice(0, 120);
  });
  await step('encyclopedia', async () => {
    await ev(() => navigate('encyclopedia'));
    await pg.waitForFunction(() => document.querySelector('#app').textContent.length > 100);
  });
  await step('VFX lab: every effect', async () => {
    // dev tools load on demand (T-271): nothing of the lab before it opens
    if (await ev(() => typeof LAB !== 'undefined' || typeof vfxToggle !== 'undefined')) throw new Error('dev tools loaded up front');
    await ev(() => devOpen('lab', () => navigate('vfxlab')));
    await pg.waitForFunction(() => document.querySelector('.vlab3d') && labMod, null, { timeout: 30000 });
    const n = await ev(() => {
      labOpt('speed', 0);
      for (const [id] of LAB_FX) {
        labFire(id);
        labMod.labAdvance(0.2);
      }
      labOpt('el', 'flash');
      labFire('spike');
      labMod.labAdvance(0.6);
      const s = labMod.labStats();
      return s.glow + s.spark + s.streak + s.smoke;
    });
    if (!n) throw new Error('no particles alive');
    await ev(() => navigate('menu'));
    return `${n} particles`;
  });
  await step('Animation lab: record, freeze, scrub, edit, copy, a clip', async () => {
    await ev(() => navigate('menu'));
    await ev(() => devOpen('anim', () => startAnimLab()));
    await pg.waitForFunction(() => typeof R3D !== 'undefined' && R3D && A && A.animLab && !A.hold, null, { timeout: 120000 });
    await pg.waitForFunction(() => R3D.anim.info(0).n > 5, null, { timeout: 60000 });
    const r = await ev(() => {
      animFreezeUI(true);
      const n = R3D.anim.info(0).n;
      animSeek(Math.floor(n / 2));
      animEdit('L.k', 1.8);
      animEdit('al.0.az', 0.5);
      const code = animCode();
      if (!A.animLab.replay || !document.querySelector('#vfxp #animT')) throw new Error('not frozen with a timeline');
      if (!/L: leg\(/.test(code)) throw new Error('no pose code: ' + code.slice(0, 80));
      animFreezeUI(false);
      return n;
    });
    // a clip (owner, 2026-10-12): the lab finds a real rally with it and plays just that moment, again and again
    const clip = await ev(() => {
      animClip('fall');
      if (!A.clip || !document.querySelector('#vfxp select[aria-label="Clip"]')) throw new Error('no clip');
      for (let i = 0; i < 400; i++) step(16);
      const d = A.disp[A.animLab.sel];
      animClip(null);
      return d ? A.clip === null && 'knockdown clip' : null;
    });
    if (!clip) throw new Error('clip did not play');
    await ev(() => leaveMatch());
    return `${r} frames, ${clip}`;
  });
  await step('Year-2 Cup match (dev): two sampled Cup squads', async () => {
    await ev(() => navigate('menu'));
    await ev(() => devOpen('cup', () => startCupSample()));
    await pg.waitForFunction(() => typeof A !== 'undefined' && A && A.m && /Year-2 Cup sample/.test(A.fx.round || ''), null, {
      timeout: 60000
    });
    const r = await ev(() => [A.m.t[0].name, A.m.t[1].name, A.m.t[0].P.length + A.m.t[1].P.length]);
    await ev(() => leaveMatch());
    return `${r[0]} vs ${r[1]}`;
  });
  await step('Monster game → result', async () => {
    await ev(() => navigate('menu'));
    await ev(() => {
      TS.playAs = 'a:2'; // Play as the left team's first wing
      startMonster();
    });
    await pg.waitForFunction(() => typeof A !== 'undefined' && A && A.m, null, { timeout: 60000 });
    // the deck (spec §2.37): your opening hand and the deck of 12 in prep; click a card to play it on the first serve
    await pg.waitForFunction(() => A.prep && document.querySelector('#prep .cdeck'), null, { timeout: 20000 });
    await ev(() => {
      if (!A.prep || $('#prep').querySelectorAll('.pteam').length !== 2) throw new Error('no Monster match prep');
      // no coach (spec §2.36): the other side is the captain's call, and the rail's tab is Reads
      if (!/Captain decides/.test($('#prep').textContent) || !/^Reads/.test($('#readsbtn').textContent) || 'coaches' in A)
        throw new Error('the coach is still in the match');
      // the opening hand (five places) and the deck (12); the captain's side is hidden
      if ($('#prep').querySelectorAll('.cdeck').length !== 1 || $('#prep').querySelectorAll('.cdeck .hmini .hc').length !== 5)
        throw new Error('no hand in prep');
      if (!new RegExp(`Deck · ${DECK.size}`).test($('#prep .cdeck').textContent)) throw new Error('no deck of 12 in prep');
    });
    const h = await ev(() => A.m.deck[0].hand.findIndex((id, k) => id && !Cards.can(A.m, 0, k)));
    if (h < 0) throw new Error('no playable card in the opening hand');
    await pg.click(`#prep .hmini .hc[data-h="${h}"]`);
    await ev(() => {
      const D = A.m.deck[0];
      if (D.log.filter(e => e.k === 'play').length !== 1 || D.hand.filter(Boolean).length !== 4)
        throw new Error(`the card was not played: ${JSON.stringify(D.hand)}`);
      if (!$('#prep .hmini .hc.q')) throw new Error('the played card is not queued in prep');
      prepStart();
      if (A.prep || A.m.deck[0].by !== 'you' || A.m.deck[1].by !== 'ai') throw new Error('prep did not start the match');
    });
    // the hand bar (T-347): five places, the piles; the queued card lifted
    await ev(() => {
      handTick(true); // (the bar's own rAF loop is slow under a software GL)
      if (!$('#hand') || $('#hand').hidden || $('#hand').querySelectorAll('.hslot').length !== 5) throw new Error('no hand bar');
    });
    await ev(() => {
      if (!$('#hand .hc.q') || !$('#hand .hpile.deck') || !$('#hand .hpile.disc')) throw new Error('no queued card / piles on the bar');
      if (+$('#hand .hpile.deck b').textContent !== A.m.deck[0].draw.length) throw new Error('deck count wrong');
    });
    // play by key: step to the next point with a playable card of yours, press its number
    const k = await ev(() => {
      for (let n = 0; n < 6000; n++) {
        step(16);
        if (R3D) R3D.poseAll(0.016);
        if (Dir.busy()) exchangeSkip();
        const D = A.m.deck[0],
          f = D.hand.findIndex((id, j) => id && !Cards.can(A.m, 0, j) && A.hshow[0][j] === id);
        if (A.m.pts[0] + A.m.pts[1] >= 1 && f >= 0 && !A.paused) return f;
      }
      return -1;
    });
    if (k < 0) throw new Error('no playable card after the first point');
    await pg.keyboard.press(String(k + 1));
    await ev(k => {
      if (A.m.deck[0].log.filter(e => e.k === 'play').length !== 2) throw new Error('the key did not play the card');
      handTick(true);
      if (!$(`#hand .hc.q[data-h="${k}"]`)) throw new Error('the keyed card is not lifted');
    }, k);
    // discard one (right-click)
    const dk = await ev(() => {
      A.sceneOn = false; // (a staged scene tucks the bar away)
      handTick(true);
      return A.m.deck[0].hand.findIndex((id, j) => id && A.hshow[0][j] === id);
    });
    if (dk >= 0) {
      await pg.click(`#hand .hc[data-h="${dk}"]`, { button: 'right', force: true });
      await ev(dk => {
        const D = A.m.deck[0];
        if (D.hand[dk] || !D.log.some(e => e.k === 'discard')) throw new Error('right-click did not discard');
        handTick(true);
        if (!$(`#hand .hc.gap[data-h="${dk}"]`)) throw new Error('the discard left no gap');
      }, dk);
    }
    // the deck list and the discard list
    await pg.click('#hand .hpile.deck', { force: true });
    await ev(() => {
      if ($('#hlist').hidden || !/Deck/.test($('#hlist').textContent)) throw new Error('the deck list did not open');
      const n = [...document.querySelectorAll('#hlist .hli b')].reduce((s, b) => s + +b.textContent.replace('×', ''), 0);
      if (n !== A.m.deck[0].draw.length) throw new Error(`deck list counts ${n}, deck ${A.m.deck[0].draw.length}`);
    });
    await pg.click('#hand .hpile.disc', { force: true });
    await ev(() => {
      if ($('#hlist').hidden || !$('#hlist .hli')) throw new Error('the discard list is empty');
      handPile('disc');
      if (!$('#hlist').hidden) throw new Error('the list did not close');
    });
    // a turn refills the gaps (dealt once the point is on screen); Monster: no pause by default, on with the setting
    await ev(() => {
      // (the engine plays on to the turn; the score is then put on screen, as playback does at the point)
      const t0 = A.m.turnN;
      A.beats = null;
      while (A.m.turnN === t0 && !A.m.over) playRally(A.m);
      if (A.m.over) return;
      handTick();
      board(snap(A.m));
      handTick();
      const D = A.m.deck[0],
        gaps = document.querySelectorAll('#hand .hc.gap').length;
      if (gaps !== D.hand.filter(x => !x).length)
        throw new Error(
          `the turn did not deal: ${gaps} gaps, hand ${JSON.stringify(D.hand)} shown ${JSON.stringify(A.hshow)} pts ${A.m.pts} ps ${A.ptsShown} side ${handSide()} hidden ${$('#hand').hidden} done ${A.done}`
        );
      if (turnPause()) throw new Error('Pause at turns is on by default in Monster');
      setOpt('turns', 'on');
      cardsTurnShow({ n: A.m.turnN });
      if (!A.paused || !/Turn/.test($('#hnote').textContent)) throw new Error('Pause at turns did not pause');
      togglePause();
      setOpt('turns', 'off');
    });
    // no captain's chips (owner, 2026-10-14) and no ⚙ Prompts; Play as sets your player
    await ev(() => {
      if (A.m.human !== A.m.t[0].ws[0].id) throw new Error('Play as did not set your player');
      if (/Prompts/.test(settingsMenu()) || typeof promptCaptain !== 'undefined' || $('#prompts'))
        throw new Error('captain chips / Prompts still there');
    });
    await ev(() => {
      // the momentum line (spec §2.14, T-254): a stage chip at each end naming a stage
      const names = STAGE_IDS.map(id => STAGES[id].name);
      for (const i of [0, 1]) {
        const c = $('#sc' + i);
        if (!c || !names.some(n => c.textContent.startsWith(n))) throw new Error(`stage chip ${i}: ${c ? c.textContent : 'missing'}`);
      }
      stageShow({ k: 'stage', side: 0, from: 'focused', to: 'loose', why: 'error' });
      if (!/Rattled/.test($('#sc0').textContent)) throw new Error('no Rattled tag');
      stageShow({ k: 'stage', side: 1, from: 'focused', to: 'fever', why: 'streak' });
      if (!$('#fevb').classList.contains('on') || $('#sc1').textContent !== 'Fever') throw new Error('no FEVER banner / chip');
    });
    // the between-point exchange (spec §2.18, T-255): two lines, Space skips each, `done` fires
    await ev(() => {
      const [p, q] = [A.m.t[0].P[0], A.m.t[1].P[0]];
      window.__xd = 0;
      exchangeShow(
        [
          { p: p.id, t: 'Not this time.', side: 0 },
          { p: q.id, t: 'We will see.', side: 1 }
        ],
        () => (window.__xd = 1)
      );
      if (!$('#xbox .xl')) throw new Error('no exchange box');
    });
    await pg.keyboard.press('Space');
    await pg.keyboard.press('Space');
    if (!(await ev(() => window.__xd === 1 && !$('#xbox') && !A.paused))) throw new Error('the exchange did not end on skip');
    await pg.keyboard.press('v'); // the VFX panel: live controls over the running game
    await pg.waitForFunction(() => $('#vfxp') && !$('#vfxp').hidden, null, { timeout: 10000 }); // (loads on demand, T-271)
    const n = await ev(() => ($('#vfxp') && !$('#vfxp').hidden ? $('#vfxp').querySelectorAll('input').length : 0));
    if (n < 15) throw new Error(`VFX panel: ${n} controls`);
    await ev(() => {
      comboTouch(12); // the rally counter
      if (!/12\s*touches/i.test(($('#combo.on') || {}).textContent || '')) throw new Error('no rally counter');
      comboEnd(true);
      vfxSet('air', 'len', 3);
      if (!/"len": 3/.test($('#vfxjson').value)) throw new Error('VFX export did not follow the edit');
      vfxResetAll();
      vfxToggle();
    });
    // the calls (spec §4.38): a fault label's call reaches A.call (the drone flies to it in venue3d), a close landing is called
    await ev(() => {
      ACTS.label({ k: 'label', t: 'Net touch', big: 1, call: 'net', at: { x: 494, z: 0.4 } }, null, { X: 0, Y: 0 });
      if (!A.call || A.call.k !== 'net' || A.call.at.z !== 0.4) throw new Error('no net touch call');
      const lc = lineCall(COURT_LINES.end + 3, 0.5);
      if (!lc || lc.k !== 'in') throw new Error('no close-in call');
    });
    await pg.waitForTimeout(800); // frames run with the call up (any page error fails the run)
    await ev(() => {
      A.hold = true;
      while (!A.m.over) playRally(A.m);
      // the Reads tab (spec §2.25, §2.36): both sides, hitters and passers after a whole match
      railOpen('reads');
      const c = $('#reads');
      if (
        !c ||
        c.querySelectorAll('.cside').length !== 2 ||
        !/attacks/.test(c.textContent) ||
        !c.querySelector('table') ||
        c.querySelectorAll('.cstat').length !== 2 || // each side's status line
        !c.querySelector('details.fold') // the numbers, folded away
      )
        throw new Error(`Reads tab: ${c ? c.textContent.slice(0, 120) : 'missing'}`);
      railOpen(null);
      finishMatch();
    });
    await pg.waitForFunction(() => /Top 3/i.test((document.querySelector('#over') || {}).textContent || ''), null, { timeout: 10000 });
    // the cards (spec §2.37): each side's cards played
    if (!/Cards[\s\S]*(×\d|No cards played)/.test(await ev(() => $('#over').textContent)))
      throw new Error('no Cards row on the result card');
  });
  await step('Fusing in the hand (T-358): drag a card onto another, F then two keys, the fused card plays', async () => {
    await ev(() => navigate('menu'));
    await ev(() => {
      TS.playAs = 'a:2';
      startMonster();
    });
    await pg.waitForFunction(() => typeof A !== 'undefined' && A && A.m && A.prep, null, { timeout: 60000 });
    const shot = process.env.QA_DIR; // (QA screenshots: QA_DIR=<dir>)
    await ev(() => {
      prepStart();
      A.paused = true; // (between points: hold play while we fuse)
      A.sceneOn = false;
      const D = A.m.deck[0];
      D.hand = ['iblk', 'idig', 'ifake', 'iatk', 'isrv'];
      A.hshow[0] = [...D.hand];
      handTick(true);
      if (!$('#hand') || $('#hand').hidden || $('#hand').querySelectorAll('.hc[data-h]').length !== 5) throw new Error('no hand bar');
    });
    // drag Improve Block onto Improve Dig: the cards it fuses with light up with the result's name and cost → result
    const box = async h => (await pg.$(`#hrow .hc[data-h="${h}"]`)).boundingBox();
    const a = await box(0),
      b = await box(1);
    await pg.mouse.move(a.x + a.width / 2, a.y + 40);
    await pg.mouse.down();
    await pg.mouse.move(a.x + a.width / 2 + 20, a.y + 30, { steps: 4 });
    await pg.mouse.move(b.x + b.width / 2, b.y + 60, { steps: 8 });
    await ev(() => {
      const fz = [...document.querySelectorAll('#hrow .hc.fz')];
      if (!fz.length || !fz.some(c => /Fuse → Fortress/.test(c.textContent))) throw new Error('no fuse highlight naming Fortress');
      if (!fz.every(c => /→/.test(c.querySelector('.hfz small').textContent))) throw new Error('no cost → result on the highlight');
      if (!document.querySelector('.hc.hghost')) throw new Error('no dragged card');
    });
    if (shot) await pg.screenshot({ path: `${shot}/fuse-drag.png` });
    await pg.mouse.up();
    await ev(() => {
      const D = A.m.deck[0];
      if (D.hand[0] !== 'fortress' || D.hand[1] !== null) throw new Error(`drag did not fuse: ${JSON.stringify(D.hand)}`);
      if (document.querySelector('.hc.hghost') || document.querySelector('#hrow .hc.fz')) throw new Error('the drag did not clear');
      if (D.log.some(e => e.k === 'play')) throw new Error('the drop played a card');
      handTick(true);
      if (!$('#hrow .hc.fused[data-h="0"]') || !/Fortress/.test($('#hrow .hc[data-h="0"]').textContent))
        throw new Error('the fused card is not on the bar');
    });
    // F, then 3 and 4: Improve Fake + Improve Attack = Decoy
    await pg.keyboard.press('f');
    await pg.keyboard.press('3');
    await ev(() => {
      if (!A.hfz || A.hfz.h !== 2 || !$('#hrow .hc.fz[data-h="3"]')) throw new Error('F 3: no highlight on its partner');
    });
    await pg.keyboard.press('4');
    await ev(() => {
      const D = A.m.deck[0];
      if (D.hand[2] !== 'decoy' || D.hand[3] !== null || A.hfz) throw new Error(`F 3 4 did not fuse: ${JSON.stringify(D.hand)}`);
      if (document.fullscreenElement) throw new Error('F went fullscreen');
    });
    if (shot) await pg.screenshot({ path: `${shot}/fuse-card.png` });
    // play Fortress: one play, both costs, active as one card; on the serve the court names it
    await ev(() => {
      const m = A.m,
        bar = CARDS.iblk.cost.bar, // (the amplifiers' bar: both parts pay the same one)
        val = p => (bar === 'hp' ? hpOf(m, p) : bar === 'mor' ? morOf(m, p) : (m.sta[p.id] ?? 1)),
        st0 = m.t[0].P.map(val);
      if (!handPlay(0, 0)) throw new Error('Fortress did not play');
      const want = CARDS.iblk.cost.amt + CARDS.idig.cost.amt;
      if (!m.t[0].P.every((p, k) => Math.abs(st0[k] - val(p) - want) < 1e-9)) throw new Error('not both costs');
      if (!Cards.active(m, 0).some(x => x.id === 'fortress')) throw new Error('Fortress not active');
      A.paused = false;
    });
    const seen = await ev(() => {
      for (let n = 0; n < 4000; n++) {
        step(16);
        if (Dir.busy()) exchangeSkip();
        if (/plays Fortress/.test(DBG.text())) {
          handTick(true);
          return true;
        }
      }
      return false;
    });
    if (!seen) throw new Error('no banner / log for the fused play');
    if (shot) await pg.screenshot({ path: `${shot}/fuse-play.png` });
    await ev(() => {
      A.hold = true;
      while (!A.m.over) playRally(A.m);
      const D = A.m.deck[0];
      if (!D.played.fortress) throw new Error('Fortress not counted');
      finishMatch();
    });
  });
  await step('Deck match as a player (T-349): your deck of 6, a hand of 3, a request, the captain plays', async () => {
    await ev(() => navigate('menu'));
    await ev(() => startDeckMatch('player'));
    await pg.waitForFunction(() => typeof A !== 'undefined' && A && A.m && A.prep && document.querySelector('#prep .cdeck'), null, {
      timeout: 60000
    });
    await ev(() => {
      const Y = Cards.my(A.m, 0);
      if (!Y || Y.size !== 3 || A.m.deck[0].by !== 'ai') throw new Error('no own hand of 3 beside the captain');
      if ($('#prep .cdeck .hmini').querySelectorAll('.hc').length !== 3) throw new Error('prep: not a hand of 3');
      if (!/Your deck · 6 \/ 6/.test($('#prep .cdeck').textContent)) throw new Error('prep: no deck pick of 6');
      if (document.querySelectorAll('#prep .dk.pick').length < 20) throw new Error('prep: not every card to pick');
    });
    // drop one, pick another (a technique you don't own: the Dev match teaches it)
    const [drop, add] = await ev(() => [A.myPick[0], Object.keys(CARDS).find(id => CARDS[id].src === 'tech' && !A.myPick.includes(id))]);
    await pg.click(`#prep .dk.pick[onclick*="'${drop}'"]`);
    await pg.click(`#prep .dk.pick[onclick*="'${add}'"]`);
    await ev(
      ([drop, add]) => {
        const Y = Cards.my(A.m, 0);
        if (Y.ids.includes(drop) || !Y.ids.includes(add)) throw new Error(`the pick did not change the deck: ${Y.ids}`);
        prepStart();
        handTick(true);
        if ($('#hand').hidden || $('#hand').querySelectorAll('.hslot').length !== 3) throw new Error('no hand bar of 3');
        if (!$('#hand .hreq')) throw new Error('no Request button');
      },
      [drop, add]
    );
    // one request: a team play in the captain's hand, the list, Ask
    await ev(() => {
      const D = A.m.deck[0];
      if (!D.hand.some(id => id && CARDS[id].type === 'team')) D.hand[0] = 'power';
      A.sceneOn = false;
      handTick(true);
    });
    await pg.click('#hand .hreq', { force: true });
    await ev(() => {
      if ($('#hlist').hidden || !/Captain’s hand/.test($('#hlist').textContent) || !$('#hlist .odds')) throw new Error('no request list');
    });
    await pg.click('#hlist .hli.rq .btn', { force: true });
    const ans = await ev(() => {
      const D = A.m.deck[0],
        e = D.log.find(x => x.k === 'ask');
      if (!e) throw new Error('the request was not made');
      if (!/request: .* → (yes|no)/.test(DBG.text())) throw new Error('no request line in the debug log');
      if (e.ok !== Cards.my(A.m, 0).hand.includes(e.id)) throw new Error('a yes did not move the card');
      if (D.hand.findIndex((id, h) => id && !Cards.canAsk(A.m, 0, h)) >= 0) throw new Error('a second request this turn');
      return `${CARDS[e.id].name} → ${e.ok ? 'yes' : 'no'}`;
    });
    // play one of yours by key, then the captain plays on (its plays in the debug log)
    const k = await ev(() => Cards.my(A.m, 0).hand.findIndex((id, j) => id && !Cards.can(A.m, 0, j, true)));
    if (k >= 0) {
      await pg.keyboard.press(String(k + 1));
      if (!(await ev(() => A.m.deck[0].log.some(e => e.k === 'play' && e.y)))) throw new Error('the key did not play your card');
    }
    const cap = await ev(() => {
      for (let n = 0; n < 40000 && !A.m.over; n++) {
        step(16);
        if (Dir.busy()) exchangeSkip();
        if (A.paused) togglePause();
        if (n % 400 === 0 && /\(captain\)/.test(DBG.text())) return true;
      }
      return /\(captain\)/.test(DBG.text());
    });
    if (!cap) throw new Error("no captain's play in the debug log");
    await ev(() => {
      A.hold = true;
      while (!A.m.over) playRally(A.m);
      finishMatch();
    });
    return `request ${ans}`;
  });
  await step('Deck match as captain (T-349): your picks join the team deck, the hand of 5', async () => {
    await ev(() => navigate('menu'));
    await ev(() => startDeckMatch('captain'));
    await pg.waitForFunction(() => typeof A !== 'undefined' && A && A.m && A.prep && document.querySelector('#prep .cdeck'), null, {
      timeout: 60000
    });
    await ev(() => {
      const D = A.m.deck[0],
        all = [...D.draw, ...D.hand];
      if (Cards.my(A.m, 0) || D.by !== 'you') throw new Error('not the team hand');
      if (!A.myPick.length || !A.myPick.every(id => all.includes(id))) throw new Error('your picks are not in the team deck');
      if ($('#prep .cdeck .hmini').querySelectorAll('.hc').length !== 5) throw new Error('prep: not a hand of 5');
      prepStart();
      handTick(true);
      if ($('#hand').querySelectorAll('.hslot').length !== 5 || $('#hand .hreq')) throw new Error('captain: hand of 5, no Request');
    });
    const k = await ev(() => A.m.deck[0].hand.findIndex((id, j) => id && !Cards.can(A.m, 0, j)));
    if (k >= 0) {
      await pg.keyboard.press(String(k + 1));
      if (!(await ev(() => A.m.deck[0].log.some(e => e.k === 'play')))) throw new Error('the key did not play the card');
    }
    await ev(() => {
      A.hold = true;
      while (!A.m.over) playRally(A.m);
      finishMatch();
    });
  });
  const dbg = await ev(() => (typeof DBG !== 'undefined' ? DBG.text() : '')).catch(() => '');
  for (const l of dbg.split('\n')) if (/\berror\b/i.test(l) && !/STALL/.test(l)) errors.push(`DBG: ${l.slice(0, 200)}`);
  await browser.close();
  srv.close();

  for (const [ok, name, ms, note] of steps) console.log(`${ok ? '✓' : '✗'} ${name} (${ms} ms)${note ? ` — ${note}` : ''}`);
  for (const e of errors) console.log(`✗ ${e}`);
  const fail = steps.filter(s => !s[0]).length + errors.length;
  console.log(`\nUI smoke: ${steps.length - steps.filter(s => !s[0]).length}/${steps.length} steps, ${errors.length} page errors`);
  process.exit(fail ? 1 : 0);
})();
