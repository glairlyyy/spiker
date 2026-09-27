// Debug log: collects errors, warnings and stalls so a player can copy them into a bug report.
// Loaded first. Keeps the last entries in memory and in localStorage (survives a reload after a freeze).

const DBG = (() => {
  const KEY = 'skyline_debug_log',
    MAX = 150,
    t0 = Date.now();
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(list)) list = [];
  } catch (e) {
    list = [];
  }
  let saveT = 0;
  const persist = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
      } catch (e) {
        /* storage full or blocked: the log stays in memory */
      }
    }, 250);
  };
  const str = v => {
    if (v instanceof Error) return `${v.name}: ${v.message}${v.stack ? '\n' + v.stack.split('\n').slice(1, 7).join('\n') : ''}`;
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v);
    } catch (e) {
      return String(v);
    }
  };
  /** Add an entry. Identical messages in a row are counted instead of repeated. */
  function log(kind, msg, extra) {
    const text = str(msg),
      last = list[list.length - 1];
    if (last && last.kind === kind && last.msg === text) {
      last.n = (last.n || 1) + 1;
      last.at = new Date().toISOString();
    } else {
      list.push({ at: new Date().toISOString(), up: Math.round((Date.now() - t0) / 1000), kind, msg: text, extra: extra ? str(extra).slice(0, 1500) : undefined });
      if (list.length > MAX * 2) list = list.slice(-MAX);
    }
    persist();
    if (typeof dbgBadge === 'function') dbgBadge();
  }
  if (typeof window === 'undefined') return { log, text: () => '', clear() {}, count: () => 0 }; // headless (tests)
  addEventListener(
    'error',
    e => {
      if (e.target && e.target !== window && (e.target.src || e.target.href))
        log('load', `Failed to load ${e.target.tagName.toLowerCase()} ${e.target.src || e.target.href}`);
      else log('error', e.error || `${e.message} (${e.filename}:${e.lineno}:${e.colno})`);
    },
    true
  );
  addEventListener('unhandledrejection', e => log('error', e.reason || 'Unhandled promise rejection'));
  for (const lvl of ['error', 'warn']) {
    const orig = console[lvl].bind(console);
    console[lvl] = (...a) => {
      orig(...a);
      log(lvl === 'error' ? 'console' : 'warn', a.map(str).join(' '));
    };
  }
  /** Everything as plain text for pasting into a chat or bug report. */
  function text(state) {
    const env = [
      `Skyline Cup 3D debug log — ${new Date().toISOString()}`,
      `Browser: ${navigator.userAgent}`,
      `Screen: ${innerWidth}×${innerHeight} @${devicePixelRatio}x`
    ];
    if (state) env.push(`State: ${str(state)}`);
    const rows = list.map(
      e => `[${e.at.slice(11, 19)} +${e.up}s] ${e.kind.toUpperCase()}${e.n > 1 ? ` ×${e.n}` : ''}: ${e.msg}${e.extra ? '\n    ' + e.extra : ''}`
    );
    return [...env, '', rows.length ? rows.join('\n') : '(no errors recorded)'].join('\n');
  }
  function clear() {
    list = [];
    persist();
    if (typeof dbgBadge === 'function') dbgBadge();
  }
  return { log, text, clear, count: () => list.filter(e => e.kind !== 'info').length };
})();
