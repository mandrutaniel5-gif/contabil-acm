// SPV / e-Factura: conectarea firmei (o dată pe an, cu certificatul calificat) și importul automat al facturilor.
//  - facturile PRIMITE de la furnizori devin cheltuieli (cu contul propus automat), cu XML-ul și PDF-ul ANAF atașate;
//  - facturile EMISE (trimise din ACM Docs sau din alt program) devin venituri;
//  - cheile de acces stau în seiful criptat al firmei; facturile vin direct de la ANAF pe dispozitiv, nu prin server.
import { db, uid } from './db.js';
import { nativeFetch, areHttpNativ, bytesToB64 } from './host.js';
import { idToken, FIREBASE } from './auth.js';
import { unzip } from './unzip.js';
import { citesteFactura, curataCUI } from './ubl.js';
import { getSetari, salveazaDocument, r2 } from './engine.js';
import { sugestieLocala } from './ai.js';
import { curs } from './bnr.js';

const API = (env) => `https://api.anaf.ro/${env === 'test' ? 'test' : 'prod'}/FCTEL/rest`;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => bytesToB64(u8 instanceof Uint8Array ? u8 : new Uint8Array(u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function server(fn, body) {
  const r = await fetch(`${FIREBASE.functions}/contabil${fn[0].toUpperCase()}${fn.slice(1)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await idToken()) }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Serverul a răspuns cu ${r.status}`);
  return j;
}

// ---------------------------------------------------------------- chei sigilate
async function cheieUnica() {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  return { kp, pub: b64(pub) };
}
async function deschide(kp, s) {
  const epk = await crypto.subtle.importKey('raw', unb64(s.epk), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: epk }, kp.privateKey, 256);
  const hk = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('acm-contabil-anaf-v1') }, hk, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, key, unb64(s.ct))));
}

export async function stare() {
  const a = await db.get('settings', 'anaf');
  return a && a.refresh ? a : null;
}
export const disponibil = () => areHttpNativ();
export async function infoServer() { return server('anafInfo'); }

/** Pornește conectarea: deschide pagina ANAF (alegi certificatul), apoi așteaptă cheile sigilate. */
export async function conecteaza(onPas) {
  const { kp, pub } = await cheieUnica();
  const { url, state } = await server('anafStart', { pub });
  window.open(url, '_blank');
  onPas && onPas('asteapta');
  const pana = Date.now() + 10 * 60 * 1000;
  while (Date.now() < pana) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await server('anafClaim', { state });
    if (r.ready) {
      const t = await deschide(kp, r.sigilat);
      const set = await getSetari();
      await db.put('settings', { id: 'anaf', ...t, env: r.env || 'prod', cif: curataCUI(set.cui), conectat: Date.now() });
      return t;
    }
  }
  throw new Error('Conectarea a expirat. Pornește-o din nou și alege certificatul în 10 minute.');
}

export async function deconecteaza() { await db.del('settings', 'anaf'); }

async function acces() {
  let a = await stare();
  if (!a) throw new Error('Firma nu este conectată la SPV.');
  const expira = a.at + (a.expiresIn || 0) * 1000;
  if (Date.now() > expira - 7 * 864e5) {
    const { kp, pub } = await cheieUnica();
    const r = await server('anafRefresh', { refresh: a.refresh, pub });
    const t = await deschide(kp, r.sigilat);
    a = { ...a, ...t, refresh: t.refresh || a.refresh, env: r.env || a.env || 'prod' };
    await db.put('settings', a);
  }
  return a;
}

async function get(path, a) {
  const r = await nativeFetch(`${API(a.env)}/${path}`, { headers: { Authorization: 'Bearer ' + a.access } });
  if (r.status === 401 || r.status === 403) throw new Error('ANAF a refuzat accesul. Reconectează firma la SPV din Setări.');
  if (!r.ok) throw new Error(`ANAF a răspuns cu eroarea ${r.status}.`);
  return r;
}

/** Mesajele din ultimele 60 de zile (atât păstrează ANAF). */
export async function mesaje(zile = 60) {
  const a = await acces();
  const set = await getSetari();
  const cif = curataCUI(set.cui) || a.cif;
  if (!cif) throw new Error('Completează CUI-ul firmei în Setări.');
  const r = await get(`listaMesajeFactura?zile=${zile}&cif=${cif}`, a);
  const j = r.json();
  if (j.eroare) { if (/nu exista mesaje/i.test(j.eroare)) return []; throw new Error('ANAF: ' + j.eroare); }
  return j.mesaje || [];
}

async function pdfDinXml(xml, storno) {
  if (!areHttpNativ()) return null;
  try {
    const r = await nativeFetch(`https://webservicesp.anaf.ro/prod/FCTEL/rest/transformare/${storno ? 'FCN' : 'FACT'}/DA`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: xml });
    if (r.ok && r.bytes[0] === 0x25) return r.bytes; // %PDF
  } catch { /* fără PDF, rămâne XML-ul */ }
  return null;
}

/**
 * Importă facturile noi din SPV. Rulează automat la pornire și apoi periodic.
 * Întoarce { primite, emise, erori, deVerificat }.
 */
export async function importa({ onProgres } = {}) {
  if (!areHttpNativ()) return { indisponibil: true };
  if (!(await stare())) return { neconectat: true };
  const set = await getSetari();
  const cifFirma = curataCUI(set.cui);
  const lista = await mesaje(60);
  const docs = await db.all('documente');
  const vazute = new Set(docs.filter((d) => d.spvId).map((d) => d.spvId));
  const respinse = [];
  const rez = { primite: 0, emise: 0, erori: 0, deVerificat: 0 };
  const a = await acces();
  const noi = lista.filter((m) => !vazute.has(String(m.id)) && /FACTURA (PRIMITA|TRIMISA)|ERORI/i.test(m.tip || ''));
  let i = 0;
  for (const m of noi) {
    onProgres && onProgres(++i, noi.length);
    if (/ERORI/i.test(m.tip)) {
      respinse.push({ id: m.id, detalii: m.detalii, data: m.data_creare });
      rez.erori++;
      continue;
    }
    const z = await get(`descarcare?id=${encodeURIComponent(m.id)}`, a);
    const fisiere = await unzip(z.bytes);
    const numeXml = Object.keys(fisiere).find((n) => n.toLowerCase().endsWith('.xml') && !/semnatura/i.test(n));
    if (!numeXml) continue;
    let r;
    try { r = await salveazaFactura(fisiere[numeXml], m, set, docs); } catch (e) { console.warn(e); continue; }
    const { doc, primita } = r;
    if (primita) rez.primite++; else rez.emise++;
    if (doc.deVerificat) rez.deVerificat++;
  }
  const meta = (await db.get('meta', 'spv')) || { id: 'spv' };
  await db.put('meta', { ...meta, ultima: Date.now(), respinse: [...respinse, ...(meta.respinse || [])].slice(0, 30), ultimRezultat: rez });
  return rez;
}


/** Transformă XML-ul unei e-Facturi în document (cu nota contabilă). m: mesajul SPV ({ id, tip, id_solicitare }) sau {}. */
export async function salveazaFactura(xmlBytes, m, set, docs) {
  const xml = typeof xmlBytes === 'string' ? xmlBytes : dec.decode(xmlBytes);
  const f = citesteFactura(xml);
  const cifFirma = curataCUI(set.cui);
  const primita = m.tip ? /PRIMITA/i.test(m.tip) : curataCUI(f.client.cui) === cifFirma || (curataCUI(f.furnizor.cui) !== cifFirma);
    const partener = primita ? f.furnizor : f.client;

    // dacă factura există deja (introdusă de mână), o legăm de SPV în loc să o dublăm
    const dublura = docs.find((d) => !d.spvId && d.nr && String(d.nr).replace(/\s/g, '') === String(f.nr).replace(/\s/g, '') && curataCUI(d.partener?.cui) === curataCUI(partener.cui));
    let totalLei = f.total, tvaLei = f.tva, cursV = 1;
    if (f.moneda && f.moneda !== 'RON') {
      cursV = (await curs(f.data, f.moneda)) || 0;
      if (cursV) { totalLei = r2(f.total * cursV); tvaLei = r2(f.tva * cursV); }
    }
    const cotaPrincipala = Number(Object.keys(f.cote).sort((x, y) => Math.abs(f.cote[y].baza) - Math.abs(f.cote[x].baza))[0] || 0) / 100;
    const descriere = (f.linii.map((l) => l.denumire).filter(Boolean).join(', ') || f.note || 'Factură SPV').slice(0, 90);
    const sug = primita ? sugestieLocala(`${descriere} ${partener.nume}`, totalLei) : null;
    const pdf = await pdfDinXml(xml, f.tip === 'storno');
    const doc = {
      ...(dublura || {}),
      id: dublura?.id || (m.id ? 'spv-' + m.id : 'xml-' + (curataCUI(partener.cui) || 'x') + '-' + String(f.nr).replace(/[^\w-]/g, '')),
      tip: primita ? 'cheltuiala' : 'venit',
      tipDocument: f.tip === 'storno' ? 'Factura storno' : 'Factura',
      data: f.data, scadenta: f.scadenta || '', nr: f.nr,
      partener: { nume: partener.nume, cui: partener.cui, adresa: partener.adresa, regCom: partener.regCom, platitorTVA: partener.platitorTVA, iban: partener.iban || f.ibanFurnizor || '' },
      descriere,
      total: totalLei, tva: set.platitorTVA ? tvaLei : 0, tvaCota: set.platitorTVA ? cotaPrincipala : 0,
      taxareInversa: !!f.taxareInversa,
      moneda: f.moneda, totalValuta: f.moneda !== 'RON' ? f.total : null, curs: f.moneda !== 'RON' ? cursV : null,
      cont: dublura?.cont || (primita ? (sug?.cont || '628') : '704'),
      tvaDeductibil: dublura?.tvaDeductibil ?? (sug?.tvaDeductibil ?? 100),
      plata: dublura?.plata || 'neplatit',
      spvId: m.id ? String(m.id) : null, spvIndex: m.id_solicitare || null, sursa: m.id ? 'SPV' : 'XML',
      deVerificat: !dublura && primita, motivCont: sug?.motiv || (primita ? 'Cont propus implicit; verifică-l.' : ''),
      linii: f.linii.slice(0, 50),
      fisier: pdf ? { name: `${f.nr || m.id || 'factura'}.pdf`, type: 'application/pdf', dataUrl: 'data:application/pdf;base64,' + b64(pdf) } : { name: `${f.nr || m.id || 'factura'}.xml`, type: 'application/xml', dataUrl: 'data:application/xml;base64,' + b64(enc.encode(xml)) },
      xmlSpv: b64((typeof xmlBytes === 'string' ? enc.encode(xmlBytes) : xmlBytes)),
    };
    if (f.moneda !== 'RON' && !cursV) doc.deVerificat = true;
    await salveazaDocument(doc, set);
  return { doc, primita };
}

/** Import manual: un fișier ZIP descărcat din SPV / ACM Docs sau XML-ul facturii. */
export async function importaFisier(file) {
  const set = await getSetari();
  const docs = await db.all('documente');
  const buf = new Uint8Array(await file.arrayBuffer());
  const xmluri = [];
  if (buf[0] === 0x50 && buf[1] === 0x4b) {
    const f = await unzip(buf);
    for (const [n, b] of Object.entries(f)) if (n.toLowerCase().endsWith('.xml') && !/semnatura/i.test(n)) xmluri.push(b);
  } else xmluri.push(buf);
  const rez = [];
  for (const x of xmluri) rez.push(await salveazaFactura(x, {}, set, docs));
  return rez;
}

export { uid };
