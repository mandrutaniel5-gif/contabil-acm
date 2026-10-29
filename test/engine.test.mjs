// Test al motorului contabil pe un scenariu de firmă (rulează: npm test)
import 'fake-indexeddb/auto';
import assert from 'node:assert/strict';
const E = await import('../www/js/engine.js');
const D = await import('../www/js/declaratii.js');
const { db } = await import('../www/js/db.js');

let ok = 0;
const t = async (nume, fn) => { await fn(); ok++; console.log('✓', nume); };

async function reset(setari) {
  for (const s of ['note', 'documente', 'mijloace', 'settings', 'parteneri']) await db.clear(s);
  await E.saveSetari({ ...E.SETARI_IMPLICITE, ...setari });
  return E.getSetari();
}
const eq = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, `${msg}: ${a} ≠ ${b}`);

// ---------------- Micro, neplătitor de TVA ----------------
await t('Scenariu micro neplătitor TVA — T1 2026', async () => {
  let s = await reset({ regim: 'micro', platitorTVA: false, cui: '12345678' });
  const op = (id) => E.OPERATII.find((o) => o.id === id);
  await E.salveazaNota({ data: '2026-01-05', explicatie: 'Capital', linii: op('capital').linii(200) });
  await E.salveazaDocument({ tip: 'venit', data: '2026-01-20', total: 10000, cont: '704', plata: 'neplatit', partener: { nume: 'Client A' } }, s);
  await E.salveazaNota({ data: '2026-02-03', explicatie: 'Încasare', linii: op('incasare').linii(10000) });
  await E.salveazaDocument({ tip: 'cheltuiala', data: '2026-01-25', total: 121, cont: '628', plata: 'banca', partener: { nume: 'Hosting' } }, s);
  await E.salveazaDocument({ tip: 'cheltuiala', data: '2026-02-10', total: 3000, cont: '303', plata: 'asociat', partener: { nume: 'eMAG' } }, s);
  await E.salveazaDocument({ tip: 'venit', data: '2026-03-15', total: 5000, cont: '704', plata: 'banca', partener: { nume: 'Client B' } }, s);
  await E.salveazaNota({ data: '2026-03-31', explicatie: 'Comision', linii: op('comision').linii(15) });
  for (const l of [1, 2, 3]) await E.inchideLuna(2026, l);

  const note = await E.toateNotele();
  const b = E.balanta(note, s, '2026-03-01', '2026-03-31');
  eq(b.tot.tsd, b.tot.tsc, 'total sume egale');
  eq(b.tot.sfd, b.tot.sfc, 'solduri finale egale');
  const r = (c) => b.rows.find((x) => x.cod === c) || { sfd: 0, sfc: 0 };
  eq(r('5121').sfd, 200 + 10000 - 121 + 5000 - 15, 'sold bancă');
  eq(r('4551').sfc, 3000, 'datorie la administrator');
  eq(r('4418').sfc, 150, 'impozit micro 1% din 15.000');
  assert.equal(b.rows.filter((x) => /^[67]/.test(x.cod) && (x.sfd || x.sfc)).length, 0, 'conturile 6/7 închise');
  eq(r('121').sfc, 15000 - 121 - 3000 - 15 - 150, 'profit în 121');
  assert.equal(E.verificaBalanta(b).filter((p) => p.grav === 'eroare').length, 0);
  const d = D.d100Micro(note, s, 2026, 1);
  assert.equal(d.impozitDePlata, 150);
  // reînchiderea nu dublează
  await E.inchideLuna(2026, 3);
  const b2 = E.balanta(await E.toateNotele(), s, '2026-03-01', '2026-03-31');
  eq(b2.rows.find((x) => x.cod === '4418').sfc, 150, 'fără dubluri la reînchidere');
  // SAF-T produce XML
  const xml = D.saftXML(note, s, await db.all('parteneri'), '2026-01-01', '2026-03-31', 'test');
  assert.ok(xml.includes('<n1:AccountID>5121</n1:AccountID>') && xml.endsWith('</n1:AuditFile>'));
});

await t('Impozit micro T2 calculat cumulativ', async () => {
  const s = await E.getSetari();
  await E.salveazaDocument({ tip: 'venit', data: '2026-05-10', total: 7000, cont: '704', plata: 'banca', partener: { nume: 'Client A' } }, s);
  for (const l of [4, 5, 6]) await E.inchideLuna(2026, l);
  const d = D.d100Micro(await E.toateNotele(), s, 2026, 2);
  assert.equal(d.impozitDePlata, 70);
  assert.equal(d.impozitTrimPrec, 150);
});

// ---------------- Plătitor TVA trimestrial ----------------
await t('Plătitor TVA — regularizare D300', async () => {
  const s = await reset({ regim: 'micro', platitorTVA: true, perioadaTVA: 'trimestru' });
  await E.salveazaDocument({ tip: 'venit', data: '2026-07-10', total: 12100, tva: 2100, tvaCota: 0.21, cont: '704', plata: 'banca' }, s);
  await E.salveazaDocument({ tip: 'cheltuiala', data: '2026-07-12', total: 1210, tva: 210, tvaCota: 0.21, cont: '628', plata: 'banca' }, s);
  await E.salveazaDocument({ tip: 'cheltuiala', data: '2026-08-02', total: 605, tva: 105, tvaCota: 0.21, cont: '6022', plata: 'casa', tvaDeductibil: 50 }, s);
  const note0 = await E.toateNotele();
  const v = D.d300(note0, s, 2026, 'T3');
  eq(v.totalColectata, 2100, 'TVA colectată'); eq(v.totalDeductibila, 262.5, 'TVA deductibilă (50% combustibil)');
  for (const l of [7, 8, 9]) await E.inchideLuna(2026, l);
  const b = E.balanta(await E.toateNotele(), s, '2026-09-01', '2026-09-30');
  const r = (c) => b.rows.find((x) => x.cod === c) || { sfd: 0, sfc: 0 };
  eq(r('4423').sfc, 2100 - 262.5, 'TVA de plată');
  eq(r('4427').sfc + r('4427').sfd + r('4426').sfd + r('4426').sfc, 0, '4426/4427 închise');
  eq(r('4418').sfc, 100, 'impozit micro pe baza fără TVA');
  eq(b.tot.sfd, b.tot.sfc, 'balanță echilibrată');
  // casa negativă e semnalată
  assert.ok(E.verificaBalanta(b).some((p) => p.text.startsWith('Casa are sold negativ')));
});

// ---------------- Profit + amortizare ----------------
await t('Impozit pe profit și amortizare', async () => {
  const s = await reset({ regim: 'profit', platitorTVA: false });
  await E.salveazaDocument({ tip: 'cheltuiala', data: '2026-01-15', total: 7200, cont: '2131', plata: 'banca' }, s);
  await db.put('mijloace', { id: 'm1', denumire: 'Server', cont: '2131', valoare: 7200, durataLuni: 36, dataPIF: '2026-01-15' });
  await E.salveazaDocument({ tip: 'venit', data: '2026-02-01', total: 20000, cont: '704', plata: 'banca' }, s);
  for (const l of [1, 2, 3]) await E.inchideLuna(2026, l);
  const note = await E.toateNotele();
  const b = E.balanta(note, s, '2026-03-01', '2026-03-31');
  const r = (c) => b.rows.find((x) => x.cod === c) || { sfd: 0, sfc: 0 };
  eq(r('2813').sfc, 400, 'amortizare feb+mar');
  eq(r('4411').sfc, Math.round((20000 - 400) * 0.16), 'impozit profit 16%');
  eq(r('404').sfd + r('404').sfc, 0, 'furnizor imobilizări achitat');
  eq(b.tot.sfd, b.tot.sfc, 'balanță echilibrată');
  assert.equal(E.amortizareLuna({ valoare: 7200, durataLuni: 36, dataPIF: '2026-01-15' }, 2029, 1), 200, 'ultima lună');
  assert.equal(E.amortizareLuna({ valoare: 7200, durataLuni: 36, dataPIF: '2026-01-15' }, 2029, 2), 0, 'după final');
});

await t('Termene și dividende', async () => {
  const s = await E.getSetari();
  const tm = D.termene({ ...s, regim: 'micro', platitorTVA: false }, new Date('2026-10-01'), 2);
  const d100 = tm.find((x) => x.cod === 'D100');
  assert.equal(E.iso(d100.termen), '2026-10-26', 'D100 T3: 25 oct e duminică → 26');
  const d406 = tm.find((x) => x.cod === 'D406');
  assert.equal(E.iso(d406.termen), '2026-11-02', 'D406 T3: 31 oct e sâmbătă → 2 nov');
  const div = E.OPERATII.find((o) => o.id === 'dividende').linii(10000, E.reguli(s));
  assert.deepEqual(div.map((l) => l.suma), [10000, 1600, 8400]);
  const sal = D.calculSalariu(4050, 0, s);
  assert.equal(sal.net, 4050 - 1013 - 405 - 263);
});



// ---------------- Extrase bancare și potrivire automată ----------------
const X = await import('../www/js/extrase.js');
await t('Extras CSV (format românesc) + potrivire automată cu facturile', async () => {
  const s = await reset({ regim: 'micro', platitorTVA: false, administrator: 'Mândruț Aniel-Ionatan', cui: '51234567' });
  await E.salveazaDocument({ id: 'f1', tip: 'venit', data: '2026-09-02', nr: 'ACM-0012', total: 4500, cont: '704', plata: 'neplatit', partener: { nume: 'Cinema Palace SRL', cui: 'RO40112233' } }, s);
  await E.salveazaDocument({ id: 'f2', tip: 'cheltuiala', data: '2026-09-05', nr: 'HST771', total: 119.5, cont: '628', plata: 'neplatit', partener: { nume: 'Hosterion SRL', cui: '20198340' } }, s);
  const csv = '﻿Data tranzactie;Descriere;Debit;Credit;Beneficiar/Ordonator\n'
    + '10.09.2026;Plata factura ACM-0012;;4.500,00;CINEMA PALACE SRL\n'
    + '11.09.2026;OP factura HST771;119,50;;HOSTERION SRL\n'
    + '30.09.2026;Comision administrare cont;12,00;;\n'
    + '15.09.2026;Retragere numerar ATM;500,00;;\n'
    + '20.09.2026;Transfer;1.000,00;;MANDRUT ANIEL-IONATAN\n'
    + '22.09.2026;GOOGLE *Workspace;54,00;;GOOGLE\n'
    + '25.09.2026;Plata necunoscuta;77,00;;SC XYZ\n';
  const f = { name: 'extras.csv', type: 'text/csv', arrayBuffer: async () => new TextEncoder().encode(csv).buffer };
  const r = await X.citesteFisier(f);
  assert.equal(r.tranzactii.length, 7);
  eq(r.tranzactii[0].suma, 4500, 'sumă credit'); eq(r.tranzactii[1].suma, -119.5, 'sumă debit');
  const res = await X.importa({ banca: 'BT', tranzactii: r.tranzactii });
  assert.equal(res.total, 7);
  const ex = (await db.all('extrase'))[0];
  const st = Object.fromEntries(ex.tranzactii.map((x) => [x.detalii.slice(0, 12), x.stare]));
  assert.equal(st['Plata factur'], 'inregistrat');
  assert.equal(st['OP factura H'], 'inregistrat');
  assert.equal(st['Comision adm'], 'inregistrat');
  assert.equal(st['Retragere nu'], 'inregistrat');
  assert.equal(st['Transfer'], 'propus');           // administratorul: cere confirmare
  assert.equal(st['GOOGLE *Work'], 'propus');       // card, fără factură: cere confirmare
  assert.equal(st['Plata necuno'], 'neclar');
  assert.ok((await db.get('documente', 'f1')).achitat, 'factura client marcată încasată');
  assert.ok((await db.get('documente', 'f2')).achitat, 'factura furnizor marcată plătită');
  // reimportul aceluiași extras nu dublează nimic
  const res2 = await X.importa({ banca: 'BT', tranzactii: (await X.citesteFisier(f)).tranzactii });
  assert.equal(res2.total, 0);
  // confirmarea plății Google creează cheltuiala de verificat
  const g = ex.tranzactii.find((x) => x.detalii.startsWith('GOOGLE'));
  await X.confirma(ex.id, g.id);
  const docG = (await db.all('documente')).find((d) => d.extrasTx === g.id);
  assert.ok(docG && docG.deVerificat && docG.cont === '628');
  const note = await E.toateNotele();
  const b = E.balanta(note, s, '2026-09-01', '2026-09-30');
  const r5121 = b.rows.find((x) => x.cod === '5121');
  eq(r5121.sfd - r5121.sfc, 4500 - 119.5 - 12 - 500 - 54, 'sold bancă după extras');
  eq(b.tot.sfd, b.tot.sfc, 'balanță echilibrată');
});

await t('Extras MT940', async () => {
  const mt = ':20:STMT\n:25:RO49AAAA1B31007593840000\n:60F:C260901RON1000,00\n:61:2609100910C250,00NTRFNONREF\n:86:Incasare de la Client SRL\n:61:2609120912D15,50NMSCNONREF\n:86:Comision\n:62F:C260930RON1234,50\n';
  const r = await X.citesteFisier({ name: 'x.sta', type: '', arrayBuffer: async () => new TextEncoder().encode(mt).buffer });
  assert.equal(r.tranzactii.length, 2);
  eq(r.tranzactii[0].suma, 250, 'credit'); eq(r.tranzactii[1].suma, -15.5, 'debit');
  assert.equal(r.tranzactii[0].data, '2026-09-10');
});

await t('Numere și date din extrase', async () => {
  eq(X.numar('1.234,56'), 1234.56, 'ro'); eq(X.numar('1,234.56'), 1234.56, 'en'); eq(X.numar('-12,5'), -12.5, 'neg'); eq(X.numar('(80.00)'), -80, 'paranteze');
  assert.equal(X.dataISO('05.03.2026'), '2026-03-05'); assert.equal(X.dataISO('2026-03-05T10:00'), '2026-03-05'); assert.equal(X.dataISO('20260305'), '2026-03-05');
});

// ---------------- Situații financiare, reportare automată ----------------
const SF = await import('../www/js/situatii.js');
await t('Situații financiare și reportarea în anul nou', async () => {
  const s = await reset({ regim: 'micro', platitorTVA: false });
  const op = (id) => E.OPERATII.find((o) => o.id === id);
  await E.salveazaNota({ data: '2025-01-10', explicatie: 'Capital', linii: op('capital').linii(1000) });
  await E.salveazaDocument({ tip: 'venit', data: '2025-03-01', total: 20000, cont: '704', plata: 'banca' }, s);
  await E.salveazaDocument({ tip: 'cheltuiala', data: '2025-03-05', total: 2000, cont: '628', plata: 'banca' }, s);
  for (let l = 1; l <= 12; l++) await E.inchideLuna(2025, l);
  const note = await E.toateNotele();
  const sf = SF.situatiiFinanciare(note, s, 2025);
  eq(sf.verificare, 0, 'bilanțul se închide');
  const cpp = Object.fromEntries(sf.cpp.map(([n, v]) => [n, v]));
  eq(cpp['Cifra de afaceri netă'], 20000, 'cifra de afaceri'); eq(cpp['Impozit pe profit / pe venit'], 200, 'impozit micro 1%');
  eq(sf.net, 20000 - 2000 - 200, 'profit net');
  // soldurile anului 2025 trec automat în 2026
  const b26 = E.balanta(note, s, '2026-01-01', '2026-01-31');
  const banca = b26.rows.find((x) => x.cod === '5121');
  eq(banca.sid, 1000 + 20000 - 2000, 'sold inițial 2026 preluat automat');
  eq(b26.tot.sid, b26.tot.sic, 'solduri inițiale echilibrate');
});


await t('Salarii 2026: salariul minim, deducere, stat de plată și notă', async () => {
  const s = await reset({ regim: 'micro', platitorTVA: false });
  const S = await import('../www/js/salarii.js');
  // 4.325 lei brut (minimul din iulie 2026): 200 lei netaxabili, deducere 20% = 865 lei
  const c = S.calcul({ tip: 'cim', brut: 4325, persoane: 0 }, '2026-09-01', s);
  eq(c.neimpozabil, 200, 'sumă netaxabilă'); eq(c.cas, 1031, 'CAS'); eq(c.cass, 413, 'CASS'); eq(c.deducere, 865, 'deducere');
  eq(c.impozit, 182, 'impozit'); eq(c.net, 2699, 'net'); eq(c.cam, 97, 'CAM');
  // peste minim: deducerea scade cu 0,5 pp la 50 lei; la minim + 2.000 lei e zero
  eq(S.deducere(4325 + 100, 4325, 0), Math.round(4325 * 0.19), 'deducere scăzută');
  eq(S.deducere(4325 + 2000, 4325, 2), 0, 'deducere zero');
  // mandat: fără deducere și fără CAM
  const m = S.calcul({ tip: 'mandat', brut: 4325 }, '2026-09-01', s);
  eq(m.cam, 0, 'mandat fără CAM'); eq(m.deducere, 0, 'mandat fără deducere');
  // sărbători legale și luna proporțională
  assert.equal(S.pasteOrtodox(2027), '2027-05-02');
  assert.equal(S.zileLucratoare('2027-01-01', '2027-01-31'), 18);
  await S.salveaza([{ id: 'a', nume: 'Popescu Andreea', tip: 'cim', deLa: '2027-01-04', brut: 4325, norma: 8 }], '2027-01-04');
  const st = S.statDePlata(await S.lista(), 2027, 1, s);
  assert.equal(st.rand[0].proportie, 100, 'angajată în prima zi lucrătoare: lună întreagă');
  eq(st.deVirat, 1723, 'de virat la ANAF');
  await E.inchideLuna(2027, 1);
  const n = (await E.toateNotele()).find((x) => x.auto === 'salarii');
  assert.ok(n, 'nota de salarii a fost generată');
  eq(n.linii.filter((l) => l.d === '641').reduce((a, l) => a + l.suma, 0), 4325, '641 = 421');
  const cm = S.conditieMicro(await S.lista(), '2027-02-01', s);
  assert.ok(cm.ok, 'condiția micro îndeplinită');
  assert.ok(!S.conditieMicro([], '2026-12-01', { ...s, dataInfiintare: '2026-10-27' }).ok);
  assert.equal(S.conditieMicro([], '2026-12-01', { ...s, dataInfiintare: '2026-10-27' }).termen, '2027-01-25');
});

await t('Extras: plata la ANAF pe mai multe luni și legarea plăților deja înregistrate', async () => {
  const s = await reset({ regim: 'micro', platitorTVA: false });
  const X = await import('../www/js/extrase.js');
  const note = [
    { data: '2027-01-31', linii: [{ d: '421', c: '4315', suma: 1031 }, { d: '421', c: '4316', suma: 413 }, { d: '421', c: '444', suma: 182 }, { d: '6461', c: '436', suma: 97 }] },
    { data: '2027-02-28', linii: [{ d: '421', c: '4315', suma: 1031 }, { d: '421', c: '4316', suma: 413 }, { d: '421', c: '444', suma: 182 }, { d: '6461', c: '436', suma: 97 }] },
    { data: '2027-03-31', linii: [{ d: '698', c: '4418', suma: 127 }] },
  ];
  const ob = X.obligatiiDeschise(note, ['4315', '4316', '444', '436', '4418'], '2027-03-24');
  assert.equal(ob.length, 8, 'două luni de contribuții deschise; impozitul micro e după data plății');
  const p = X.propune({ data: '2027-03-24', suma: -1723, detalii: 'Plata contributii D112 cont unic ANAF', contraparte: 'TREZORERIE OPERATIVA' },
    { documente: [], note, setari: s, solduri: {}, contBanca: '5121' });
  eq(p.linii.reduce((a, l) => a + l.suma, 0), 1723, 'o lună de contribuții');
  assert.ok(p.incredere >= 90 && /februarie|01\.2027|02\.2027/.test(p.motiv), p.motiv);
  const bon = { id: 'n1', data: '2027-03-06', explicatie: 'OMV benzină', linii: [{ d: '6022', c: '5121', suma: 310.34 }] };
  const q = X.propune({ data: '2027-03-07', suma: -310.34, detalii: 'POS OMV PETROM ORADEA', contraparte: 'OMV PETROM' },
    { documente: [], note: [bon], setari: s, solduri: {}, contBanca: '5121' });
  assert.equal(q.legaNota, 'n1', 'bonul plătit cu cardul nu se mai înregistrează a doua oară');
});

const F = await import('../www/js/v-formulare.js').catch(() => null);
await t('Suma în litere', async () => {
  const { inLitere } = F || (await import('../www/js/v-formulare.js'));
  assert.equal(inLitere(1), 'un leu');
  assert.equal(inLitere(2), 'doi lei');
  assert.equal(inLitere(21), 'douăzeci și unu de lei');
  assert.equal(inLitere(100), 'o sută de lei');
  assert.equal(inLitere(1250.5), 'o mie două sute cincizeci de lei și cincizeci de bani');
  assert.equal(inLitere(2019), 'două mii nouăsprezece lei');
});

console.log(`\n${ok} teste trecute.`);
