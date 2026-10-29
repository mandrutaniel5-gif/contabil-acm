// Indicații automate: verifică datele și spune pe înțeles ce e de făcut. Funcționează fără AI.
import { balanta, verificaBalanta, lunaInterval, lei, LUNI, azi, cifraAfaceri, reguli, dataRo, iso, tvaLa } from './engine.js';
import { termene, zilePana } from './declaratii.js';
import { conditieMicro, lista as listaSalariati } from './salarii.js';

export async function indicatii({ note, documente, setari, mijloace, extrase = [], seif = null, spv = null, anaf = null }) {
  const out = [];
  const salariati = await listaSalariati();
  const pasi = primiPasi({ note, setari, extrase, seif, anaf, salariati });
  const now = new Date();
  const an = now.getFullYear();
  const R = reguli(setari);

  if (!setari.cui && !pasi) out.push({ grav: 'warn', text: 'Completează datele firmei (CUI, adresă). Apar pe registre și în fișierul SAF-T.', act: ['Completează datele', '#setari'] });
  if (!Object.keys(setari.soldInitial || {}).length && note.length === 0) {
    out.push({ grav: 'info', text: 'Dacă firma a avut activitate înainte de a folosi aplicația, introdu soldurile de la 1 ianuarie (din ultima balanță). Dacă firma e nouă, poți sări peste.', act: ['Solduri inițiale', '#setari/solduri'] });
  }

  const caAn = cifraAfaceri(note, `${an}-01-01`, `${an}-12-31`);
  if (setari.regim === 'micro' && !setari.cursSetat && caAn >= R.micro.plafonEUR * 5 * 0.5) out.push({ grav: 'info', text: 'Cursul euro pentru plafonul micro nu a putut fi luat automat de la BNR. Pune cursul BNR din ultima zi a anului trecut, ca plafonul de 100.000 € să fie calculat exact.', act: ['Regim fiscal', '#setari/fiscal'] });

  // Condiția de salariat pentru microîntreprinderi
  if (setari.regim === 'micro' && (note.length || setari.dataInfiintare)) {
    const cm = conditieMicro(salariati, azi(), setari);
    if (!cm.ok) {
      const z = cm.termen ? Math.round((new Date(cm.termen) - new Date(azi())) / 864e5) : null;
      out.push({ grav: z != null && z > 30 ? 'warn' : 'err', text: z != null && z >= 0
        ? `Firma micro trebuie să aibă un salariat cu normă întreagă (sau administratorul cu contract de mandat plătit cel puțin cu salariul minim) până pe ${dataRo(cm.termen)} — ${z === 0 ? 'astăzi' : `în ${z} zile`}. Altfel trece la impozit pe profit. Când angajezi pe cineva, adaugă-l în Salarii.`
        : `Firma micro nu are salariat${cm.termen ? ` de la ${dataRo(cm.termen)}` : ''}. Fără salariat (sau contract de mandat), impozitul pe venit nu se mai poate aplica: firma trece la impozit pe profit din trimestrul respectiv. Adaugă salariații în Salarii sau vorbește cu un contabil.${!setari.dataInfiintare ? ' Dacă firma e nouă, completează data înființării (Setări → Firma): ai 90 de zile să angajezi.' : ''}`,
      act: ['Salarii', '#declaratii/salarii'] });
    }
  }

  const deVer = documente.filter((d) => d.deVerificat);
  if (deVer.length) out.push({ grav: 'warn', text: `${deVer.length} ${deVer.length === 1 ? 'document așteaptă' : 'documente așteaptă'} o verificare (venite din SPV sau din extras). Uită-te la contul propus și salvează.`, act: ['Vezi documentele', '#documente'], cheie: 'verificat' });
  const neclare = extrase.flatMap((x) => x.tranzactii.filter((t) => t.stare === 'propus' || t.stare === 'neclar' || t.stare === 'nou'));
  if (neclare.length) out.push({ grav: 'warn', text: `${neclare.length} ${neclare.length === 1 ? 'tranzacție din extras așteaptă' : 'tranzacții din extras așteaptă'} confirmarea ta.`, act: ['Deschide Banca', '#banca'] });
  const restante = documente.filter((d) => d.plata === 'neplatit' && !d.achitat && d.tip === 'venit' && (d.scadenta || '9999') < azi());
  if (restante.length) out.push({ grav: 'info', text: `${restante.length} ${restante.length === 1 ? 'client are factura' : 'facturi de la clienți sunt'} peste scadență: ${lei(restante.reduce((t, d) => t + Number(d.total) - Number(d.platitPartial || 0), 0))} lei de încasat.`, act: ['Parteneri', '#parteneri'] });
  // Servicii din străinătate cumpărate de o firmă neplătitoare de TVA: cod special (art. 317) și D301
  const strain = documente.filter((d) => d.tip === 'cheltuiala' && d.taxareInversa && !tvaLa(setari, d.data) && (d.data || '') >= `${an - 1}-01-01`);
  if (strain.length && !setari.cod317) {
    const furn = [...new Set(strain.map((d) => (d.partener?.nume || '').split(/\s|\*/)[0]).filter(Boolean))].slice(0, 4).join(', ');
    out.push({ grav: 'err', text: `Plătești servicii de la firme din străinătate (${furn}). Chiar dacă firma nu e plătitoare de TVA, pentru ele se datorează TVA în România (taxare inversă): ai nevoie de un cod special de TVA (art. 317, formularul 700 la ANAF), depui lunar D301 și plătești TVA-ul de 21%. Pentru furnizorii din UE se depune și D390. După ce primești codul, bifează-l în Regim fiscal.`, act: ['Regim fiscal', '#setari/fiscal'] });
  } else if (strain.length) {
    const inainte = strain.filter((d) => setari.cod317DeLa && d.data < setari.cod317DeLa);
    if (inainte.length) out.push({ grav: 'warn', text: `${inainte.length} plăți către furnizori din străinătate sunt dinainte de data codului special de TVA (${dataRo(setari.cod317DeLa)}), în total ${lei(inainte.reduce((a, d) => a + Number(d.total), 0))} lei. TVA-ul pentru ele (21%) se datora și atunci: se declară cu D301 pentru lunile respective. Discută cu un contabil cum le regularizezi.`, act: ['Întreabă asistentul', '#declaratii'], ai: 'Am plătit servicii din străinătate înainte să am cod special de TVA (art. 317). Cum regularizez TVA-ul pentru lunile acelea?', cheie: `strain-inainte-${inainte.length}`, ascunde: true });
    const per = {};
    for (const n of note) for (const l of n.linii) if (l.d301) per[n.data.slice(0, 7)] = (per[n.data.slice(0, 7)] || 0) + Number(l.suma);
    const lunaTrecuta = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);
    if (per[lunaTrecuta]) out.push({ grav: 'warn', text: `D301 pentru ${LUNI[Number(lunaTrecuta.slice(5)) - 1]}: TVA de ${lei(per[lunaTrecuta])} lei pentru serviciile din străinătate. Se depune și se plătește până pe 25 ${LUNI[now.getMonth()]}.`, act: ['Declarații', '#declaratii'] });
  }
  if (spv && spv.respinse && spv.respinse.length && Date.now() - (spv.ultima || 0) < 30 * 864e5) out.push({ grav: 'err', text: `ANAF a respins ${spv.respinse.length === 1 ? 'o factură' : spv.respinse.length + ' facturi'} trimise în SPV. Corectează-le în ACM Docs și retrimite-le.`, act: ['Detalii', '#setari/spv'] });
  if (!seif && note.length > 5 && !pasi) out.push({ grav: 'info', text: 'Datele sunt doar pe acest dispozitiv. Creează seiful criptat ca să le ai și pe telefon și să nu le pierzi dacă se strică dispozitivul.', act: ['Dispozitive', '#setari/sync'] });

  // Termene apropiate
  for (const t of termene(setari, now, 1)) {
    const z = zilePana(t.termen);
    if (z < 0 || z > 14) continue;
    out.push({ grav: z <= 5 ? 'err' : 'warn', text: `${t.nume} pentru ${t.perioada}: termen ${z === 0 ? 'astăzi' : z === 1 ? 'mâine' : `în ${z} zile`} (${dataRo(iso(t.termen))}).`, act: ['Pregătește declarația', '#declaratii'] });
  }

  // Lunile neînchise (doar dacă închiderea automată e oprită)
  if (setari.inchidereAutomata === false) {
    const lunaCur = now.getMonth() + 1;
    const neinchise = [];
    for (let l = 1; l < lunaCur; l++) {
      const p = `${an}-${String(l).padStart(2, '0')}`;
      const areMiscari = note.some((n) => n.data.startsWith(p) && !n.auto);
      const inchisa = note.some((n) => n.autoPerioada === p && n.auto === 'inchidere');
      if (areMiscari && !inchisa) neinchise.push(LUNI[l - 1]);
    }
    if (neinchise.length) out.push({ grav: 'warn', text: `${neinchise.length === 1 ? `Luna ${neinchise[0]} nu e închisă` : `Lunile ${neinchise.slice(0, -1).join(', ')} și ${neinchise.at(-1)} nu sunt închise`}. Închiderea calculează impozitul, TVA-ul, salariile și amortizarea.`, act: ['Închide luna', '#registre/inchidere'] });
  }

  // Documente fără fișier atașat (e-Facturile din SPV au XML-ul, care e documentul original)
  const faraFisier = documente.filter((d) => !d.fisier && !['SPV', 'XML', 'extras'].includes(d.sursa) && (d.data || '') >= shift(-62));
  if (faraFisier.length) out.push({ grav: 'info', text: `${faraFisier.length === 1 ? 'Un document din ultimele două luni nu are' : `${faraFisier.length} documente din ultimele două luni nu au`} poza sau PDF-ul atașat. Păstrează documentele justificative — sunt cerute la control.`, act: ['Vezi documentele', '#documente'] });
  const faraFactura = documente.filter((d) => d.sursa === 'extras' && !d.fisier && !d.deVerificat && (d.data || '') >= shift(-62));
  if (faraFactura.length) out.push({ grav: 'info', text: `${faraFactura.length === 1 ? 'O plată cu cardul nu are' : `${faraFactura.length} plăți cu cardul nu au`} factura atașată (de ex. abonamentele online). Descarcă facturile din contul furnizorului și atașează-le la document.`, act: ['Vezi documentele', '#documente'] });

  // Facturi de la furnizori neplătite de mult (cele de la clienți apar mai sus, la scadență)
  const vechi = documente.filter((d) => d.plata === 'neplatit' && !d.achitat && d.tip === 'cheltuiala' && d.data < shift(-30));
  if (vechi.length) out.push({ grav: 'info', text: `${vechi.length === 1 ? 'O factură de la furnizori apare neplătită' : `${vechi.length} facturi de la furnizori apar neplătite`} de peste 30 de zile. Dacă le-ai plătit, plata se leagă singură când imporți extrasul de cont.`, act: ['Banca', '#banca'] });

  // Impozitul pe dividende reținut și neplătit
  const bAn = balanta(note, setari, `${an - 1}-01-01`, azi());
  const s446 = bAn.rows.find((r) => r.cod === '446');
  if (s446 && s446.sfc - s446.sfd > 0.5) {
    const ult = note.filter((n) => n.linii.some((l) => l.c === '446')).map((n) => n.data).sort().at(-1);
    const t = ult ? new Date(ult + 'T12:00:00') : now; t.setMonth(t.getMonth() + 1, 25);
    out.push({ grav: 'warn', text: `Impozitul pe dividende de ${lei(s446.sfc - s446.sfd)} lei se declară în D100 și se plătește până pe ${dataRo(iso(t))} (25 ale lunii de după plata dividendelor).`, act: ['Declarații', '#declaratii/impozit'] });
  }

  // Plafoane
  const ca = caAn;
  if (setari.regim === 'micro') {
    const plafon = R.micro.plafonEUR * (Number(setari.cursEUR) || 5);
    const p = ca / plafon;
    if (p >= 0.8) out.push({ grav: p >= 1 ? 'err' : 'warn', text: `Cifra de afaceri a ajuns la ${Math.round(p * 100)}% din plafonul micro (${lei(plafon)} lei). ${p >= 1 ? 'Firma trece la impozit pe profit din trimestrul depășirii — vorbește cu un contabil.' : 'Peste plafon firma trece la impozit pe profit.'}` });
  }
  if (!setari.platitorTVA) {
    const p = ca / R.tva.plafonScutire;
    if (p >= 1) {
      const zi = dataDepasire(note, an, R.tva.plafonScutire);
      out.push({ grav: 'err', cheie: 'tva-depasit', text: `Ai depășit plafonul de scutire TVA (${lei(R.tva.plafonScutire)} lei) pe ${dataRo(zi)}. De atunci firma trebuie să fie plătitoare de TVA: factura care a depășit plafonul și cele de după se emit cu TVA, iar cererea de cod de TVA (formularul 098) se depunea cel târziu în ziua depășirii. Dacă ai primit codul, marchează firma ca plătitoare de TVA.`, act: ['Trec la TVA', `#setari/fiscal/tva/${zi}`] });
    } else if (p >= 0.8) {
      out.push({ grav: 'warn', text: `Cifra de afaceri a ajuns la ${Math.round(p * 100)}% din plafonul de scutire TVA (${lei(R.tva.plafonScutire)} lei). Mai ai ${lei(R.tva.plafonScutire - ca)} lei. Factura care depășește plafonul trebuie emisă deja cu TVA, iar cererea de înregistrare (formularul 098) se depune cel târziu în ziua depășirii — pregătește-o din timp.`, act: ['Ce trebuie să fac?', '#declaratii'], ai: 'Cifra de afaceri se apropie de plafonul de scutire de TVA. Ce trebuie să fac concret, pas cu pas, ca să devin plătitor de TVA la timp?' });
    }
  }

  // Erori din balanță (an curent)
  const { to } = lunaInterval(an, 12);
  const b = balanta(note, setari, `${an}-01-01`, to);
  for (const p of verificaBalanta(b)) out.push({ grav: p.grav === 'eroare' ? 'err' : 'warn', text: p.text, act: ['Vezi balanța', '#registre/balanta'] });

  // Cheltuieli mari încadrate ca obiecte de inventar
  for (const d of documente) {
    if (d.tip === 'cheltuiala' && d.cont === '303' && Number(d.total) >= R.mijlocFixMin) {
      out.push({ grav: 'warn', text: `„${d.descriere || d.partener?.nume}” costă peste ${lei(R.mijlocFixMin)} lei. Dacă îl folosești mai mult de un an, e mijloc fix (cont 2131) și se amortizează.`, act: ['Deschide documentul', `#documente/${d.id}`] });
    }
  }
  // Mijloace fixe din documente neînregistrate în lista de amortizare
  for (const d of documente) {
    if (d.tip === 'cheltuiala' && d.cont?.startsWith('2') && !mijloace.some((m) => m.docId === d.id)) {
      out.push({ grav: 'warn', text: `„${d.descriere}” e înregistrat ca mijloc fix, dar nu are plan de amortizare.`, act: ['Adaugă amortizarea', `#registre/mijloace/nou/${d.id}`] });
    }
  }

  const ascunse = setari.indicatiiAscunse || [];
  for (let i = out.length - 1; i >= 0; i--) if (out[i].cheie && ascunse.includes(out[i].cheie)) out.splice(i, 1);
  if (!out.length) out.push({ grav: 'ok', text: 'Totul arată în regulă. Înregistrează documentele pe măsură ce apar și închide luna la final.' });
  return out;
}

function dataDepasire(note, an, plafon) {
  const zile = [...new Set(note.filter((n) => n.data.startsWith(String(an))).map((n) => n.data))].sort();
  for (const z of zile) if (cifraAfaceri(note, `${an}-01-01`, z) > plafon) return z;
  return azi();
}

/** Primii pași pentru o firmă nouă (lista de pe ecranul Acasă). */
export function primiPasi({ note, setari, extrase = [], seif = null, anaf = null, salariati = [] }, nativ = false) {
  if (setari.primiPasiAscuns) return null;
  const p = [
    { ok: !!(setari.cui && setari.adresa && setari.iban), text: 'Datele firmei: CUI (se completează de la ANAF), adresa, IBAN-ul', act: '#setari/firma' },
    { ok: !!setari.dataInfiintare && !!setari.regimConfirmat, text: 'Data înființării și regimul fiscal (micro sau profit, cu sau fără TVA)', act: '#setari/fiscal' },
    { ok: note.some((n) => n.linii.some((l) => l.c === '1012' || l.d === '456' || l.c === '456')) || !!Object.keys(setari.soldInitial || {}).length, text: 'Capitalul social (din Operațiuni) sau soldurile de la începutul anului', act: '#operatii' },
    ...(setari.regim === 'micro' ? [{ ok: conditieMicro(salariati, azi(), setari).ok, text: 'Salariatul obligatoriu pentru micro (sau contractul de mandat al administratorului)', act: '#declaratii/salarii' }] : []),
    { ok: !!seif, text: 'Seiful criptat, ca datele să fie salvate și pe telefon', act: '#setari/sync' },
    ...(nativ ? [{ ok: !!anaf, text: 'Conectarea la SPV, ca facturile să vină singure de la ANAF', act: '#setari/spv' }] : []),
    { ok: extrase.length > 0, text: 'Primul extras de cont importat (CSV sau PDF din aplicația băncii)', act: '#banca' },
  ];
  if (p.every((x) => x.ok)) return null;
  return p;
}

function shift(zile) { const d = new Date(); d.setDate(d.getDate() + zile); return d.toISOString().slice(0, 10); }

// Rezumat text pentru contextul asistentului AI
/** Contextul complet pentru asistent: rezumatul contabil + ce arată aplicația pe Acasă + salariați + termene. */
export async function contextAsistent(ctx, ecran) {
  const { lista } = await import('./salarii.js');
  const sal = await lista();
  const tips = await indicatii(ctx).catch(() => []);
  const tm = termene(ctx.setari, new Date(), 2).slice(0, 6);
  const s = ctx.setari;
  return `${rezumatPentruAI(ctx, ecran)}
Detalii firmă: înființată ${s.dataInfiintare || 'necompletat'}; ${s.tvaDeLa ? `plătitoare de TVA de la ${s.tvaDeLa}; ` : ''}${s.cod317 ? `cod special de TVA (art. 317) de la ${s.cod317DeLa || '?'}; ` : ''}administrator ${s.administrator || 'necompletat'}.
Salariați: ${sal.length ? sal.map((a) => `${a.nume} (${a.tip === 'mandat' ? 'contract de mandat' : `CIM ${a.norma || 8}h`}, brut ${a.brut} lei, din ${a.deLa}${a.panaLa ? ' până ' + a.panaLa : ''})`).join('; ') : 'niciunul'}.
Ce arată aplicația acum pe Acasă (de făcut):
${tips.map((t) => '- ' + t.text).join('\n') || '- nimic'}
Termene apropiate:
${tm.map((t) => `- ${t.nume} pentru ${t.perioada}: ${dataRo(iso(t.termen))}`).join('\n') || '- niciunul'}`;
}

export function rezumatPentruAI({ note, setari, documente }, ecran) {
  const an = new Date().getFullYear();
  const b = balanta(note, setari, `${an}-01-01`, `${an}-12-31`);
  const solduri = b.rows.map((r) => `${r.cod} ${r.nume}: ${r.sfd ? 'D ' + lei(r.sfd) : 'C ' + lei(r.sfc)}`).slice(0, 80).join('\n');
  const ultime = documente.slice(-10).map((d) => `${d.data} ${d.tip} ${d.partener?.nume || ''} ${lei(d.total)} lei cont ${d.cont} plată ${d.plata}`).join('\n');
  return `Data de azi: ${azi()}. Ecran deschis: ${ecran}.
Firma: ${setari.nume}, CUI ${setari.cui || 'necompletat'}. Regim: ${setari.regim === 'micro' ? 'microîntreprindere' : 'impozit pe profit'}. ${setari.platitorTVA ? `Plătitoare de TVA (${setari.perioadaTVA === 'luna' ? 'lunar' : 'trimestrial'}${setari.tvaLaIncasare ? ', TVA la încasare' : ''})` : 'Neplătitoare de TVA'}. ${setari.areSalariati ? 'Are salariați.' : 'Fără salariați.'}
Solduri ${an} (balanță):
${solduri || '(nicio înregistrare încă)'}
Ultimele documente:
${ultime || '(niciunul)'}`;
}
