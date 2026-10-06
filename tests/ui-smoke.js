#!/usr/bin/env node
// UI smoke test (T-231): opens the real page in headless Chromium and walks every screen once — title, a new career's hub,
// the four sheets, every place card, the Encyclopedia, the VFX lab, a simmed court match's result card and a Monster game to its result.
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
      RUN.days = 7;
      RUN.money = 3000;
      renderCareer();
    });
  });
  for (const k of ['me', 'people', 'world', 'season'])
    await step(`sheet ${k}`, async () => {
      await ev(k => hubOpen(k), k);
      const n = await ev(() => ((document.querySelector('.hub .sheet') || {}).textContent || '').length);
      await ev(() => hubOpen(null));
      if (n < 20) throw new Error('the sheet did not render');
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
      mapPick('venue:arena'); // and one rendered for real
      if (!document.querySelector('#spot').textContent.includes('Court match')) bad.push('venue card: no court match');
      mapPick(null);
      if (bad.length) throw new Error(bad.join('; '));
      return `${ids.length} cards`;
    })
  );
  await step('simmed court match → result card', async () => {
    await ev(() => mapCourt('arena', 'open', true));
    await pg.waitForFunction(() => CW.lock && CW.lock.phase === 'res', null, { timeout: 30000 });
    const txt = await ev(() => document.querySelector('#actlock').textContent);
    if (!/Top 3/i.test(txt)) throw new Error('no result card');
    await pg.keyboard.press('Space');
    if (await ev(() => !!CW.lock)) throw new Error('Space did not close the card');
  });
  await step('played court match → a call answered → skip → result card', async () => {
    await ev(() => {
      RUN.days = 7;
      RUN.injury = null;
      G.calls = 'all';
      mapCourt('arena', 'open', false);
    });
    await pg.waitForFunction(() => typeof R3D !== 'undefined' && R3D && A && A.m && !A.hold, null, { timeout: 120000 });
    const shown = await ev(() => {
      A.hold = true; // frames by hand (the 3D clock is slow on a software GPU)
      for (let i = 0; i < 60000 && !(A.ask && A.ask.shown); i++) {
        step(16);
        R3D.poseAll(0.016);
      }
      return !!(A.ask && A.ask.shown && document.querySelector('#calls'));
    });
    if (!shown) throw new Error('no call shown');
    await pg.keyboard.press('1');
    const n = await ev(() => (A.m.calls || []).length);
    if (n !== 1 || (await ev(() => !!A.ask))) throw new Error(`the call was not answered (${n})`);
    await ev(() => skipMatch());
    await pg.waitForFunction(() => /Top 3/i.test((document.querySelector('#over') || {}).textContent || ''), null, { timeout: 10000 });
    await ev(() => leaveMatch());
    return `${n} call`;
  });
  await step('encyclopedia', async () => {
    await ev(() => navigate('encyclopedia'));
    await pg.waitForFunction(() => document.querySelector('#app').textContent.length > 100);
  });
  await step('VFX lab: every effect', async () => {
    await ev(() => navigate('vfxlab'));
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
  await step('Monster game → result', async () => {
    await ev(() => navigate('menu'));
    await ev(() => startMonster());
    await pg.waitForFunction(() => typeof A !== 'undefined' && A && A.m, null, { timeout: 60000 });
    await ev(() => {
      A.hold = true;
      while (!A.m.over) playRally(A.m);
      finishMatch();
    });
    await pg.waitForFunction(() => /Top 3/i.test((document.querySelector('#over') || {}).textContent || ''), null, { timeout: 10000 });
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
