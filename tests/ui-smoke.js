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
const step = async (name, fn) => {
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
      if (!/Dynasty Strength Center/.test(tag) || !/trip/.test(tag)) throw new Error(`tag: ${tag}`);
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
      await pg.mouse.click(at[0], at[1], { button: 'right' });
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
    const st = await ev(() => ({ ms: MapView.m3.bench(3), ring: MapView.m3.info().ring, vrm: MapView.m3.info().life.vrm }));
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
    const days = await ev(() => 7 - City.days(RUN));
    await ev(() => MapView.m3.setView({ d: 110 })); // (back out to the map, as the walk camera leaves it)
    await ev(p => {
      City.moveTo(RUN, p);
      renderCareer();
      MapView.m3.jump();
    }, back);
    await pg.waitForFunction(() => MapView.m3.street() === 0 && !MapView.m3.info().ring.on, null, { timeout: 120000 });
    return `${st.ms} ms a frame at street level (ring ${st.ring.lots} lots, ${Math.round(st.ring.tris / 1000)}k tris, built in ${st.ring.ms} ms; ${st.vrm} VRMs); the walk took ${days} day(s)`;
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
      days: RUN.days
    }));
    if (!/Heavy sets/.test(p.txt) || !p.kbd) throw new Error(`prompt: ${p.txt.slice(0, 120)}`);
    await pg.keyboard.press('f');
    await pg.waitForFunction(d => RUN.days < d, p.days, { timeout: 20000 });
    await pg.waitForFunction(() => !CW.lock, null, { timeout: 300000 });
    const t = await ev(() => ({ ms: MapView.m3.bench(3), street: MapView.m3.street() }));
    if (t.street < 0.5) throw new Error(`the day lifted the camera off street level (${t.street})`);
    await ev(() => MapView.m3.setView({ d: 110 }));
    return `cut ${p.i.cut}, roof ${p.i.alpha}, ${p.days} → ${await ev(() => RUN.days)} days, street ${t.street.toFixed(2)} after, ${t.ms} ms a frame`;
  });
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
    if (!/Their hand: hidden/.test(pre) || !/the captain fills the rest|Drag a card into a slot/.test(pre))
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
    // drag and drop (owner, 2026-10-16): a pool card onto a slot, then that slot's card back onto the pool
    await pg.waitForFunction(() => A.prep && document.querySelector('#prep .cpool'), null, { timeout: 20000 });
    await ev(() => {
      // the opening hand follows the random Monster teams: Power Up may already be slotted — empty that slot first
      const C = A.m.cards[0],
        k = Object.keys(C.slots).find(s => C.slots[s] === 'pow');
      if (k) cardsSet(0, k, null);
      cardsRedraw();
    });
    await pg.waitForFunction(() => document.querySelector('#prep .cpool .cpick[data-card="pow"]'), null, { timeout: 5000 });
    await pg.dragAndDrop('#prep .cpool .cpick[data-card="pow"]', '#prep .cslot[data-slot="atk1"]');
    if ((await ev(() => A.m.cards[0].slots.atk1)) !== 'pow') throw new Error('drag: Power Up not in ATK 2');
    await pg.dragAndDrop('#prep .cslot[data-slot="atk1"]', '#prep .cpool');
    if ((await ev(() => A.m.cards[0].slots.atk1)) === 'pow') throw new Error('drag: the slot did not empty');
    // the pool's filters (owner, 2026-10-17): DEF shows only DEF cards, All brings the rest back
    await pg.click('#prep .cfilt[data-filt="def"]');
    await ev(() => {
      const ids = [...document.querySelectorAll('#prep .cpool .cpick')].map(b => b.dataset.card);
      if (!ids.length || ids.some(id => CARDS[id].zone !== 'def')) throw new Error(`filter DEF shows ${ids.join(',')}`);
    });
    await pg.click('#prep .cfilt[data-filt="all"]');
    await ev(() => {
      if (!document.querySelector('#prep .cpool .cpick[data-card="pow"]')) throw new Error('filter All: Power Up missing');
    });
    // match prep (spec §2.26): both sides yours in a Monster game; pick Hunt the passer / Wall their ace for the left team
    await ev(() => {
      if (!A.prep || $('#prep').querySelectorAll('.pteam').length !== 2) throw new Error('no Monster match prep');
      // no coach (spec §2.36): the other side is the captain's call, and the rail's tab is Reads
      if (!/Captain decides/.test($('#prep').textContent) || !/^Reads/.test($('#readsbtn').textContent) || 'coaches' in A)
        throw new Error('the coach is still in the match');
      // the hand (spec §2.33): your five slots and the pool; the captain's side is hidden
      if ($('#prep').querySelectorAll('.chand').length !== 1 || $('#prep').querySelectorAll('.chand .cslot').length !== 5)
        throw new Error('no hand in prep');
      cardsSlot(0, 'atk0');
      cardsPick(0, 'hunt');
      cardsSlot(0, 'def0');
      cardsPick(0, 'wall');
      if (A.m.cards[0].slots.atk0 !== 'hunt' || A.m.cards[0].slots.def0 !== 'wall')
        throw new Error(`cards: ${JSON.stringify(A.m.cards[0].slots)}`);
      prepStart();
      const p = A.m.plan[0];
      if (A.prep || p.atk !== 'hunt' || p.def !== 'wall' || A.m.cards[0].by !== 'you' || A.m.cards[1].by !== 'ai')
        throw new Error(`cards did not set the plans: ${JSON.stringify(A.m.plan)}`);
      // Tab mid-match: a look at your hand (play waits); Tab again closes it
      cardsPeek();
      if (!A.prep || !$('#cturn') || $('#cturn').hidden || !$('#cturn .cbars .cbrow')) throw new Error('Tab did not open the hand');
      cardsPeek();
      if (A.prep) throw new Error('the hand did not close');
      // a turn (spec §2.32): the overlay pauses play with your hand editable
      cardsTurnShow({ n: 1 });
      if (!A.prep || !$('#cturn .cpool .cpick')) throw new Error('no turn overlay');
      cardsTurnClose();
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
    // the cards (spec §2.33): each side's plays and turns slotted
    if (!/Cards[\s\S]*Hunt the Passer ×/.test(await ev(() => $('#over').textContent))) throw new Error('no Cards row on the result card');
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
