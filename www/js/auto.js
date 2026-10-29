// Automatizări care rulează singure, cât timp aplicația e deschisă:
//  - sincronizarea criptată între dispozitive;
//  - cursul BNR (zilnic) și cursul EUR de închidere a anului pentru plafonul micro;
//  - importul facturilor din SPV (la pornire și la fiecare 2 ore);
//  - închiderea lunilor trecute, refăcută automat când se modifică ceva într-o lună închisă;
//  - reportarea rezultatului anului trecut (121 → 1171) la 1 ianuarie.
import { db } from './db.js';
import { getSetari, saveSetari, inchideLuna, salveazaNota, toateNotele, balanta, LUNI, r2, pad } from './engine.js';
import * as sync from './sync.js';
import * as bnr from './bnr.js';
import * as anaf from './anaf.js';

const ascultatori = new Set();
export const laEveniment = (f) => { ascultatori.add(f); return () => ascultatori.delete(f); };
const anunta = (e) => ascultatori.forEach((f) => { try { f(e); } catch (x) { console.error(x); } });

const jurnal = [];
export const ultimele = () => jurnal.slice(0, 20);
function log(text, tip = 'info') {
  jurnal.unshift({ t: Date.now(), text, tip });
  anunta({ jurnal: true, text, tip });
}

let pornit = false;
let reincarca = null;
export function porneste(onDateNoi) {
  if (pornit) return;
  pornit = true;
  reincarca = onDateNoi;
  sync.laSchimbare((e) => {
    if (e.stare === 'gata' && e.primite) { log(`Sincronizare: ${e.primite === 1 ? 'o modificare primită' : e.primite + ' modificări primite'} de pe alte dispozitive.`); reincarca && reincarca(); }
    if (e.stare === 'eroare') log('Sincronizarea nu a reușit: ' + e.eroare, 'eroare');
    anunta({ sync: e });
  });
  sync.stare().then((s) => { if (s) sync.porneste(); });
  setTimeout(ciclu, 1500);
  setInterval(ciclu, 30 * 60 * 1000);
  // după fiecare modificare, închiderile se refac (cu o mică întârziere, ca să grupeze modificările)
  let t = null;
  import('./db.js').then(({ onChange }) => onChange((store) => {
    if (store !== 'note' && store !== 'documente' && store !== 'mijloace') return;
    clearTimeout(t); t = setTimeout(() => inchideriAutomate().catch((e) => console.error(e)), 4000);
  }));
}

let inCiclu = false;
async function ciclu() {
  if (inCiclu) return;
  inCiclu = true;
  try {
    await pas('Curs BNR', async () => {
      const r = await bnr.actualizeaza();
      if (!r) return;
      const set = await getSetari();
      const an = new Date().getFullYear();
      if (set.cursAn !== an - 1) {
        const c = await bnr.cursInchidereAn(an - 1);
        if (c) { await saveSetari({ ...set, cursEUR: Math.round(c * 10000) / 10000, cursSetat: true, cursAn: an - 1 }); log(`Cursul EUR pentru plafonul micro a fost setat automat: ${c.toFixed(4)} lei (BNR, 31.12.${an - 1}).`); }
      }
    });
    await pas('SPV', async () => {
      const meta = await db.get('meta', 'spv');
      if (meta && meta.ultima && Date.now() - meta.ultima < 2 * 3600 * 1000) return;
      const r = await anaf.importa();
      if (r.indisponibil || r.neconectat) return;
      const n = r.primite + r.emise;
      if (n) { log(`SPV: ${r.primite} facturi primite și ${r.emise} emise importate${r.deVerificat ? `, ${r.deVerificat} de verificat` : ''}.`, 'ok'); reincarca && reincarca(); }
      if (r.erori) log(`SPV: ${r.erori} facturi respinse de ANAF. Vezi detaliile în Documente.`, 'eroare');
    });
    await pas('Închideri', inchideriAutomate);
  } finally { inCiclu = false; }
}

async function pas(nume, fn) {
  try { await fn(); } catch (e) { log(`${nume}: ${e.message}`, 'eroare'); }
}

export async function ruleazaAcum() { const m = await db.get('meta', 'spv'); if (m) await db.put('meta', { ...m, ultima: 0 }); return ciclu(); }

let inInchidere = false;
/** Reface închiderea lunilor în care s-a schimbat ceva după ultima închidere (și a lunilor de după, din același an). */
export async function inchideriAutomate() {
  const set = await getSetari();
  if (set.inchidereAutomata === false || inInchidere) return 0;
  inInchidere = true;
  try {
    const now = new Date();
    const anCur = now.getFullYear(), lunaCur = now.getMonth() + 1;
    let note = await toateNotele();
    const sal = await db.get('settings', 'salariati');
    let refacute = 0;
    for (const an of [anCur - 1, anCur]) {
      const ultimaLuna = an < anCur ? 12 : lunaCur - 1;
      let dela = 0;
      for (let l = 1; l <= ultimaLuna; l++) {
        const p = `${an}-${pad(l)}`;
        const manuale = note.filter((n) => n.data.startsWith(p) && !n.auto);
        const inch = note.find((n) => n.autoPerioada === p && n.auto === 'inchidere');
        const ultMod = manuale.reduce((m, n) => (n.modificat > m ? n.modificat : m), '');
        const mf = (await db.all('mijloace')).some((m) => m.dataPIF && m.dataPIF.slice(0, 7) < p);
        const salSchimbat = sal?.dela && sal.dela.slice(0, 7) <= p && (!inch || sal.modificat > inch.modificat);
        if (salSchimbat || ((manuale.length || mf) && (!inch || ultMod > inch.modificat))) { dela = l; break; }
      }
      if (!dela) continue;
      for (let l = dela; l <= ultimaLuna; l++) {
        const p = `${an}-${pad(l)}`;
        const are = note.some((n) => n.data.startsWith(p)) || l === dela;
        if (are || note.some((n) => n.data > p)) { await inchideLuna(an, l); refacute++; }
      }
      note = await toateNotele();
    }
    await reportare();
    if (refacute) { log(`Închiderea lunilor a fost refăcută automat (${refacute} ${refacute === 1 ? 'lună' : 'luni'}).`); reincarca && reincarca(); }
    return refacute;
  } finally { inInchidere = false; }
}

/** La 1 ianuarie: profitul sau pierderea anului trecut trece din 121 în 1171 (rezultat reportat). */
async function reportare() {
  const an = new Date().getFullYear();
  const note = await toateNotele();
  if (!note.some((n) => n.data < `${an}-01-01`)) return;
  const set = await getSetari();
  const b = balanta(note.filter((n) => n.auto !== 'reportare' || n.autoPerioada !== `${an}-00`), set, `${an - 1}-12-01`, `${an - 1}-12-31`);
  const r121 = b.rows.find((r) => r.cod === '121');
  const sold = r121 ? r2(r121.sfc - r121.sfd) : 0;
  const ex = note.find((n) => n.auto === 'reportare' && n.autoPerioada === `${an}-00`);
  const suma = Math.abs(sold);
  if (ex && Math.abs((ex.linii[0]?.suma || 0) - suma) < 0.005 && (sold >= 0) === (ex.linii[0]?.d === '121')) return;
  if (ex) await db.del('note', ex.id);
  if (!suma) return;
  await salveazaNota({
    data: `${an}-01-01`, document: 'Notă reportare', auto: 'reportare', autoPerioada: `${an}-00`,
    explicatie: `Reportarea ${sold >= 0 ? 'profitului' : 'pierderii'} exercițiului ${an - 1} în rezultatul reportat`,
    linii: sold >= 0 ? [{ d: '121', c: '1171', suma }] : [{ d: '1171', c: '121', suma }],
  });
  log(`Rezultatul anului ${an - 1} (${sold >= 0 ? 'profit' : 'pierdere'} ${suma.toLocaleString('ro-RO')} lei) a fost reportat automat în contul 1171.`);
}

export { LUNI };
