// One IndexedDB database for everything the player adds (skins, music). Kept in this browser only.
const DB = 'mohasorok', VERSION = 2, STORES = ['skins', 'music'];

let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => { dbp = null; rej(r.error); };
  });
  return dbp;
}

export async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
export const getAll = (store) => tx(store, 'readonly', (s) => s.getAll());
export const put = (store, rec) => tx(store, 'readwrite', (s) => s.put(rec));
export const del = (store, id) => tx(store, 'readwrite', (s) => s.delete(id));
