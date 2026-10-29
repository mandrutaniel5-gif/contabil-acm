// Salarii: angajați, calculul lunar (Cod fiscal 2026), statul de plată și notele contabile automate.
//  - CAS 25%, CASS 10%, impozit 10% (reținute din salariu), CAM 2,25% (plătit de firmă);
//  - suma netaxabilă la salariul minim (300 lei până la 30.06.2026, 200 lei de la 1.07.2026), dacă brutul
//    pe contract este exact salariul minim și venitul brut nu trece de 4.600 lei;
//  - deducerea personală (art. 77): 20/25/30/35/45% din salariul minim pentru 0/1/2/3/4+ persoane în întreținere,
//    minus 0,5 puncte procentuale la fiecare 50 de lei peste salariul minim, până la 0 la minim + 2.000 lei;
//    plus 15% din salariul minim pentru angajații sub 26 de ani, cu aceeași scădere;
//  - contract de mandat (administrator): CAS și CASS, impozit 10%, fără deducere și fără CAM.
import { db } from './db.js';
import { r2, reguli, pad, lunaInterval } from './engine.js';

export const SALARIU_MINIM = [['2026-01-01', 4050], ['2026-07-01', 4325]];
export function salariuMinim(data, setari) {
  const R = reguli(setari);
  if (R.salarii?.minim) return Number(R.salarii.minim);
  let v = SALARIU_MINIM[0][1];
  for (const [de, s] of SALARIU_MINIM) if (data >= de) v = s;
  return v;
}
const netaxabil = (data) => (data >= '2026-07-01' ? 200 : 300);

export function deducere(brut, minim, persoane = 0, sub26 = false) {
  const peste = brut - minim;
  if (peste >= 2000) return 0;
  const trepte = peste <= 0 ? 0 : Math.ceil(peste / 50);
  const baza = [20, 25, 30, 35, 45][Math.min(4, Math.max(0, persoane))] + (sub26 ? 15 : 0);
  const pct = Math.max(0, baza - trepte * 0.5);
  return Math.round(minim * pct / 100);
}

/** Calculul pentru un angajat într-o lună (data = YYYY-MM-DD din luna respectivă). */
export function calcul(ang, data, setari) {
  const R = reguli(setari).salarii;
  const brut = r2(ang.brut);
  const minim = salariuMinim(data, setari);
  const mandat = ang.tip === 'mandat';
  const neimp = !mandat && ang.tip === 'cim' && brut === minim && brut <= 4600 ? netaxabil(data) : 0;
  const bazaContrib = brut - neimp;
  const cas = Math.round(bazaContrib * R.cas);
  const cass = Math.round(bazaContrib * R.cass);
  const ded = mandat ? 0 : (ang.functieBaza === false ? 0 : deducere(brut, minim, Number(ang.persoane) || 0, !!ang.sub26));
  const bazaImpozit = Math.max(0, bazaContrib - cas - cass - ded);
  const impozit = Math.round(bazaImpozit * R.impozit);
  const net = r2(brut - cas - cass - impozit);
  const cam = mandat ? 0 : Math.round(brut * R.cam);
  return { brut, minim, neimpozabil: neimp, cas, cass, deducere: ded, bazaImpozit, impozit, net, cam, cost: r2(brut + cam) };
}

export async function lista() { return ((await db.get('settings', 'salariati')) || { lista: [] }).lista; }
/** Salvează lista; `dela` = prima zi afectată, ca închiderile lunilor de după să fie refăcute automat. */
export async function salveaza(lst, dela) {
  const v = (await db.get('settings', 'salariati')) || {};
  const d = [dela, v.dela].filter(Boolean).sort()[0] || null;
  await db.put('settings', { id: 'salariati', lista: lst, modificat: new Date().toISOString(), dela: d });
}

/** Angajații activi într-o lună (proporțional cu zilele lucrate în luna angajării/plecării). */
export function activi(lst, an, luna) {
  const { from, to } = lunaInterval(an, luna);
  return lst.filter((a) => a.deLa && a.deLa <= to && (!a.panaLa || a.panaLa >= from));
}

/** Paștele ortodox (calendar iulian + 13 zile, valabil 1900-2099). */
export function pasteOrtodox(y) {
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7;
  const luna = Math.floor((d + e + 114) / 31), zi = ((d + e + 114) % 31) + 1;
  const p = new Date(Date.UTC(y, luna - 1, zi + 13));
  return p.toISOString().slice(0, 10);
}
const _sl = {};
/** Zilele de sărbătoare legală (Codul muncii, art. 139). */
export function sarbatori(y) {
  if (_sl[y]) return _sl[y];
  const p = new Date(pasteOrtodox(y) + 'T12:00:00Z');
  const rel = (n) => { const d = new Date(p); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  return (_sl[y] = new Set([...['01-01', '01-02', '01-06', '01-07', '01-24', '05-01', '06-01', '08-15', '11-30', '12-01', '12-25', '12-26'].map((x) => `${y}-${x}`), rel(-2), rel(0), rel(1), rel(49), rel(50)]));
}
export function zileLucratoare(from, to) {
  let n = 0; const d = new Date(from + 'T12:00:00'); const end = new Date(to + 'T12:00:00');
  while (d <= end) {
    const w = d.getDay(); const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (w && w !== 6 && !sarbatori(d.getFullYear()).has(iso)) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

/** Statul de plată pe lună: rânduri pe angajat + totaluri. */
export function statDePlata(lst, an, luna, setari) {
  const { from, to } = lunaInterval(an, luna);
  const rand = activi(lst, an, luna).map((a) => {
    const de = a.deLa > from ? a.deLa : from, pana = a.panaLa && a.panaLa < to ? a.panaLa : to;
    const k = zileLucratoare(de, pana) / zileLucratoare(from, to);
    const ang = k < 1 ? { ...a, brut: Math.round(a.brut * k) } : a;
    const c = calcul(ang, from, setari);
    // suma netaxabilă se acordă doar pentru brutul întreg de salariu minim
    return { id: a.id, nume: a.nume, tip: a.tip, proportie: Math.round(k * 100), ...c };
  });
  const tot = rand.reduce((t, r) => { for (const k of ['brut', 'cas', 'cass', 'impozit', 'net', 'cam']) t[k] = r2((t[k] || 0) + r[k]); return t; }, {});
  return { an, luna, rand, tot, deVirat: r2((tot.cas || 0) + (tot.cass || 0) + (tot.impozit || 0) + (tot.cam || 0)) };
}

/** Liniile notei contabile de salarii (generată la închiderea lunii). */
export function liniiNota(stat) {
  const L = [];
  for (const r of stat.rand) {
    const n = r.nume;
    L.push({ d: '641', c: '421', suma: r.brut, expl: `Salariu brut ${n}` });
    if (r.cas) L.push({ d: '421', c: '4315', suma: r.cas, expl: `CAS 25% ${n}` });
    if (r.cass) L.push({ d: '421', c: '4316', suma: r.cass, expl: `CASS 10% ${n}` });
    if (r.impozit) L.push({ d: '421', c: '444', suma: r.impozit, expl: `Impozit pe salariu ${n}` });
    if (r.cam) L.push({ d: '6461', c: '436', suma: r.cam, expl: `CAM 2,25% ${n}` });
  }
  return L.filter((l) => l.suma > 0);
}

/** Condiția micro: un salariat cu normă întreagă (sau mai mulți cu normă parțială, cumulat), ori un administrator
 *  cu contract de mandat plătit cel puțin cu salariul minim; firmele noi au 90 de zile de la înființare. */
export function conditieMicro(lst, data, setari) {
  const act = lst.filter((a) => a.deLa && a.deLa <= data && (!a.panaLa || a.panaLa >= data));
  const norme = act.filter((a) => a.tip === 'cim').reduce((s, a) => s + (Number(a.norma) || 8), 0);
  const mandatOk = act.some((a) => a.tip === 'mandat' && Number(a.brut) >= salariuMinim(data, setari));
  const ok = norme >= 8 || mandatOk;
  let termen = null;
  if (!ok && setari.dataInfiintare) {
    const t = new Date(setari.dataInfiintare + 'T12:00:00'); t.setDate(t.getDate() + 90);
    termen = t.toISOString().slice(0, 10);
  }
  const plecat = lst.filter((a) => a.panaLa && a.panaLa < data).sort((a, b) => b.panaLa.localeCompare(a.panaLa))[0];
  if (!ok && plecat && !termen) { const t = new Date(plecat.panaLa + 'T12:00:00'); t.setDate(t.getDate() + 30); termen = t.toISOString().slice(0, 10); }
  return { ok, termen, norme, mandatOk };
}

export { pad };
