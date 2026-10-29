// Formulare tipizate: se completează, se tipăresc și înregistrează automat nota contabilă.
import { e, $, $$, icon, withLoad, toast, openSheet, closeSheet, eqHTML } from './ui.js';
import { db } from './db.js';
import { lei, r2, azi, dataRo, salveazaNota, OPERATII, reguli } from './engine.js';
import { cont } from './conturi.js';
import { situatiiFinanciare } from './situatii.js';

// ---------------------------------------------------------------- suma în litere
const U = ['', 'unu', 'doi', 'trei', 'patru', 'cinci', 'șase', 'șapte', 'opt', 'nouă', 'zece', 'unsprezece', 'doisprezece', 'treisprezece', 'paisprezece', 'cincisprezece', 'șaisprezece', 'șaptesprezece', 'optsprezece', 'nouăsprezece'];
const Z = ['', '', 'douăzeci', 'treizeci', 'patruzeci', 'cincizeci', 'șaizeci', 'șaptezeci', 'optzeci', 'nouăzeci'];
function sub1000(n, fem) {
  const s = Math.floor(n / 100), r = n % 100;
  const out = [];
  if (s) out.push(s === 1 ? 'o sută' : `${s === 2 ? 'două' : U[s]} sute`);
  if (r) {
    if (r < 20) out.push(fem && r === 1 ? 'una' : fem && r === 2 ? 'două' : U[r]);
    else { const z = Math.floor(r / 10), u = r % 10; out.push(Z[z] + (u ? ' și ' + (u === 1 ? 'unu' : u === 2 ? 'doi' : U[u]) : '')); }
  }
  return out.join(' ');
}
export function inLitere(suma) {
  const v = Math.round(Math.abs(suma) * 100);
  const lei_ = Math.floor(v / 100), bani = v % 100;
  const grup = (n, unu, multe, fem) => { if (!n) return ''; if (n === 1) return unu; const t = sub1000(n, fem); return (n % 100 >= 20 || n % 100 === 0 ? t + ' de ' : t + ' ') + multe; };
  const mil = Math.floor(lei_ / 1e6), mii = Math.floor((lei_ % 1e6) / 1000), rest = lei_ % 1000;
  const parti = [grup(mil, 'un milion', 'milioane'), grup(mii, 'o mie', 'mii', true), rest ? sub1000(rest, false) : ''].filter(Boolean);
  let t = parti.join(' ') || 'zero';
  t += rest % 100 >= 20 || (lei_ && rest % 100 === 0) ? ' de lei' : lei_ === 1 ? ' leu' : ' lei';
  if (bani) t += ` și ${bani === 1 ? 'un' : sub1000(bani, false)} ${bani === 1 ? 'ban' : bani % 100 >= 20 ? 'de bani' : 'bani'}`;
  return t.replace(/^unu leu$/, 'un leu').replace(/(^| )unu leu$/, '$1un leu');
}

async function urmatorul(serie) {
  const s = (await db.get('settings', 'serii')) || { id: 'serii' };
  s[serie] = (s[serie] || 0) + 1;
  await db.put('settings', s);
  return s[serie];
}

// ---------------------------------------------------------------- tipărire
export function tipareste(html) {
  let p = document.getElementById('print-area');
  if (!p) { p = document.createElement('div'); p.id = 'print-area'; document.body.appendChild(p); }
  p.innerHTML = html;
  document.body.classList.add('print-form');
  const gata = () => { document.body.classList.remove('print-form'); p.innerHTML = ''; window.removeEventListener('afterprint', gata); };
  window.addEventListener('afterprint', gata);
  setTimeout(() => window.print(), 50);
}
export const antetFirma = (s) => `<div class="pf-firma"><b>${e(s.nume)}</b><br>CUI ${e(s.cui || '—')} · ${e(s.regCom || '')}<br>${e(s.adresa || '')}</div>`;

const FORMULARE = [
  { id: 'chitanta', titlu: 'Chitanță', ajutor: 'Încasezi cash de la un client. Se înregistrează în casă și, dacă alegi factura, o marchează încasată.' },
  { id: 'dispozitie', titlu: 'Dispoziție de plată / încasare', ajutor: 'Dai sau primești bani din casierie pentru avansuri, restituiri sau alte plăți fără factură.' },
  { id: 'decont', titlu: 'Decont de cheltuieli', ajutor: 'Justifici un avans de trezorerie cu bonurile și facturile cheltuite.' },
  { id: 'deplasare', titlu: 'Ordin de deplasare', ajutor: 'Deplasare în interes de serviciu, cu diurnă. Se tipărește și se semnează la plecare și la întoarcere.' },
  { id: 'pif', titlu: 'Proces-verbal de punere în funcțiune', ajutor: 'Documentul care arată de când începe amortizarea unui mijloc fix.' },
  { id: 'hotarare', titlu: 'Hotărârea asociatului unic', ajutor: 'Aprobă situațiile financiare anuale și decide ce se face cu profitul (rezervă, reportare, dividende).' },
];

export async function render(main, ctx, params) {
  if (params[0]) return formular(main, ctx, params[0]);
  main.innerHTML = `
  <div class="page-head"><div><h1>Formulare</h1><p class="sub">Documentele tipizate de care ai nevoie în firmă. Le completezi, le tipărești, iar înregistrarea contabilă se face singură.</p></div></div>
  <section class="panel"><ul class="list">${FORMULARE.map((f) => `<li class="clickable" data-go="#formulare/${f.id}"><div class="grow"><div class="t">${e(f.titlu)}</div><div class="m">${e(f.ajutor)}</div></div><span class="muted">›</span></li>`).join('')}</ul></section>`;
}

async function formular(main, ctx, id) {
  const f = FORMULARE.find((x) => x.id === id);
  if (!f) { main.innerHTML = '<div class="empty"><h3>Formularul nu există</h3></div>'; return; }
  const s = ctx.setari;
  main.innerHTML = `<div class="page-head"><div><button class="btn ghost sm" data-go="#formulare" style="padding-left:0">‹ Formulare</button><h1>${e(f.titlu)}</h1><p class="sub">${e(f.ajutor)}</p></div></div>
    <div class="split"><section class="panel" id="fm"></section><section class="panel"><h2>Ce se înregistrează</h2><div id="nota" class="muted">Completează formularul.</div></section></div>`;
  const fm = $('#fm', main), nota = $('#nota', main);
  const arataNota = (linii) => { nota.innerHTML = linii.length ? `<ul class="list">${linii.map((l) => `<li><div class="grow">${eqHTML(l.d, l.c, null, cont)}<div class="m">${e(l.expl || '')}</div></div><div class="amt num">${lei(l.suma)}</div></li>`).join('')}</ul>` : '<p class="muted">Nu se face nicio înregistrare.</p>'; };
  const v = (x) => $(x, fm);
  const val = (x) => v(x)?.value?.trim() || '';

  if (id === 'chitanta') {
    const fact = ctx.documente.filter((d) => d.tip === 'venit' && d.plata === 'neplatit' && !d.achitat);
    fm.innerHTML = `<div class="fields-2"><label class="field"><span>Data</span><input type="date" id="data" value="${azi()}"></label><label class="field"><span>Suma (lei)</span><input type="number" step="0.01" id="suma"></label></div>
      <label class="field"><span>Factura încasată</span><select id="fact"><option value="">— fără factură (alt venit în numerar) —</option>${fact.map((d) => `<option value="${d.id}" data-s="${d.total}" data-p="${e(d.partener?.nume || '')}">${e(d.partener?.nume || '')} · ${e(d.nr || '')} · ${lei(d.total)} lei</option>`).join('')}</select></label>
      <label class="field"><span>Primit de la</span><input type="text" id="dela"></label>
      <label class="field"><span>Reprezentând</span><input type="text" id="repr" value="contravaloare factură"></label>
      <div class="row end"><button class="btn primary" id="go">${icon('print')}Înregistrează și tipărește</button></div>`;
    const linii = () => { const S = r2(val('#suma')); return S ? [{ d: '5311', c: v('#fact').value ? '411' : '7588', suma: S, expl: 'Încasare numerar' }] : []; };
    v('#fact').onchange = () => { const o = v('#fact').selectedOptions[0]; if (o.value) { v('#suma').value = o.dataset.s; v('#dela').value = o.dataset.p; v('#repr').value = 'contravaloare factura ' + o.textContent.split(' · ')[1]; } arataNota(linii()); };
    fm.oninput = () => arataNota(linii());
    v('#go').onclick = async (ev) => {
      const l = linii(); if (!l.length || !val('#dela')) { toast('Completează suma și de la cine ai primit.'); return; }
      const nr = await urmatorul('chitanta');
      await withLoad(async () => {
        await salveazaNota({ data: val('#data'), document: `Chitanța ${nr}`, partener: val('#dela'), explicatie: `Încasare numerar — ${val('#repr')}`, linii: l, tipNota: 'formular' });
        if (v('#fact').value) { const d = await db.get('documente', v('#fact').value); await db.put('documente', { ...d, achitat: true, platitPartial: d.total, dataPlata: val('#data') }); }
      }, ev.currentTarget);
      tipareste(`<div class="pf">${antetFirma(s)}<h1>CHITANȚĂ nr. ${nr}</h1><p>Data: ${dataRo(val('#data'))}</p>
        <p>Am primit de la <b>${e(val('#dela'))}</b> suma de <b>${lei(l[0].suma)} lei</b>, adică <i>${inLitere(l[0].suma)}</i>, reprezentând ${e(val('#repr'))}.</p>
        <div class="pf-sem"><div>Casier,<br><br>__________________</div></div></div>`);
      toast('Chitanța a fost înregistrată.'); await ctx.reload();
    };
  }

  if (id === 'dispozitie') {
    fm.innerHTML = `<div class="seg full" style="margin-bottom:14px"><button data-t="plata" aria-pressed="true">Plată din casă</button><button data-t="incasare" aria-pressed="false">Încasare în casă</button></div>
      <div class="fields-2"><label class="field"><span>Data</span><input type="date" id="data" value="${azi()}"></label><label class="field"><span>Suma (lei)</span><input type="number" step="0.01" id="suma"></label></div>
      <label class="field"><span>Persoana</span><input type="text" id="pers" value="${e(s.administrator || '')}"></label>
      <label class="field"><span>Scopul</span><select id="scop"><option value="542">Avans de trezorerie (pentru cumpărături)</option><option value="4551">Împrumut / rambursare administrator</option><option value="625">Diurnă / deplasare</option><option value="473">Altele, de clarificat</option></select></label>
      <label class="field"><span>Explicație</span><input type="text" id="expl"></label>
      <div class="row end"><button class="btn primary" id="go">${icon('print')}Înregistrează și tipărește</button></div>`;
    let tip = 'plata';
    $$('[data-t]', fm).forEach((b) => (b.onclick = () => { tip = b.dataset.t; $$('[data-t]', fm).forEach((x) => x.setAttribute('aria-pressed', x === b)); arataNota(linii()); }));
    const linii = () => { const S = r2(val('#suma')), c = v('#scop').value; return S ? [tip === 'plata' ? { d: c, c: '5311', suma: S, expl: 'Plată din casierie' } : { d: '5311', c, suma: S, expl: 'Încasare în casierie' }] : []; };
    fm.oninput = fm.onchange = () => arataNota(linii());
    v('#go').onclick = async (ev) => {
      const l = linii(); if (!l.length || !val('#pers')) { toast('Completează suma și persoana.'); return; }
      const nr = await urmatorul('dispozitie');
      await withLoad(() => salveazaNota({ data: val('#data'), document: `Dispoziția de ${tip === 'plata' ? 'plată' : 'încasare'} ${nr}`, partener: val('#pers'), explicatie: `${tip === 'plata' ? 'Plată' : 'Încasare'} casierie — ${val('#expl') || v('#scop').selectedOptions[0].textContent}`, linii: l, tipNota: 'formular' }), ev.currentTarget);
      tipareste(`<div class="pf">${antetFirma(s)}<h1>DISPOZIȚIE DE ${tip === 'plata' ? 'PLATĂ' : 'ÎNCASARE'} CĂTRE CASIERIE nr. ${nr}</h1><p>Data: ${dataRo(val('#data'))}</p>
        <p>Numele și prenumele: <b>${e(val('#pers'))}</b></p><p>Suma: <b>${lei(l[0].suma)} lei</b> (${inLitere(l[0].suma)})</p><p>Scopul ${tip === 'plata' ? 'plății' : 'încasării'}: ${e(val('#expl') || v('#scop').selectedOptions[0].textContent)}</p>
        <div class="pf-sem"><div>Conducătorul unității,<br><br>__________________</div><div>${tip === 'plata' ? 'Am primit suma' : 'Am predat suma'},<br><br>__________________</div><div>Casier,<br><br>__________________</div></div></div>`);
      toast('Dispoziția a fost înregistrată.'); await ctx.reload();
    };
  }

  if (id === 'decont') {
    const avansuri = ctx.documente.filter((d) => d.tip === 'cheltuiala' && d.plata === 'avans' && !d.decontat);
    fm.innerHTML = `<div class="fields-2"><label class="field"><span>Data</span><input type="date" id="data" value="${azi()}"></label><label class="field"><span>Persoana</span><input type="text" id="pers" value="${e(s.administrator || '')}"></label></div>
      <label class="field"><span>Avans primit (lei)</span><input type="number" step="0.01" id="avans"><small>Suma dată din casă prin dispoziția de plată.</small></label>
      <h3>Documente justificative plătite din avans</h3>
      ${avansuri.length ? `<ul class="list">${avansuri.map((d) => `<li><label class="check" style="padding:0;width:100%"><input type="checkbox" data-d="${d.id}" data-s="${d.total}" checked><span class="grow">${e(d.partener?.nume || d.descriere)} · ${dataRo(d.data)}</span><span class="num">${lei(d.total)}</span></label></li>`).join('')}</ul>` : '<p class="muted small">Nu există documente cu plata „Din avansul de trezorerie”. Adaugă bonurile în Documente, cu această plată.</p>'}
      <div id="calc" class="small" style="margin:10px 0"></div>
      <div class="row end"><button class="btn primary" id="go">${icon('print')}Înregistrează și tipărește</button></div>`;
    const calc = () => {
      const av = r2(val('#avans'));
      const ch = r2($$('[data-d]:checked', fm).reduce((t, x) => t + Number(x.dataset.s), 0));
      const dif = r2(av - ch);
      v('#calc').innerHTML = `Cheltuit: <b>${lei(ch)}</b> lei · ${dif >= 0 ? `de restituit în casă: <b>${lei(dif)}</b> lei` : `de primit din casă: <b>${lei(-dif)}</b> lei`}`;
      return { av, ch, dif };
    };
    const linii = () => { const { dif } = calc(); return dif > 0 ? [{ d: '5311', c: '542', suma: dif, expl: 'Rest de avans restituit' }] : dif < 0 ? [{ d: '542', c: '5311', suma: -dif, expl: 'Diferență plătită persoanei' }] : []; };
    fm.oninput = fm.onchange = () => arataNota(linii());
    calc();
    v('#go').onclick = async (ev) => {
      const { av, ch, dif } = calc(); if (!av && !ch) { toast('Completează avansul.'); return; }
      const nr = await urmatorul('decont');
      const ids = $$('[data-d]:checked', fm).map((x) => x.dataset.d);
      await withLoad(async () => {
        const l = linii();
        if (l.length) await salveazaNota({ data: val('#data'), document: `Decont ${nr}`, partener: val('#pers'), explicatie: `Decontarea avansului de trezorerie — ${val('#pers')}`, linii: l, tipNota: 'formular' });
        for (const i of ids) { const d = await db.get('documente', i); await db.put('documente', { ...d, decontat: nr }); }
      }, ev.currentTarget);
      const docs = ctx.documente.filter((d) => ids.includes(d.id));
      tipareste(`<div class="pf">${antetFirma(s)}<h1>DECONT DE CHELTUIELI nr. ${nr}</h1><p>Data: ${dataRo(val('#data'))} · Titular avans: <b>${e(val('#pers'))}</b></p>
        <table><thead><tr><th>Nr.</th><th>Document</th><th>Furnizor</th><th>Data</th><th class="n">Suma</th></tr></thead><tbody>${docs.map((d, i) => `<tr><td>${i + 1}</td><td>${e(d.tipDocument || '')} ${e(d.nr || '')}</td><td>${e(d.partener?.nume || '')}</td><td>${dataRo(d.data)}</td><td class="n">${lei(d.total)}</td></tr>`).join('')}</tbody></table>
        <p>Avans primit: ${lei(av)} lei · Cheltuit: ${lei(ch)} lei · ${dif >= 0 ? `Restituit: ${lei(dif)}` : `Primit în plus: ${lei(-dif)}`} lei</p>
        <div class="pf-sem"><div>Titular avans,<br><br>__________________</div><div>Aprobat,<br><br>__________________</div><div>Casier,<br><br>__________________</div></div></div>`);
      toast('Decontul a fost înregistrat.'); await ctx.reload();
    };
  }

  if (id === 'deplasare') {
    fm.innerHTML = `<label class="field"><span>Persoana</span><input type="text" id="pers" value="${e(s.administrator || '')}"></label>
      <div class="fields-2"><label class="field"><span>Destinația</span><input type="text" id="dest"></label><label class="field"><span>Scopul</span><input type="text" id="scop" placeholder="ex. întâlnire cu clientul X"></label></div>
      <div class="fields-3"><label class="field"><span>Plecare</span><input type="date" id="de" value="${azi()}"></label><label class="field"><span>Sosire</span><input type="date" id="pana" value="${azi()}"></label><label class="field"><span>Diurnă / zi (lei)</span><input type="number" step="0.01" id="diurna" value="57.50"><small>Până la 57,50 lei/zi e neimpozabilă pentru salariați (de 2,5 ori diurna bugetarilor).</small></label></div>
      <label class="field"><span>Mijloc de transport</span><input type="text" id="mij" placeholder="ex. autoturism B-00-XYZ, tren"></label>
      <label class="check"><input type="checkbox" id="cash" checked><span>Diurna se plătește acum din casă</span></label>
      <div class="row end"><button class="btn primary" id="go">${icon('print')}Înregistrează și tipărește</button></div>`;
    const zile = () => Math.max(1, Math.round((new Date(val('#pana')) - new Date(val('#de'))) / 864e5) + 1);
    const linii = () => { const S = r2(zile() * Number(val('#diurna') || 0)); return S && v('#cash').checked ? [{ d: '625', c: '5311', suma: S, expl: `Diurnă ${zile()} zile` }] : []; };
    fm.oninput = fm.onchange = () => arataNota(linii());
    arataNota(linii());
    v('#go').onclick = async (ev) => {
      if (!val('#pers') || !val('#dest')) { toast('Completează persoana și destinația.'); return; }
      const nr = await urmatorul('deplasare');
      const l = linii();
      if (l.length) await withLoad(() => salveazaNota({ data: val('#de'), document: `Ordin de deplasare ${nr}`, partener: val('#pers'), explicatie: `Diurnă deplasare ${val('#dest')}`, linii: l, tipNota: 'formular' }), ev.currentTarget);
      tipareste(`<div class="pf">${antetFirma(s)}<h1>ORDIN DE DEPLASARE nr. ${nr}</h1>
        <p>Domnul/doamna <b>${e(val('#pers'))}</b> este delegat(ă) pentru executarea unei misiuni în localitatea <b>${e(val('#dest'))}</b>, în scopul: ${e(val('#scop'))}.</p>
        <p>Durata deplasării: ${dataRo(val('#de'))} – ${dataRo(val('#pana'))} (${zile()} zile). Mijloc de transport: ${e(val('#mij'))}.</p>
        <p>Diurnă: ${zile()} zile × ${lei(val('#diurna'))} lei = <b>${lei(zile() * Number(val('#diurna') || 0))} lei</b>.</p>
        <table><thead><tr><th>Viza</th><th>Data și ora sosirii</th><th>Data și ora plecării</th><th>Ștampila și semnătura</th></tr></thead><tbody><tr><td>${e(val('#dest'))}</td><td style="height:60px"></td><td></td><td></td></tr></tbody></table>
        <div class="pf-sem"><div>Conducătorul unității,<br><br>__________________</div><div>Titular,<br><br>__________________</div></div></div>`);
      toast('Ordinul de deplasare a fost înregistrat.'); await ctx.reload();
    };
  }

  if (id === 'pif') {
    fm.innerHTML = ctx.mijloace.length ? `<label class="field"><span>Mijlocul fix</span><select id="mf">${ctx.mijloace.map((m) => `<option value="${m.id}">${e(m.denumire)} · ${lei(m.valoare)} lei</option>`).join('')}</select></label>
      <label class="field"><span>Locul de folosință</span><input type="text" id="loc" value="${e(s.adresa || '')}"></label>
      <div class="row end"><button class="btn primary" id="go">${icon('print')}Tipărește</button></div>` : '<div class="empty"><h3>Niciun mijloc fix</h3><p>Adaugă întâi mijlocul fix din Registre → Mijloace fixe.</p></div>';
    arataNota([]);
    v('#go') && (v('#go').onclick = () => {
      const m = ctx.mijloace.find((x) => x.id === v('#mf').value);
      tipareste(`<div class="pf">${antetFirma(s)}<h1>PROCES-VERBAL DE RECEPȚIE ȘI PUNERE ÎN FUNCȚIUNE</h1>
        <p>Încheiat astăzi, ${dataRo(m.dataPIF)}, privind punerea în funcțiune a mijlocului fix:</p>
        <table><tbody><tr><td>Denumire</td><td>${e(m.denumire)}</td></tr><tr><td>Cont</td><td>${m.cont} — ${e(cont(m.cont).nume)}</td></tr><tr><td>Valoare de intrare</td><td>${lei(m.valoare)} lei</td></tr><tr><td>Durata normală de funcționare</td><td>${m.durataLuni} luni</td></tr><tr><td>Metoda de amortizare</td><td>liniară, începând cu luna următoare punerii în funcțiune</td></tr><tr><td>Locul de folosință</td><td>${e(val('#loc'))}</td></tr></tbody></table>
        <p>Bunul a fost recepționat, este în stare de funcționare și se pune în funcțiune la data de mai sus.</p>
        <div class="pf-sem"><div>Administrator,<br>${e(s.administrator || '')}<br><br>__________________</div></div></div>`);
    });
  }

  if (id === 'hotarare') {
    const an = new Date().getFullYear() - 1;
    const sf = situatiiFinanciare(ctx.note, s, an);
    fm.innerHTML = `<div class="fields-2"><label class="field"><span>Exercițiul financiar</span><input type="number" id="an" value="${an}"></label><label class="field"><span>Data hotărârii</span><input type="date" id="data" value="${azi()}"></label></div>
      <label class="field"><span>Asociat unic</span><input type="text" id="asoc" value="${e(s.administrator || '')}"></label>
      <p class="small">Profit net ${an}: <b>${lei(sf.net)} lei</b></p>
      <label class="field"><span>Din profit se distribuie ca dividende (lei, brut)</span><input type="number" step="0.01" id="div" value="0"><small>Dividendele se pot plăti doar din profitul anilor încheiați, dacă activul net rămâne peste capitalul social. Impozit 16%, reținut de firmă.</small></label>
      <label class="check"><input type="checkbox" id="inreg"><span>Înregistrează și distribuirea dividendelor (1171 = 457, impozit 457 = 446, plată 457 = 5121)</span></label>
      <div class="row end"><button class="btn primary" id="go">${icon('print')}Tipărește hotărârea</button></div>`;
    const linii = () => { const S = r2(val('#div')); return S && v('#inreg').checked ? OPERATII.find((o) => o.id === 'dividende').linii(S, reguli(s)) : []; };
    fm.oninput = fm.onchange = () => arataNota(linii());
    arataNota([]);
    v('#go').onclick = async (ev) => {
      const S = r2(val('#div'));
      if (S > Math.max(0, sf.net) + 0.01) { toast('Dividendele nu pot depăși profitul net al anului (sau rezultatul reportat).'); }
      const l = linii();
      if (l.length) await withLoad(() => salveazaNota({ data: val('#data'), document: 'Hotărârea asociatului unic', explicatie: `Distribuire dividende din profitul ${val('#an')}`, linii: l, tipNota: 'formular', operatie: 'dividende' }), ev.currentTarget);
      tipareste(`<div class="pf">${antetFirma(s)}<h1>HOTĂRÂREA ASOCIATULUI UNIC</h1><p>din data de ${dataRo(val('#data'))}</p>
        <p>Subsemnatul(a) <b>${e(val('#asoc'))}</b>, în calitate de asociat unic al ${e(s.nume)}, hotărăsc:</p>
        <p>Art. 1. Se aprobă situațiile financiare anuale ale exercițiului ${e(val('#an'))}, cu un ${sf.net >= 0 ? 'profit' : 'pierdere'} net(ă) de ${lei(Math.abs(sf.net))} lei.</p>
        <p>Art. 2. ${S ? `Din profitul net se distribuie dividende în sumă brută de ${lei(S)} lei (${inLitere(S)}), iar diferența rămâne ca rezultat reportat.` : `${sf.net >= 0 ? 'Profitul net rămâne' : 'Pierderea rămâne'} în rezultatul reportat al societății.`}</p>
        <p>Art. 3. Se descarcă de gestiune administratorul pentru exercițiul ${e(val('#an'))}.</p>
        <div class="pf-sem"><div>Asociat unic,<br>${e(val('#asoc'))}<br><br>__________________</div></div></div>`);
      if (l.length) { toast('Dividendele au fost înregistrate.'); await ctx.reload(); }
    };
  }
}
