// Bază de date locală (IndexedDB). Datele stau pe dispozitiv; backup criptat din Setări.
const DB_NAME = 'acm-contabil';
const VERSION = 2;
export const STORES = ['settings', 'note', 'documente', 'parteneri', 'mijloace', 'chat', 'extrase', 'meta'];
// Ce se sincronizează în seiful criptat. 'meta' și setările locale (sesiuni, chei de dispozitiv) nu pleacă.
export const SYNC_STORES = ['settings', 'note', 'documente', 'parteneri', 'mijloace', 'extrase'];
const LOCAL_ONLY = { settings: new Set(['aiSession', 'device']) };
export const esteSincronizat = (store, id) => SYNC_STORES.includes(store) && !(LOCAL_ONLY[store] && LOCAL_ONLY[store].has(id));

let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}

function tx(store, mode, fn) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
  }));
}

// Ascultători de modificări (sincronizarea marchează înregistrările de trimis). opts.remote = venit din seif.
const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = (store, id, deleted, opts) => { for (const f of listeners) { try { f(store, id, deleted, opts || {}); } catch (e) { console.error(e); } } };

export const db = {
  get: (store, id) => tx(store, 'readonly', (s) => s.get(id)),
  all: (store) => tx(store, 'readonly', (s) => s.getAll()),
  put: async (store, obj, opts) => { const r = await tx(store, 'readwrite', (s) => { s.put(obj); return obj; }); notify(store, obj.id, false, opts); return r; },
  del: async (store, id, opts) => { const r = await tx(store, 'readwrite', (s) => s.delete(id)); notify(store, id, true, opts); return r; },
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
  async dump() {
    const out = {};
    for (const s of STORES) out[s] = await db.all(s);
    return out;
  },
  async restore(data) {
    for (const s of STORES) {
      await db.clear(s);
      for (const o of data[s] || []) await db.put(s, o);
    }
  },
};

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---- Backup criptat (AES-GCM 256, cheie derivată PBKDF2-SHA256 600k iterații) ----
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function exportCriptat(password) {
  const data = enc.encode(JSON.stringify(await db.dump()));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFrom(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  // chunked base64 pentru fișiere mari
  let s = '';
  for (let i = 0; i < ct.length; i += 0x8000) s += String.fromCharCode(...ct.subarray(i, i + 0x8000));
  return JSON.stringify({ format: 'acm-contabil-backup', v: 1, salt: b64(salt), iv: b64(iv), data: btoa(s) });
}

export async function importCriptat(text, password) {
  const o = JSON.parse(text);
  if (o.format !== 'acm-contabil-backup') throw new Error('Fișierul nu este un backup ACM Contabil.');
  const key = await keyFrom(password, unb64(o.salt));
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv) }, key, unb64(o.data));
  } catch {
    throw new Error('Parolă greșită sau fișier deteriorat.');
  }
  await db.restore(JSON.parse(dec.decode(plain)));
}
