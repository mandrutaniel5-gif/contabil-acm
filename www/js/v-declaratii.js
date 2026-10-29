import { e, $, $$, icon, toast, descarca } from './ui.js';
import { lei, r2, dataRo, LUNI, trimDinLuna, trimInterval, lunaInterval, reguli, iso } from './engine.js';
import { termene, zilePana, d100Micro, estimareProfit, d300, calculSalariu, saftXML } from './declaratii.js';
import { VERSIUNE } from './version.js';

// perioada implicită: luna/trimestrul anterior; se recalculează în fiecare zi (aplicația poate sta deschisă zile întregi)
const st = {};
function perioadaImplicita() {
  const n = new Date(); const zi = n.toISOString().slice(0, 10);
  if (st.zi === zi) return;
  const prev = n.getMonth() === 0 ? 12 : n.getMonth(); // luna anterioară, 1-12
  Object.assign(st, { zi, an: n.getMonth() === 0 ? n.getFullYear() - 1 : n.getFullYear(), t: Math.ceil(prev / 3), luna: prev });
}

export async function render(main, ctx, params) {
  perioadaImplicita();
  const s = ctx.setari;
  const tabs = [['calendar', 'Calendar']];
  tabs.push(['impozit', s.regim === 'micro' ? 'D100 — impozit micro' : 'Impozit pe profit']);
  if (s.platitorTVA) tabs.push(['tva', 'D300 — TVA']);
  tabs.push(['saft', 'D406 — SAF-T']);
  tabs.push(['salarii', 'Salarii — D112']);
  const tab = params[0] || 'calendar';
  main.innerHTML = `
  <div class="page-head"><div><h1>Declarații</h1><p class="sub">Aplicația calculează sumele din contabilitate. Declarațiile se depun online, în SPV sau pe e-guvernare.ro, cu formularele oficiale ANAF.</p></div></div>
  <div class="seg" style="margin-bottom:16px">${tabs.map(([k, l]) => `<button data-go="#declaratii/${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>
  <div id="dv"></div>`;
  const dv = $('#dv', main);
  const rerender = () => render(main, ctx, params);
  await ({ calendar, impozit, tva, saft, salarii }[tab] || calendar)(dv, ctx, rerender);
}

function selTrim(rer) {
  setTimeout(() => {
    const t = document.getElementById('d-t'), a = document.getElementById('d-an');
    if (t) t.onchange = (ev) => { st.t = Number(ev.target.value); rer(); };
    if (a) a.onchange = (ev) => { st.an = Number(ev.target.value); rer(); };
  });
  return `<div class="row"><select id="d-t" style="width:auto">${[1, 2, 3, 4].map((t) => `<option value="${t}" ${st.t === t ? 'selected' : ''}>Trimestrul ${t}</option>`).join('')}</select>
    <select id="d-an" style="width:auto">${[st.an - 1, st.an, st.an + 1].map((y) => `<option ${y === st.an ? 'selected' : ''}>${y}</option>`).join('')}</select></div>`;
}

function pasi(lista) {
  return `<h3 style="margin-top:18px">Cum o depui</h3><ol class="small" style="padding-left:20px;margin:6px 0 0">${lista.map((x) => `<li style="margin-bottom:6px">${x}</li>`).join('')}</ol>`;
}

function calendar(el, ctx) {
  const tm = termene(ctx.setari, new Date(), 12);
  el.innerHTML = `<section class="panel"><h2>Următoarele termene</h2>
    <p class="muted small" style="margin-top:-6px">Calculate din setările firmei. Când termenul cade în weekend, se mută pe luni. Sărbătorile legale nu sunt luate în calcul.</p>
    <ul class="list">${tm.map((t) => { const z = zilePana(t.termen); return `<li><div class="grow"><div class="t">${e(t.nume)}</div><div class="m">Pentru ${e(t.perioada)} · termen ${dataRo(iso(t.termen))}</div></div><span class="badge ${z < 0 ? 'err' : z <= 5 ? 'err' : z <= 14 ? 'warn' : ''}">${z < 0 ? 'depășit' : z === 0 ? 'azi' : `în ${z} zile`}</span></li>`; }).join('')}</ul>
  </section>`;
}

function impozit(el, ctx, rer) {
  const s = ctx.setari;
  if (s.regim === 'micro') {
    const d = d100Micro(ctx.note, s, st.an, st.t);
    const pct = Math.min(1, d.procentPlafon);
    el.innerHTML = `<section class="panel">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">D100 — impozit pe veniturile microîntreprinderilor</h2>${selTrim(rer)}</div>
      <div class="figures" style="margin-top:18px">
        <div class="figure"><div class="label">Venituri T${st.t}</div><div class="value num">${lei(d.bazaTrim)}<small>lei</small></div></div>
        <div class="figure"><div class="label">Cotă</div><div class="value num">${Math.round(d.cota * 100)}%</div></div>
        <div class="figure"><div class="label">Impozit de plată</div><div class="value num">${lei(d.impozitDePlata)}<small>lei</small></div><div class="hint">rotunjit la leu</div></div>
        <div class="figure"><div class="label">Plafon micro</div><div class="value num">${Math.round(d.procentPlafon * 100)}%</div><div class="meter ${pct >= 1 ? 'err' : pct >= 0.8 ? 'warn' : ''}"><i style="width:${pct * 100}%"></i></div><div class="hint">${lei(d.cifraAfaceri)} din ${lei(d.plafonLei)} lei</div></div>
      </div>
      <hr class="sep">
      <div class="table-wrap"><table><tbody>
        <tr><td>Baza impozabilă cumulată de la 1 ianuarie</td><td class="n">${lei(d.bazaCum)}</td></tr>
        <tr><td>Impozit cumulat (${Math.round(d.cota * 100)}%)</td><td class="n">${lei(d.impozitCumulat)}</td></tr>
        <tr><td>Impozit declarat în trimestrele anterioare</td><td class="n">${lei(d.impozitTrimPrec)}</td></tr>
        <tr class="total"><td>Impozit de plată pentru T${st.t} ${st.an}</td><td class="n">${lei(d.impozitDePlata)}</td></tr>
      </tbody></table></div>
      <p class="muted small">Baza = venituri din clasa 7, fără veniturile excluse prin art. 53 din Codul fiscal (lista se poate ajusta în Setări). Plafonul se compară cu cifra de afaceri, la cursul de ${lei(s.cursEUR)} lei/euro din Setări.</p>
      ${pasi([
        'Închide ultima lună a trimestrului din Registre → Închiderea lunii, ca nota de impozit (698 = 4418) să fie înregistrată.',
        'Descarcă formularul D100 de pe anaf.ro (Declarații electronice → Descărcare declarații) și deschide-l în Adobe Reader.',
        `Alege obligația „Impozit pe veniturile microîntreprinderilor”, perioada T${st.t} ${st.an}, și completează suma de ${lei(d.impozitDePlata)} lei.`,
        'Validează, semnează și depune-l în SPV sau pe e-guvernare.ro. Termenul este pe 25 a lunii de după trimestru.',
        'Plătește suma în contul unic al ANAF, apoi înregistrează plata din Operațiuni → Plată impozit micro.',
      ])}
      <div class="row" style="margin-top:14px"><button class="btn" data-go="#operatii">Înregistrează plata</button><button class="btn" data-ai="Explică-mi pas cu pas cum completez și depun D100 pentru trimestrul ${st.t} ${st.an}. Impozitul calculat este ${d.impozitDePlata} lei.">${icon('spark')}Ghidează-mă</button></div>
    </section>`;
  } else {
    const p = estimareProfit(ctx.note, s, st.an, st.t);
    el.innerHTML = `<section class="panel">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">Impozit pe profit — estimare cumulată</h2>${selTrim(rer)}</div>
      <div class="table-wrap" style="margin-top:14px"><table><tbody>
        <tr><td>Venituri de la 1 ianuarie</td><td class="n">${lei(p.venituri)}</td></tr>
        <tr><td>Cheltuieli de la 1 ianuarie</td><td class="n">${lei(p.cheltuieli)}</td></tr>
        <tr><td>Rezultat contabil</td><td class="n">${lei(p.rezultat)}</td></tr>
        <tr><td>+ Amenzi și penalități (nedeductibile)</td><td class="n">${lei(p.amenzi)}</td></tr>
        <tr><td>Profit impozabil estimat</td><td class="n">${lei(p.profitImpozabil)}</td></tr>
        <tr class="total"><td>Impozit pe profit cumulat (${Math.round(p.cota * 100)}%)</td><td class="n">${lei(p.impozit)}</td></tr>
      </tbody></table></div>
      <div class="tip warn" style="margin-top:12px"><span class="dot"></span><div class="grow"><p>Aceasta este o estimare. Calculul final (D101) include ajustări pe care aplicația nu le face singură: limita de deductibilitate a protocolului (${lei(p.protocol)} lei înregistrați), sponsorizări, pierderi fiscale din anii trecuți, rezerva legală. Verifică-l cu un contabil autorizat.</p></div></div>
      ${pasi([
        'Plățile anticipate trimestriale se declară în D100, până pe 25 a lunii de după trimestrele 1–3.',
        'Declarația anuală D101 se depune până pe 25 iunie a anului următor.',
        'După plată, înregistrează-o din Operațiuni → Plată impozit pe profit.',
      ])}
      <div class="row" style="margin-top:14px"><button class="btn" data-ai="Explică-mi cum se calculează impozitul pe profit pentru firma mea și ce cheltuieli nedeductibile ar trebui să verific.">${icon('spark')}Ghidează-mă</button></div>
    </section>`;
  }
}

function tva(el, ctx, rer) {
  const s = ctx.setari;
  const lunar = s.perioadaTVA === 'luna';
  const per = lunar ? st.luna : `T${st.t}`;
  const d = d300(ctx.note, s, st.an, per);
  const rand = (k, o) => o[k] ? `<tr><td>Cota ${k}%</td><td class="n">${lei(o[k].baza)}</td><td class="n">${lei(o[k].tva)}</td></tr>` : '';
  setTimeout(() => {
    const l = document.getElementById('d-luna');
    if (l) l.onchange = (ev) => { st.luna = Number(ev.target.value); rer(); };
  });
  el.innerHTML = `<section class="panel">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">D300 — decont de TVA</h2>
      ${lunar ? `<div class="row"><select id="d-luna" style="width:auto">${LUNI.map((l, i) => `<option value="${i + 1}" ${st.luna === i + 1 ? 'selected' : ''}>${l}</option>`).join('')}</select><select id="d-an" style="width:auto">${[st.an - 1, st.an].map((y) => `<option ${y === st.an ? 'selected' : ''}>${y}</option>`).join('')}</select></div>` : selTrim(rer)}</div>
    <h3 style="margin-top:18px">TVA colectată — din facturile emise</h3>
    <div class="table-wrap"><table><thead><tr><th>Cotă</th><th class="n">Bază</th><th class="n">TVA</th></tr></thead><tbody>${rand('21', d.colectata)}${rand('11', d.colectata)}<tr class="total"><td>Total</td><td></td><td class="n">${lei(d.totalColectata)}</td></tr></tbody></table></div>
    <h3 style="margin-top:18px">TVA deductibilă — din facturile primite</h3>
    <div class="table-wrap"><table><thead><tr><th>Cotă</th><th class="n">Bază</th><th class="n">TVA</th></tr></thead><tbody>${rand('21', d.deductibila)}${rand('11', d.deductibila)}<tr class="total"><td>Total</td><td></td><td class="n">${lei(d.totalDeductibila)}</td></tr></tbody></table></div>
    <div class="figures" style="margin-top:18px"><div class="figure"><div class="label">TVA de plată</div><div class="value num">${lei(d.dePlata)}<small>lei</small></div></div><div class="figure"><div class="label">TVA de recuperat</div><div class="value num">${lei(d.deRecuperat)}<small>lei</small></div></div></div>
    <p class="muted small">Operațiunile intracomunitare, taxarea inversă și achizițiile de servicii din afara țării (ex. abonamente software din UE/SUA) au rânduri speciale în D300 și nu sunt calculate automat în această versiune. Întreabă asistentul dacă ai astfel de facturi.</p>
    ${pasi([
      'Închide luna (sau ultima lună a trimestrului) din Registre, ca TVA-ul să fie regularizat automat (4427 = 4426, diferența în 4423 sau 4424).',
      'Descarcă D300 de pe anaf.ro și transcrie bazele și TVA-ul pe rândurile corespunzătoare fiecărei cote.',
      'Depune-l până pe 25 a lunii următoare perioadei și, dacă e cazul, D394 până pe 30.',
      'Plătește TVA-ul și înregistrează plata din Operațiuni → Plată TVA.',
    ])}
    <div class="row" style="margin-top:14px"><button class="btn" data-ai="Ajută-mă să completez D300 pentru perioada ${per} ${st.an}. TVA colectată ${d.totalColectata} lei, TVA deductibilă ${d.totalDeductibila} lei. Pe ce rânduri trec sumele?">${icon('spark')}Ghidează-mă</button></div>
  </section>`;
}

function saft(el, ctx, rer) {
  const s = ctx.setari;
  const lunar = s.platitorTVA && s.perioadaTVA === 'luna';
  const p = lunar ? lunaInterval(st.an, st.luna) : trimInterval(st.an, st.t);
  const nrNote = ctx.note.filter((n) => n.data >= p.from && n.data <= p.to).length;
  el.innerHTML = `<section class="panel">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">D406 — fișierul standard de control fiscal (SAF-T)</h2>${lunar ? '' : selTrim(rer)}</div>
    <p style="max-width:68ch">SRL-urile mici depun D406 ${lunar ? 'lunar' : 'trimestrial'}, până în ultima zi a lunii de după perioadă. Fișierul conține planul de conturi, soldurile, partenerii și toate notele contabile din perioadă.</p>
    <div class="tip warn"><span class="dot"></span><div class="grow"><p>Fișierul generat este o schiță XML pe structura SAF-T. Înainte de depunere trebuie validat cu DUKIntegrator (aplicația oficială ANAF), care semnalează orice câmp lipsă sau neconform. Corecturile se fac în aplicație și se generează din nou.</p></div></div>
    <ul class="list" style="margin-top:8px">
      <li><div class="grow"><div class="t">Perioada</div></div><div>${dataRo(p.from)} – ${dataRo(p.to)}</div></li>
      <li><div class="grow"><div class="t">Note contabile incluse</div></div><div class="num">${nrNote}</div></li>
      <li><div class="grow"><div class="t">Parteneri</div></div><div class="num">${ctx.parteneri.length}</div></li>
      <li><div class="grow"><div class="t">CUI firmă</div></div><div>${s.cui ? e(s.cui) : '<span class="badge err">lipsește</span>'}</div></li>
    </ul>
    ${pasi([
      'Închide toate lunile din perioadă.',
      'Generează fișierul XML de mai jos.',
      'Deschide DUKIntegrator, alege declarația D406, încarcă fișierul și apasă „Validare”. Corectează erorile semnalate.',
      'Creează PDF-ul semnat din DUKIntegrator și depune-l în SPV sau pe e-guvernare.ro.',
    ])}
    <div class="row" style="margin-top:14px"><button class="btn primary" id="gen">${icon('download')}Generează XML</button><button class="btn" data-ai="Explică-mi pe înțeles ce este SAF-T (D406) și cum folosesc DUKIntegrator pentru validare.">${icon('spark')}Ghidează-mă</button></div>
  </section>`;
  $('#gen', el).onclick = () => {
    if (!s.cui) { toast('Completează CUI-ul firmei în Setări.'); return; }
    const xml = saftXML(ctx.note, s, ctx.parteneri, p.from, p.to, VERSIUNE);
    descarca(`D406_${String(s.cui).replace(/\D/g, '')}_${p.from}_${p.to}.xml`, xml, 'application/xml');
    toast('Fișierul SAF-T a fost generat.');
  };
}

async function salarii(el, ctx, rer) {
  const s = ctx.setari;
  const S = await import('./salarii.js');
  const { openSheet, closeSheet, confirma } = await import('./ui.js');
  const { tipareste, antetFirma } = await import('./v-formulare.js');
  const lst = await S.lista();
  const an = st.an, luna = st.luna;
  const { to } = lunaInterval(an, luna);
  const stat = S.statDePlata(lst, an, luna, s);
  const azi = new Date().toISOString().slice(0, 10);
  const cm = S.conditieMicro(lst, azi, s);
  const perioada = `${an}-${String(luna).padStart(2, '0')}`;
  const notaSal = ctx.note.find((n) => n.auto === 'salarii' && n.autoPerioada === perioada);
  const urm = luna === 12 ? [an + 1, 1] : [an, luna + 1];
  const termen = `25.${String(urm[1]).padStart(2, '0')}.${urm[0]}`;
  const tipNume = { cim: 'Contract de muncă', mandat: 'Contract de mandat (administrator)' };

  el.innerHTML = `
  ${s.regim === 'micro' ? `<div class="tip ${cm.ok ? 'ok' : 'err'}"><span class="dot"></span><div class="grow"><p>${cm.ok
    ? `<b>Condiția de salariat pentru micro este îndeplinită</b> (${cm.mandatOk ? 'administrator cu contract de mandat plătit cel puțin cu salariul minim' : `${cm.norme / 8 === 1 ? 'un salariat cu normă întreagă' : `normă cumulată ${cm.norme} ore/zi`}`}).`
    : `<b>Microîntreprinderea trebuie să aibă un salariat cu normă întreagă</b> (sau un administrator cu contract de mandat plătit cel puțin cu salariul minim).${cm.termen ? ` Termen: <b>${dataRo(cm.termen)}</b>.` : ''} Altfel firma trece la impozit pe profit din trimestrul respectiv.${!s.dataInfiintare ? ' Completează data înființării în Setări → Firma ca să știi termenul de 90 de zile.' : ''}`}</p></div></div>` : ''}
  <section class="panel">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">Salariați</h2><button class="btn sm primary" id="s-add">${icon('plus')}Adaugă</button></div>
    ${lst.length ? `<ul class="list" style="margin-top:10px">${lst.map((a) => `<li class="clickable" data-ang="${a.id}"><div class="grow"><div class="t">${e(a.nume)}</div>
      <div class="m">${tipNume[a.tip] || ''} · din ${dataRo(a.deLa)}${a.panaLa ? ' până pe ' + dataRo(a.panaLa) : ''} · ${a.tip === 'cim' ? (Number(a.norma) || 8) + ' ore/zi · ' : ''}brut ${lei(a.brut)} lei</div></div>
      ${a.panaLa && a.panaLa < azi ? '<span class="badge">plecat</span>' : '<span class="badge ok">activ</span>'}</li>`).join('')}</ul>`
    : '<p class="muted">Niciun salariat. Adaugă angajații (și administratorul, dacă are contract de mandat) ca aplicația să facă singură statul de plată, nota contabilă lunară și să recunoască plățile în extras.</p>'}
  </section>
  <section class="panel">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">Statul de plată</h2>
      <div class="row"><select id="d-luna" style="width:auto">${LUNI.map((l, i) => `<option value="${i + 1}" ${luna === i + 1 ? 'selected' : ''}>${l}</option>`).join('')}</select><select id="d-an" style="width:auto">${[an - 1, an, an + 1].map((y) => `<option ${y === an ? 'selected' : ''}>${y}</option>`).join('')}</select></div></div>
    ${stat.rand.length ? `<div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Salariat</th><th class="n">Brut</th><th class="n">CAS 25%</th><th class="n">CASS 10%</th><th class="n">Impozit</th><th class="n">Net</th><th class="n">CAM 2,25%</th></tr></thead><tbody>
      ${stat.rand.map((r) => `<tr><td>${e(r.nume)}${r.proportie < 100 ? ` <span class="muted small">(${r.proportie}% din lună)</span>` : ''}${r.neimpozabil ? ` <span class="muted small">· ${r.neimpozabil} lei netaxabili</span>` : ''}${r.deducere ? ` <span class="muted small">· deducere ${lei(r.deducere)}</span>` : ''}</td><td class="n">${lei(r.brut)}</td><td class="n">${lei(r.cas)}</td><td class="n">${lei(r.cass)}</td><td class="n">${lei(r.impozit)}</td><td class="n"><b>${lei(r.net)}</b></td><td class="n">${lei(r.cam)}</td></tr>`).join('')}
      </tbody><tfoot><tr class="total"><td>Total</td><td class="n">${lei(stat.tot.brut)}</td><td class="n">${lei(stat.tot.cas)}</td><td class="n">${lei(stat.tot.cass)}</td><td class="n">${lei(stat.tot.impozit)}</td><td class="n">${lei(stat.tot.net)}</td><td class="n">${lei(stat.tot.cam)}</td></tr></tfoot></table></div>
      <div class="figures" style="margin-top:12px">
        <div class="figure"><div class="label">De plătit salariaților</div><div class="value num">${lei(stat.tot.net)}<small>lei</small></div><div class="hint">transfer din bancă, de obicei până pe 10-15 ale lunii următoare</div></div>
        <div class="figure"><div class="label">De plătit la ANAF</div><div class="value num">${lei(stat.deVirat)}<small>lei</small></div><div class="hint">CAS + CASS + impozit + CAM, cu D112, până pe ${termen}</div></div>
      </div>
      <div class="tip ${notaSal ? 'ok' : ''}"><span class="dot"></span><div class="grow"><p>${notaSal ? 'Nota contabilă de salarii pentru luna aceasta e înregistrată (641 = 421, reținerile și CAM).' : 'Nota contabilă se înregistrează singură la închiderea lunii.'} Plățile din extras (salariul net și plata la ANAF) se recunosc automat.</p>
        <div class="act"><button class="btn sm" id="s-print">Tipărește statul de plată</button><button class="btn sm ghost" data-ai="Cum depun declarația D112 pentru salariile din ${LUNI[luna - 1]} ${an}? Am ${stat.rand.length} ${stat.rand.length === 1 ? 'salariat' : 'salariați'}, brut total ${stat.tot.brut} lei, de plată ${stat.deVirat} lei.">Cum depun D112?</button></div></div></div>`
    : '<p class="muted" style="margin-top:10px">Niciun salariat activ în luna aleasă. D112 se depune doar pentru lunile cu salarii sau indemnizații.</p>'}
  </section>
  <details class="panel"><summary style="cursor:pointer;font-weight:600">Calculator rapid de salariu</summary>
    <div class="fields-2" style="margin-top:10px">
      <label class="field"><span>Salariu brut (lei)</span><input type="number" id="s-brut" value="${S.salariuMinim(azi, s)}"></label>
      <label class="field"><span>Persoane în întreținere</span><input type="number" id="s-pers" value="0" min="0" max="9"></label>
    </div>
    <div id="s-out"></div>
  </details>`;

  $('#d-luna', el).onchange = (ev) => { st.luna = Number(ev.target.value); rer(); };
  $('#d-an', el).onchange = (ev) => { st.an = Number(ev.target.value); rer(); };
  const calc = () => {
    const c = S.calcul({ tip: 'cim', brut: Number($('#s-brut', el).value) || 0, persoane: Number($('#s-pers', el).value) || 0 }, azi, s);
    $('#s-out', el).innerHTML = `<div class="table-wrap"><table><tbody>
      <tr><td>Salariu brut</td><td class="n">${lei(c.brut)}</td></tr>
      ${c.neimpozabil ? `<tr><td>Sumă netaxabilă (salariul minim)</td><td class="n">${lei(c.neimpozabil)}</td></tr>` : ''}
      <tr><td>CAS 25%</td><td class="n">${lei(c.cas)}</td></tr><tr><td>CASS 10%</td><td class="n">${lei(c.cass)}</td></tr>
      ${c.deducere ? `<tr><td>Deducere personală</td><td class="n">${lei(c.deducere)}</td></tr>` : ''}
      <tr><td>Impozit 10%</td><td class="n">${lei(c.impozit)}</td></tr>
      <tr class="total"><td>Salariu net</td><td class="n">${lei(c.net)}</td></tr>
      <tr><td>CAM 2,25% (plătit de firmă)</td><td class="n">${lei(c.cam)}</td></tr>
      <tr><td><b>Cost total pentru firmă</b></td><td class="n"><b>${lei(c.cost)}</b></td></tr></tbody></table></div>`;
  };
  $('#s-brut', el).oninput = calc; $('#s-pers', el).oninput = calc; calc();

  if ($('#s-print', el)) $('#s-print', el).onclick = () => tipareste(`<div class="pf">${antetFirma(s)}<h1>Stat de plată — ${LUNI[luna - 1]} ${an}</h1>
    <table><thead><tr><th>Nr.</th><th>Nume</th><th>Brut</th><th>CAS</th><th>CASS</th><th>Impozit</th><th>Net</th><th>Semnătura</th></tr></thead><tbody>
    ${stat.rand.map((r, i) => `<tr><td>${i + 1}</td><td>${e(r.nume)}</td><td>${lei(r.brut)}</td><td>${lei(r.cas)}</td><td>${lei(r.cass)}</td><td>${lei(r.impozit)}</td><td>${lei(r.net)}</td><td></td></tr>`).join('')}
    <tr><td></td><td><b>Total</b></td><td>${lei(stat.tot.brut)}</td><td>${lei(stat.tot.cas)}</td><td>${lei(stat.tot.cass)}</td><td>${lei(stat.tot.impozit)}</td><td>${lei(stat.tot.net)}</td><td></td></tr></tbody></table>
    <p>CAM 2,25% datorat de angajator: ${lei(stat.tot.cam)} lei. Total de virat la bugetul de stat: ${lei(stat.deVirat)} lei.</p>
    <div class="pf-sem"><div>Întocmit,<br><br>______________</div><div>Administrator,<br>${e(s.administrator || '')}<br>______________</div></div></div>`);

  const editeaza = (a) => {
    const nou = !a;
    a = a || { id: 'ang-' + Date.now().toString(36), tip: 'cim', deLa: azi, brut: S.salariuMinim(azi, s), norma: 8, persoane: 0, sub26: false, functieBaza: true };
    const sh = openSheet(nou ? 'Salariat nou' : a.nume, `
      <label class="field"><span>Nume și prenume</span><input type="text" id="a-nume" value="${e(a.nume || '')}"></label>
      <label class="field"><span>Tip contract</span><select id="a-tip"><option value="cim" ${a.tip === 'cim' ? 'selected' : ''}>Contract individual de muncă</option><option value="mandat" ${a.tip === 'mandat' ? 'selected' : ''}>Contract de mandat (administrator)</option></select></label>
      <div class="fields-2">
        <label class="field"><span>Data începerii</span><input type="date" id="a-dela" value="${e(a.deLa || '')}"></label>
        <label class="field"><span>Data încetării</span><input type="date" id="a-pana" value="${e(a.panaLa || '')}"><small>Gol dacă lucrează în continuare.</small></label>
        <label class="field"><span>Salariu brut lunar (lei)</span><input type="number" step="1" id="a-brut" value="${e(a.brut)}"><small>Salariul minim acum: ${lei(S.salariuMinim(azi, s))} lei.</small></label>
        <label class="field" id="a-norma-f"><span>Normă (ore pe zi)</span><select id="a-norma">${[8, 6, 4, 2].map((h) => `<option value="${h}" ${Number(a.norma || 8) === h ? 'selected' : ''}>${h === 8 ? '8 ore — normă întreagă' : h + ' ore — parțial'}</option>`).join('')}</select></label>
        <label class="field" id="a-pers-f"><span>Persoane în întreținere</span><input type="number" min="0" max="9" id="a-pers" value="${e(a.persoane || 0)}"></label>
      </div>
      <div id="a-chk"><label class="check"><input type="checkbox" id="a-sub26" ${a.sub26 ? 'checked' : ''}><span>Are sub 26 de ani (deducere personală mai mare)</span></label>
      <label class="check"><input type="checkbox" id="a-baza" ${a.functieBaza !== false ? 'checked' : ''}><span>Aici are funcția de bază (primește deducerea personală)</span></label></div>
      <p class="muted small" id="a-info"></p>`,
      `<div class="row end">${nou ? '' : '<button class="btn" id="a-del">Șterge</button>'}<button class="btn primary" id="a-save">Salvează</button></div>`);
    const q = (x) => sh.querySelector(x);
    const upd = () => {
      const m = q('#a-tip').value === 'mandat';
      q('#a-norma-f').hidden = m; q('#a-pers-f').hidden = m; q('#a-chk').hidden = m;
      const c = S.calcul({ tip: q('#a-tip').value, brut: Number(q('#a-brut').value) || 0, persoane: Number(q('#a-pers').value) || 0, sub26: q('#a-sub26').checked, functieBaza: q('#a-baza').checked }, azi, s);
      q('#a-info').textContent = `Net: ${lei(c.net)} lei · cost total firmă: ${lei(c.cost)} lei pe lună.${m ? ' Contractul de mandat se înregistrează la ANAF prin D112, nu în REVISAL.' : ' Contractul de muncă se înregistrează în REVISAL cel târziu cu o zi înainte de începerea activității.'}`;
    };
    sh.addEventListener('input', upd); sh.addEventListener('change', upd); upd();
    q('#a-save').onclick = async () => {
      const x = { ...a, nume: q('#a-nume').value.trim(), tip: q('#a-tip').value, deLa: q('#a-dela').value, panaLa: q('#a-pana').value || '', brut: Number(q('#a-brut').value) || 0,
        norma: Number(q('#a-norma').value) || 8, persoane: Number(q('#a-pers').value) || 0, sub26: q('#a-sub26').checked, functieBaza: q('#a-baza').checked };
      if (!x.nume || !x.deLa || !x.brut) { toast('Completează numele, data începerii și salariul.'); return; }
      const nl = nou ? [...lst, x] : lst.map((y) => (y.id === x.id ? x : y));
      await S.salveaza(nl, [x.deLa, a.deLa].filter(Boolean).sort()[0]);
      if (!s.areSalariati) { const { saveSetari } = await import('./engine.js'); await saveSetari({ ...s, areSalariati: true }); }
      closeSheet(); toast('Salvat. Statul de plată și notele se actualizează singure.');
      const auto = await import('./auto.js'); await auto.inchideriAutomate(); await ctx.reload();
    };
    if (q('#a-del')) q('#a-del').onclick = async () => {
      if (!(await confirma(`Ștergi ${a.nume}? Dacă a plecat din firmă, completează mai bine data încetării, ca lunile lucrate să rămână în contabilitate.`, 'Șterge'))) return;
      await S.salveaza(lst.filter((y) => y.id !== a.id), a.deLa);
      const auto = await import('./auto.js'); await auto.inchideriAutomate(); await ctx.reload();
    };
  };
  $('#s-add', el).onclick = () => editeaza(null);
  $$('[data-ang]', el).forEach((li) => (li.onclick = () => editeaza(lst.find((a) => a.id === li.dataset.ang))));
}
