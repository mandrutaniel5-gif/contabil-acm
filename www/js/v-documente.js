import { e, $, $$, icon, withLoad, toast, confirma, alege, eqHTML } from './ui.js';
import { lei, r2, azi, dataRo, noteDinDocument, salveazaDocument, stergeDocument, reguli, LUNI } from './engine.js';
import { cont, toateConturile } from './conturi.js';
import { furnizorStrain } from './rules.js';
import * as ai from './ai.js';
import { rezumatPentruAI } from './indicatii.js';

const PLATI_CH = [
  ['banca', 'Din contul bancar'], ['casa', 'Cash, din casa firmei'], ['asociat', 'Administratorul, din bani proprii'],
  ['avans', 'Din avansul de trezorerie'], ['neplatit', 'Încă neplătit'],
];
const PLATI_V = [['banca', 'Încasat în bancă'], ['casa', 'Încasat cash'], ['neplatit', 'Încă neîncasat']];

export async function render(main, ctx, params) {
  if (params[0]) return editor(main, ctx, params[0]);
  const { documente } = ctx;
  const st = render.st || (render.st = { tip: 'toate', luna: '' });
  const luni = [...new Set(documente.map((d) => (d.data || '').slice(0, 7)))].sort().reverse();
  const list = documente.filter((d) => (st.tip === 'toate' || (st.tip === 'verificat' ? d.deVerificat : d.tip === st.tip)) && (!st.luna || d.data?.startsWith(st.luna)))
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  const tot = list.reduce((s, d) => s + (d.tip === 'venit' ? 1 : -1) * Number(d.total || 0), 0);

  main.innerHTML = `
  <div class="page-head">
    <div><h1>Documente</h1><p class="sub">Bonuri, chitanțe, facturi primite și emise. Fiecare document creează automat nota contabilă.</p></div>
    <div class="row"><button class="btn" id="xml" title="ZIP sau XML descărcat din SPV sau ACM Docs">${icon('download')}Importă e-Factură</button><input type="file" id="xmlf" hidden multiple accept=".zip,.xml"><button class="btn primary" data-go="#documente/nou">${icon('scan')}Adaugă document</button></div>
  </div>
  <section class="panel">
    <div class="row" style="justify-content:space-between;margin-bottom:10px">
      <div class="seg" role="group" aria-label="Tip">${[['toate', 'Toate'], ['cheltuiala', 'Cheltuieli'], ['venit', 'Venituri'], ['verificat', `De verificat${documente.filter((d) => d.deVerificat).length ? ' (' + documente.filter((d) => d.deVerificat).length + ')' : ''}`]].map(([k, l]) => `<button data-tip="${k}" aria-pressed="${st.tip === k}">${l}</button>`).join('')}</div>
      <select id="f-luna" style="width:auto;min-width:180px"><option value="">Toate lunile</option>${luni.map((l) => `<option value="${l}" ${st.luna === l ? 'selected' : ''}>${LUNI[Number(l.slice(5)) - 1]} ${l.slice(0, 4)}</option>`).join('')}</select>
    </div>
    ${list.length ? `<ul class="list">${list.map((d) => `
      <li class="clickable" data-go="#documente/${d.id}">
        <div class="grow"><div class="t">${e(d.partener?.nume || d.descriere || 'Document')}</div>
        <div class="m">${dataRo(d.data)} · ${e(d.tipDocument || '')} ${e(d.nr || '')} · ${e(cont(d.cont).nume)}</div></div>
        ${d.sursa === 'SPV' ? '<span class="badge accent">SPV</span>' : ''}
        ${d.deVerificat ? '<span class="badge warn">de verificat</span>' : ''}
        ${!d.fisier ? '<span class="badge warn">fără fișier</span>' : ''}
        ${d.plata === 'neplatit' && !d.achitat ? `<span class="badge">${d.tip === 'venit' ? 'neîncasat' : 'neplătit'}</span>` : ''}
        <div class="amt num" style="color:${d.tip === 'venit' ? 'var(--ok)' : 'inherit'}">${d.tip === 'venit' ? '+' : '−'}${lei(d.total)}</div>
      </li>`).join('')}</ul>
      <p class="muted small" style="text-align:right;margin:10px 0 0">Total afișat: <b class="num">${lei(tot)} lei</b></p>`
      : `<div class="empty"><h3>Niciun document aici</h3><p>Adaugă un bon sau o factură — poți face o poză direct din aplicație.</p></div>`}
  </section>`;
  $$('[data-tip]', main).forEach((b) => (b.onclick = () => { st.tip = b.dataset.tip; render(main, ctx, []); }));
  $('#f-luna', main).onchange = (ev) => { st.luna = ev.target.value; render(main, ctx, []); };
  $('#xml', main).onclick = () => $('#xmlf', main).click();
  $('#xmlf', main).onchange = async (ev) => {
    const files = [...ev.target.files]; ev.target.value = '';
    try {
      const { importaFisier } = await import('./anaf.js');
      let n = 0;
      await withLoad(async () => { for (const f of files) n += (await importaFisier(f)).length; });
      toast(`${n} ${n === 1 ? 'factură importată' : 'facturi importate'}. Verifică-le pe cele marcate „de verificat”.`);
      await ctx.reload();
    } catch (err) { toast('Fișierul nu a putut fi citit ca e-Factură: ' + err.message); }
  };
}

async function editor(main, ctx, id) {
  const { setari } = ctx;
  const R = reguli(setari);
  const existent = id !== 'nou' ? ctx.documente.find((d) => d.id === id) : null;
  if (id !== 'nou' && !existent) { main.innerHTML = '<div class="empty"><h3>Documentul nu mai există</h3></div>'; return; }
  const doc = existent ? structuredClone(existent) : {
    tip: 'cheltuiala', data: azi(), tipDocument: 'Bon fiscal', nr: '', partener: { nume: '', cui: '' },
    descriere: '', total: '', tva: 0, tvaCota: setari.platitorTVA ? R.tva.standard : 0, cont: '', plata: 'banca', tvaDeductibil: 100,
  };
  let contManual = !!existent;
  let aiInfo = existent?.aiInfo || null;
  const aiOn = await ai.conectat();

  const conturiOpt = () => {
    const all = toateConturile();
    const ok = doc.tip === 'cheltuiala' ? all.filter((c) => c.cod[0] === '6' || ['303', '3028', '371', '2051', '2131', '2133', '214', '471'].includes(c.cod)) : all.filter((c) => c.cod[0] === '7');
    return ok.filter((c) => !['691', '698', '6811', '603'].includes(c.cod))
      .map((c) => `<option value="${c.cod}" ${doc.cont === c.cod ? 'selected' : ''}>${c.cod} · ${e(c.nume)}</option>`).join('');
  };

  main.innerHTML = `
  <div class="page-head">
    <div><button class="btn ghost sm" data-go="#documente" style="padding-left:0">‹ Documente</button><h1>${existent ? 'Document' : 'Document nou'}</h1></div>
    ${existent ? `<div class="row"><button class="btn danger" id="del">Șterge</button></div>` : ''}
  </div>
  <div class="split">
    <section class="panel">
      <div class="seg full" role="group" aria-label="Tip document" style="margin-bottom:18px">
        <button data-t="cheltuiala" aria-pressed="${doc.tip === 'cheltuiala'}">Cheltuială — am cumpărat ceva</button>
        <button data-t="venit" aria-pressed="${doc.tip === 'venit'}">Venit — am emis o factură</button>
      </div>
      ${doc.sursa === 'SPV' || doc.sursa === 'XML' ? `<div class="tip ${doc.deVerificat ? 'warn' : 'ok'}"><span class="dot"></span><div class="grow"><p><b>Factură ${doc.sursa === 'SPV' ? 'importată automat din SPV' : 'importată din e-Factură'}.</b> ${doc.deVerificat ? 'Verifică contul propus și salvează: ' + e(doc.motivCont || '') : 'Verificată.'}${doc.moneda && doc.moneda !== 'RON' ? ` Valoare în ${e(doc.moneda)}: ${lei(doc.totalValuta)}, curs BNR ${doc.curs ? Number(doc.curs).toFixed(4) : 'indisponibil'}.` : ''}${doc.taxareInversa ? ' Factura are taxare inversă.' : ''}</p></div></div>` : ''}
      ${doc.sursa === 'extras' ? `<div class="tip warn"><span class="dot"></span><div class="grow"><p><b>Creat din extrasul bancar.</b> Atașează factura furnizorului (PDF-ul primit pe email) și completează numărul ei.</p></div></div>` : ''}
      ${existent && existent.plata === 'neplatit' ? `<p class="small">${existent.achitat ? `<span class="badge ok">${existent.tip === 'venit' ? 'încasată' : 'plătită'}</span> ${existent.dataPlata ? 'pe ' + dataRo(existent.dataPlata) : ''}` : `<span class="badge">${existent.tip === 'venit' ? 'neîncasată' : 'neplătită'}</span>${existent.platitPartial ? ` · achitat parțial ${lei(existent.platitPartial)} lei` : ''} · plata se înregistrează singură când apare în extras`}</p>` : ''}
      <div id="ai-tips"></div>
      <div class="fields-3">
        <label class="field"><span>Data documentului</span><input type="date" id="data" value="${e(doc.data)}"></label>
        <label class="field"><span>Tip</span><select id="tipDocument">${[...new Set(['Bon fiscal', 'Factura', 'Factura storno', 'Chitanta', 'Plată card', 'Extras de cont', 'Contract', doc.tipDocument].filter(Boolean))].map((t) => `<option ${doc.tipDocument === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="field"><span>Număr</span><input type="text" id="nr" value="${e(doc.nr)}" placeholder="ex. 0045"></label>
      </div>
      <div class="fields-2">
        <label class="field"><span id="lbl-partener">${doc.tip === 'venit' ? 'Client' : 'Furnizor'}</span><input type="text" id="pnume" value="${e(doc.partener?.nume)}" placeholder="Numele firmei"></label>
        <label class="field"><span>CUI</span><div class="row" style="flex-wrap:nowrap"><input type="text" id="pcui" value="${e(doc.partener?.cui)}" placeholder="ex. RO12345678"><button class="btn sm" id="anaf" title="Completează automat din registrul ANAF" ${aiOn ? '' : 'disabled'}>ANAF</button></div></label>
      </div>
      <div class="fields-2"><label class="field"><span>Ce reprezintă</span><input type="text" id="descriere" value="${e(doc.descriere)}" placeholder="ex. abonament hosting, benzină, laptop"></label>
      <label class="field"><span>Scadența</span><input type="date" id="scadenta" value="${e(doc.scadenta || '')}"><small>Pentru facturi: când trebuie plătită.</small></label></div>
      <div class="fields-3">
        <label class="field"><span>Total de plată (lei)</span><input type="number" step="0.01" id="total" value="${e(doc.total)}" inputmode="decimal"></label>
        ${setari.platitorTVA ? `
        <label class="field"><span>Cotă TVA</span><select id="tvaCota">${[[R.tva.standard, '21%'], [R.tva.redusa, '11%'], [0, 'Fără TVA / scutit']].map(([v, l]) => `<option value="${v}" ${Number(doc.tvaCota) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span>TVA (lei)</span><input type="number" step="0.01" id="tva" value="${e(doc.tva)}"><small>Se calculează automat din total.</small></label>` : ''}
      </div>
      <label class="field"><span>Cont contabil</span><select id="cont"><option value="">Alege…</option>${conturiOpt()}</select><small id="cont-help"></small></label>
      ${setari.platitorTVA ? `<label class="field" id="ded-wrap"><span>TVA deductibil (%)</span><input type="number" id="tvaDeductibil" min="0" max="100" value="${e(doc.tvaDeductibil ?? 100)}"><small>100% pentru majoritatea achizițiilor. 50% pentru combustibilul unei mașini folosite și personal.</small></label>` : ''}
      <label class="check" id="ti-wrap" ${doc.tip === 'venit' ? 'hidden' : ''}><input type="checkbox" id="ti" ${doc.taxareInversa ? 'checked' : ''}><span><b>Furnizor din străinătate</b> (taxare inversă)<br><span class="muted small">Servicii de la firme din afara țării (Google, GitHub, Apple…): factura vine fără TVA românesc, iar TVA-ul se calculează aici${setari.platitorTVA ? ' (colectat și dedus în același timp)' : setari.cod317 ? ' și se plătește prin D301' : '. Firma are nevoie de cod special de TVA (art. 317)'}.</span></span></label>
      <label class="field"><span id="lbl-plata">${doc.tip === 'venit' ? 'Încasare' : 'Cum s-a plătit'}</span><select id="plata"></select></label>
      <div class="row end" style="margin-top:8px"><button class="btn" data-go="#documente">Renunță</button><button class="btn primary" id="save">Salvează documentul</button></div>
    </section>

    <div>
      <section class="panel">
        <h2>Fișierul documentului</h2>
        <div id="file-area"></div>
        <input type="file" id="file" accept="image/*,application/pdf" hidden>
        <input type="file" id="camera" accept="image/*" capture="environment" hidden>
        ${aiOn ? '' : '<p class="muted small" style="margin:10px 0 0">Fără internet, completează datele de mână. Cu internet, asistentul le citește singur din poză.</p>'}
      </section>
      <section class="panel">
        <h2>Ce se înregistrează</h2>
        <p class="muted small" style="margin-top:-6px">Nota contabilă generată automat. Debitul e în stânga semnului egal, creditul în dreapta.</p>
        <div id="nota"></div>
      </section>
    </div>
  </div>`;

  const v = (sel) => $(sel, main);
  const fillPlata = () => {
    const opts = doc.tip === 'venit' ? PLATI_V : PLATI_CH;
    if (!opts.some(([k]) => k === doc.plata)) doc.plata = opts[0][0];
    v('#plata').innerHTML = opts.map(([k, l]) => `<option value="${k}" ${doc.plata === k ? 'selected' : ''}>${l}</option>`).join('');
  };
  const read = () => {
    doc.data = v('#data').value; doc.tipDocument = v('#tipDocument').value; doc.nr = v('#nr').value.trim();
    doc.partener = { ...(doc.partener || {}), nume: v('#pnume').value.trim(), cui: v('#pcui').value.trim() };
    doc.descriere = v('#descriere').value.trim(); doc.total = r2(v('#total').value);
    if (setari.platitorTVA) { doc.tvaCota = Number(v('#tvaCota').value); doc.tva = r2(v('#tva').value); doc.tvaDeductibil = Number(v('#tvaDeductibil')?.value ?? 100); }
    doc.cont = v('#cont').value; doc.plata = v('#plata').value; doc.scadenta = v('#scadenta').value;
    doc.taxareInversa = doc.tip === 'cheltuiala' && !!v('#ti')?.checked;
    if (doc.taxareInversa && !doc.tvaCota) doc.tvaCota = R.tva.standard;
  };
  const calcTVA = () => {
    if (!setari.platitorTVA) return;
    const t = r2(v('#total').value), k = Number(v('#tvaCota').value);
    v('#tva').value = k ? r2(t * k / (1 + k)) : 0;
  };
  const sugereaza = () => {
    if (contManual) return;
    if (!existent && doc.tip === 'cheltuiala' && v('#ti')) v('#ti').checked = furnizorStrain(`${v('#descriere').value} ${v('#pnume').value}`);
    const s = ai.sugestieLocala(`${v('#descriere').value} ${v('#pnume').value}`, v('#total').value);
    if (s && doc.tip === 'cheltuiala') {
      v('#cont').value = s.cont;
      if (v('#tvaDeductibil')) v('#tvaDeductibil').value = s.tvaDeductibil;
      v('#cont-help').innerHTML = `<span class="badge accent">sugestie</span> ${e(s.motiv)} ${e(cont(s.cont).ajutor)}`;
    }
  };
  const helpCont = () => { if (v('#cont').value) v('#cont-help').textContent = cont(v('#cont').value).ajutor; };
  const preview = () => {
    read();
    const n = noteDinDocument({ ...doc, cont: doc.cont || (doc.tip === 'venit' ? '704' : '6588') }, setari);
    v('#nota').innerHTML = doc.total ? `<ul class="list">${n.linii.map((l) => `<li><div class="grow"><div>${eqHTML(l.d, l.c, null, cont)}</div><div class="m">${e(l.expl || '')}</div></div><div class="amt num">${lei(l.suma)}</div></li>`).join('')}</ul>`
      : '<p class="muted">Completează totalul ca să vezi înregistrarea.</p>';
  };
  const tipsAI = () => {
    if (!aiInfo) { v('#ai-tips').innerHTML = ''; return; }
    const w = aiInfo.avertismente || [];
    v('#ai-tips').innerHTML = `<div class="tip ok"><span class="dot"></span><div class="grow"><p><b>Date citite de asistent.</b> ${e(aiInfo.motivCont || '')} Verifică-le înainte de salvare.</p></div></div>`
      + w.map((x) => `<div class="tip warn"><span class="dot"></span><div class="grow"><p>${e(x)}</p></div></div>`).join('');
  };
  const fileArea = () => {
    const f = doc.fisier;
    v('#file-area').innerHTML = f ? `
      ${f.type.startsWith('image/') ? `<img class="preview" src="${f.dataUrl}" alt="Documentul scanat">` : `<div class="tip"><span class="dot"></span><div class="grow"><p>${e(f.name)} (PDF)</p></div></div>`}
      <div class="row" style="margin-top:10px"><button class="btn sm" id="replace">Schimbă fișierul</button>${aiOn ? `<button class="btn sm" id="reread">${icon('spark')}Citește din nou</button>` : ''}<button class="btn sm ghost" id="openf">Deschide</button></div>`
      : `<div class="drop" id="drop" tabindex="0" role="button">${icon('scan')}<p style="margin:8px 0 4px"><b>Fă o poză sau alege fișierul</b></p><p class="muted small" style="margin:0">Bon, chitanță sau factură PDF. Poți trage fișierul aici.</p></div>
         <div class="row" style="margin-top:10px;justify-content:center"><button class="btn sm" id="cam">Cameră</button><button class="btn sm" id="pick">Alege fișier</button></div>`;
    v('#replace') && (v('#replace').onclick = () => v('#file').click());
    v('#openf') && (v('#openf').onclick = () => { const w = window.open(); if (w) w.document.write(`<iframe src="${f.dataUrl}" style="border:0;width:100%;height:100%"></iframe>`); });
    v('#reread') && (v('#reread').onclick = (ev) => citeste(ev.currentTarget));
    const d = v('#drop');
    if (d) {
      d.onclick = () => v('#file').click();
      d.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') v('#file').click(); };
      d.ondragover = (ev) => { ev.preventDefault(); d.classList.add('over'); };
      d.ondragleave = () => d.classList.remove('over');
      d.ondrop = (ev) => { ev.preventDefault(); d.classList.remove('over'); if (ev.dataTransfer.files[0]) incarca(ev.dataTransfer.files[0]); };
      v('#cam').onclick = () => v('#camera').click();
      v('#pick').onclick = () => v('#file').click();
    }
  };
  let fisierBrut = null;
  const incarca = async (file) => {
    if (file.size > 12 * 1024 * 1024) { toast('Fișierul e prea mare (maxim 12 MB).'); return; }
    await withLoad(async () => {
      const p = await ai.pregatesteImagine(file);
      fisierBrut = p;
      doc.fisier = { name: file.name, type: p.type, dataUrl: p.preview || `data:${p.type};base64,${p.data}` };
      fileArea();
    });
    if (aiOn) citeste();
  };
  const citeste = async (btn) => {
    if (!doc.fisier) return;
    const file = fisierBrut || { type: doc.fisier.type, data: doc.fisier.dataUrl.split(',')[1] };
    try {
      const r = await withLoad(() => ai.extrage({ type: file.type, data: file.data }, `Firma ${setari.platitorTVA ? 'este' : 'NU este'} plătitoare de TVA. Regim ${setari.regim}.`), btn);
      aiInfo = r; doc.aiInfo = r;
      if (r.data) v('#data').value = r.data;
      if (r.tipDocument) v('#tipDocument').value = ['Bon fiscal', 'Factura', 'Chitanta'].includes(r.tipDocument) ? r.tipDocument : v('#tipDocument').value;
      if (r.nr) v('#nr').value = r.nr;
      if (r.furnizor?.nume) v('#pnume').value = r.furnizor.nume;
      if (r.furnizor?.cui) v('#pcui').value = r.furnizor.cui;
      if (r.descriere) v('#descriere').value = r.descriere;
      if (r.total) v('#total').value = r.total;
      if (setari.platitorTVA) {
        if (r.tvaCota != null) v('#tvaCota').value = String(r.tvaCota);
        v('#tva').value = r.tva || 0;
        if (r.tvaDeductibil != null) v('#tvaDeductibil').value = r.tvaDeductibil;
      }
      if (r.moneda && r.moneda !== 'RON') (r.avertismente = r.avertismente || []).push(`Documentul este în ${r.moneda}. Introdu totalul în lei, la cursul BNR din ziua documentului.`);
      if (r.cont && cont(r.cont)) { v('#cont').value = r.cont; contManual = true; v('#cont-help').textContent = cont(r.cont).ajutor; }
      tipsAI(); preview();
    } catch (err) {
      toast(err.message);
      sugereaza(); preview();
    }
  };

  fillPlata(); fileArea(); helpCont(); tipsAI(); preview();
  $$('[data-t]', main).forEach((b) => (b.onclick = () => {
    read(); doc.tip = b.dataset.t; doc.cont = ''; contManual = false;
    $$('[data-t]', main).forEach((x) => x.setAttribute('aria-pressed', x === b));
    v('#cont').innerHTML = `<option value="">Alege…</option>${conturiOpt()}`;
    if (doc.tip === 'venit') { v('#cont').value = '704'; v('#tipDocument').value = 'Factura'; }
    v('#lbl-partener').textContent = doc.tip === 'venit' ? 'Client' : 'Furnizor';
    v('#lbl-plata').textContent = doc.tip === 'venit' ? 'Încasare' : 'Cum s-a plătit';
    v('#ti-wrap').hidden = doc.tip === 'venit';
    if (v('#ded-wrap')) v('#ded-wrap').hidden = doc.tip === 'venit';
    fillPlata(); helpCont(); preview();
  }));
  if (v('#ded-wrap')) v('#ded-wrap').hidden = doc.tip === 'venit';
  v('#file').onchange = (ev) => ev.target.files[0] && incarca(ev.target.files[0]);
  v('#camera').onchange = (ev) => ev.target.files[0] && incarca(ev.target.files[0]);
  v('#total').oninput = () => { calcTVA(); preview(); };
  v('#tvaCota') && (v('#tvaCota').onchange = () => { calcTVA(); preview(); });
  v('#descriere').oninput = () => { sugereaza(); preview(); };
  v('#pnume').oninput = () => { sugereaza(); };
  v('#cont').onchange = () => { contManual = true; helpCont(); preview(); };
  main.addEventListener('input', preview);
  main.addEventListener('change', preview);
  v('#anaf').onclick = async (ev) => {
    const cui = v('#pcui').value;
    if (!cui.replace(/\D/g, '')) { toast('Scrie întâi CUI-ul.'); return; }
    try {
      const r = await withLoad(() => ai.cautaCUI(cui), ev.currentTarget);
      v('#pnume').value = r.nume; doc.partener = { ...doc.partener, adresa: r.adresa, regCom: r.regCom, platitorTVA: r.platitorTVA };
      toast(`${r.nume}${r.platitorTVA ? ' — plătitor de TVA' : ''}`);
    } catch (err) { toast(err.message); }
  };
  v('#save').onclick = async (ev) => {
    read();
    const lipsa = [];
    if (!doc.data) lipsa.push('data');
    if (!doc.total || doc.total <= 0) lipsa.push('totalul');
    if (!doc.cont) lipsa.push('contul contabil');
    if (lipsa.length) { toast(`Completează ${lipsa.join(', ')}.`); return; }
    if (doc.tip === 'cheltuiala' && doc.plata === 'casa') {
      const b = ctx.soldCasa ? ctx.soldCasa() : null;
      if (b != null && b < doc.total && !existent) {
        const ultimExtras = (ctx.extrase || []).flatMap((x) => x.tranzactii.map((t) => t.data)).sort().at(-1) || '';
        const asteaptaExtras = doc.data > ultimExtras; // retragerea de la bancomat poate fi în extrasul neimportat încă
        const r = await alege('De unde au fost banii?', `În casa firmei sunt acum ${lei(b)} lei, iar bonul e de ${lei(doc.total)} lei. ${asteaptaExtras ? 'Dacă ai scos bani de la bancomat cu cardul firmei, retragerea apare în extrasul de cont și casa se completează când îl imporți.' : 'Dacă administratorul a plătit din banii lui, firma îi datorează suma (decont) și i-o poate da înapoi oricând.'}`,
          asteaptaExtras
            ? [['casa', 'Din casă — am scos bani de la bancomat (recomandat)', true], ['asociat', 'Administratorul, din banii lui'], ['banca', 'Cu cardul firmei']]
            : [['asociat', 'Administratorul, din banii lui (recomandat)', true], ['banca', 'Cu cardul firmei'], ['casa', 'Totuși din casă']]);
        if (!r) return;
        doc.plata = r; v('#plata').value = r;
      }
    }
    doc.deVerificat = false;
    await withLoad(() => salveazaDocument(doc, setari), ev.currentTarget);
    toast('Document salvat și înregistrat.');
    await ctx.reload();
    if (doc.cont.startsWith('2') && !ctx.mijloace.some((m) => m.docId === doc.id)) location.hash = `#registre/mijloace/nou/${doc.id}`;
    else location.hash = '#documente';
  };
  if (v('#del')) v('#del').onclick = async () => {
    if (!(await confirma('Ștergi documentul și nota contabilă generată din el?', 'Șterge'))) return;
    await stergeDocument(existent); await ctx.reload(); toast('Document șters.'); location.hash = '#documente';
  };
}
