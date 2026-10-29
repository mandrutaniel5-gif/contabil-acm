// Indicații automate: verifică datele și spune pe înțeles ce e de făcut. Funcționează fără AI.
import { balanta, verificaBalanta, lunaInterval, lei, LUNI, azi, cifraAfaceri, reguli, dataRo, iso } from './engine.js';
import { termene, zilePana } from './declaratii.js';

export async function indicatii({ note, documente, setari, mijloace }) {
  const out = [];
  const now = new Date();
  const an = now.getFullYear();
  const R = reguli(setari);

  if (!setari.cui) out.push({ grav: 'warn', text: 'Completează datele firmei (CUI, adresă). Apar pe registre și în fișierul SAF-T.', act: ['Completează datele', '#setari'] });
  if (!Object.keys(setari.soldInitial || {}).length && note.length === 0) {
    out.push({ grav: 'info', text: 'Dacă firma a avut activitate înainte de a folosi aplicația, introdu soldurile de la 1 ianuarie (din ultima balanță). Dacă firma e nouă, poți sări peste.', act: ['Solduri inițiale', '#setari/solduri'] });
  }

  if (setari.regim === 'micro' && !setari.cursSetat) out.push({ grav: 'info', text: 'Setează cursul BNR al euro din ultima zi a anului trecut, ca plafonul micro de 100.000 € să fie calculat corect.', act: ['Regim fiscal', '#setari/fiscal'] });

  // Termene apropiate
  for (const t of termene(setari, now, 1)) {
    const z = zilePana(t.termen);
    if (z < 0 || z > 14) continue;
    out.push({ grav: z <= 5 ? 'err' : 'warn', text: `${t.nume} pentru ${t.perioada}: termen ${z === 0 ? 'astăzi' : z === 1 ? 'mâine' : `în ${z} zile`} (${dataRo(iso(t.termen))}).`, act: ['Pregătește declarația', '#declaratii'] });
  }

  // Lunile neînchise
  const lunaCur = now.getMonth() + 1;
  const neinchise = [];
  for (let l = 1; l < lunaCur; l++) {
    const p = `${an}-${String(l).padStart(2, '0')}`;
    const areMiscari = note.some((n) => n.data.startsWith(p) && !n.auto);
    const inchisa = note.some((n) => n.autoPerioada === p && n.auto === 'inchidere');
    if (areMiscari && !inchisa) neinchise.push(LUNI[l - 1]);
  }
  if (neinchise.length) out.push({ grav: 'warn', text: `Lunile ${neinchise.join(', ')} nu sunt închise. Închiderea calculează automat impozitul, TVA-ul și amortizarea.`, act: ['Închide luna', '#registre/inchidere'] });

  // Documente fără fișier atașat
  const faraFisier = documente.filter((d) => !d.fisier && d.data?.startsWith(String(an)));
  if (faraFisier.length) out.push({ grav: 'info', text: `${faraFisier.length} document${faraFisier.length > 1 ? 'e nu au' : ' nu are'} poza sau PDF-ul atașat. Păstrează documentele justificative — sunt cerute la control.`, act: ['Vezi documentele', '#documente'] });

  // Facturi neîncasate / neplătite vechi
  const vechi = documente.filter((d) => d.plata === 'neplatit' && !d.achitat && d.data < shift(-30));
  if (vechi.length) out.push({ grav: 'info', text: `${vechi.length} factur${vechi.length > 1 ? 'i sunt' : 'ă este'} neîncasată/neplătită de peste 30 de zile. Când apare plata în extras, înregistreaz-o din Operațiuni.`, act: ['Operațiuni', '#operatii'] });

  // Plafoane
  const ca = cifraAfaceri(note, `${an}-01-01`, `${an}-12-31`);
  if (setari.regim === 'micro') {
    const plafon = R.micro.plafonEUR * (Number(setari.cursEUR) || 5);
    const p = ca / plafon;
    if (p >= 0.8) out.push({ grav: p >= 1 ? 'err' : 'warn', text: `Cifra de afaceri a ajuns la ${Math.round(p * 100)}% din plafonul micro (${lei(plafon)} lei). ${p >= 1 ? 'Firma trece la impozit pe profit din trimestrul depășirii — vorbește cu un contabil.' : 'Peste plafon firma trece la impozit pe profit.'}` });
  }
  if (!setari.platitorTVA) {
    const p = ca / R.tva.plafonScutire;
    if (p >= 0.8) out.push({ grav: p >= 1 ? 'err' : 'warn', text: `Cifra de afaceri a ajuns la ${Math.round(p * 100)}% din plafonul de scutire TVA (${lei(R.tva.plafonScutire)} lei). La depășire, înregistrarea în scopuri de TVA se cere din ziua depășirii.` });
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

  if (!out.length) out.push({ grav: 'ok', text: 'Totul arată în regulă. Înregistrează documentele pe măsură ce apar și închide luna la final.' });
  return out;
}

function shift(zile) { const d = new Date(); d.setDate(d.getDate() + zile); return d.toISOString().slice(0, 10); }

// Rezumat text pentru contextul asistentului AI
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
