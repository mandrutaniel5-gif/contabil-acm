import { e, $, $$, icon, withLoad, toast, descarca, confirma, eqHTML } from './ui.js';
import { db, uid } from './db.js';
import {
  lei, r2, dataRo, LUNI, lunaInterval, trimInterval, balanta, verificaBalanta, fisaCont, registruCasa,
  inchideLuna, amortizareLuna, CONT_AMORTIZARE, reguli,
} from './engine.js';
import { cont, toateConturile, NUME_CLASE } from './conturi.js';
import { notaManuala } from './v-operatii.js';

const TABS = [['jurnal', 'Registrul jurnal'], ['balanta', 'Balanța'], ['fisa', 'Fișa contului'], ['casa', 'Registrul de casă'], ['mijloace', 'Mijloace fixe'], ['inchidere', 'Închiderea lunii']];

const st = { tipPer: 'luna', an: new Date().getFullYear(), luna: new Date().getMonth() + 1, t: Math.ceil((new Date().getMonth() + 1) / 3), cont: '5121' };

function interval() {
  if (st.tipPer === 'an') return { from: `${st.an}-01-01`, to: `${st.an}-12-31`, label: `anul ${st.an}` };
  if (st.tipPer === 'trim') return { ...trimInterval(st.an, st.t), label: `T${st.t} ${st.an}` };
  return { ...lunaInterval(st.an, st.luna), label: `${LUNI[st.luna - 1]} ${st.an}` };
}

function selPerioada() {
  return `<div class="row no-print">
    <div class="seg">${[['luna', 'Lună'], ['trim', 'Trimestru'], ['an', 'An']].map(([k, l]) => `<button data-per="${k}" aria-pressed="${st.tipPer === k}">${l}</button>`).join('')}</div>
    ${st.tipPer === 'luna' ? `<select id="p-luna" style="width:auto">${LUNI.map((l, i) => `<option value="${i + 1}" ${st.luna === i + 1 ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
    ${st.tipPer === 'trim' ? `<select id="p-t" style="width:auto">${[1, 2, 3, 4].map((t) => `<option value="${t}" ${st.t === t ? 'selected' : ''}>T${t}</option>`).join('')}</select>` : ''}
    <select id="p-an" style="width:auto">${[st.an - 1, st.an, st.an + 1].filter((v, i, a) => a.indexOf(v) === i).map((y) => `<option ${y === st.an ? 'selected' : ''}>${y}</option>`).join('')}</select>
  </div>`;
}

export async function render(main, ctx, params) {
  const tab = params[0] || 'jurnal';
  if (tab === 'mijloace' && params[1] === 'nou') return mijlocNou(main, ctx, params[2]);
  main.innerHTML = `
  <div class="page-head">
    <div><h1>Registre</h1><p class="sub">Se completează singure din documente și operațiuni. Le poți tipări sau exporta oricând.</p></div>
    <div class="row"><button class="btn" id="print">${icon('print')}Tipărește</button></div>
  </div>
  <div class="seg no-print" style="margin-bottom:16px">${TABS.map(([k, l]) => `<button data-go="#registre/${k}" aria-pressed="${tab === k}">${l}</button>`).join('')}</div>
  <div id="reg"></div>`;
  $('#print', main).onclick = () => window.print();
  const reg = $('#reg', main);
  const rerender = () => render(main, ctx, params);
  ({ jurnal, balanta: vBalanta, fisa, casa, mijloace, inchidere }[tab] || jurnal)(reg, ctx, rerender);
  $$('[data-per]', reg).forEach((b) => (b.onclick = () => { st.tipPer = b.dataset.per; rerender(); }));
  $('#p-luna', reg) && ($('#p-luna', reg).onchange = (ev) => { st.luna = Number(ev.target.value); rerender(); });
  $('#p-t', reg) && ($('#p-t', reg).onchange = (ev) => { st.t = Number(ev.target.value); rerender(); });
  $('#p-an', reg) && ($('#p-an', reg).onchange = (ev) => { st.an = Number(ev.target.value); rerender(); });
}

function antet(ctx, titlu, per) {
  return `<div style="margin-bottom:14px"><div class="muted small">${e(ctx.setari.nume)}${ctx.setari.cui ? ` · CUI ${e(ctx.setari.cui)}` : ''}</div><h2 style="margin:2px 0 0">${e(titlu)} — ${e(per.label)}</h2></div>`;
}

function jurnal(el, ctx) {
  const p = interval();
  const note = ctx.note.filter((n) => n.data >= p.from && n.data <= p.to);
  const tot = r2(note.flatMap((n) => n.linii).reduce((s, l) => s + l.suma, 0));
  el.innerHTML = `<section class="panel">
    <div class="row" style="justify-content:space-between;align-items:flex-start">${antet(ctx, 'Registrul jurnal', p)}${selPerioada()}</div>
    ${note.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Nr.</th><th>Data</th><th>Document</th><th>Explicație</th><th>Debit = Credit</th><th class="n">Sumă</th></tr></thead>
      <tbody>${note.map((n) => n.linii.map((l, i) => `<tr class="row-click" data-n="${n.id}">
        <td>${i ? '' : n.nr}</td><td>${i ? '' : dataRo(n.data)}</td><td>${i ? '' : e(n.document || '')}</td>
        <td>${i ? `<span class="muted">${e(l.expl || '')}</span>` : e(n.explicatie || '')}${!i && n.auto ? ' <span class="badge accent">automat</span>' : ''}</td>
        <td>${eqHTML(l.d, l.c, null, cont)}</td><td class="n">${lei(l.suma)}</td></tr>`).join('')).join('')}
        <tr class="total"><td colspan="5">Total rulaj</td><td class="n">${lei(tot)}</td></tr></tbody></table></div>
      <div class="row no-print" style="margin-top:12px"><button class="btn sm" id="csv">${icon('download')}Export CSV</button></div>`
      : '<div class="empty"><h3>Nicio înregistrare în perioada aleasă</h3><p>Adaugă documente sau operațiuni — apar aici automat.</p></div>'}
  </section>`;
  $$('[data-n]', el).forEach((tr) => (tr.onclick = () => notaManuala(ctx, ctx.note.find((n) => n.id === tr.dataset.n))));
  $('#csv', el) && ($('#csv', el).onclick = () => {
    const rows = [['Nr', 'Data', 'Document', 'Explicatie', 'Debit', 'Credit', 'Suma']];
    for (const n of note) for (const l of n.linii) rows.push([n.nr, n.data, n.document || '', l.expl || n.explicatie || '', l.d, l.c, l.suma.toFixed(2)]);
    descarca(`registru-jurnal-${p.from}_${p.to}.csv`, '﻿' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\n'), 'text/csv');
  });
}

function vBalanta(el, ctx) {
  const p = interval();
  const b = balanta(ctx.note, ctx.setari, p.from, p.to);
  const probleme = verificaBalanta(b);
  const clase = [...new Set(b.rows.map((r) => r.cod[0]))];
  const cell = (v) => `<td class="n">${v ? lei(v) : ''}</td>`;
  el.innerHTML = `<section class="panel">
    <div class="row" style="justify-content:space-between;align-items:flex-start">${antet(ctx, 'Balanța de verificare', p)}${selPerioada()}</div>
    ${probleme.length ? probleme.map((x) => `<div class="tip ${x.grav === 'eroare' ? 'err' : 'warn'}"><span class="dot"></span><div class="grow"><p>${e(x.text)}</p></div></div>`).join('') : b.rows.length ? '<div class="tip ok"><span class="dot"></span><div class="grow"><p>Balanța este echilibrată și nu are solduri neobișnuite.</p></div></div>' : ''}
    ${b.rows.length ? `<div class="table-wrap"><table>
      <thead><tr><th rowspan="2">Cont</th><th rowspan="2">Denumire</th><th class="n" colspan="2">Sold inițial an</th><th class="n" colspan="2">Rulaje precedente</th><th class="n" colspan="2">Rulaje perioadă</th><th class="n" colspan="2">Total sume</th><th class="n" colspan="2">Sold final</th></tr>
      <tr>${'<th class="n">Debit</th><th class="n">Credit</th>'.repeat(5)}</tr></thead>
      <tbody>${clase.map((c) => `<tr class="group"><td colspan="12">Clasa ${c} — ${NUME_CLASE[c] || ''}</td></tr>` + b.rows.filter((r) => r.cod[0] === c).map((r) => `<tr class="row-click" data-fisa="${r.cod}"><td><b>${r.cod}</b></td><td>${e(r.nume)}</td>${cell(r.sid)}${cell(r.sic)}${cell(r.rpd)}${cell(r.rpc)}${cell(r.rcd)}${cell(r.rcc)}${cell(r.tsd)}${cell(r.tsc)}${cell(r.sfd)}${cell(r.sfc)}</tr>`).join('')).join('')}
      <tr class="total"><td colspan="2">Total</td>${['sid', 'sic', 'rpd', 'rpc', 'rcd', 'rcc', 'tsd', 'tsc', 'sfd', 'sfc'].map((k) => `<td class="n">${lei(b.tot[k])}</td>`).join('')}</tr></tbody></table></div>
      <p class="muted small no-print">Apasă pe un cont ca să vezi fișa lui. Totalurile de pe fiecare pereche debit/credit trebuie să fie egale.</p>
      <div class="row no-print"><button class="btn sm" id="csv">${icon('download')}Export CSV</button><button class="btn sm" data-ai="Uită-te pe balanța mea de verificare și explică-mi pe înțeles ce înseamnă soldurile și dacă vezi ceva în neregulă.">${icon('spark')}Explică-mi balanța</button></div>`
      : '<div class="empty"><h3>Nu există încă rulaje</h3></div>'}
  </section>`;
  $$('[data-fisa]', el).forEach((tr) => (tr.onclick = () => { st.cont = tr.dataset.fisa; location.hash = '#registre/fisa'; }));
  $('#csv', el) && ($('#csv', el).onclick = () => {
    const rows = [['Cont', 'Denumire', 'SI D', 'SI C', 'RP D', 'RP C', 'RC D', 'RC C', 'TS D', 'TS C', 'SF D', 'SF C']];
    for (const r of b.rows) rows.push([r.cod, r.nume, r.sid, r.sic, r.rpd, r.rpc, r.rcd, r.rcc, r.tsd, r.tsc, r.sfd, r.sfc].map((x) => typeof x === 'number' ? x.toFixed(2) : x));
    descarca(`balanta-${p.from}_${p.to}.csv`, '﻿' + rows.map((r) => r.map((x) => `"${x}"`).join(';')).join('\n'), 'text/csv');
  });
}

function fisa(el, ctx, rerender) {
  const p = interval();
  const f = fisaCont(ctx.note, ctx.setari, st.cont, p.from, p.to);
  const c = cont(st.cont);
  const folosite = new Set(ctx.note.flatMap((n) => n.linii.flatMap((l) => [l.d, l.c])));
  const opts = toateConturile().filter((x) => folosite.has(x.cod) || x.cod === st.cont);
  el.innerHTML = `<section class="panel">
    <div class="row" style="justify-content:space-between;align-items:flex-start">${antet(ctx, `Fișa contului ${c.cod}`, p)}${selPerioada()}</div>
    <label class="field no-print" style="max-width:460px"><span>Contul</span><select id="f-cont">${opts.map((x) => `<option value="${x.cod}" ${x.cod === st.cont ? 'selected' : ''}>${x.cod} · ${e(x.nume)}</option>`).join('')}</select><small>${e(c.ajutor)}</small></label>
    <div class="table-wrap"><table><thead><tr><th>Data</th><th>Nota</th><th>Document</th><th>Explicație</th><th>Cont corespondent</th><th class="n">Debit</th><th class="n">Credit</th><th class="n">Sold</th></tr></thead>
    <tbody><tr class="group"><td colspan="7">Sold la începutul perioadei</td><td class="n">${lei(f.soldInceput)}</td></tr>
    ${f.rows.map((r) => `<tr><td>${dataRo(r.data)}</td><td>${r.nr}</td><td>${e(r.document || '')}</td><td>${e(r.explicatie || '')}</td><td>${r.contra}</td><td class="n">${r.d ? lei(r.d) : ''}</td><td class="n">${r.c ? lei(r.c) : ''}</td><td class="n">${lei(r.sold)}</td></tr>`).join('')}
    <tr class="total"><td colspan="5">Total / sold final</td><td class="n">${lei(f.rows.reduce((s, r) => s + r.d, 0))}</td><td class="n">${lei(f.rows.reduce((s, r) => s + r.c, 0))}</td><td class="n">${lei(f.soldFinal)}</td></tr></tbody></table></div>
    <p class="muted small">Sold pozitiv = sold debitor; sold negativ = sold creditor.</p>
  </section>`;
  $('#f-cont', el).onchange = (ev) => { st.cont = ev.target.value; rerender(); };
}

function casa(el, ctx) {
  const p = interval();
  const zile = registruCasa(ctx.note, ctx.setari, p.from, p.to);
  el.innerHTML = `<section class="panel">
    <div class="row" style="justify-content:space-between;align-items:flex-start">${antet(ctx, 'Registrul de casă', p)}${selPerioada()}</div>
    ${zile.length ? zile.map((z) => `
      <h3 style="margin-top:14px">${dataRo(z.data)}</h3>
      <div class="table-wrap"><table><thead><tr><th>Nr.</th><th>Document</th><th>Explicație</th><th class="n">Încasări</th><th class="n">Plăți</th></tr></thead><tbody>
      <tr class="group"><td colspan="3">Sold din ziua precedentă</td><td class="n" colspan="2">${lei(z.soldInitial)}</td></tr>
      ${z.rows.map((r) => `<tr><td>${r.nr}</td><td>${e(r.document || '')}</td><td>${e(r.explicatie || '')}</td><td class="n">${r.d ? lei(r.d) : ''}</td><td class="n">${r.c ? lei(r.c) : ''}</td></tr>`).join('')}
      <tr class="total"><td colspan="3">Total zi</td><td class="n">${lei(z.inc)}</td><td class="n">${lei(z.pl)}</td></tr>
      <tr><td colspan="3"><b>Sold final</b></td><td class="n" colspan="2"><b style="color:${z.soldFinal < 0 ? 'var(--err)' : 'inherit'}">${lei(z.soldFinal)}</b></td></tr></tbody></table></div>`).join('')
      : '<div class="empty"><h3>Nicio mișcare de numerar în perioada aleasă</h3><p>Plățile și încasările cash apar aici automat. Soldul casei nu poate fi niciodată negativ.</p></div>'}
  </section>`;
}

function mijloace(el, ctx) {
  const an = st.an;
  const rows = ctx.mijloace.map((m) => {
    let amortizat = 0;
    const [y0] = m.dataPIF.split('-').map(Number);
    for (let y = y0; y <= an; y++) for (let l = 1; l <= 12; l++) amortizat += amortizareLuna(m, y, l);
    return { ...m, amortizat: r2(amortizat), ramas: r2(m.valoare - amortizat), lunar: r2(m.valoare / m.durataLuni) };
  });
  el.innerHTML = `<section class="panel">
    <div class="row" style="justify-content:space-between">${antet(ctx, 'Registrul mijloacelor fixe', { label: `la 31.12.${an}` })}<button class="btn sm primary no-print" data-go="#registre/mijloace/nou">${icon('plus')}Adaugă mijloc fix</button></div>
    <p class="muted small">Bunurile de peste ${lei(reguli(ctx.setari).mijlocFixMin)} lei folosite mai mult de un an. Amortizarea lunară se înregistrează automat la închiderea lunii, începând cu luna de după punerea în funcțiune.</p>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Denumire</th><th>Cont</th><th>Pus în funcțiune</th><th class="n">Durată</th><th class="n">Valoare</th><th class="n">Amortizare lunară</th><th class="n">Amortizat</th><th class="n">Valoare rămasă</th><th></th></tr></thead>
      <tbody>${rows.map((m) => `<tr><td>${e(m.denumire)}</td><td>${m.cont}</td><td>${dataRo(m.dataPIF)}</td><td class="n">${m.durataLuni} luni</td><td class="n">${lei(m.valoare)}</td><td class="n">${lei(m.lunar)}</td><td class="n">${lei(m.amortizat)}</td><td class="n">${lei(m.ramas)}</td><td><button class="btn sm ghost danger no-print" data-del="${m.id}">Șterge</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><h3>Niciun mijloc fix</h3><p>Când înregistrezi o cheltuială pe contul 2131 sau 214, aplicația te aduce aici să îi setezi amortizarea.</p></div>'}
  </section>`;
  $$('[data-del]', el).forEach((b) => (b.onclick = async () => {
    if (!(await confirma('Ștergi mijlocul fix? Amortizarea deja înregistrată în lunile închise rămâne până le închizi din nou.', 'Șterge'))) return;
    await db.del('mijloace', b.dataset.del); await ctx.reload(); toast('Mijloc fix șters.');
  }));
}

async function mijlocNou(main, ctx, docId) {
  const d = docId ? ctx.documente.find((x) => x.id === docId) : null;
  const valoare = d ? (ctx.setari.platitorTVA ? r2(d.total - (d.tva || 0) * (d.tvaDeductibil ?? 100) / 100) : d.total) : '';
  main.innerHTML = `
  <div class="page-head"><div><button class="btn ghost sm" data-go="#registre/mijloace" style="padding-left:0">‹ Mijloace fixe</button><h1>Mijloc fix nou</h1></div></div>
  <section class="panel" style="max-width:720px">
    <div class="tip"><span class="dot"></span><div class="grow"><p>Durata de folosire vine din Catalogul mijloacelor fixe (HG 2139/2004). Pentru calculatoare și echipamente IT se folosesc de obicei 2–4 ani (24–48 luni). Dacă nu ești sigur, întreabă asistentul.</p><div class="act"><button class="btn sm ghost" data-ai="Ce durată de amortizare să aleg pentru ${e(d?.descriere || 'un echipament IT')}, conform Catalogului mijloacelor fixe?">Întreabă asistentul</button></div></div></div>
    <label class="field"><span>Denumire</span><input type="text" id="m-den" value="${e(d?.descriere || '')}"></label>
    <div class="fields-3">
      <label class="field"><span>Cont</span><select id="m-cont">${['2131', '214', '2133', '2051'].map((c) => `<option value="${c}" ${d?.cont === c ? 'selected' : ''}>${c} · ${e(cont(c).nume)}</option>`).join('')}</select></label>
      <label class="field"><span>Valoare de intrare (lei)</span><input type="number" step="0.01" id="m-val" value="${e(valoare)}"></label>
      <label class="field"><span>Durată (luni)</span><input type="number" id="m-dur" value="36" min="1"></label>
    </div>
    <label class="field" style="max-width:240px"><span>Data punerii în funcțiune</span><input type="date" id="m-pif" value="${e(d?.data || new Date().toISOString().slice(0, 10))}"></label>
    <p class="muted small" id="m-calc"></p>
    <div class="row end"><button class="btn" data-go="#registre/mijloace">Renunță</button><button class="btn primary" id="m-save">Salvează</button></div>
  </section>`;
  const q = (x) => $(x, main);
  const calc = () => { const v = Number(q('#m-val').value), n = Number(q('#m-dur').value); q('#m-calc').textContent = v && n ? `Amortizare lunară: ${lei(v / n)} lei, timp de ${n} luni (${(n / 12).toFixed(1).replace('.0', '')} ani).` : ''; };
  main.addEventListener('input', calc); calc();
  q('#m-save').onclick = async () => {
    const m = { id: uid(), denumire: q('#m-den').value.trim(), cont: q('#m-cont').value, contAmort: CONT_AMORTIZARE[q('#m-cont').value], valoare: r2(q('#m-val').value), durataLuni: Number(q('#m-dur').value), dataPIF: q('#m-pif').value, docId: d?.id || null };
    if (!m.denumire || !m.valoare || !m.durataLuni || !m.dataPIF) { toast('Completează toate câmpurile.'); return; }
    await db.put('mijloace', m); await ctx.reload(); toast('Mijloc fix adăugat.'); location.hash = '#registre/mijloace';
  };
}

function inchidere(el, ctx, rerender) {
  const an = st.an;
  const lunaCur = new Date().getFullYear() === an ? new Date().getMonth() + 1 : 12;
  const stare = (l) => {
    const p = `${an}-${String(l).padStart(2, '0')}`;
    const misc = ctx.note.some((n) => n.data.startsWith(p) && !n.auto);
    const auto = ctx.note.filter((n) => n.autoPerioada === p);
    return { p, misc, inchisa: auto.some((n) => n.auto === 'inchidere'), auto };
  };
  el.innerHTML = `<section class="panel">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div><h2>Închiderea lunii — ${an}</h2>
    <p class="muted" style="margin-top:-4px;max-width:66ch">La finalul fiecărei luni, după ce ai introdus toate documentele și extrasele, apasă „Închide luna”. Aplicația înregistrează automat amortizarea, regularizarea TVA, impozitul trimestrial și închide veniturile și cheltuielile în contul de profit (121). Poți închide din nou oricând — notele automate se refac, fără dubluri.</p></div>
    <select id="p-an" style="width:auto">${[an - 1, an, an + 1].map((y) => `<option ${y === an ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
    <ul class="list">${LUNI.map((nume, i) => {
      const l = i + 1, s = stare(l);
      const viitor = l > lunaCur;
      return `<li><div class="grow"><div class="t">${nume[0].toUpperCase() + nume.slice(1)}</div><div class="m">${s.inchisa ? `Închisă · ${s.auto.length} note automate` : s.misc ? 'Are înregistrări, neînchisă' : 'Fără înregistrări'}</div></div>
        ${s.inchisa ? '<span class="badge ok">închisă</span>' : s.misc ? '<span class="badge warn">deschisă</span>' : ''}
        <button class="btn sm ${s.inchisa ? '' : 'primary'}" data-close="${l}" ${viitor ? 'disabled' : ''}>${s.inchisa ? 'Închide din nou' : 'Închide luna'}</button></li>`;
    }).join('')}</ul>
  </section>`;
  $$('[data-close]', el).forEach((b) => (b.onclick = async (ev) => {
    const l = Number(b.dataset.close);
    const create = await withLoad(() => inchideLuna(an, l), ev.currentTarget);
    await ctx.reload();
    toast(`${LUNI[l - 1][0].toUpperCase() + LUNI[l - 1].slice(1)} închisă: ${create.length === 1 ? 'o notă automată' : `${create.length} note automate`}.`);
  }));
}
