// Extrase bancare: import (CSV, MT940, CAMT.053, PDF/poză prin AI) și potrivire automată cu facturile.
import { db, uid } from './db.js';
import { getSetari, salveazaNota, r2, balanta, reguli } from './engine.js';
import { sugestieLocala } from './ai.js';
import { curataCUI } from './ubl.js';
import { furnizorStrain } from './rules.js';

// ---------------------------------------------------------------- utilitare
const fara = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function numar(v) {
  if (typeof v === 'number') return v;
  let s = String(v || '').trim().replace(/\s| /g, '').replace(/(RON|LEI|EUR|USD)$/i, '');
  if (!s) return NaN;
  const neg = /^\(.*\)$/.test(s) || /-$/.test(s);
  s = s.replace(/[()]/g, '').replace(/-$/, '');
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > ld) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return neg ? -Math.abs(n) : n;
}
export function dataISO(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return '';
}
async function amprenta(t) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode([t.data, r2(t.suma), fara(t.detalii).slice(0, 80), fara(t.contraparte).slice(0, 40)].join('|')));
  return [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------- parsere
function csvRanduri(text) {
  const prima = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const sep = [';', '\t', ','].sort((a, b) => prima.split(b).length - prima.split(a).length)[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const COLOANE = {
  data: ['data tranzactiei', 'data tranzactie', 'data operatiunii', 'data inregistrarii', 'data valutei', 'completed date', 'started date', 'booking date', 'date', 'data'],
  suma: ['suma', 'amount', 'valoare', 'sum'],
  debit: ['debit', 'plati', 'sume debitoare', 'iesiri'],
  credit: ['credit', 'incasari', 'sume creditoare', 'intrari'],
  detalii: ['descriere', 'detalii tranzactie', 'detalii', 'description', 'explicatie', 'explicatii', 'reference', 'referinta', 'tip tranzactie'],
  contraparte: ['beneficiar', 'ordonator', 'nume beneficiar/ordonator', 'contrapartida', 'partener', 'counterparty', 'payee', 'nume'],
  iban: ['cont beneficiar', 'iban beneficiar', 'cont partener', 'iban'],
  moneda: ['moneda', 'currency', 'valuta'],
};
function parseCSV(text) {
  const rows = csvRanduri(text);
  let hi = -1, map = {};
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const h = rows[i].map((c) => fara(c).trim());
    const m = {};
    for (const [k, alias] of Object.entries(COLOANE)) {
      const idx = h.findIndex((c) => alias.some((a) => c === a || c.startsWith(a)));
      if (idx >= 0) m[k] = idx;
    }
    if (m.data != null && (m.suma != null || m.debit != null || m.credit != null)) { hi = i; map = m; break; }
  }
  if (hi < 0) throw new Error('Nu am recunoscut coloanele extrasului (dată, sumă). Încearcă exportul în format CSV, MT940 sau CAMT, ori încarcă PDF-ul.');
  const out = [];
  for (const r of rows.slice(hi + 1)) {
    const data = dataISO(r[map.data]);
    if (!data) continue;
    let suma = map.suma != null ? numar(r[map.suma]) : NaN;
    if (!Number.isFinite(suma)) {
      const d = numar(r[map.debit]), c = numar(r[map.credit]);
      suma = (Number.isFinite(c) ? Math.abs(c) : 0) - (Number.isFinite(d) ? Math.abs(d) : 0);
    }
    if (!Number.isFinite(suma) || !suma) continue;
    out.push({ data, suma: r2(suma), detalii: (r[map.detalii] || '').trim(), contraparte: (r[map.contraparte] || '').trim(), iban: (r[map.iban] || '').trim(), moneda: (r[map.moneda] || '').trim().toUpperCase() });
  }
  return { tranzactii: out };
}

function parseMT940(text) {
  const out = []; let cur = null; let iban = '';
  const lines = text.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith(':25:')) iban = l.slice(4).trim();
    if (l.startsWith(':61:')) {
      const m = l.slice(4).match(/^(\d{6})(\d{4})?(R?[CD])([A-Z])?(\d+,\d*)/);
      if (!m) continue;
      const y = '20' + m[1].slice(0, 2);
      const suma = parseFloat(m[5].replace(',', '.')) * (m[3].endsWith('D') ? -1 : 1) * (m[3].startsWith('R') ? -1 : 1);
      cur = { data: `${y}-${m[1].slice(2, 4)}-${m[1].slice(4, 6)}`, suma: r2(suma), detalii: '', contraparte: '' };
      out.push(cur);
    } else if (l.startsWith(':86:') && cur) {
      let d = l.slice(4);
      while (lines[i + 1] && !lines[i + 1].startsWith(':')) d += ' ' + lines[++i];
      cur.detalii = d.replace(/\?\d{2}/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  return { iban, tranzactii: out };
}

function parseCAMT(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const g = (el, n) => el.getElementsByTagNameNS('*', n)[0];
  const t = (el, n) => (g(el, n)?.textContent || '').trim();
  const out = [];
  for (const e of doc.getElementsByTagNameNS('*', 'Ntry')) {
    const amt = parseFloat(t(e, 'Amt'));
    const semn = t(e, 'CdtDbtInd') === 'DBIT' ? -1 : 1;
    const bk = g(e, 'BookgDt');
    const rp = g(e, 'RltdPties');
    const parte = rp ? (semn > 0 ? g(rp, 'Dbtr') : g(rp, 'Cdtr')) : null;
    out.push({
      data: dataISO(bk ? t(bk, 'Dt') || t(bk, 'DtTm') : ''), suma: r2(amt * semn),
      detalii: [...e.getElementsByTagNameNS('*', 'Ustrd')].map((x) => x.textContent.trim()).join(' ') || t(e, 'AddtlNtryInf'),
      contraparte: parte ? t(parte, 'Nm') : '', iban: rp ? t(semn > 0 ? (g(rp, 'DbtrAcct') || rp) : (g(rp, 'CdtrAcct') || rp), 'IBAN') : '',
    });
  }
  const acct = g(doc, 'Acct');
  return { iban: acct ? t(acct, 'IBAN') : '', tranzactii: out.filter((x) => x.data) };
}

export async function citesteFisier(file) {
  const nume = file.name.toLowerCase();
  if (/\.(pdf|jpe?g|png|heic|webp)$/.test(nume) || file.type.startsWith('image/') || file.type === 'application/pdf') return { necesitaAI: true };
  const buf = new Uint8Array(await file.arrayBuffer());
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1250').decode(buf);
  if (/<Document[\s>][\s\S]*BkToCstmrStmt/.test(text)) return parseCAMT(text);
  if (/:20:|:61:/.test(text)) return parseMT940(text);
  return parseCSV(text);
}

// ---------------------------------------------------------------- potrivire automată
const REGULI_TEXT = [
  { test: /comision|taxa (de )?administrare|abonament (cont|pachet)|cost (operatiune|tranzactie)|fee\b|tax[aă] serviciu/, sens: -1, cont: '627', motiv: 'Comision bancar' },
  { test: /dobanda|interest/, sens: 1, cont: '766', motiv: 'Dobândă primită' },
  { test: /dobanda|interest/, sens: -1, cont: '666', motiv: 'Dobândă plătită' },
  { test: /retragere (numerar|atm)|atm|cash withdrawal|ridicare numerar/, sens: -1, tip: 'ridicare', motiv: 'Ridicare numerar în casă' },
  { test: /depunere numerar|cash deposit/, sens: 1, tip: 'depunere', motiv: 'Depunere numerar din casă' },
  { test: /capital social|aport/, sens: 1, cont: '456', motiv: 'Depunere capital social' },
];

/** Numărul facturii apare în text? „ACM-0021” se potrivește cu „acm 21”, „ACM0021”, „factura nr. 21”. */
export function numarInText(nr, text) {
  const m = fara(nr).match(/^([a-z]*)[^a-z0-9]*0*(\d+)$/);
  if (!m || !m[2]) return false;
  const [, serie, num] = m;
  const t = ' ' + text.replace(/[^a-z0-9]+/g, ' ') + ' ';
  if (serie && new RegExp(` ${serie} ?0*${num} `).test(t)) return true;
  return new RegExp(` (factura|fact|fc|ff|inv|invoice|nr) ?(nr )?0*${num} `).test(t) || (num.length >= 4 && t.includes(` ${num} `));
}

function scorDocument(t, d) {
  let s = 0;
  const text = fara(`${t.detalii} ${t.contraparte}`);
  const rest = r2(Number(d.total) - Number(d.platitPartial || 0));
  if (Math.abs(Math.abs(t.suma) - rest) < 0.011) s += 50;
  else if (Math.abs(Math.abs(t.suma) - Number(d.total)) < 0.011) s += 45;
  const nume = fara(d.partener?.nume).replace(/\b(s\.?r\.?l\.?|s\.?a\.?|srl|sa|pfa|ii|ltd|gmbh|inc)\b/g, '').split(/\s+/).filter((w) => w.length > 2);
  if (nume.length && nume.filter((w) => text.includes(w)).length >= Math.min(2, nume.length)) s += 30;
  const cui = curataCUI(d.partener?.cui);
  if (cui && text.replace(/\D/g, ' ').split(/\s+/).includes(cui)) s += 30;
  if (d.nr && numarInText(d.nr, text)) s += 35;
  if (d.partener?.iban && t.iban && t.iban.replace(/\s/g, '') === d.partener.iban.replace(/\s/g, '')) s += 40;
  if (t.data < d.data) s -= 25;
  return s;
}

/** Propune înregistrarea unei tranzacții. încredere ≥ 80 → se înregistrează singură. */
export function propune(t, ctx) {
  const { documente, setari, solduri } = ctx;
  const text = fara(`${t.detalii} ${t.contraparte}`);
  const sens = t.suma > 0 ? 1 : -1;
  const contBanca = ctx.contBanca || '5121';
  const S = Math.abs(t.suma);

  // 0. deja înregistrată (bon plătit cu cardul, operațiune sau formular introduse înainte de extras): doar se leagă
  const zi = (x, n) => { const d = new Date(x + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  const legate = ctx.legate || new Set();
  const existenta = (ctx.note || []).find((n) => !legate.has(n.id) && !n.sursa?.extrasId && n.data >= zi(t.data, -7) && n.data <= zi(t.data, 3)
    && n.linii.some((l) => Math.abs(Number(l.suma) - S) < 0.011 && (sens > 0 ? l.d === contBanca : l.c === contBanca)));
  if (existenta) {
    return { incredere: 95, legaNota: existenta.id, motiv: `Deja înregistrată: ${existenta.explicatie || existenta.document || ''}`.slice(0, 140), linii: [] };
  }

  // 1. factură deschisă (client sau furnizor)
  const deschise = documente.filter((d) => d.plata === 'neplatit' && !d.achitat && (sens > 0 ? d.tip === 'venit' : d.tip === 'cheltuiala'));
  const best = deschise.map((d) => ({ d, s: scorDocument(t, d) })).sort((a, b) => b.s - a.s)[0];
  if (best && best.s >= 50) {
    const d = best.d;
    const contP = d.tip === 'venit' ? '411' : (String(d.cont).startsWith('2') ? '404' : '401');
    return {
      incredere: Math.min(99, best.s), docId: d.id,
      motiv: `${sens > 0 ? 'Încasare' : 'Plată'} factura ${d.nr || ''} — ${d.partener?.nume || ''}`.trim(),
      linii: sens > 0 ? [{ d: contBanca, c: contP, suma: S }] : [{ d: contP, c: contBanca, suma: S }],
      partener: d.partener?.nume || '',
    };
  }
  // 2. impozite și taxe (ANAF / Trezorerie): o plată poate acoperi mai multe obligații deodată (contul unic),
  //    iar obligațiile se adună lună de lună; căutăm combinația de obligații neplătite care dă exact suma.
  if (sens < 0 && /anaf|trezorerie|treasury|buget(ul)? (de )?stat|cont unic|d112|d100|d300|impozit (pe|micro)/.test(text)) {
    const NUME = { 4418: 'impozit micro', 4411: 'impozit pe profit', 4423: 'TVA', 446: 'impozit pe dividende', 444: 'impozit pe salarii', 4315: 'CAS', 4316: 'CASS', 436: 'CAM' };
    const items = obligatiiDeschise(ctx.note || [], Object.keys(NUME), t.data);
    let best = null;
    const n = Math.min(items.length, 16);
    for (let mask = 1; mask < 1 << n; mask++) {
      let sum = 0, k = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { sum += items[i].suma; k++; }
      if (Math.abs(sum - S) < 0.6 && (!best || k < best.k)) best = { mask, k };
    }
    if (best) {
      const sel = items.slice(0, n).filter((_, i) => best.mask & (1 << i));
      const per = {}; for (const x of sel) per[x.cont] = r2((per[x.cont] || 0) + x.suma);
      return { incredere: 92, motiv: `Plată la ANAF: ${[...new Set(sel.map((x) => NUME[x.cont] + ' ' + x.per))].join(', ')}`, linii: Object.entries(per).map(([c, v]) => ({ d: c, c: contBanca, suma: v, expl: 'Plată ' + NUME[c] })) };
    }
    const [c, m] = setari.regim === 'micro' ? ['4418', 'impozit micro'] : ['4411', 'impozit pe profit'];
    return { incredere: 55, motiv: `Plată la ANAF, probabil ${m}. Suma nu se potrivește cu nicio datorie din aplicație: verifică.`, linii: [{ d: c, c: contBanca, suma: S }] };
  }
  // 2b. salariul net plătit unui angajat
  if (sens < 0 && (solduri['421'] || 0) > 0.009) {
    const ang = (ctx.salariati || []).find((a) => fara(a.nume).split(/\s+/).filter((w) => w.length > 2).every((w) => text.includes(w)));
    if (ang || /salariu|salar|lichidare|avans chenzina/.test(text)) {
      return { incredere: ang && S <= solduri['421'] + 0.01 ? 92 : 70, motiv: `Plată salariu${ang ? ' ' + ang.nume : ''}`, linii: [{ d: '421', c: contBanca, suma: S }] };
    }
  }
  // 3. reguli de text (comisioane, dobânzi, numerar, capital)
  for (const r of REGULI_TEXT) {
    if (r.sens !== sens || !r.test.test(text)) continue;
    if (r.tip === 'ridicare') return { incredere: 85, motiv: r.motiv, linii: [{ d: '581', c: contBanca, suma: S }, { d: '5311', c: '581', suma: S }] };
    if (r.tip === 'depunere') return { incredere: 85, motiv: r.motiv, linii: [{ d: '581', c: '5311', suma: S }, { d: contBanca, c: '581', suma: S }] };
    return { incredere: 90, motiv: r.motiv, linii: sens > 0 ? [{ d: contBanca, c: r.cont, suma: S }] : [{ d: r.cont, c: contBanca, suma: S }] };
  }
  // 4. administratorul
  // dividende plătite asociatului (după hotărârea de distribuire: 457 are sold)
  if (sens < 0 && /dividend/.test(text) && (solduri['457'] || 0) > 0.009) {
    return { incredere: S <= solduri['457'] + 0.01 ? 90 : 60, motiv: 'Plată dividende către asociat', linii: [{ d: '457', c: contBanca, suma: S }] };
  }
  const admin = fara(setari.administrator).split(/\s+/).filter((w) => w.length > 2);
  if (admin.length && admin.filter((w) => text.includes(w)).length >= Math.min(2, admin.length)) {
    return sens > 0
      ? { incredere: 70, motiv: 'Bani puși de administrator în firmă (împrumut)', linii: [{ d: contBanca, c: '4551', suma: S }] }
      : { incredere: 55, motiv: 'Bani dați administratorului (rambursare împrumut sau decont). Dacă sunt dividende, alege „Distribuire dividende”.', linii: [{ d: '4551', c: contBanca, suma: S }] };
  }
  // 5. transfer între conturile firmei
  if (setari.iban && t.iban && t.iban.replace(/\s/g, '') === setari.iban.replace(/\s/g, '')) {
    return { incredere: 80, motiv: 'Transfer între conturile firmei', linii: sens > 0 ? [{ d: contBanca, c: '581', suma: S }] : [{ d: '581', c: contBanca, suma: S }] };
  }
  // 6. plată cu cardul fără factură în aplicație (abonamente, reclame): se creează cheltuiala, de completat cu factura
  if (sens < 0) {
    const strain = furnizorStrain(`${t.contraparte} ${t.detalii}`);
    const inv = ctx.invatat?.get(cheieContraparte(t));
    if (inv) return { incredere: inv.n >= 1 ? 88 : 70, motiv: `La fel ca plățile anterioare către ${t.contraparte || 'acest furnizor'}: ${inv.nume}. Atașează factura când o primești.`, cheltuialaNoua: { cont: inv.cont, tvaDeductibil: inv.tvaDeductibil ?? 100, taxareInversa: inv.taxareInversa ?? strain }, linii: [{ d: inv.cont, c: contBanca, suma: S }] };
    const sug = sugestieLocala(`${t.contraparte} ${t.detalii}`, S);
    if (sug) return { incredere: 65, motiv: `Plată ${t.contraparte || ''} — ${sug.motiv}${strain ? ' Furnizor din străinătate: taxare inversă.' : ''} Atașează factura când o primești.`.trim(), cheltuialaNoua: { cont: sug.cont, tvaDeductibil: sug.tvaDeductibil, taxareInversa: strain }, linii: [{ d: sug.cont, c: contBanca, suma: S }] };
  }
  return { incredere: 0, motiv: sens > 0 ? 'Încasare neidentificată' : 'Plată neidentificată', linii: [] };
}

const cheieContraparte = (t) => fara(t.contraparte || t.detalii || '').replace(/\d+([.,]\d+)?/g, ' ').replace(/\b(pos|usd|eur|ron|srl|sa|inc|ltd)\b/g, ' ').replace(/[^a-z ]/g, ' ').split(/\s+/).filter((w) => w.length > 2).slice(0, 3).join(' ');
/** Ce a ales utilizatorul la plățile anterioare (cheltuieli fără factură, plătite cu cardul), pe contraparte. */
function invatat(extrase) {
  const m = new Map();
  for (const x of extrase) for (const y of x.tranzactii) {
    const p = y.propunere;
    if (y.stare !== 'inregistrat' || !p || p.legaNota || p.docId || !p.cheltuialaNoua || y.suma > 0) continue;
    const k = cheieContraparte(y); if (!k) continue;
    const v = m.get(k) || { n: 0 };
    m.set(k, { cont: p.cheltuialaNoua.cont, tvaDeductibil: p.cheltuialaNoua.tvaDeductibil, taxareInversa: p.cheltuialaNoua.taxareInversa, nume: (p.motiv || '').split('—')[1]?.split('.')[0]?.trim() || p.cheltuialaNoua.cont, n: v.n + 1 });
  }
  return m;
}

/** Obligațiile neplătite pe conturi, pe luni (cele mai vechi se sting primele cu plățile deja făcute). */
export function obligatiiDeschise(note, conturi, pana = '9999-12-31') {
  const out = [];
  for (const cont of conturi) {
    const cred = {}; let deb = 0;
    for (const n of note) {
      if (n.data > pana) continue;
      for (const l of n.linii) {
        if (l.c === cont) { const k = n.data.slice(0, 7); cred[k] = r2((cred[k] || 0) + Number(l.suma)); }
        if (l.d === cont) deb = r2(deb + Number(l.suma));
      }
    }
    for (const k of Object.keys(cred).sort()) {
      const v = r2(cred[k] - Math.min(deb, cred[k])); deb = r2(Math.max(0, deb - cred[k]));
      if (v > 0.009) out.push({ cont, per: k.slice(5) + '.' + k.slice(0, 4), luna: k, suma: v });
    }
  }
  return out.sort((a, b) => a.luna.localeCompare(b.luna)).slice(-16);
}

function soldurile(note, setari) {
  const an = new Date().getFullYear();
  const b = balanta(note, setari, `${an - 1}-01-01`, `${an}-12-31`);
  const o = {};
  for (const r of b.rows) o[r.cod] = r2(r.sfc - r.sfd);
  return o;
}

/** Importă tranzacțiile (fără dubluri), le propune înregistrarea și le înregistrează singure pe cele sigure. */
export async function importa({ banca, iban, moneda, tranzactii, perioada }, { autoPrag = 80 } = {}) {
  const setari = await getSetari();
  const contBanca = moneda && moneda !== 'RON' ? '5124' : '5121';
  const existente = new Set((await db.all('extrase')).flatMap((e) => e.tranzactii.map((t) => t.id)));
  const lista = [];
  for (const t of tranzactii) {
    t.id = await amprenta(t);
    if (!existente.has(t.id) && !lista.some((x) => x.id === t.id)) lista.push({ ...t, stare: 'nou' });
  }
  const ex = { id: uid(), banca: banca || '', iban: iban || '', moneda: moneda || 'RON', contBanca, perioada: perioada || null, importat: Date.now(), tranzactii: lista };
  await db.put('extrase', ex);
  return proceseaza(ex.id, { autoPrag, setari });
}

export async function proceseaza(extrasId, { autoPrag = 80, setari } = {}) {
  setari = setari || await getSetari();
  const ex = await db.get('extrase', extrasId);
  let auto = 0, deConfirmat = 0;
  const { lista: listaSalariati } = await import('./salarii.js');
  const salariati = await listaSalariati();
  const toate = await db.all('extrase');
  const legate = new Set(toate.flatMap((x) => x.tranzactii.map((y) => y.legat || y.notaId).filter(Boolean)));
  const inv = invatat(toate);
  for (const t of ex.tranzactii) {
    if (t.stare === 'inregistrat' || t.stare === 'ignorat') continue;
    const documente = await db.all('documente');
    const note = await db.all('note');
    const p = propune(t, { documente, note, setari, solduri: soldurile(note, setari), contBanca: ex.contBanca, legate, salariati, invatat: inv });
    if (p.legaNota) legate.add(p.legaNota);
    t.propunere = p;
    if (p.incredere >= autoPrag && (p.linii.length || p.legaNota)) { await aplica(ex, t, p, setari); auto++; }
    else { t.stare = p.linii.length || p.legaNota ? 'propus' : 'neclar'; deConfirmat++; }
  }
  await db.put('extrase', ex);
  return { extrasId: ex.id, total: ex.tranzactii.length, auto, deConfirmat };
}

/** Înregistrează o tranzacție: nota contabilă, factura marcată achitată sau cheltuiala nouă. */
export async function aplica(ex, t, p, setari) {
  setari = setari || await getSetari();
  if (p.legaNota) { t.stare = 'inregistrat'; t.legat = p.legaNota; t.propunere = p; return; }
  let docId = p.docId;
  if (p.cheltuialaNoua) {
    const { salveazaDocument } = await import('./engine.js');
    const d = {
      id: uid(), tip: 'cheltuiala', tipDocument: 'Plată card', data: t.data, nr: '', partener: { nume: t.contraparte || 'Plată card', cui: '' },
      descriere: (t.detalii || t.contraparte || '').slice(0, 80), total: Math.abs(t.suma), tva: 0, tvaCota: 0,
      cont: p.cheltuialaNoua.cont, tvaDeductibil: p.cheltuialaNoua.tvaDeductibil, plata: 'banca', sursa: 'extras', deVerificat: true,
      ...(p.cheltuialaNoua.taxareInversa ? { taxareInversa: true, tvaCota: reguli(setari).tva.standard } : {}),
      motivCont: 'Creată din extras: atașează factura furnizorului.', extrasTx: t.id,
    };
    await salveazaDocument(d, setari);
    t.stare = 'inregistrat'; t.docId = d.id; t.notaId = d.notaId;
    return;
  }
  const n = await salveazaNota({
    data: t.data, document: `Extras ${ex.banca || 'bancă'} ${t.data}`, partener: p.partener || t.contraparte || '',
    explicatie: `${p.motiv}${t.detalii ? ' — ' + t.detalii.slice(0, 120) : ''}`, linii: p.linii.map((l) => ({ ...l, expl: l.expl || p.motiv })),
    tipNota: 'extras', sursa: { extrasId: ex.id, tx: t.id },
  });
  t.stare = 'inregistrat'; t.notaId = n.id;
  if (docId) {
    const d = await db.get('documente', docId);
    if (d) {
      const platit = r2(Number(d.platitPartial || 0) + Math.abs(t.suma));
      await db.put('documente', { ...d, platitPartial: platit, achitat: platit >= Number(d.total) - 0.01, dataPlata: t.data });
    }
    t.docId = docId;
  }
}

export async function confirma(extrasId, txId, propunere) {
  const ex = await db.get('extrase', extrasId);
  const t = ex.tranzactii.find((x) => x.id === txId);
  await aplica(ex, t, propunere || t.propunere);
  await db.put('extrase', ex);
}
export async function ignora(extrasId, txId) {
  const ex = await db.get('extrase', extrasId);
  const t = ex.tranzactii.find((x) => x.id === txId);
  t.stare = 'ignorat';
  await db.put('extrase', ex);
}
export async function anuleaza(extrasId, txId) {
  const ex = await db.get('extrase', extrasId);
  const t = ex.tranzactii.find((x) => x.id === txId);
  if (t.legat) { delete t.legat; t.stare = 'nou'; await db.put('extrase', ex); return; }
  if (t.notaId) await db.del('note', t.notaId);
  if (t.docId) {
    const d = await db.get('documente', t.docId);
    if (d && d.extrasTx === t.id) { await db.del('documente', d.id); }
    else if (d) { const platit = r2(Math.max(0, Number(d.platitPartial || 0) - Math.abs(t.suma))); await db.put('documente', { ...d, platitPartial: platit, achitat: platit >= Number(d.total) - 0.01 }); }
  }
  t.stare = 'nou'; delete t.notaId; delete t.docId;
  await db.put('extrase', ex);
}

export { reguli };
