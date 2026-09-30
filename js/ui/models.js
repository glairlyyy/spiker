// Extra player models (.vrm files the player loads from their own disk). They are kept in this browser only
// (IndexedDB) — never uploaded — and handed to the 3D renderer, which gives them to your own career player only.

const Models = (() => {
  const DB = 'sns_models',
    ST = 'vrm';
  let dbP = null;
  const db = () =>
    dbP ||
    (dbP = new Promise((res, rej) => {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(ST);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
  const tx = (mode, fn) =>
    db().then(
      d =>
        new Promise((res, rej) => {
          const t = d.transaction(ST, mode),
            out = fn(t.objectStore(ST));
          t.oncomplete = () => res(out && out.result);
          t.onerror = () => rej(t.error);
        })
    );
  /** Names loaded into the 3D world this session. */
  const live = [];
  return {
    live,
    /** Stored models: [{ name, buf }] (empty if storage is blocked). */
    async all() {
      try {
        const keys = (await tx('readonly', s => s.getAllKeys())) || [],
          bufs = (await tx('readonly', s => s.getAll())) || [];
        return keys.map((k, i) => ({ name: String(k), buf: bufs[i] }));
      } catch (e) {
        return [];
      }
    },
    /** Keep a model (best effort) and load it into the 3D world now. */
    async add(name, buf) {
      try {
        await tx('readwrite', s => s.put(buf, name));
      } catch (e) {
        // storage blocked: the model still works until the page is closed
      }
      const api = await load3D();
      await api.addModel(buf, name);
      live.push(name);
    },
    /** Forget a stored model (takes effect on the next load). */
    async remove(name) {
      try {
        await tx('readwrite', s => s.delete(name));
      } catch (e) {
        // nothing stored
      }
    },
    /** At start-up: load every stored model into the 3D world. */
    async boot() {
      const api = await load3D();
      for (const m of await this.all())
        if (!live.includes(m.name))
          try {
            await api.addModel(m.buf, m.name);
            live.push(m.name);
          } catch (e) {
            DBG.log('warn', `Model ${m.name} could not be loaded`, e);
          }
    }
  };
})();
/** Menu: a .vrm picked from disk. */
async function addModelFile(input) {
  const f = input.files && input.files[0],
    note = $('#mdl-note');
  if (!f) return;
  if (note) note.textContent = `Loading ${f.name}…`;
  try {
    await Models.add(f.name, await f.arrayBuffer());
    renderMenu();
  } catch (e) {
    if (note) note.textContent = `${f.name}: not a usable VRM model (${e.message || e})`;
  }
}
async function removeModel(name) {
  await Models.remove(name);
  const note = $('#mdl-note');
  if (note) note.textContent = `${name} removed — it goes away when you reload.`;
}
