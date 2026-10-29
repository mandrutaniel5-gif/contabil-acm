import { e, $, $$, icon, toast, descarca } from './ui.js';
import { lei, r2, dataRo, LUNI, trimDinLuna, trimInterval, lunaInterval, reguli, iso } from './engine.js';
import { termene, zilePana, d100Micro, estimareProfit, d300, calculSalariu, saftXML } from './declaratii.js';
import { VERSIUNE } from './version.js';

const _n = new Date(); const _prev = _n.getMonth() === 0 ? 12 : _n.getMonth(); // luna anterioară, 1-12
const st = { an: _n.getMonth() === 0 ? _n.getFullYear() - 1 : _n.getFullYear(), t: Math.ceil(_prev / 3), luna: _prev };

export async function render(main, ctx, params) {
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
  ({ calendar, impozit, tva, saft, salarii }[tab] || calendar)(dv, ctx, rerender);
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

function salarii(el, ctx) {
  const s = ctx.setari;
  el.innerHTML = `<section class="panel" style="max-width:760px">
    <h2>Calculator salariu și D112</h2>
    ${s.areSalariati ? '' : '<p class="muted">Firma nu are salariați în Setări. D112 se depune doar pentru lunile în care se plătesc salarii sau indemnizații.</p>'}
    <div class="fields-2">
      <label class="field"><span>Salariu brut (lei)</span><input type="number" id="s-brut" value="4050"></label>
      <label class="field"><span>Deducere personală (lei)</span><input type="number" id="s-ded" value="0"><small>Depinde de salariu și de persoanele în întreținere. Valoarea exactă o confirmă asistentul sau contabilul.</small></label>
    </div>
    <div id="s-out"></div>
    <div class="tip warn"><span class="dot"></span><div class="grow"><p>Calculul nu include facilitățile speciale (ex. suma netaxabilă pentru salariul minim, scutirile pentru persoanele cu dizabilități). Pentru angajați reali, statul de plată și D112 se întocmesc de obicei cu un soft de salarizare sau de către contabil.</p></div></div>
  </section>`;
  const calc = () => {
    const c = calculSalariu(Number($('#s-brut', el).value) || 0, $('#s-ded', el).value, s);
    $('#s-out', el).innerHTML = `<div class="table-wrap"><table><tbody>
      <tr><td>Salariu brut</td><td class="n">${lei(c.brut)}</td><td class="muted">641 = 421</td></tr>
      <tr><td>CAS 25% (reținut din salariu)</td><td class="n">${lei(c.cas)}</td><td class="muted">421 = 4315</td></tr>
      <tr><td>CASS 10% (reținut din salariu)</td><td class="n">${lei(c.cass)}</td><td class="muted">421 = 4316</td></tr>
      <tr><td>Impozit 10%</td><td class="n">${lei(c.impozit)}</td><td class="muted">421 = 444</td></tr>
      <tr class="total"><td>Salariu net</td><td class="n">${lei(c.net)}</td><td></td></tr>
      <tr><td>CAM 2,25% (plătit de firmă)</td><td class="n">${lei(c.cam)}</td><td class="muted">6461 = 436</td></tr>
      <tr><td><b>Cost total pentru firmă</b></td><td class="n"><b>${lei(c.costTotal)}</b></td><td></td></tr>
    </tbody></table></div>`;
  };
  el.addEventListener('input', calc); calc();
}
