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

console.log(`\n${ok} teste trecute.`);
