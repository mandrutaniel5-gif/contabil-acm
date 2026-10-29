// Cursul BNR, luat automat (zilnic și pe tot anul) și păstrat local.
// Din 2026 fișierele XML sunt pe curs.bnr.ro (vechile adrese de pe www.bnr.ro întorc o pagină HTML).
import { db } from './db.js';
import { nativeFetch, areHttpNativ } from './host.js';

function parse(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out = {};
  for (const cube of doc.getElementsByTagName('Cube')) {
    const d = cube.getAttribute('date');
    const r = {};
    for (const rate of cube.getElementsByTagName('Rate')) {
      const m = Number(rate.getAttribute('multiplier') || 1);
      r[rate.getAttribute('currency')] = parseFloat(rate.textContent) / m;
    }
    out[d] = r;
  }
  return out;
}

export const ultimaEroare = { text: '' };
/** Descarcă și citește un fișier XML al BNR; încearcă pe rând adresele date (site-ul BNR are mai multe). */
async function descarca(...urls) {
  let err;
  for (const url of urls) {
    try {
      const r = await nativeFetch(url, { headers: { Accept: 'application/xml,text/xml,*/*' } });
      if (!r.ok) throw new Error(`BNR nu a răspuns (${r.status}) la ${url}`);
      const o = parse(r.text());
      if (Object.keys(o).length) return o;
      throw new Error(`Răspuns fără cursuri de la ${url}: ${r.text().slice(0, 80)}`);
    } catch (e) { err = e; }
  }
  ultimaEroare.text = err?.message || '';
  throw err;
}

/** Actualizează cursurile anului curent (și, la nevoie, ale anului trecut). Rulează o dată pe zi. */
export async function actualizeaza({ fortat = false } = {}) {
  if (!areHttpNativ() || !navigator.onLine) return null;
  const st = (await db.get('meta', 'bnr')) || { id: 'bnr', zi: '' };
  const azi = new Date().toISOString().slice(0, 10);
  if (!fortat && st.zi === azi) return st;
  const an = new Date().getFullYear();
  const anCur = await descarca(`https://curs.bnr.ro/files/xml/years/nbrfxrates${an}.xml`, `https://www.bnr.ro/files/xml/years/nbrfxrates${an}.xml`).catch(() => ({}));
  const ultim = await descarca('https://curs.bnr.ro/nbrfxrates.xml', 'https://curs.bnr.ro/nbrfxrates10days.xml', 'https://www.bnr.ro/nbrfxrates.xml').catch(() => ({}));
  await db.put('meta', { id: `bnr:${an}`, cursuri: { ...((await db.get('meta', `bnr:${an}`))?.cursuri || {}), ...anCur, ...ultim } });
  if (!(await db.get('meta', `bnr:${an - 1}`))) {
    const prec = await descarca(`https://curs.bnr.ro/files/xml/years/nbrfxrates${an - 1}.xml`, `https://www.bnr.ro/files/xml/years/nbrfxrates${an - 1}.xml`).catch(() => null);
    if (prec) await db.put('meta', { id: `bnr:${an - 1}`, cursuri: prec });
  }
  const nou = { id: 'bnr', zi: azi };
  await db.put('meta', nou);
  return nou;
}

/** Cursul valabil la o dată (ultima zi bancară dinainte, dacă data e weekend/sărbătoare). */
export async function curs(data, moneda = 'EUR') {
  if (!moneda || moneda === 'RON') return 1;
  const an = Number(String(data).slice(0, 4));
  for (const a of [an, an - 1]) {
    const c = (await db.get('meta', `bnr:${a}`))?.cursuri;
    if (!c) continue;
    const zile = Object.keys(c).filter((d) => d <= data && c[d][moneda]).sort();
    if (zile.length) return c[zile[zile.length - 1]][moneda];
  }
  return null;
}

/** Cursul EUR din ultima zi a anului precedent: folosit pentru plafonul microîntreprinderii. */
export async function cursInchidereAn(an) { return curs(`${an}-12-31`, 'EUR'); }
