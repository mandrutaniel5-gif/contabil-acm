import { e, $, $$, icon, withLoad, toast, descarca, confirma } from './ui.js';
import { db, exportCriptat, importCriptat, STORES } from './db.js';
import { saveSetari, reguli, lei, r2 } from './engine.js';
import { cont, toateConturile } from './conturi.js';
import { RULES_2026 } from './rules.js';
import * as ai from './ai.js';
import { VERSIUNE } from './version.js';

export async function render(main, ctx, params) {
  const sec = params[0] || 'firma';
  const SECT = [['firma', 'Firma'], ['fiscal', 'Regim fiscal'], ['solduri', 'Solduri inițiale'], ['ai', 'Asistent AI'], ['date', 'Date și backup'], ['aspect', 'Aspect']];
  main.innerHTML = `
  <div class="page-head"><div><h1>Setări</h1><p class="sub">ACM Contabil ${VERSIUNE}</p></div></div>
  <div class="seg" style="margin-bottom:16px">${SECT.map(([k, l]) => `<button data-go="#setari/${k}" aria-pressed="${sec === k}">${l}</button>`).join('')}</div>
  <section class="panel" style="max-width:820px" id="sv"></section>`;
  const sv = $('#sv', main);
  await ({ firma, fiscal, solduri, ai: vAI, date, aspect }[sec] || firma)(sv, ctx);
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
    <div class="row end"><button class="btn primary" id="save">Salvează</button></div>`;
  const v = (x) => $(x, el);
  v('#anaf').onclick = async (ev) => {
    try {
      const r = await withLoad(() => ai.cautaCUI(v('#cui').value), ev.currentTarget);
      v('#nume').value = r.nume; v('#adresa').value = r.adresa; v('#regCom').value = r.regCom;
      toast(r.platitorTVA ? 'Date preluate. ANAF arată firma ca plătitoare de TVA — verifică în Regim fiscal.' : 'Date preluate de la ANAF.');
    } catch (err) { toast(err.message); }
  };
  v('#save').onclick = (ev) => salveaza(ctx, Object.fromEntries(['nume', 'cui', 'regCom', 'localitate', 'adresa', 'iban', 'banca'].map((k) => [k, v('#' + k).value.trim()])), ev.currentTarget);
}

function fiscal(el, ctx) {
  const s = ctx.setari; const R = reguli(s);
  el.innerHTML = `<h2>Regim fiscal</h2>
    <div class="tip"><span class="dot"></span><div class="grow"><p><b>Nu știi ce regim are firma?</b> Un SRL nou cu cifra de afaceri sub ${lei(R.micro.plafonEUR)} euro și care îndeplinește condițiile din Codul fiscal este de regulă microîntreprindere (impozit ${Math.round(R.micro.cota * 100)}% din venituri). Regimul exact apare în certificatul de înregistrare fiscală sau în Vectorul fiscal din SPV.</p>
      <div class="act"><button class="btn sm ghost" data-ai="Cum aflu dacă firma mea ACM CODE SRL este microîntreprindere sau plătitoare de impozit pe profit, și ce condiții trebuie să îndeplinesc în 2026 pentru regimul micro?">Întreabă asistentul</button></div></div></div>
    <label class="field"><span>Impozitare</span><select id="regim"><option value="micro" ${s.regim === 'micro' ? 'selected' : ''}>Microîntreprindere — ${Math.round(R.micro.cota * 100)}% din venituri</option><option value="profit" ${s.regim === 'profit' ? 'selected' : ''}>Impozit pe profit — ${Math.round(R.profit.cota * 100)}% din profit</option></select></label>
    <label class="check"><input type="checkbox" id="platitorTVA" ${s.platitorTVA ? 'checked' : ''}><span><b>Firma este plătitoare de TVA</b><br><span class="muted small">Are cod de TVA (CUI cu prefix RO în certificat). Dacă nu, facturile se emit fără TVA, iar TVA-ul de pe achiziții intră în cheltuială.</span></span></label>
    <div id="tva-opts" ${s.platitorTVA ? '' : 'hidden'}>
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
  v('#save').onclick = (ev) => {
    const n = (id) => Number(v(id).value);
    salveaza(ctx, {
      regim: v('#regim').value, platitorTVA: v('#platitorTVA').checked, perioadaTVA: v('#perioadaTVA').value,
      tvaLaIncasare: v('#tvaLaIncasare').checked, areSalariati: v('#areSalariati').checked, cursEUR: n('#cursEUR'), cursSetat: true,
      reguli: {
        micro: { cota: n('#r-micro') / 100, plafonEUR: n('#r-plafon'), excluseBaza: v('#r-excl').value.split(',').map((x) => x.trim()).filter(Boolean) },
        profit: { cota: n('#r-profit') / 100 }, dividende: { cota: n('#r-div') / 100 },
        tva: { standard: n('#r-tva') / 100, redusa: n('#r-tvar') / 100, plafonScutire: n('#r-ptva') },
        mijlocFixMin: n('#r-mf') || RULES_2026.mijlocFixMin,
      },
    }, ev.currentTarget);
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

async function vAI(el, ctx) {
  const s = ctx.setari;
  const on = await ai.conectat();
  const sess = await db.get('settings', 'aiSession');
  el.innerHTML = `<h2>Asistent AI</h2>
    <p class="muted" style="margin-top:-6px">Asistentul citește bonurile și facturile, propune contul potrivit, explică pașii și verifică luna. Rulează pe Claude, printr-o funcție Firebase a firmei — cheia AI nu se află pe dispozitiv.</p>
    ${on ? `<div class="tip ok"><span class="dot"></span><div class="grow"><p>Conectat ca <b>${e(sess.email)}</b>.</p><div class="act"><button class="btn sm ghost" id="logout">Deconectează</button></div></div></div>` : ''}
    <label class="field"><span>Adresa funcțiilor</span><input type="url" id="functionUrl" value="${e(s.ai.functionUrl)}" placeholder="https://europe-west1-PROIECT.cloudfunctions.net"><small>Din consola Firebase → Functions. Aplicația apelează /ai și /cui.</small></label>
    <label class="field"><span>Cheia web Firebase</span><input type="text" id="firebaseApiKey" value="${e(s.ai.firebaseApiKey)}" placeholder="AIza…"><small>Setări proiect → General → Web API Key. Este o cheie publică; accesul e controlat de cont.</small></label>
    ${on ? '' : `<hr class="sep"><h3>Cont</h3><div class="fields-2">
      <label class="field"><span>Email</span><input type="email" id="email" value="${e(s.ai.email)}" autocomplete="username"></label>
      <label class="field"><span>Parolă</span><input type="password" id="pass" autocomplete="current-password"></label></div>`}
    <div class="row end"><button class="btn" id="save">Salvează</button>${on ? '' : '<button class="btn primary" id="login">Conectează</button>'}</div>`;
  const v = (x) => $(x, el);
  const aiPatch = () => ({ ai: { ...s.ai, functionUrl: v('#functionUrl').value.trim(), firebaseApiKey: v('#firebaseApiKey').value.trim(), email: v('#email')?.value.trim() || s.ai.email } });
  v('#save').onclick = (ev) => salveaza(ctx, aiPatch(), ev.currentTarget);
  v('#login') && (v('#login').onclick = async (ev) => {
    try {
      await saveSetari({ ...s, ...aiPatch() });
      const mail = await withLoad(() => ai.login(v('#email').value.trim(), v('#pass').value), ev.currentTarget);
      toast(`Conectat ca ${mail}.`); await ctx.reload();
    } catch (err) { toast(err.message); }
  });
  v('#logout') && (v('#logout').onclick = async () => { await ai.logout(); toast('Deconectat.'); await ctx.reload(); });
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
