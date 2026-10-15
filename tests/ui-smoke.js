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
    await pg.waitForFunction(() => CW.lock && CW.lock.phase === 'res', null, { timeout: 90000 });
    const txt = await ev(() => document.querySelector('#actlock').textContent);
    if (!/Top 3/i.test(txt)) throw new Error('no result card');
    await pg.keyboard.press('Space');
    if (await ev(() => !!CW.lock)) throw new Error('Space did not close the card');
  });
  await step('played court match → no prompts in a rally → skip → result card', async () => {
    await ev(() => {
      RUN.days = 7;
      RUN.injury = null;
      mapCourt('arena', 'open', false);
    });
    await pg.waitForFunction(() => typeof R3D !== 'undefined' && R3D && A && A.m && !A.hold, null, { timeout: 120000 });
    // match prep (spec §2.26, §2.33): both teams; your side's hand (one card yours, the coach fills the rest); theirs hidden
    const pre = await ev(() => (A.prep && $('#prep') && !$('#prep').hidden ? $('#prep').textContent : ''));
    if (!/Their hand: hidden/.test(pre) || !/the coach fills the rest/.test(pre))
      throw new Error(`career match prep: ${pre.slice(0, 200)}`);
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
  await step('Monster game → result', async () => {
    await ev(() => navigate('menu'));
    await ev(() => {
      TS.playAs = 'a:2'; // Play as the left team's first wing
      startMonster();
    });
    await pg.waitForFunction(() => typeof A !== 'undefined' && A && A.m, null, { timeout: 60000 });
    // match prep (spec §2.26): both sides yours in a Monster game; pick Hunt the passer / Wall their ace for the left team
    await ev(() => {
      if (!A.prep || $('#prep').querySelectorAll('.pteam').length !== 2) throw new Error('no Monster match prep');
      // the hand (spec §2.33): your five slots and the pool; the coach's side is hidden
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
    await ev(() => {
      A.hold = true;
      while (!A.m.over) playRally(A.m);
      // the coach panel (spec §2.25): both sides, hitters and passers after a whole match
      railOpen('coach');
      const c = $('#coach');
      if (
        !c ||
        c.querySelectorAll('.cside').length !== 2 ||
        !/attacks/.test(c.textContent) ||
        !c.querySelector('table') ||
        c.querySelectorAll('.cstat').length !== 2 || // each side's status line
        !c.querySelector('details.fold') // the numbers, folded away
      )
        throw new Error(`coach panel: ${c ? c.textContent.slice(0, 120) : 'missing'}`);
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
