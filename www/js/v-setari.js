import { e, $, $$, icon, withLoad, toast, descarca, confirma } from './ui.js';
import { db, exportCriptat, importCriptat, STORES } from './db.js';
import { saveSetari, reguli, lei, r2 } from './engine.js';
import { cont, toateConturile } from './conturi.js';
import { RULES_2026 } from './rules.js';
import * as ai from './ai.js';
import * as sync from './sync.js';
import * as anaf from './anaf.js';
import * as auto from './auto.js';
import { qrSVG, scaneaza } from './qr.js';
import { areHttpNativ, platforma } from './host.js';
import { VERSIUNE } from './version.js';

export async function render(main, ctx, params) {
  const sec = params[0] || 'firma';
  const SECT = [['firma', 'Firma'], ['fiscal', 'Regim fiscal'], ['sync', 'Dispozitive'], ['spv', 'SPV / e-Factura'], ['auto', 'Automatizări'], ['solduri', 'Solduri inițiale'], ['date', 'Backup'], ['aspect', 'Aspect']];
  main.innerHTML = `
  <div class="page-head"><div><h1>Setări</h1><p class="sub">ACM Contabil ${VERSIUNE}</p></div></div>
  <div class="seg" style="margin-bottom:16px">${SECT.map(([k, l]) => `<button data-go="#setari/${k}" aria-pressed="${sec === k}">${l}</button>`).join('')}</div>
  <section class="panel" style="max-width:820px" id="sv"></section>`;
  const sv = $('#sv', main);
  await ({ firma, fiscal, solduri, sync: vSync, spv: vSpv, auto: vAuto, date, aspect }[sec] || firma)(sv, ctx, params.slice(1));
}

async function salveaza(ctx, patch, btn) {
  await withLoad(() => saveSetari({ ...ctx.setari, ...patch }), btn);
  await ctx.reload();
  toast('Setările au fost salvate.');
}

function firma(el, ctx) {
  const s = ctx.setari;
  el.innerHTML = `<h2>Datele firmei</h2>
    <div class="fields-2">
      <label class="field"><span>Denumire</span><input type="text" id="nume" value="${e(s.nume)}"></label>
      <label class="field"><span>CUI</span><div class="row" style="flex-wrap:nowrap"><input type="text" id="cui" value="${e(s.cui)}" placeholder="ex. 51234567"><button class="btn sm" id="anaf">ANAF</button></div><small>Apasă ANAF ca datele să se completeze automat.</small></label>
      <label class="field"><span>Nr. Registrul Comerțului</span><input type="text" id="regCom" value="${e(s.regCom)}" placeholder="J05/…/2026"></label>
      <label class="field"><span>Localitate</span><input type="text" id="localitate" value="${e(s.localitate || '')}"></label>
    </div>
    <label class="field"><span>Adresa sediului social</span><input type="text" id="adresa" value="${e(s.adresa)}"></label>
    <div class="fields-2">
      <label class="field"><span>IBAN</span><input type="text" id="iban" value="${e(s.iban)}"></label>
      <label class="field"><span>Banca</span><input type="text" id="banca" value="${e(s.banca)}"></label>
    </div>
    <div class="fields-2">
      <label class="field"><span>Data înființării firmei</span><input type="date" id="dataInfiintare" value="${e(s.dataInfiintare || '')}"><small>Din certificatul de înregistrare. O firmă micro nouă are 90 de zile să angajeze un salariat.</small></label>
    </div>
    <label class="field"><span>Numele administratorului</span><input type="text" id="administrator" value="${e(s.administrator || '')}" placeholder="ex. Mândruț Aniel-Ionatan"><small>Apare pe formulare și ajută la recunoașterea în extras a banilor puși sau scoși de administrator.</small></label>
    <div class="row end"><button class="btn primary" id="save">Salvează</button></div>`;
  const v = (x) => $(x, el);
  v('#anaf').onclick = async (ev) => {
    try {
      const r = await withLoad(() => ai.cautaCUI(v('#cui').value), ev.currentTarget);
      v('#nume').value = r.nume; v('#adresa').value = r.adresa; v('#regCom').value = r.regCom;
      toast(r.platitorTVA ? 'Date preluate. ANAF arată firma ca plătitoare de TVA — verifică în Regim fiscal.' : 'Date preluate de la ANAF.');
    } catch (err) { toast(err.message); }
  };
  v('#save').onclick = (ev) => salveaza(ctx, Object.fromEntries(['nume', 'cui', 'regCom', 'localitate', 'adresa', 'iban', 'banca', 'administrator', 'dataInfiintare'].map((k) => [k, v('#' + k).value.trim()])), ev.currentTarget);
}

function fiscal(el, ctx, p = []) {
  const s = ctx.setari; const R = reguli(s);
  const trecere = p[0] === 'tva' && !s.platitorTVA ? (p[1] || new Date().toISOString().slice(0, 10)) : null;
  el.innerHTML = `<h2>Regim fiscal</h2>
    <div class="tip"><span class="dot"></span><div class="grow"><p><b>Nu știi ce regim are firma?</b> Un SRL nou cu cifra de afaceri sub ${lei(R.micro.plafonEUR)} euro și care îndeplinește condițiile din Codul fiscal este de regulă microîntreprindere (impozit ${Math.round(R.micro.cota * 100)}% din venituri). Regimul exact apare în certificatul de înregistrare fiscală sau în Vectorul fiscal din SPV.</p>
      <div class="act"><button class="btn sm ghost" data-ai="Cum aflu dacă firma mea ACM CODE SRL este microîntreprindere sau plătitoare de impozit pe profit, și ce condiții trebuie să îndeplinesc în 2026 pentru regimul micro?">Întreabă asistentul</button></div></div></div>
    <label class="field"><span>Impozitare</span><select id="regim"><option value="micro" ${s.regim === 'micro' ? 'selected' : ''}>Microîntreprindere — ${Math.round(R.micro.cota * 100)}% din venituri</option><option value="profit" ${s.regim === 'profit' ? 'selected' : ''}>Impozit pe profit — ${Math.round(R.profit.cota * 100)}% din profit</option></select></label>
    ${trecere ? `<div class="tip warn"><span class="dot"></span><div class="grow"><p><b>Trecerea la TVA.</b> Plafonul de scutire a fost depășit pe ${trecere.split('-').reverse().join('.')}. Din ziua depășirii (începând cu factura care a depășit plafonul) facturile se emit cu TVA, iar cererea de înregistrare (formularul 098) se depune cel târziu în acea zi. Completează mai jos data de la care ești plătitor de TVA (din certificatul primit de la ANAF) și salvează. Facturile de dinainte rămân fără TVA.</p></div></div>` : ''}
    <label class="check"><input type="checkbox" id="platitorTVA" ${s.platitorTVA || trecere ? 'checked' : ''}><span><b>Firma este plătitoare de TVA</b><br><span class="muted small">Are cod de TVA (CUI cu prefix RO în certificat). Dacă nu, facturile se emit fără TVA, iar TVA-ul de pe achiziții intră în cheltuială.</span></span></label>
    <div id="tva-opts" ${s.platitorTVA || trecere ? '' : 'hidden'}>
      <label class="field" style="max-width:260px"><span>Plătitor de TVA de la data</span><input type="date" id="tvaDeLa" value="${e(trecere || s.tvaDeLa || '')}"><small>Gol dacă firma a fost plătitoare de TVA dintotdeauna.</small></label>
      <label class="field"><span>Perioada fiscală TVA</span><select id="perioadaTVA"><option value="trimestru" ${s.perioadaTVA === 'trimestru' ? 'selected' : ''}>Trimestrială</option><option value="luna" ${s.perioadaTVA === 'luna' ? 'selected' : ''}>Lunară</option></select></label>
      <label class="check"><input type="checkbox" id="tvaLaIncasare" ${s.tvaLaIncasare ? 'checked' : ''}><span><b>TVA la încasare</b><br><span class="muted small">TVA-ul din facturile emise se datorează abia când clientul plătește.</span></span></label>
    </div>
    <label class="check"><input type="checkbox" id="areSalariati" ${s.areSalariati ? 'checked' : ''}><span><b>Firma are salariați</b><br><span class="muted small">Activează termenul lunar pentru D112. O microîntreprindere trebuie să aibă cel puțin un salariat, cu excepțiile prevăzute de lege.</span></span></label>
    <label class="field" style="max-width:260px"><span>Curs EUR pentru plafonul micro</span><input type="number" step="0.0001" id="cursEUR" value="${e(s.cursEUR)}"><small>Cursul BNR din ultima zi a anului precedent.</small></label>
    <details style="margin:10px 0 16px"><summary style="cursor:pointer;font-weight:600">Valori fiscale folosite în calcule</summary>
      <p class="muted small">Modifică-le doar dacă se schimbă legea. Valorile implicite sunt cele din ${RULES_2026.an}.</p>
      <div class="fields-3">
        <label class="field"><span>Cotă micro (%)</span><input type="number" step="0.01" id="r-micro" value="${R.micro.cota * 100}"></label>
        <label class="field"><span>Plafon micro (EUR)</span><input type="number" id="r-plafon" value="${R.micro.plafonEUR}"></label>
        <label class="field"><span>Impozit profit (%)</span><input type="number" step="0.01" id="r-profit" value="${R.profit.cota * 100}"></label>
        <label class="field"><span>TVA standard (%)</span><input type="number" step="0.01" id="r-tva" value="${R.tva.standard * 100}"></label>
        <label class="field"><span>TVA redus (%)</span><input type="number" step="0.01" id="r-tvar" value="${R.tva.redusa * 100}"></label>
        <label class="field"><span>Plafon scutire TVA (lei)</span><input type="number" id="r-ptva" value="${R.tva.plafonScutire}"></label>
        <label class="field"><span>Prag mijloc fix (lei)</span><input type="number" id="r-mf" value="${R.mijlocFixMin}"></label>
        <label class="field"><span>Impozit dividende (%)</span><input type="number" step="0.01" id="r-div" value="${R.dividende.cota * 100}"></label>
      </div>
      <label class="field"><span>Conturi de venit excluse din baza micro</span><input type="text" id="r-excl" value="${e(R.micro.excluseBaza.join(', '))}"><small>Prefixe de cont, separate prin virgulă.</small></label>
    </details>
    <div class="row end"><button class="btn primary" id="save">Salvează</button></div>`;
  const v = (x) => $(x, el);
  v('#platitorTVA').onchange = () => { v('#tva-opts').hidden = !v('#platitorTVA').checked; };
  v('#save').onclick = async (ev) => {
    const n = (id) => Number(v(id).value);
    const inainte = `${s.platitorTVA}|${s.tvaDeLa || ''}`;
    await salveaza(ctx, {
      regim: v('#regim').value, platitorTVA: v('#platitorTVA').checked, tvaDeLa: v('#platitorTVA').checked ? v('#tvaDeLa').value : '', perioadaTVA: v('#perioadaTVA').value, regimConfirmat: true,
      tvaLaIncasare: v('#tvaLaIncasare').checked, areSalariati: v('#areSalariati').checked, cursEUR: n('#cursEUR'), cursSetat: true,
      reguli: {
        micro: { cota: n('#r-micro') / 100, plafonEUR: n('#r-plafon'), excluseBaza: v('#r-excl').value.split(',').map((x) => x.trim()).filter(Boolean) },
        profit: { cota: n('#r-profit') / 100 }, dividende: { cota: n('#r-div') / 100 },
        tva: { standard: n('#r-tva') / 100, redusa: n('#r-tvar') / 100, plafonScutire: n('#r-ptva') },
        mijlocFixMin: n('#r-mf') || RULES_2026.mijlocFixMin,
      },
    }, ev.currentTarget);
    const ns = ctx.setari;
    if (`${ns.platitorTVA}|${ns.tvaDeLa || ''}` !== inainte) {
      // notele documentelor afectate se refac cu noul regim de TVA
      const { salveazaDocument } = await import('./engine.js');
      const de = !s.platitorTVA && ns.platitorTVA ? ns.tvaDeLa || '' : [s.tvaDeLa || '', ns.tvaDeLa || ''].sort()[0];
      const docs = ctx.documente.filter((d) => (d.data || '') >= de);
      for (const d of docs) await salveazaDocument(d, ns);
      if (docs.length) { await ctx.reload(); toast(`Regimul de TVA a fost aplicat la ${docs.length} ${docs.length === 1 ? 'document' : 'documente'} din ${de ? 'perioada de la ' + de.split('-').reverse().join('.') : 'toată perioada'}.`); }
      location.hash = '#declaratii';
    }
  };
}

function solduri(el, ctx) {
  const s = ctx.setari;
  const si = structuredClone(s.soldInitial || {});
  const conturi = toateConturile().filter((c) => !['6', '7'].includes(c.cod[0]) && c.cod !== '121');
  el.innerHTML = `<h2>Solduri la 1 ianuarie ${s.anCurent}</h2>
    <p class="muted" style="margin-top:-6px">Dacă firma a avut activitate înainte de a folosi aplicația, copiază soldurile finale din ultima balanță a anului precedent. Pentru o firmă nouă, lasă totul gol — capitalul social se înregistrează din Operațiuni.</p>
    <div class="table-wrap"><table><thead><tr><th>Cont</th><th class="n">Sold debitor</th><th class="n">Sold creditor</th><th></th></tr></thead><tbody id="si-rows"></tbody>
    <tfoot><tr class="total"><td>Total</td><td class="n" id="si-td"></td><td class="n" id="si-tc"></td><td></td></tr></tfoot></table></div>
    <div class="row" style="margin-top:10px"><select id="si-add" style="width:auto;max-width:100%"><option value="">Adaugă un cont…</option>${conturi.map((c) => `<option value="${c.cod}">${c.cod} · ${e(c.nume)}</option>`).join('')}</select></div>
    <div id="si-msg" style="margin-top:12px"></div>
    <div class="row end"><button class="btn primary" id="save">Salvează soldurile</button></div>`;
  const v = (x) => $(x, el);
  const draw = () => {
    v('#si-rows').innerHTML = Object.keys(si).sort().map((k) => `<tr><td><b>${k}</b> ${e(cont(k).nume)}</td>
      <td><input type="number" step="0.01" data-k="${k}" data-s="d" value="${si[k].d || ''}" style="text-align:right"></td>
      <td><input type="number" step="0.01" data-k="${k}" data-s="c" value="${si[k].c || ''}" style="text-align:right"></td>
      <td><button class="icon-btn" data-rm="${k}" aria-label="Elimină">${icon('x')}</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Niciun sold introdus.</td></tr>';
    $$('[data-rm]', el).forEach((b) => (b.onclick = () => { delete si[b.dataset.rm]; draw(); }));
    tot();
  };
  const tot = () => {
    const d = r2(Object.values(si).reduce((x, y) => x + (Number(y.d) || 0), 0)), c = r2(Object.values(si).reduce((x, y) => x + (Number(y.c) || 0), 0));
    v('#si-td').textContent = lei(d); v('#si-tc').textContent = lei(c);
    v('#si-msg').innerHTML = d === c ? (d ? '<div class="tip ok"><span class="dot"></span><div class="grow"><p>Soldurile sunt echilibrate.</p></div></div>' : '')
      : `<div class="tip err"><span class="dot"></span><div class="grow"><p>Totalul debitor (${lei(d)}) trebuie să fie egal cu totalul creditor (${lei(c)}). Diferență: ${lei(Math.abs(d - c))} lei.</p></div></div>`;
  };
  el.addEventListener('input', (ev) => { if (ev.target.dataset.k) { si[ev.target.dataset.k][ev.target.dataset.s] = r2(ev.target.value); tot(); } });
  v('#si-add').onchange = (ev) => { if (ev.target.value && !si[ev.target.value]) si[ev.target.value] = { d: 0, c: 0 }; ev.target.value = ''; draw(); };
  draw();
  v('#save').onclick = (ev) => salveaza(ctx, { soldInitial: si }, ev.currentTarget);
}

async function vSync(el, ctx) {
  const st = await sync.stare();
  const asteapta = await sync.inAsteptare();
  if (!st) {
    el.innerHTML = `<h2>Sincronizare între dispozitive</h2>
      <p class="muted" style="margin-top:-6px;max-width:62ch">Ține aceeași contabilitate pe calculator, telefon și iPhone, fără cont. Datele se criptează pe dispozitiv înainte de a pleca. Serverul păstrează doar text criptat, pe care nu îl poate citi nimeni, nici dezvoltatorul aplicației.</p>
      <div class="grid g2">
        <div class="tip"><span class="dot"></span><div class="grow"><p><b>E primul dispozitiv?</b> Creează seiful. Datele de pe acest dispozitiv se urcă criptat, iar apoi poți adăuga celelalte dispozitive.</p><div class="act"><button class="btn sm primary" id="creeaza">Creează seiful</button></div></div></div>
        <div class="tip"><span class="dot"></span><div class="grow"><p><b>Ai deja seiful pe alt dispozitiv?</b> Acolo deschide Setări → Dispozitive și scanează codul QR sau copiază codul de asociere.</p><div class="act row"><button class="btn sm" id="scan">Scanează codul QR</button><button class="btn sm ghost" id="manual">Introdu codul</button></div></div></div>
      </div>
      <div id="asoc" hidden style="margin-top:14px"></div>`;
    const v = (x) => $(x, el);
    v('#creeaza').onclick = async (ev) => {
      try { await withLoad(() => sync.creeazaSeif(), ev.currentTarget); toast('Seiful a fost creat. Datele se sincronizează criptat.'); await ctx.reload(); }
      catch (err) { toast(err.message); }
    };
    const asoc = async (text, btn) => {
      try { const r = await withLoad(() => sync.asociaza(text), btn); toast(`Dispozitiv asociat. Am primit ${r.primite || 0} înregistrări.`); await ctx.reload(); }
      catch (err) { toast(err.message); }
    };
    v('#manual').onclick = () => {
      v('#asoc').hidden = false;
      v('#asoc').innerHTML = `<label class="field"><span>Codul de asociere</span><input type="text" id="cod" placeholder="ACMC1-…" autocomplete="off" autocapitalize="off" spellcheck="false"></label><div class="row end"><button class="btn primary" id="ok">Asociază</button></div>`;
      v('#ok').onclick = (ev) => asoc(v('#cod').value, ev.currentTarget);
    };
    v('#scan').onclick = async () => {
      v('#asoc').hidden = false;
      v('#asoc').innerHTML = `<video id="vid" style="width:100%;max-width:420px;border-radius:14px;background:#000;aspect-ratio:4/3;object-fit:cover"></video><p class="muted small">Îndreaptă camera spre codul QR de pe celălalt dispozitiv.</p><button class="btn sm" id="stop">Oprește camera</button>`;
      const ac = new AbortController();
      v('#stop').onclick = () => { ac.abort(); v('#asoc').hidden = true; };
      try { const text = await scaneaza(v('#vid'), { semnal: ac.signal }); v('#asoc').hidden = true; await asoc(text); }
      catch (err) { if (err.message !== 'anulat') toast(err.message); }
    };
    return;
  }
  const cod = sync.codAsociere(st);
  el.innerHTML = `<h2>Sincronizare între dispozitive</h2>
    <div class="tip ${st.eroare ? 'err' : 'ok'}"><span class="dot"></span><div class="grow"><p>${st.eroare ? e(st.eroare) : `Seif activ. Ultima sincronizare: ${st.ultima ? new Date(st.ultima).toLocaleString('ro-RO') : 'încă nu'}.`}${asteapta ? ` ${asteapta} modificări așteaptă să fie trimise.` : ''}</p>
      <div class="act"><button class="btn sm ghost" id="acum">Sincronizează acum</button></div></div></div>
    <h3 style="margin-top:16px">Adaugă un dispozitiv</h3>
    <p class="muted small" style="margin-top:0">Pe celălalt dispozitiv: Setări → Dispozitive → Scanează codul QR. Codul dă acces complet la contabilitate: arată-l doar dispozitivelor tale.</p>
    <div class="row" style="align-items:flex-start;gap:20px">
      <div id="qr" style="border-radius:14px;overflow:hidden;border:1px solid var(--line);line-height:0;background:#fff" hidden></div>
      <div class="grow" style="min-width:220px">
        <button class="btn" id="arata">${icon('lock')}Arată codul QR</button>
        <div id="codtxt" hidden style="margin-top:10px"><label class="field"><span>Sau copiază codul de asociere</span><input type="text" readonly value="${e(cod)}" id="codin"></label><button class="btn sm" id="copiaza">Copiază</button></div>
      </div>
    </div>
    <hr class="sep">
    <h3>Scoate acest dispozitiv din seif</h3>
    <p class="muted small">Datele rămân pe acest dispozitiv și în seif, dar nu se mai sincronizează aici.</p>
    <button class="btn danger" id="iesi">Scoate dispozitivul</button>`;
  const v = (x) => $(x, el);
  v('#arata').onclick = () => {
    const ascuns = v('#qr').hidden;
    v('#qr').hidden = !ascuns; v('#codtxt').hidden = !ascuns;
    v('#qr').innerHTML = ascuns ? qrSVG(sync.textQR(st), 220) : '';
    v('#arata').innerHTML = `${icon('lock')}${ascuns ? 'Ascunde codul' : 'Arată codul QR'}`;
  };
  v('#copiaza').onclick = async () => { try { await navigator.clipboard.writeText(cod); toast('Cod copiat. Șterge-l din clipboard după ce l-ai folosit.'); } catch { v('#codin').select(); } };
  v('#acum').onclick = async (ev) => { try { const r = await withLoad(() => sync.sincronizeaza(), ev.currentTarget); toast(`Sincronizat: ${r.trimise || 0} trimise, ${r.primite || 0} primite.`); await ctx.reload(); } catch (err) { toast(err.message); } };
  v('#iesi').onclick = async () => { if (!(await confirma('Scoți acest dispozitiv din seif? Datele locale rămân, dar nu se mai sincronizează.', 'Scoate'))) return; await sync.iesiDinSeif(); toast('Dispozitivul a fost scos din seif.'); await ctx.reload(); };
}

async function vSpv(el, ctx) {
  const st = await anaf.stare();
  const meta = (await db.get('meta', 'spv')) || {};
  const nativ = areHttpNativ();
  el.innerHTML = `<h2>SPV și e-Factura</h2>
    <p class="muted" style="margin-top:-6px;max-width:64ch">Cu firma conectată, aplicația ia singură din SPV facturile primite de la furnizori și pe cele emise, cu XML-ul și PDF-ul ANAF. Le înregistrează ca documente și îți propune contul. ANAF păstrează mesajele 60 de zile, așa că aplicația verifică la fiecare câteva ore.</p>
    ${!nativ ? '<div class="tip warn"><span class="dot"></span><div class="grow"><p>Conectarea la ANAF merge doar din aplicația instalată (Windows, Android, iPhone), nu din browser.</p></div></div>' : ''}
    ${st ? `<div class="tip ok"><span class="dot"></span><div class="grow"><p>Firma este conectată${st.cif ? ` (CUI ${e(st.cif)})` : ''} din ${new Date(st.conectat || st.at).toLocaleDateString('ro-RO')}. Conectarea expiră după un an; aplicația îți amintește din timp.</p>
         <p class="small muted">${meta.ultima ? `Ultima verificare: ${new Date(meta.ultima).toLocaleString('ro-RO')}.` : 'Încă nu s-a verificat.'}${meta.ultimRezultat ? ` Ultimul import: ${meta.ultimRezultat.primite} primite, ${meta.ultimRezultat.emise} emise.` : ''}</p>
         <div class="act row"><button class="btn sm primary" id="acum" ${nativ ? '' : 'disabled'}>Verifică SPV acum</button><button class="btn sm ghost danger" id="deco">Deconectează</button></div></div></div>`
      : `<div class="tip"><span class="dot"></span><div class="grow"><p>Ai nevoie de certificatul digital calificat al firmei (sau al administratorului, înregistrat în SPV pentru firmă), pus în calculator sau pe token.</p><div class="act"><button class="btn sm primary" id="con" ${nativ ? '' : 'disabled'}>Conectează firma la SPV</button></div></div></div>`}
    <div id="pas"></div>
    ${(meta.respinse || []).length ? `<h3 style="margin-top:16px">Facturi respinse de ANAF</h3><ul class="list">${meta.respinse.map((r) => `<li><div class="grow"><div class="t">${e(r.detalii || 'Factură respinsă')}</div><div class="m">${e(String(r.data || ''))}</div></div></li>`).join('')}</ul>` : ''}`;
  const v = (x) => $(x, el);
  v('#con') && (v('#con').onclick = async (ev) => {
    if (!ctx.setari.cui) { toast('Completează întâi CUI-ul firmei în Setări → Firma.'); return; }
    try {
      await withLoad(() => anaf.conecteaza((p) => { if (p === 'asteapta') v('#pas').innerHTML = '<div class="tip"><span class="dot"></span><div class="grow"><p>S-a deschis pagina ANAF. Alege certificatul firmei, apoi întoarce-te aici. Aștept confirmarea…</p></div></div>'; }), ev.currentTarget);
      toast('Firma este conectată la SPV. Importul pornește acum.');
      await auto.ruleazaAcum();
      await ctx.reload();
    } catch (err) { v('#pas').innerHTML = ''; toast(err.message); }
  });
  v('#acum') && (v('#acum').onclick = async (ev) => {
    try { const r = await withLoad(() => anaf.importa(), ev.currentTarget); toast(`SPV: ${r.primite || 0} facturi primite, ${r.emise || 0} emise${r.erori ? `, ${r.erori} respinse` : ''}.`); await ctx.reload(); }
    catch (err) { toast(err.message); }
  });
  v('#deco') && (v('#deco').onclick = async () => { if (!(await confirma('Deconectezi firma de la SPV? Facturile deja importate rămân.', 'Deconectează'))) return; await anaf.deconecteaza(); toast('Firma a fost deconectată de la SPV.'); await ctx.reload(); });
}

async function vAuto(el, ctx) {
  const s = ctx.setari;
  const j = auto.ultimele();
  el.innerHTML = `<h2>Automatizări</h2>
    <p class="muted" style="margin-top:-6px">Ce face aplicația singură, cât timp e deschisă pe oricare dintre dispozitive.</p>
    <label class="check"><input type="checkbox" id="inchidereAutomata" ${s.inchidereAutomata !== false ? 'checked' : ''}><span><b>Închide lunile automat</b><br><span class="muted small">Amortizarea, TVA-ul, impozitul trimestrial și închiderea conturilor 6/7 se refac singure când apare un document nou într-o lună trecută.</span></span></label>
    <label class="check"><input type="checkbox" id="extrasAutomat" ${s.extrasAutomat !== false ? 'checked' : ''}><span><b>Înregistrează singur plățile sigure din extras</b><br><span class="muted small">Încasările și plățile potrivite clar cu o factură, comisioanele, dobânzile, retragerile de numerar. Restul îți cer confirmarea.</span></span></label>
    <label class="check"><input type="checkbox" checked disabled><span><b>Curs BNR zilnic</b><br><span class="muted small">Pentru facturile în valută și pentru plafonul micro (cursul din 31 decembrie).</span></span></label>
    <label class="check"><input type="checkbox" checked disabled><span><b>Reportarea rezultatului la 1 ianuarie</b><br><span class="muted small">Profitul sau pierderea anului trecut trece automat din 121 în 1171, iar soldurile se preiau în anul nou.</span></span></label>
    <div class="row end"><button class="btn primary" id="save">Salvează</button><button class="btn" id="acum">Rulează acum</button></div>
    <h3 style="margin-top:18px">Jurnal</h3>
    ${j.length ? `<ul class="list">${j.map((x) => `<li><div class="grow"><div class="${x.tip === 'eroare' ? '' : ''}">${e(x.text)}</div><div class="m">${new Date(x.t).toLocaleString('ro-RO')}</div></div>${x.tip === 'eroare' ? '<span class="badge err">eroare</span>' : x.tip === 'ok' ? '<span class="badge ok">gata</span>' : ''}</li>`).join('')}</ul>` : '<p class="muted">Nicio acțiune automată în această sesiune încă.</p>'}`;
  const v = (x) => $(x, el);
  v('#save').onclick = (ev) => salveaza(ctx, { inchidereAutomata: v('#inchidereAutomata').checked, extrasAutomat: v('#extrasAutomat').checked }, ev.currentTarget);
  v('#acum').onclick = async (ev) => { await withLoad(() => auto.ruleazaAcum(), ev.currentTarget); toast('Automatizările au rulat.'); await ctx.reload(); };
}

function date(el, ctx) {
  el.innerHTML = `<h2>Date și backup</h2>
    <p class="muted" style="margin-top:-6px">Toată contabilitatea stă pe acest dispozitiv. Fă un backup criptat cel puțin o dată pe lună și păstrează-l în alt loc (ex. un stick sau cloud-ul tău).</p>
    <div class="fields-2"><label class="field"><span>Parolă backup</span><input type="password" id="bp" autocomplete="new-password"><small>Fără această parolă backup-ul nu poate fi deschis. Nu există recuperare.</small></label></div>
    <div class="row"><button class="btn primary" id="exp">${icon('lock')}Descarcă backup criptat</button><button class="btn" id="imp">Restaurează din backup</button><input type="file" id="impf" accept=".acmbak,.json" hidden></div>
    <hr class="sep">
    <h3>Ștergere date</h3><p class="muted small">Șterge toate documentele, notele și setările de pe acest dispozitiv.</p>
    <button class="btn danger" id="wipe">Șterge toate datele</button>`;
  const v = (x) => $(x, el);
  v('#exp').onclick = async (ev) => {
    const p = v('#bp').value;
    if (p.length < 8) { toast('Alege o parolă de cel puțin 8 caractere.'); return; }
    const txt = await withLoad(() => exportCriptat(p), ev.currentTarget);
    descarca(`ACM-Contabil-backup-${new Date().toISOString().slice(0, 10)}.acmbak`, txt, 'application/json');
    toast('Backup descărcat.');
  };
  v('#imp').onclick = () => { if (!v('#bp').value) { toast('Scrie parola backup-ului, apoi alege fișierul.'); return; } v('#impf').click(); };
  v('#impf').onchange = async (ev) => {
    const f = ev.target.files[0]; if (!f) return;
    if (!(await confirma('Restaurarea înlocuiește toate datele de pe acest dispozitiv cu cele din backup. Continui?', 'Restaurează'))) return;
    try { await withLoad(async () => importCriptat(await f.text(), v('#bp').value)); toast('Date restaurate.'); await ctx.reload(); }
    catch (err) { toast(err.message); }
  };
  v('#wipe').onclick = async () => {
    if (!(await confirma('Ștergi definitiv toate datele de pe acest dispozitiv? Fă înainte un backup.', 'Șterge tot'))) return;
    for (const st of STORES) await db.clear(st);
    toast('Datele au fost șterse.'); await ctx.reload(); location.hash = '#acasa';
  };
}

function aspect(el, ctx) {
  const t = ctx.setari.tema || 'auto';
  el.innerHTML = `<h2>Aspect</h2>
    <div class="seg">${[['auto', 'Ca sistemul'], ['light', 'Luminos'], ['dark', 'Întunecat']].map(([k, l]) => `<button data-tema="${k}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>`;
  $$('[data-tema]', el).forEach((b) => (b.onclick = () => salveaza(ctx, { tema: b.dataset.tema })));
}
