// Motorul contabil: note, registre, balanță, închideri automate, calcule fiscale.
import { db, uid } from './db.js';
import { cont } from './conturi.js';
import { RULES_2026 } from './rules.js';

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const lei = (n) => (Number(n) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------- Perioade ----------
export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const azi = () => iso(new Date());
export function lunaInterval(an, luna) { // luna 1-12
  const last = new Date(an, luna, 0).getDate();
  return { from: `${an}-${pad(luna)}-01`, to: `${an}-${pad(luna)}-${pad(last)}` };
}
export function trimInterval(an, t) {
  const l1 = (t - 1) * 3 + 1;
  return { from: lunaInterval(an, l1).from, to: lunaInterval(an, l1 + 2).to };
}
export const trimDinLuna = (luna) => Math.ceil(luna / 3);
export const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
export const dataRo = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };

// ---------- Setări ----------
export const SETARI_IMPLICITE = {
  id: 'firma',
  nume: 'ACM CODE S.R.L.', cui: '', regCom: '', adresa: '', iban: '', banca: '',
  regim: 'micro',            // 'micro' | 'profit'
  platitorTVA: false, perioadaTVA: 'trimestru', tvaLaIncasare: false,
  areSalariati: false,
  anCurent: new Date().getFullYear(),
  cursEUR: 5.0,              // curs BNR la închiderea exercițiului precedent (pentru plafonul micro)
  soldInitial: {},           // { '5121': {d: 0, c: 0}, ... } la 1 ianuarie
  ai: { functionUrl: '', firebaseApiKey: '', email: '' },
  tema: 'auto',
  reguli: null,              // suprascrieri pentru RULES_2026
};
export async function getSetari() {
  const s = await db.get('settings', 'firma');
  return { ...SETARI_IMPLICITE, ...(s || {}), ai: { ...SETARI_IMPLICITE.ai, ...((s && s.ai) || {}) } };
}
export const saveSetari = (s) => db.put('settings', { ...s, id: 'firma' });
/** Firma e plătitoare de TVA la data respectivă (se poate înregistra în cursul anului, de la data „tvaDeLa”). */
export const tvaLa = (setari, data) => !!setari.platitorTVA && (!setari.tvaDeLa || String(data || '9999-12-31') >= setari.tvaDeLa);
export function reguli(setari) {
  const r = structuredClone(RULES_2026);
  if (setari && setari.reguli) {
    for (const k of Object.keys(setari.reguli)) {
      const v = setari.reguli[k];
      if (v == null) continue;
      r[k] = typeof r[k] === 'object' && !Array.isArray(r[k]) ? { ...r[k], ...v } : v;
    }
  }
  return r;
}

// ---------- Note contabile ----------
export async function toateNotele() {
  const n = await db.all('note');
  return n.sort((a, b) => (a.data + pad(a.nr || 0).padStart(6, '0')).localeCompare(b.data + pad(b.nr || 0).padStart(6, '0')));
}
export function validNota(n) {
  const err = [];
  if (!n.data) err.push('Lipsește data.');
  if (!n.linii || !n.linii.length) err.push('Nota nu are nicio înregistrare.');
  for (const l of n.linii || []) {
    if (!l.d || !l.c) err.push('Fiecare rând trebuie să aibă cont debitor și cont creditor.');
    if (l.d === l.c) err.push(`Contul ${l.d} nu poate fi și debitor și creditor.`);
    if (!Number(l.suma)) err.push('Suma nu poate fi zero.');
    if (!/^\d{3,6}$/.test(String(l.d || '')) || !/^\d{3,6}$/.test(String(l.c || ''))) err.push('Conturile trebuie să fie coduri numerice din planul de conturi (ex. 401, 5121).');
  }
  return [...new Set(err)];
}
export async function salveazaNota(n) {
  const e = validNota(n);
  if (e.length) throw new Error(e.join(' '));
  if (!n.id) n.id = uid();
  if (!n.nr) {
    const all = await db.all('note');
    const an = n.data.slice(0, 4);
    n.nr = all.filter((x) => x.data.slice(0, 4) === an).reduce((m, x) => Math.max(m, x.nr || 0), 0) + 1;
  }
  n.linii = n.linii.map((l) => ({ ...l, suma: r2(l.suma) }));
  n.modificat = new Date().toISOString();
  return db.put('note', n);
}
export const stergeNota = (id) => db.del('note', id);

// ---------- Balanță de verificare (5 egalități) ----------
// Sold inițial an + rulaje precedente + rulaje curente = total sume → sold final
export function balanta(note, setari, from, to) {
  const an = from.slice(0, 4);
  const inceputAn = `${an}-01-01`;
  const m = new Map();
  const get = (cod) => {
    if (!m.has(cod)) m.set(cod, { cod, sid: 0, sic: 0, rpd: 0, rpc: 0, rcd: 0, rcc: 0 });
    return m.get(cod);
  };
  for (const [cod, v] of Object.entries(setari.soldInitial || {})) {
    const r = get(cod); r.sid += Number(v.d) || 0; r.sic += Number(v.c) || 0;
  }
  for (const n of note) {
    if (n.data > to) continue;
    // anii anteriori intră automat în soldul inițial (reportare automată de la an la an)
    if (n.data < inceputAn) {
      for (const l of n.linii) {
        const s = Number(l.suma) || 0;
        get(l.d).sid += s; get(l.c).sic += s;
      }
      continue;
    }
    const prec = n.data < from;
    for (const l of n.linii) {
      const s = Number(l.suma) || 0;
      const D = get(l.d), C = get(l.c);
      if (prec) { D.rpd += s; C.rpc += s; } else { D.rcd += s; C.rcc += s; }
    }
  }
  // soldul inițial se prezintă net (debitor sau creditor), ca în balanța oficială
  for (const r of m.values()) {
    const net = r2(r.sid - r.sic);
    r.sid = net > 0 ? net : 0; r.sic = net < 0 ? -net : 0;
  }
  const rows = [...m.values()].map((r) => {
    const tsd = r.sid + r.rpd + r.rcd, tsc = r.sic + r.rpc + r.rcc;
    const tip = cont(r.cod).tip;
    let sfd = 0, sfc = 0;
    const dif = r2(tsd - tsc);
    if (tip === 'A' || tip === 'C') { if (dif >= 0) sfd = dif; else sfc = -dif; }
    else if (tip === 'P' || tip === 'V') { if (dif <= 0) sfc = -dif; else sfd = dif; }
    else { if (dif >= 0) sfd = dif; else sfc = -dif; }
    return { ...r, tsd: r2(tsd), tsc: r2(tsc), sfd, sfc, nume: cont(r.cod).nume, tip };
  }).filter((r) => r.tsd || r.tsc).sort((a, b) => a.cod.localeCompare(b.cod));
  const tot = rows.reduce((t, r) => {
    for (const k of ['sid', 'sic', 'rpd', 'rpc', 'rcd', 'rcc', 'tsd', 'tsc', 'sfd', 'sfc']) t[k] = r2(t[k] + r[k]);
    return t;
  }, { sid: 0, sic: 0, rpd: 0, rpc: 0, rcd: 0, rcc: 0, tsd: 0, tsc: 0, sfd: 0, sfc: 0 });
  return { rows, tot };
}

export function verificaBalanta({ rows, tot }) {
  const probleme = [];
  const eq = (a, b) => Math.abs(a - b) < 0.005;
  if (!eq(tot.sid, tot.sic)) probleme.push({ grav: 'eroare', text: `Soldurile inițiale nu sunt egale (D ${lei(tot.sid)} ≠ C ${lei(tot.sic)}). Verifică soldurile de la 1 ianuarie din Setări.` });
  if (!eq(tot.sfd, tot.sfc)) probleme.push({ grav: 'eroare', text: 'Soldurile finale nu sunt egale. Balanța nu este închisă corect.' });
  for (const r of rows) {
    const c = cont(r.cod);
    if (r.cod === '5311' && r.sfc > 0) probleme.push({ grav: 'eroare', text: `Casa are sold negativ (${lei(r.sfc)} lei). Nu poți plăti din casă mai mult decât ai încasat — verifică registrul de casă.` });
    if (r.cod.startsWith('512') && r.sfc > 0) probleme.push({ grav: 'eroare', text: `Contul bancar ${r.cod} are sold negativ. Probabil lipsește o încasare sau o plată e înregistrată greșit.` });
    if (c.tip === 'A' && r.sfc > 0 && !r.cod.startsWith('5')) probleme.push({ grav: 'atentie', text: `Contul ${r.cod} (${c.nume}) are sold creditor, deși în mod normal are sold debitor.` });
    if (c.tip === 'P' && r.sfd > 0) probleme.push({ grav: 'atentie', text: `Contul ${r.cod} (${c.nume}) are sold debitor, deși în mod normal are sold creditor. Ex.: ai plătit un furnizor de două ori?` });
    if (r.cod === '473' && (r.sfd || r.sfc)) probleme.push({ grav: 'atentie', text: 'Contul 473 (sume în curs de clarificare) are sold. Lămurește sumele înainte de închiderea lunii.' });
    if (r.cod === '581' && (r.sfd || r.sfc)) probleme.push({ grav: 'atentie', text: 'Contul 581 (viramente interne) trebuie să rămână fără sold. Lipsește una din părțile unei depuneri/ridicări de numerar.' });
  }
  return probleme;
}

// ---------- Fișa contului ----------
export function fisaCont(note, setari, cod, from, to) {
  const si = setari.soldInitial?.[cod] || { d: 0, c: 0 };
  let sold = (Number(si.d) || 0) - (Number(si.c) || 0);
  const rows = [];
  let soldInceput = null;
  for (const n of note) {
    if (n.data > to) continue;
    for (const l of n.linii) {
      if (l.d !== cod && l.c !== cod) continue;
      const d = l.d === cod ? Number(l.suma) : 0;
      const c = l.c === cod ? Number(l.suma) : 0;
      if (n.data >= from && soldInceput === null) soldInceput = sold;
      sold = r2(sold + d - c);
      if (n.data >= from) rows.push({ data: n.data, nr: n.nr, document: n.document, explicatie: n.explicatie, contra: l.d === cod ? l.c : l.d, d, c, sold, notaId: n.id });
    }
  }
  if (soldInceput === null) soldInceput = sold;
  return { rows, soldInceput: r2(soldInceput), soldFinal: sold };
}

// ---------- Registrul de casă (pe zile) ----------
export function registruCasa(note, setari, from, to) {
  const f = fisaCont(note, setari, '5311', from, to);
  const zile = new Map();
  let sold = f.soldInceput;
  for (const r of f.rows) {
    if (!zile.has(r.data)) zile.set(r.data, { data: r.data, soldInitial: sold, rows: [], inc: 0, pl: 0 });
    const z = zile.get(r.data);
    z.rows.push(r); z.inc = r2(z.inc + r.d); z.pl = r2(z.pl + r.c);
    sold = r.sold; z.soldFinal = sold;
  }
  return [...zile.values()];
}

// ---------- Documente → note contabile ----------
// doc.tip: 'cheltuiala' | 'venit'
export function noteDinDocument(doc, setari) {
  const linii = [];
  const total = r2(doc.total);
  const areTVA = tvaLa(setari, doc.data);
  const tva = areTVA ? r2(doc.tva || 0) : 0;
  const baza = areTVA ? r2(total - tva) : total;
  const partener = doc.partener?.nume || '';
  const docTxt = `${doc.tipDocument || 'Factura'} ${doc.nr || ''}`.trim();

  if (doc.tip === 'cheltuiala' && doc.taxareInversa && areTVA) {
    // taxare inversă (ex. servicii din UE, art. 307/331 Cod fiscal): factura vine fără TVA,
    // cumpărătorul calculează TVA-ul și îl înregistrează simultan ca deductibil și colectat
    const contCh = doc.cont || '628';
    const contFurn = contCh.startsWith('2') ? '404' : '401';
    const cota = Number(doc.tvaCota) || 0.21;
    const tvaTI = r2(total * cota);
    linii.push({ d: contCh, c: contFurn, suma: total, expl: doc.descriere || cont(contCh).nume });
    linii.push({ d: '4426', c: '4427', suma: tvaTI, expl: 'TVA taxare inversă', tvaCota: cota, baza: total, taxareInversa: true });
    const plata = { banca: '5121', casa: '5311', asociat: '4551', avans: '542' }[doc.plata];
    if (plata) linii.push({ d: contFurn, c: plata, suma: total, expl: 'Plată ' + partener });
  } else if (doc.tip === 'cheltuiala' && doc.taxareInversa && setari.cod317 && (!setari.cod317DeLa || doc.data >= setari.cod317DeLa)) {
    // neplătitor de TVA cu cod special (art. 317): TVA-ul pentru serviciile din străinătate se declară în D301 și
    // se plătește; nu se deduce, deci intră în costul serviciului
    const contCh = doc.cont || '628';
    const cota = Number(doc.tvaCota) || 0.21;
    const tvaTI = r2(total * cota);
    linii.push({ d: contCh, c: '401', suma: total, expl: doc.descriere || cont(contCh).nume });
    linii.push({ d: contCh, c: '4423', suma: tvaTI, expl: 'TVA servicii din străinătate (D301)', d301: true, tvaCota: cota, baza: total });
    const plata = { banca: '5121', casa: '5311', asociat: '4551', avans: '542' }[doc.plata];
    if (plata) linii.push({ d: '401', c: plata, suma: total, expl: 'Plată ' + partener });
  } else if (doc.tip === 'cheltuiala') {
    const contCh = doc.cont || '6588';
    const imob = contCh.startsWith('2');
    const contFurn = imob ? '404' : '401';
    const pctDed = doc.tvaDeductibil == null ? 100 : Number(doc.tvaDeductibil);
    const tvaDed = r2(tva * pctDed / 100);
    const tvaNeded = r2(tva - tvaDed);
    linii.push({ d: contCh, c: contFurn, suma: r2(baza + tvaNeded), expl: doc.descriere || cont(contCh).nume });
    if (tvaDed) linii.push({ d: '4426', c: contFurn, suma: tvaDed, expl: 'TVA deductibilă', tvaCota: doc.tvaCota, baza: r2(baza * pctDed / 100) });
    if (contCh === '303') linii.push({ d: '603', c: '303', suma: r2(baza + tvaNeded), expl: 'Dare în folosință obiect de inventar' });
    const plata = { banca: '5121', casa: '5311', asociat: '4551', avans: '542' }[doc.plata];
    if (plata) linii.push({ d: contFurn, c: plata, suma: total, expl: doc.plata === 'asociat' ? 'Plătit de administrator din bani proprii' : 'Plată ' + partener });
  } else {
    const contV = doc.cont || '704';
    linii.push({ d: '411', c: contV, suma: baza, expl: doc.descriere || cont(contV).nume });
    if (tva) linii.push({ d: '411', c: setari.tvaLaIncasare ? '4428' : '4427', suma: tva, expl: 'TVA colectată', tvaCota: doc.tvaCota, baza });
    const inc = { banca: '5121', casa: '5311' }[doc.plata];
    if (inc) {
      linii.push({ d: inc, c: '411', suma: total, expl: 'Încasare ' + partener });
      if (setari.tvaLaIncasare && tva) linii.push({ d: '4428', c: '4427', suma: tva, expl: 'TVA devenită exigibilă la încasare', tvaCota: doc.tvaCota, baza });
    }
  }
  return {
    data: doc.data, document: docTxt, partener, explicatie: `${doc.tip === 'cheltuiala' ? 'Cheltuială' : 'Venit'}: ${doc.descriere || ''} ${partener ? '— ' + partener : ''}`.trim(),
    linii, sursa: { docId: doc.id }, tipNota: doc.tip,
  };
}

export async function salveazaDocument(doc, setari) {
  if (!doc.id) doc.id = uid();
  const existent = (await db.all('note')).find((n) => n.sursa?.docId === doc.id);
  const nota = noteDinDocument(doc, setari);
  if (existent) { nota.id = existent.id; nota.nr = existent.nr; }
  const saved = await salveazaNota(nota);
  doc.notaId = saved.id;
  await db.put('documente', doc);
  if (doc.partener?.nume) await adaugaPartener(doc.partener, doc.tip === 'cheltuiala' ? 'furnizor' : 'client');
  return doc;
}
export async function stergeDocument(doc) {
  if (doc.notaId) await db.del('note', doc.notaId);
  await db.del('documente', doc.id);
}

export async function adaugaPartener(p, rol) {
  const all = await db.all('parteneri');
  const key = (p.cui || p.nume).replace(/\s|RO/gi, '').toLowerCase();
  const ex = all.find((x) => (x.cui || x.nume).replace(/\s|RO/gi, '').toLowerCase() === key);
  const o = { ...(ex || {}), ...p, id: ex?.id || uid(), roluri: [...new Set([...(ex?.roluri || []), rol])] };
  await db.put('parteneri', o);
  return o;
}

// ---------- Operațiuni frecvente (șabloane pentru începători) ----------
export const OPERATII = [
  { id: 'incasare', grup: 'Bancă', titlu: 'Încasare de la un client', ajutor: 'Clientul ți-a plătit o factură în cont.', partener: true, linii: (s) => [{ d: '5121', c: '411', suma: s }] },
  { id: 'plataFurn', grup: 'Bancă', titlu: 'Plată către un furnizor', ajutor: 'Ai plătit din cont o factură primită (deja înregistrată, neplătită).', partener: true, linii: (s) => [{ d: '401', c: '5121', suma: s }] },
  { id: 'comision', grup: 'Bancă', titlu: 'Comision bancar', ajutor: 'Banca ți-a reținut un comision sau o taxă de administrare.', linii: (s) => [{ d: '627', c: '5121', suma: s }] },
  { id: 'dobanda', grup: 'Bancă', titlu: 'Dobândă primită de la bancă', ajutor: 'Banca ți-a plătit dobândă la sold.', linii: (s) => [{ d: '5121', c: '766', suma: s }] },
  { id: 'depunere', grup: 'Numerar', titlu: 'Depunere numerar din casă în bancă', ajutor: 'Ai dus bani cash din casierie în contul firmei.', linii: (s) => [{ d: '581', c: '5311', suma: s }, { d: '5121', c: '581', suma: s }] },
  { id: 'ridicare', grup: 'Numerar', titlu: 'Ridicare numerar din bancă în casă', ajutor: 'Ai scos bani din contul firmei pentru casierie.', linii: (s) => [{ d: '581', c: '5121', suma: s }, { d: '5311', c: '581', suma: s }] },
  { id: 'avans', grup: 'Numerar', titlu: 'Avans de trezorerie (bani dați pentru cumpărături)', ajutor: 'Ai dat bani din casă cuiva ca să cumpere ceva pentru firmă. Bonurile se înregistrează apoi ca cheltuieli cu plata „Avans de trezorerie”.', linii: (s) => [{ d: '542', c: '5311', suma: s }] },
  { id: 'restituireAvans', grup: 'Numerar', titlu: 'Restituire rest avans de trezorerie', ajutor: 'Banii rămași din avans s-au întors în casă.', linii: (s) => [{ d: '5311', c: '542', suma: s }] },
  { id: 'imprumutAsoc', grup: 'Administrator', titlu: 'Administratorul împrumută firma', ajutor: 'Ai pus bani personali în contul firmei (nu ca aport la capital).', linii: (s) => [{ d: '5121', c: '4551', suma: s }] },
  { id: 'rambursAsoc', grup: 'Administrator', titlu: 'Firma îi dă înapoi bani administratorului', ajutor: 'Rambursezi împrumutul de la asociat sau cheltuielile plătite de el din buzunar.', linii: (s) => [{ d: '4551', c: '5121', suma: s }] },
  { id: 'capital', grup: 'Administrator', titlu: 'Depunere capital social', ajutor: 'Asociatul depune capitalul social subscris la înființare.', linii: (s) => [{ d: '456', c: '1011', suma: s }, { d: '5121', c: '456', suma: s }, { d: '1011', c: '1012', suma: s }] },
  { id: 'dividende', grup: 'Administrator', titlu: 'Distribuire dividende', ajutor: 'Se plătesc dividende din profitul anilor anteriori. Introdu suma brută; aplicația calculează impozitul de 16%. Verifică cu asistentul condițiile legale înainte.', linii: (s, r) => { const imp = r2(s * r.dividende.cota); return [{ d: '1171', c: '457', suma: s }, { d: '457', c: '446', suma: imp, expl: 'Impozit pe dividende reținut' }, { d: '457', c: '5121', suma: r2(s - imp), expl: 'Dividend net plătit' }]; } },
  { id: 'plataMicro', grup: 'Taxe', titlu: 'Plată impozit micro', ajutor: 'Ai plătit la ANAF impozitul din declarația D100.', linii: (s) => [{ d: '4418', c: '5121', suma: s }] },
  { id: 'plataProfit', grup: 'Taxe', titlu: 'Plată impozit pe profit', ajutor: 'Ai plătit la ANAF impozitul pe profit.', linii: (s) => [{ d: '4411', c: '5121', suma: s }] },
  { id: 'plataTVA', grup: 'Taxe', titlu: 'Plată TVA', ajutor: 'Ai plătit la ANAF TVA-ul din decontul D300.', linii: (s) => [{ d: '4423', c: '5121', suma: s }] },
  { id: 'incasareTVA', grup: 'Taxe', titlu: 'Rambursare TVA de la ANAF', ajutor: 'ANAF ți-a returnat TVA de recuperat.', linii: (s) => [{ d: '5121', c: '4424', suma: s }] },
  { id: 'plataDiv', grup: 'Taxe', titlu: 'Plată impozit pe dividende', ajutor: 'Ai plătit la ANAF impozitul reținut din dividende.', linii: (s) => [{ d: '446', c: '5121', suma: s }] },
  { id: 'neclar', grup: 'Altele', titlu: 'Sumă neclară în extras', ajutor: 'Ai o intrare sau ieșire în bancă pe care nu știi încă unde s-o încadrezi. O pui temporar în 473 și o lămurești până la final de lună.', sens: true, linii: (s, r, sens) => [sens === 'iesire' ? { d: '473', c: '5121', suma: s } : { d: '5121', c: '473', suma: s }] },
];

// ---------- Mijloace fixe și amortizare ----------
export function amortizareLuna(m, an, luna) {
  if (!m.dataPIF || !m.durataLuni) return 0;
  const [y, mo] = m.dataPIF.split('-').map(Number);
  const start = y * 12 + mo + 1; // se amortizează din luna următoare punerii în funcțiune
  const cur = an * 12 + luna;
  if (cur < start || cur >= start + Number(m.durataLuni)) return 0;
  const lunar = r2(m.valoare / m.durataLuni);
  if (cur === start + Number(m.durataLuni) - 1) return r2(m.valoare - lunar * (m.durataLuni - 1));
  return lunar;
}
export const CONT_AMORTIZARE = { '2051': '2805', '2131': '2813', '2133': '2813', '214': '2814' };

// ---------- Indicatori pentru perioadă ----------
const esteInchidere = (n) => n.auto === 'inchidere';
export function rulajeClasa(note, from, to, filtru) {
  let ch = 0, v = 0;
  for (const n of note) {
    if (n.data < from || n.data > to || esteInchidere(n)) continue;
    for (const l of n.linii) {
      if (filtru && !filtru(l)) continue;
      if (l.d[0] === '6') ch += l.suma; if (l.c[0] === '6') ch -= l.suma;
      if (l.c[0] === '7') v += l.suma; if (l.d[0] === '7') v -= l.suma;
    }
  }
  return { cheltuieli: r2(ch), venituri: r2(v), rezultat: r2(v - ch) };
}

export function bazaMicro(note, from, to, R) {
  let b = 0;
  const exclus = (c) => R.micro.excluseBaza.some((p) => c.startsWith(p));
  for (const n of note) {
    if (n.data < from || n.data > to || esteInchidere(n)) continue;
    for (const l of n.linii) {
      if (l.c[0] === '7' && !exclus(l.c)) b += l.suma;
      if (l.d[0] === '7' && !exclus(l.d)) b -= l.suma;
    }
  }
  return r2(b);
}

export function cifraAfaceri(note, from, to) {
  let b = 0;
  for (const n of note) {
    if (n.data < from || n.data > to || esteInchidere(n)) continue;
    for (const l of n.linii) {
      if (/^70/.test(l.c)) b += l.suma;
      if (/^70/.test(l.d)) b -= l.suma;
    }
  }
  return r2(b);
}

// D300 — din liniile TVA ale notelor
export function calculTVA(note, from, to) {
  const out = { colectata: {}, deductibila: {}, totalColectata: 0, totalDeductibila: 0 };
  for (const n of note) {
    if (n.data < from || n.data > to || esteInchidere(n)) continue;
    for (const l of n.linii) {
      if (l.c === '4427') {
        const k = l.taxareInversa ? 'ti' : String(Math.round((l.tvaCota ?? 0.21) * 100));
        out.colectata[k] = out.colectata[k] || { baza: 0, tva: 0 };
        out.colectata[k].tva = r2(out.colectata[k].tva + l.suma); out.colectata[k].baza = r2(out.colectata[k].baza + (l.baza || 0));
        out.totalColectata = r2(out.totalColectata + l.suma);
      }
      if (l.d === '4426') {
        const k = l.taxareInversa ? 'ti' : String(Math.round((l.tvaCota ?? 0.21) * 100));
        out.deductibila[k] = out.deductibila[k] || { baza: 0, tva: 0 };
        out.deductibila[k].tva = r2(out.deductibila[k].tva + l.suma); out.deductibila[k].baza = r2(out.deductibila[k].baza + (l.baza || 0));
        out.totalDeductibila = r2(out.totalDeductibila + l.suma);
      }
    }
  }
  out.dePlata = r2(Math.max(0, out.totalColectata - out.totalDeductibila));
  out.deRecuperat = r2(Math.max(0, out.totalDeductibila - out.totalColectata));
  return out;
}

// ---------- Închiderea lunii (note generate automat) ----------
// Generează: amortizare, regularizare TVA (la final de perioadă TVA), impozit micro/profit (la final de trimestru),
// închiderea conturilor de venituri și cheltuieli în 121. Rulează din nou fără dubluri.
export async function inchideLuna(an, luna) {
  const setari = await getSetari();
  const R = reguli(setari);
  const { from, to } = lunaInterval(an, luna);
  const perioada = `${an}-${pad(luna)}`;
  // șterge notele automate existente pentru lună
  for (const n of await db.all('note')) if (n.autoPerioada === perioada) await db.del('note', n.id);
  const create = [];
  const add = async (auto, document, explicatie, linii) => {
    linii = linii.filter((l) => r2(l.suma) > 0);
    if (!linii.length) return;
    const n = await salveazaNota({ data: to, document, explicatie, linii, auto, autoPerioada: perioada });
    create.push(n);
  };

  // 1. Amortizare
  const mf = await db.all('mijloace');
  const am = mf.map((m) => ({ m, s: amortizareLuna(m, an, luna) })).filter((x) => x.s > 0);
  await add('amortizare', 'Notă amortizare', `Amortizare ${LUNI[luna - 1]} ${an}`,
    am.map(({ m, s }) => ({ d: '6811', c: CONT_AMORTIZARE[m.cont] || '2813', suma: s, expl: m.denumire })));

  // 1b. Salarii: statul de plată al lunii
  const S = await import('./salarii.js');
  const stat = S.statDePlata(await S.lista(), an, luna, setari);
  if (stat.rand.length) await add('salarii', 'Stat de plată', `Salarii ${LUNI[luna - 1]} ${an} (${stat.rand.length} ${stat.rand.length === 1 ? 'angajat' : 'angajați'})`, S.liniiNota(stat));

  let note = await toateNotele();
  const finalTrim = luna % 3 === 0;
  const finalPerTVA = setari.perioadaTVA === 'luna' || finalTrim;

  // 2. Regularizare TVA
  if (tvaLa(setari, to) && finalPerTVA) {
    const p = setari.perioadaTVA === 'luna' ? { from, to } : trimInterval(an, trimDinLuna(luna));
    const b = balanta(note, setari, p.from, p.to);
    const sold = (cod) => { const r = b.rows.find((x) => x.cod === cod); return r ? r2(r.sfc - r.sfd) : 0; };
    const col = sold('4427'); const ded = -sold('4426');
    const linii = [];
    const comp = Math.min(col, ded);
    if (comp > 0) linii.push({ d: '4427', c: '4426', suma: comp, expl: 'Compensare TVA' });
    if (col > ded) linii.push({ d: '4427', c: '4423', suma: r2(col - ded), expl: 'TVA de plată' });
    if (ded > col) linii.push({ d: '4424', c: '4426', suma: r2(ded - col), expl: 'TVA de recuperat' });
    await add('tva', 'Notă regularizare TVA', 'Regularizare TVA perioadă', linii);
    note = await toateNotele();
  }

  // 3. Impozit pe venit (micro) / profit — la final de trimestru
  if (finalTrim) {
    const t = trimDinLuna(luna);
    const iAn = `${an}-01-01`;
    const pT = trimInterval(an, t);
    if (setari.regim === 'micro') {
      const bazaCum = bazaMicro(note, iAn, pT.to, R);
      const bazaPrec = t > 1 ? bazaMicro(note, iAn, trimInterval(an, t - 1).to, R) : 0;
      const imp = Math.round(bazaCum * R.micro.cota) - Math.round(bazaPrec * R.micro.cota);
      await add('impozit', 'Notă impozit micro', `Impozit micro T${t} ${an} (${Math.round(R.micro.cota * 100)}% din ${lei(r2(bazaCum - bazaPrec))} lei)`,
        [{ d: '698', c: '4418', suma: imp }]);
    } else {
      const rc = rulajeClasa(note, iAn, pT.to, (l) => !['691'].includes(l.d));
      const neded = nedeductibile(note, iAn, pT.to);
      const impCum = Math.max(0, Math.round((rc.rezultat + neded) * R.profit.cota));
      const prec = sumaCont(note, iAn, trimInterval(an, Math.max(1, t)).from, '691', true);
      await add('impozit', 'Notă impozit profit', `Impozit pe profit estimat T${t} ${an}`,
        [{ d: '691', c: '4411', suma: r2(impCum - prec) }]);
    }
    note = await toateNotele();
  }

  // 4. Închiderea conturilor de venituri și cheltuieli
  const rul = new Map();
  for (const n of note) {
    if (n.data < from || n.data > to || n.auto === 'inchidere') continue;
    for (const l of n.linii) {
      for (const [cod, semn] of [[l.d, 1], [l.c, -1]]) {
        if (cod[0] === '6' || cod[0] === '7') rul.set(cod, r2((rul.get(cod) || 0) + semn * l.suma));
      }
    }
  }
  const linii = [];
  for (const [cod, s] of rul) {
    if (cod[0] === '6' && s > 0) linii.push({ d: '121', c: cod, suma: s });
    if (cod[0] === '6' && s < 0) linii.push({ d: cod, c: '121', suma: -s });
    if (cod[0] === '7' && s < 0) linii.push({ d: cod, c: '121', suma: -s });
    if (cod[0] === '7' && s > 0) linii.push({ d: '121', c: cod, suma: s });
  }
  await add('inchidere', 'Notă închidere', `Închiderea conturilor de venituri și cheltuieli — ${LUNI[luna - 1]} ${an}`, linii);
  return create;
}

function sumaCont(note, from, toExcl, cod, debit) {
  let s = 0;
  for (const n of note) {
    if (n.data < from || n.data >= toExcl || n.auto === 'inchidere') continue;
    for (const l of n.linii) if ((debit ? l.d : l.c) === cod) s += l.suma;
  }
  return r2(s);
}
// Cheltuieli nedeductibile evidente (estimare): amenzi, impozit pe profit, 50% protocol peste limită nu se calculează aici.
function nedeductibile(note, from, to) {
  let s = 0;
  for (const n of note) {
    if (n.data < from || n.data > to || n.auto === 'inchidere') continue;
    for (const l of n.linii) if (l.d === '6581') s += l.suma;
  }
  return r2(s);
}

// ---------- Termene declarații ----------
export function zileLucratoare(d) { // mută pe următoarea zi lucrătoare (weekend)
  const x = new Date(d);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
  return x;
}
