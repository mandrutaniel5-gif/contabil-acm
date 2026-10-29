// Test încorporat, folosit doar în build-urile de test (iOS în simulator, Windows în Electron).
// Trece prin toate ecranele, măsoară lățimea și zoom-ul, testează apelurile native (BNR, ANAF)
// și scrie rezultatele în consolă cu prefixul ACMTEST. Cine rulează testul face capturi la „ACMSHOT”
// și atinge ecranul la „ACMTAP x y” (coordonate CSS = puncte iOS).
const log = (...a) => console.log('ACMTEST', ...a);
const pauza = (ms) => new Promise((r) => setTimeout(r, ms));
const rezultate = [];
const ok = (nume, cond, detalii = '') => { rezultate.push({ nume, ok: !!cond, detalii }); log(cond ? 'OK' : 'FAIL', nume, detalii); };

async function captura(nume, ms = 1600) { log('ACMSHOT', nume); console.log('ACMSHOT ' + nume); await pauza(ms); }
async function atinge(el, nume) {
  el.scrollIntoView({ block: 'center' });
  await pauza(400);
  const r = el.getBoundingClientRect();
  const x = Math.round(r.left + Math.min(r.width / 2, 60)), y = Math.round(r.top + r.height / 2);
  console.log(`ACMTAP ${x} ${y} ${nume}`);
  await pauza(3500); // cel care rulează testul atinge ecranul; așteptăm tastatura și eventualul zoom
}

async function mergi(h) { location.hash = '#' + h; await pauza(900); }
const latime = () => ({ iw: innerWidth, vw: Math.round(visualViewport.width), sw: document.documentElement.scrollWidth, scale: Math.round(visualViewport.scale * 100) / 100 });

async function date() {
  const { db } = await import('./js/db.js');
  const e = await import('./js/engine.js');
  await e.saveSetari({ ...(await e.getSetari()), cui: '51234567', nume: 'ACM CODE S.R.L.', adresa: 'Nr. 344, Avram Iancu, jud. Bihor', iban: 'RO49BTRLRONCRT0512345601', administrator: 'Mândruț Aniel-Ionatan' });
  const s = await e.getSetari();
  const op = (id) => e.OPERATII.find((o) => o.id === id);
  if ((await db.all('note')).length) return false;
  await e.salveazaNota({ data: '2026-10-05', explicatie: 'Capital', linii: op('capital').linii(200), tipNota: 'operatie' });
  await e.salveazaDocument({ tip: 'venit', data: '2026-10-08', nr: 'ACM-0001', total: 12500, cont: '704', plata: 'neplatit', partener: { nume: 'CINEMA PALACE SRL — departamentul de dezvoltare aplicații mobile', cui: 'RO40112233' }, descriere: 'Dezvoltare aplicație mobilă de rezervări, etapa 1 din 3, conform contractului de prestări servicii' }, s);
  await e.salveazaDocument({ tip: 'cheltuiala', data: '2026-10-10', nr: 'HST 771', total: 605, cont: '628', plata: 'banca', partener: { nume: 'HOSTERION SRL', cui: 'RO20198340' }, descriere: 'Găzduire web 12 luni' }, s);
  const S = await import('./js/salarii.js');
  await S.salveaza([{ id: 'a1', nume: 'Popescu Andreea', tip: 'cim', deLa: '2026-10-01', brut: 4325, norma: 8, persoane: 0 }], '2026-10-01');
  return true;
}

export async function ruleaza() {
  await pauza(2500);
  log('START', navigator.userAgent, JSON.stringify(latime()));
  if (await date()) { log('date de test create, repornesc aplicația'); location.reload(); return; }
  // 1. fiecare ecran: nu are voie să fie mai lat decât ecranul și nici mărit
  const ecrane = ['acasa', 'documente', 'documente/nou', 'banca', 'operatii', 'parteneri', 'registre/jurnal', 'registre/balanta', 'registre/fisa', 'registre/casa', 'registre/tva', 'registre/mijloace', 'registre/inchidere', 'registre/inventar', 'registre/situatii', 'registre/an', 'declaratii', 'declaratii/impozit', 'declaratii/saft', 'declaratii/salarii', 'declaratii/tva', 'formulare', 'formulare/chitanta', 'formulare/dispozitie', 'formulare/decont', 'formulare/deplasare', 'formulare/hotarare', 'ghid', 'setari/firma', 'setari/fiscal', 'setari/sync', 'setari/spv', 'setari/auto', 'setari/solduri', 'setari/date', 'setari/aspect'];
  for (const h of ecrane) {
    await mergi(h);
    const l = latime();
    const err = document.querySelector('main')?.innerText.includes('nu s-a putut afișa');
    ok(`ecran ${h}`, !err && l.sw <= l.iw + 1 && l.scale <= 1.01, JSON.stringify(l));
  }
  for (const h of ['acasa', 'documente/nou', 'banca', 'registre/balanta', 'declaratii/impozit', 'formulare/chitanta', 'setari/sync']) { await mergi(h); await captura(h.replace('/', '_')); }
  // 2. zoom la atingerea câmpurilor (problema raportată pe iPhone)
  for (const [h, sel] of [['documente/nou', '#total'], ['documente/nou', '#pnume'], ['documente/nou', '#cont'], ['formulare/chitanta', '#suma'], ['setari/firma', '#cui'], ['operatii', null]]) {
    await mergi(h);
    let el = sel && document.querySelector(sel);
    if (h === 'operatii') { document.querySelector('[data-op="incasare"]').click(); await pauza(700); el = document.querySelector('#o-suma'); }
    if (!el) { ok(`atingere ${h} ${sel}`, false, 'element lipsă'); continue; }
    await atinge(el, `${h} ${sel || '#o-suma'}`);
    const l = latime();
    ok(`fără zoom la atingere ${h} ${sel || '#o-suma'}`, l.scale <= 1.01 && l.sw <= l.iw + 1, JSON.stringify({ ...l, focus: document.activeElement === el }));
    await captura(`tap_${h.replace('/', '_')}_${(sel || 'o-suma').replace('#', '')}`, 900);
    document.activeElement?.blur(); await pauza(900);
    document.querySelector('[data-close]')?.click(); await pauza(400);
  }
  // 2b. foaia de salariat (dialog) pe ecran mic: câmpurile se văd și nu măresc pagina
  await mergi('declaratii/salarii');
  document.querySelector('#s-add')?.click(); await pauza(700);
  const an = document.querySelector('#a-nume');
  if (an) { await atinge(an, 'salariat nume'); const l = latime(); ok('fără zoom în foaia de salariat', l.scale <= 1.01 && l.sw <= l.iw + 1, JSON.stringify(l)); await captura('foaie_salariat', 900); document.activeElement?.blur(); }
  else ok('foaia de salariat se deschide', false, 'lipsă #a-nume');
  document.querySelector('[data-close]')?.click(); await pauza(400);
  // 3. apeluri native (fără CORS): BNR și ANAF
  try {
    const bnr = await import('./js/bnr.js');
    await bnr.actualizeaza({ fortat: true });
    const c = await bnr.curs(new Date().toISOString().slice(0, 10), 'EUR');
    let diag = String(c) + ' ' + bnr.ultimaEroare.text;
    if (!(c > 4)) {
      const { nativeFetch } = await import('./js/host.js');
      for (const u of ['https://www.bnr.ro/nbrfxrates.xml', 'https://bnr.ro/nbrfxrates.xml', 'https://www.bnr.ro/files/xml/years/nbrfxrates2026.xml']) {
        try { const r = await nativeFetch(u); diag += ` | ${u} → ${r.status} ${r.text().slice(0, 120).replace(/\s+/g, ' ')}`; } catch (e) { diag += ` | ${u} → ${e.message}`; }
      }
    }
    ok('curs BNR prin HTTP nativ', c > 4 && c < 7, diag);
  } catch (e) { ok('curs BNR prin HTTP nativ', false, e.message); }
  try {
    const ai = await import('./js/ai.js');
    const r = await ai.cautaCUI('14399840');
    ok('ANAF CUI prin HTTP nativ', /DANTE/i.test(r.nume), r.nume);
  } catch (e) { ok('ANAF CUI prin HTTP nativ', false, e.message); }
  try {
    const { nativeFetch } = await import('./js/host.js');
    const xml = '<?xml version="1.0"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/>';
    const r = await nativeFetch('https://webservicesp.anaf.ro/prod/FCTEL/rest/validare/FACT1', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: xml });
    ok('ANAF e-Factura (validator) prin HTTP nativ', r.status === 200, r.status + ' ' + r.text().slice(0, 80));
  } catch (e) { ok('ANAF e-Factura (validator) prin HTTP nativ', false, e.message); }
  // 4. criptografie folosită de seif și de SPV (WebCrypto pe platformă)
  try {
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const hk = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), 'HKDF', false, ['deriveKey', 'deriveBits']);
    await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new Uint8Array(1) }, hk, 256);
    const ds = new DecompressionStream('deflate-raw');
    ok('WebCrypto ECDH/HKDF + DecompressionStream', !!kp && !!ds);
  } catch (e) { ok('WebCrypto ECDH/HKDF + DecompressionStream', false, e.message); }
  const n = rezultate.filter((r) => !r.ok).length;
  log('GATA', JSON.stringify({ total: rezultate.length, esuate: n }));
  console.log('ACMDONE ' + JSON.stringify(rezultate));
}

ruleaza().catch((e) => { log('FAIL', 'excepție', e.message); console.log('ACMDONE []'); });
