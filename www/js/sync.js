// Sincronizare criptată între dispozitive, fără cont.
//
// Cum funcționează:
//  - primul dispozitiv creează un seif: o cheie secretă de 256 de biți, generată local, care nu pleacă niciodată
//    de pe dispozitiv decât prin codul de asociere (QR) arătat de tine altui dispozitiv;
//  - din cheie se derivă (HKDF-SHA256): adresa seifului în Firestore, cheia de criptare AES-256-GCM
//    și o cheie HMAC pentru numele înregistrărilor (serverul nu vede nici ce tip de date sunt);
//  - fiecare înregistrare (notă, document, partener…) se criptează pe dispozitiv și se trimite ca text opac;
//  - Firestore vede doar: adresa aleatoare a seifului, nume de înregistrări aleatoare, text criptat și ora scrierii.
//  - autentificarea e anonimă (Firebase), doar ca să nu poată scrie oricine pe internet în baza de date.
import { db, onChange, esteSincronizat, SYNC_STORES } from './db.js';

import { FIREBASE, idToken as token } from './auth.js';
export { FIREBASE };
const FS = () => `https://firestore.googleapis.com/v1/projects/${FIREBASE.projectId}/databases/(default)/documents`;
const COL = 'inregistrari';
const CHUNK = 600000; // caractere base64 pe document (limita Firestore e 1 MiB)

const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };

// ---------------------------------------------------------------- chei
async function deriva(secret) {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveBits', 'deriveKey']);
  const h = (info) => ({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('ACM Contabil seif v1'), info: enc.encode(info) });
  const idBits = new Uint8Array(await crypto.subtle.deriveBits(h('adresa'), base, 256));
  const aes = await crypto.subtle.deriveKey(h('criptare'), base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const mac = await crypto.subtle.deriveKey(h('index'), base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign']);
  return { vaultId: b64u(idBits), aes, mac };
}
let chei = null;
async function cheiSeif() {
  const s = await db.get('meta', 'seif');
  if (!s) return null;
  if (!chei || chei.vaultId !== s.vaultId) chei = { ...(await deriva(unb64u(s.secret))), seif: s };
  return chei;
}
async function numeInregistrare(k, store, id) {
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k.mac, enc.encode(store + '\u0000' + id)));
  return b64u(sig.subarray(0, 24));
}

async function api(path, body, method = 'POST') {
  const r = await fetch(FS() + path, {
    method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await token()) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* nimic */ }
  if (!r.ok) {
    if (r.status === 403) throw new Error('Firestore a refuzat accesul. Verifică regulile de securitate ale bazei de date.');
    throw new Error('Sincronizare: ' + ((j && (j.error?.message || j[0]?.error?.message)) || r.status));
  }
  return j;
}

// ---------------------------------------------------------------- criptare înregistrări
async function cripteaza(k, docName, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(docName) }, k.aes, enc.encode(JSON.stringify(obj))));
  return { iv: b64u(iv), c: b64u(ct) };
}
async function decripteaza(k, docName, iv, c) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv), additionalData: enc.encode(docName) }, k.aes, unb64u(c));
  return JSON.parse(dec.decode(pt));
}

// ---------------------------------------------------------------- coada de trimis
let pornit = false;
let programat = null;
const ascultatori = new Set();
export const laSchimbare = (f) => { ascultatori.add(f); return () => ascultatori.delete(f); };
const anunta = (e) => ascultatori.forEach((f) => { try { f(e); } catch (x) { console.error(x); } });

async function marcheaza(store, id, deleted) {
  await db.put('meta', { id: `out:${store}:${id}`, store, rid: id, deleted: !!deleted, m: Date.now() });
  programeaza(2500);
}
function programeaza(ms) {
  clearTimeout(programat);
  programat = setTimeout(() => { sincronizeaza().catch((e) => anunta({ eroare: e.message })); }, ms);
}

export function porneste() {
  if (pornit) return;
  pornit = true;
  onChange((store, id, deleted, opts) => {
    if (opts.remote || !esteSincronizat(store, id)) return;
    db.get('meta', 'seif').then((s) => { if (s) marcheaza(store, id, deleted); });
  });
  const tick = () => { if (document.visibilityState === 'visible') programeaza(500); };
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('online', tick);
  setInterval(tick, 120000);
  programeaza(1500);
}

let ruleaza = false;
export async function sincronizeaza() {
  const k = await cheiSeif();
  if (!k || ruleaza) return { skipped: true };
  if (!navigator.onLine) return { offline: true };
  ruleaza = true;
  anunta({ stare: 'ruleaza' });
  try {
    const trimise = await trimite(k);
    const primite = await primeste(k);
    const s = await db.get('meta', 'seif');
    await db.put('meta', { ...s, ultima: Date.now(), eroare: null });
    anunta({ stare: 'gata', trimise, primite });
    return { trimise, primite };
  } catch (e) {
    const s = await db.get('meta', 'seif');
    if (s) await db.put('meta', { ...s, eroare: e.message });
    anunta({ stare: 'eroare', eroare: e.message });
    throw e;
  } finally { ruleaza = false; }
}

async function trimite(k) {
  const coada = (await db.all('meta')).filter((x) => x.id.startsWith('out:'));
  const base = `projects/${FIREBASE.projectId}/databases/(default)/documents/seifuri/${k.vaultId}/${COL}/`;
  let n = 0;
  let writes = [], marime = 0, sterse = [];
  const flush = async () => {
    if (!writes.length) return;
    await api(':commit', { writes });
    for (const id of sterse) await db.del('meta', id);
    n += sterse.length; writes = []; sterse = []; marime = 0;
  };
  for (const o of coada) {
    const name = await numeInregistrare(k, o.store, o.rid);
    const obj = o.deleted ? null : await db.get(o.store, o.rid);
    const payload = { s: o.store, id: o.rid, m: o.m, del: o.deleted || !obj, v: obj || null };
    const { iv, c } = await cripteaza(k, name, payload);
    const parti = [];
    for (let i = 0; i < c.length; i += CHUNK) parti.push(c.slice(i, i + CHUNK));
    const doc = (nm, fields) => ({ update: { name: base + nm, fields }, updateTransforms: [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }] });
    if (parti.length > 1) {
      // părțile întâi, apoi documentul principal care le numără: cine citește nu vede niciodată o înregistrare incompletă
      for (let i = 0; i < parti.length; i++) {
        writes.push({ update: { name: base + name + '_' + i, fields: { c: { stringValue: parti[i] }, iv: { stringValue: '' }, p: { integerValue: String(i) } } } });
        marime += parti[i].length;
        if (marime > 4000000) { await flush(); }
      }
      writes.push(doc(name, { c: { stringValue: '' }, iv: { stringValue: iv }, n: { integerValue: String(parti.length) } }));
    } else {
      writes.push(doc(name, { c: { stringValue: c }, iv: { stringValue: iv } }));
      marime += c.length;
    }
    sterse.push(o.id);
    if (writes.length >= 40 || marime > 4000000) await flush();
  }
  await flush();
  return n;
}

async function primeste(k) {
  const s = await db.get('meta', 'seif');
  let dupa = s.dupa || null; // timestamp RFC3339 al ultimei înregistrări primite
  let n = 0;
  for (;;) {
    const q = { structuredQuery: { from: [{ collectionId: COL }], orderBy: [{ field: { fieldPath: 't' }, direction: 'ASCENDING' }], limit: 200 } };
    if (dupa) q.structuredQuery.where = { fieldFilter: { field: { fieldPath: 't' }, op: 'GREATER_THAN', value: { timestampValue: dupa } } };
    const res = await api(`/seifuri/${k.vaultId}:runQuery`, q);
    const docs = (res || []).filter((x) => x.document).map((x) => x.document);
    if (!docs.length) break;
    for (const d of docs) {
      const name = d.name.split('/').pop();
      const f = d.fields || {};
      dupa = f.t?.timestampValue || d.updateTime;
      let c = f.c?.stringValue || '';
      const nparti = Number(f.n?.integerValue || 0);
      if (nparti) {
        c = '';
        for (let i = 0; i < nparti; i++) {
          const p = await api(`/seifuri/${k.vaultId}/${COL}/${name}_${i}`, null, 'GET');
          c += p.fields.c.stringValue;
        }
      }
      let rec;
      try { rec = await decripteaza(k, name, f.iv.stringValue, c); } catch { continue; } // nu e din seiful nostru / deteriorat
      if (!SYNC_STORES.includes(rec.s) || !esteSincronizat(rec.s, rec.id)) continue;
      // dacă avem o modificare locală mai nouă, încă netrimisă, o păstrăm pe a noastră
      const local = await db.get('meta', `out:${rec.s}:${rec.id}`);
      if (local && local.m > rec.m) continue;
      if (rec.del) await db.del(rec.s, rec.id, { remote: true });
      else await db.put(rec.s, rec.v, { remote: true });
      n++;
    }
    await db.put('meta', { ...(await db.get('meta', 'seif')), dupa });
    if (docs.length < 200) break;
  }
  return n;
}

// ---------------------------------------------------------------- seif: creare, asociere, ieșire
export async function stare() { return db.get('meta', 'seif'); }

async function marcheazaTot() {
  for (const st of SYNC_STORES) for (const o of await db.all(st)) if (esteSincronizat(st, o.id)) await db.put('meta', { id: `out:${st}:${o.id}`, store: st, rid: o.id, deleted: false, m: Date.now() });
}

export async function creeazaSeif() {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  const { vaultId } = await deriva(secret);
  await token(); // verifică din timp că Firebase acceptă autentificarea
  await db.put('meta', { id: 'seif', secret: b64u(secret), vaultId, creat: Date.now(), dispozitiv: numeDispozitiv() });
  chei = null;
  await marcheazaTot();
  porneste();
  return sincronizeaza();
}

export function codAsociere(s) { return 'ACMC1-' + s.secret; }
export const textQR = (s) => 'acmcontabil:seif:' + codAsociere(s);

export async function asociaza(text) {
  const m = String(text || '').trim().match(/ACMC1-([A-Za-z0-9_-]{43})/);
  if (!m) throw new Error('Codul de asociere nu este valid. Copiază-l întreg sau scanează codul QR.');
  const secret = unb64u(m[1]);
  if (secret.length !== 32) throw new Error('Codul de asociere nu este valid.');
  const { vaultId } = await deriva(secret);
  await token();
  await db.put('meta', { id: 'seif', secret: m[1], vaultId, creat: Date.now(), dispozitiv: numeDispozitiv(), dupa: null });
  chei = null;
  await marcheazaTot(); // datele deja existente pe acest dispozitiv se adaugă în seif
  porneste();
  return sincronizeaza();
}

export async function iesiDinSeif() {
  await db.del('meta', 'seif');
  for (const o of await db.all('meta')) if (o.id.startsWith('out:')) await db.del('meta', o.id);
  chei = null;
}

function numeDispozitiv() {
  const ua = navigator.userAgent;
  if (window.acmHost) return 'Windows';
  if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'Browser';
}

export async function inAsteptare() { return (await db.all('meta')).filter((x) => x.id.startsWith('out:')).length; }
