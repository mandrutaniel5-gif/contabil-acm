// Situații financiare anuale (bilanț prescurtat + cont de profit și pierdere), registrul-inventar,
// jurnalele de vânzări/cumpărări și închiderea exercițiului.
import { e, $, $$, icon, withLoad, toast, descarca } from './ui.js';
import { db } from './db.js';
import { lei, r2, dataRo, balanta, salveazaNota, amortizareLuna, LUNI } from './engine.js';
import { cont } from './conturi.js';

const pref = (c, ...p) => p.some((x) => c.startsWith(x));

/** Rulajele conturilor de venituri și cheltuieli pe an, fără notele de închidere. */
function rulaje67(note, an) {
  const m = {};
  for (const n of note) {
    if (!n.data.startsWith(String(an)) || n.auto === 'inchidere') continue;
    for (const l of n.linii) {
      if (/^[67]/.test(l.d)) m[l.d] = r2((m[l.d] || 0) + l.suma);
      if (/^[67]/.test(l.c)) m[l.c] = r2((m[l.c] || 0) - l.suma);
    }
  }
  return m; // cheltuieli: pozitiv; venituri: negativ
}

export function situatiiFinanciare(note, setari, an) {
  const b = balanta(note, setari, `${an}-12-01`, `${an}-12-31`);
  const S = (fn, semn = 'd') => r2(b.rows.filter((r) => fn(r.cod)).reduce((s, r) => s + (semn === 'd' ? r.sfd - r.sfc : r.sfc - r.sfd), 0));
  const SD = (fn) => r2(b.rows.filter((r) => fn(r.cod)).reduce((s, r) => s + r.sfd, 0));
  const SC = (fn) => r2(b.rows.filter((r) => fn(r.cod)).reduce((s, r) => s + r.sfc, 0));
  const imob = r2(S((c) => pref(c, '20', '21', '22', '23', '26')) - S((c) => pref(c, '28', '29'), 'c'));
  const stocuri = S((c) => pref(c, '3') && !pref(c, '39'));
  const banca = S((c) => pref(c, '512', '531', '532', '541', '542'));
  const investitii = S((c) => pref(c, '50'));
  const clasa4 = (c) => pref(c, '4') && !pref(c, '471', '472', '4428');
  const creante = SD(clasa4);
  const datoriiScurt = r2(SC(clasa4) + SC((c) => pref(c, '519')));
  const datoriiLung = S((c) => pref(c, '16'), 'c');
  const avans = S((c) => pref(c, '471'));
  const venAvans = S((c) => pref(c, '472'), 'c');
  const provizioane = S((c) => pref(c, '15'), 'c');
  const capital = S((c) => pref(c, '101'), 'c');
  const rezerve = S((c) => pref(c, '106'), 'c');
  const reportat = S((c) => pref(c, '117'), 'c');
  const rezultat = S((c) => c === '121', 'c');
  const repartizare = S((c) => c === '129');
  const activeCirc = r2(stocuri + creante + investitii + banca);
  const activeNete = r2(activeCirc + avans - datoriiScurt - venAvans);
  const totalActiveMinusDatorii = r2(imob + activeNete);
  const capitaluri = r2(capital + rezerve + reportat + rezultat - repartizare);

  const R = rulaje67(note, an);
  const sum = (fn, semn = 1) => r2(Object.entries(R).filter(([c]) => fn(c)).reduce((s, [, v]) => s + semn * v, 0));
  const cifra = sum((c) => pref(c, '70'), -1);
  const altVenExpl = sum((c) => pref(c, '7') && !pref(c, '70', '76', '78'), -1);
  const venFin = sum((c) => pref(c, '76', '78'), -1);
  const chMat = sum((c) => pref(c, '60'));
  const chPers = sum((c) => pref(c, '64'));
  const chAmort = sum((c) => pref(c, '68'));
  const chAlte = sum((c) => pref(c, '61', '62', '63', '65'));
  const chFin = sum((c) => pref(c, '66'));
  const impozit = sum((c) => pref(c, '69'));
  const venituri = r2(cifra + altVenExpl + venFin);
  const cheltuieli = r2(chMat + chPers + chAmort + chAlte + chFin);
  const brut = r2(venituri - cheltuieli);
  const net = r2(brut - impozit);
  return {
    an,
    bilant: [
      ['A', 'Active imobilizate', imob],
      ['B', 'Active circulante', activeCirc, [['Stocuri', stocuri], ['Creanțe', creante], ['Investiții pe termen scurt', investitii], ['Casa și conturi la bănci', banca]]],
      ['C', 'Cheltuieli în avans', avans],
      ['D', 'Datorii care trebuie plătite într-un an', datoriiScurt],
      ['E', 'Active circulante nete / datorii curente nete', activeNete],
      ['F', 'Total active minus datorii curente', totalActiveMinusDatorii],
      ['G', 'Datorii care trebuie plătite într-o perioadă mai mare de un an', datoriiLung],
      ['H', 'Provizioane', provizioane],
      ['I', 'Venituri în avans', venAvans],
      ['J', 'Capital și rezerve', capitaluri, [['Capital subscris vărsat', capital], ['Rezerve', rezerve], ['Rezultatul reportat', reportat], ['Rezultatul exercițiului', rezultat], ['Repartizarea profitului', -repartizare]]],
    ],
    cpp: [
      ['Cifra de afaceri netă', cifra], ['Alte venituri din exploatare', altVenExpl], ['Venituri financiare', venFin], ['Venituri totale', venituri, 1],
      ['Cheltuieli cu materiile prime, materialele și mărfurile', chMat], ['Cheltuieli cu personalul', chPers], ['Amortizări', chAmort], ['Alte cheltuieli de exploatare', chAlte], ['Cheltuieli financiare', chFin], ['Cheltuieli totale', cheltuieli, 1],
      [brut >= 0 ? 'Profit brut' : 'Pierdere brută', brut, 1], ['Impozit pe profit / pe venit', impozit], [net >= 0 ? 'Profit net' : 'Pierdere netă', net, 1],
    ],
    verificare: r2(totalActiveMinusDatorii - datoriiLung - provizioane - capitaluri),
    brut, net, capital, rezerve,
  };
}

// ---------------------------------------------------------------- randări (taburi în Registre)
export function vSituatii(el, ctx, an, rer) {
  const sf = situatiiFinanciare(ctx.note, ctx.setari, an);
  const rand = (r) => `<tr${r[3] ? '' : ''}><td><b>${r[0]}</b></td><td>${e(r[1])}</td><td class="n"><b>${lei(r[2])}</b></td></tr>${(r[3] || []).map(([n, v]) => `<tr><td></td><td class="muted">${e(n)}</td><td class="n">${lei(v)}</td></tr>`).join('')}`;
  el.innerHTML = `<section class="panel">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="muted small">${e(ctx.setari.nume)}${ctx.setari.cui ? ` · CUI ${e(ctx.setari.cui)}` : ''}</div><h2 style="margin:2px 0 0">Situații financiare anuale — ${an}</h2></div>${selAn(an)}</div>
    <div class="tip warn" style="margin-top:12px"><span class="dot"></span><div class="grow"><p>Sunt calculate din balanța la 31.12.${an}, pe structura bilanțului prescurtat al microentităților. Se depun la ANAF pe formularul oficial (S1005 sau cel aplicabil firmei), până pe 30 mai ${an + 1}, semnate de un contabil autorizat sau expert contabil dacă administratorul nu are studii economice.</p></div></div>
    ${Math.abs(sf.verificare) > 0.5 ? `<div class="tip err"><span class="dot"></span><div class="grow"><p>Bilanțul nu se închide (diferență ${lei(sf.verificare)} lei). Închide toate lunile anului și verifică balanța.</p></div></div>` : ''}
    <h3 style="margin-top:16px">Bilanț</h3>
    <div class="table-wrap"><table><thead><tr><th></th><th>Element</th><th class="n">31.12.${an}</th></tr></thead><tbody>${sf.bilant.map(rand).join('')}</tbody></table></div>
    <h3 style="margin-top:18px">Contul de profit și pierdere</h3>
    <div class="table-wrap"><table><tbody>${sf.cpp.map(([n, v, tot]) => `<tr${tot ? ' class="group"' : ''}><td>${e(n)}</td><td class="n">${tot ? `<b>${lei(v)}</b>` : lei(v)}</td></tr>`).join('')}</tbody></table></div>
    <div class="row no-print" style="margin-top:12px"><button class="btn sm" id="csv">${icon('download')}Export CSV</button><button class="btn sm" data-ai="Explică-mi pe înțeles situațiile financiare ale firmei pe ${an}: profit net ${sf.net} lei. Ce formular depun, până când și ce trebuie să verific înainte?">${icon('spark')}Explică-mi</button></div>
  </section>`;
  legaAn(el, rer);
  $('#csv', el).onclick = () => {
    const rows = [['Element', 'Valoare']];
    for (const r of sf.bilant) { rows.push([`${r[0]}. ${r[1]}`, r[2].toFixed(2)]); for (const [n, v] of r[3] || []) rows.push(['   ' + n, v.toFixed(2)]); }
    for (const [n, v] of sf.cpp) rows.push([n, v.toFixed(2)]);
    descarca(`situatii-financiare-${an}.csv`, '﻿' + rows.map((r) => r.map((x) => `"${x}"`).join(';')).join('\n'), 'text/csv');
  };
}

export function vInventar(el, ctx, an, rer) {
  const b = balanta(ctx.note, ctx.setari, `${an}-12-01`, `${an}-12-31`);
  const rows = b.rows.filter((r) => !/^[67]/.test(r.cod) && (r.sfd || r.sfc));
  const mf = ctx.mijloace.map((m) => {
    let am = 0; const [y0] = m.dataPIF.split('-').map(Number);
    for (let y = y0; y <= an; y++) for (let l = 1; l <= 12; l++) am += amortizareLuna(m, y, l);
    return { ...m, ramas: r2(m.valoare - am) };
  });
  el.innerHTML = `<section class="panel">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="muted small">${e(ctx.setari.nume)}</div><h2 style="margin:2px 0 0">Registrul-inventar — 31.12.${an}</h2></div>${selAn(an)}</div>
    <p class="muted small">Se întocmește la sfârșitul anului, după inventarierea casei, a conturilor bancare, a creanțelor, datoriilor și a bunurilor. Valoarea de inventar e egală cu cea contabilă dacă la inventariere nu s-au găsit diferențe.</p>
    <div class="table-wrap"><table><thead><tr><th>Nr.</th><th>Cont</th><th>Denumire</th><th class="n">Valoare contabilă</th><th class="n">Valoare de inventar</th><th class="n">Diferențe</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.cod}</td><td>${e(r.nume)}</td><td class="n">${lei(r.sfd || r.sfc)}</td><td class="n">${lei(r.sfd || r.sfc)}</td><td class="n">0,00</td></tr>`).join('')}
    </tbody></table></div>
    ${mf.length ? `<h3 style="margin-top:16px">Mijloace fixe</h3><div class="table-wrap"><table><thead><tr><th>Denumire</th><th class="n">Valoare de intrare</th><th class="n">Valoare rămasă</th></tr></thead><tbody>${mf.map((m) => `<tr><td>${e(m.denumire)}</td><td class="n">${lei(m.valoare)}</td><td class="n">${lei(m.ramas)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <p class="small" style="margin-top:24px">Comisia de inventariere: ____________________ &nbsp;&nbsp; Administrator: ${e(ctx.setari.administrator || '____________________')}</p>
  </section>`;
  legaAn(el, rer);
}

export function vJurnalTVA(el, ctx, an, luna, rer) {
  const p = `${an}-${String(luna).padStart(2, '0')}`;
  const docs = ctx.documente.filter((d) => d.data?.startsWith(p)).sort((a, b) => a.data.localeCompare(b.data));
  const tab = (tip, titlu) => {
    const ds = docs.filter((d) => d.tip === tip);
    const tot = ds.reduce((t, d) => ({ b: t.b + (Number(d.total) - Number(d.tva || 0)), t: t.t + Number(d.tva || 0), v: t.v + Number(d.total) }), { b: 0, t: 0, v: 0 });
    return `<h3 style="margin-top:16px">${titlu}</h3><div class="table-wrap"><table><thead><tr><th>Nr.</th><th>Data</th><th>Document</th><th>${tip === 'venit' ? 'Client' : 'Furnizor'}</th><th>CUI</th><th class="n">Total</th><th class="n">Bază</th><th class="n">Cotă</th><th class="n">TVA</th></tr></thead><tbody>
      ${ds.map((d, i) => `<tr class="row-click" data-go="#documente/${d.id}"><td>${i + 1}</td><td>${dataRo(d.data)}</td><td>${e(d.nr || '')}</td><td>${e(d.partener?.nume || '')}</td><td>${e(d.partener?.cui || '')}</td><td class="n">${lei(d.total)}</td><td class="n">${lei(Number(d.total) - Number(d.tva || 0))}</td><td class="n">${d.taxareInversa ? 'TI' : Math.round((d.tvaCota || 0) * 100) + '%'}</td><td class="n">${lei(d.tva || 0)}</td></tr>`).join('') || '<tr><td colspan="9" class="muted">Niciun document.</td></tr>'}
      <tr class="total"><td colspan="5">Total</td><td class="n">${lei(tot.v)}</td><td class="n">${lei(tot.b)}</td><td></td><td class="n">${lei(tot.t)}</td></tr></tbody></table></div>`;
  };
  el.innerHTML = `<section class="panel">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><div><div class="muted small">${e(ctx.setari.nume)}</div><h2 style="margin:2px 0 0">Jurnale de TVA — ${LUNI[luna - 1]} ${an}</h2></div>
    <div class="row"><select id="j-l" style="width:auto">${LUNI.map((l, i) => `<option value="${i + 1}" ${i + 1 === luna ? 'selected' : ''}>${l}</option>`).join('')}</select>${selAn(an)}</div></div>
    ${ctx.setari.platitorTVA ? '' : '<p class="muted small">Firma nu e plătitoare de TVA: jurnalele nu sunt obligatorii, dar le poți folosi ca evidență a facturilor.</p>'}
    ${tab('venit', 'Jurnal de vânzări')}${tab('cheltuiala', 'Jurnal de cumpărări')}
  </section>`;
  legaAn(el, rer);
  $('#j-l', el).onchange = (ev) => rer({ luna: Number(ev.target.value) });
}

export function vInchidereAn(el, ctx, an, rer) {
  const sf = situatiiFinanciare(ctx.note, ctx.setari, an);
  const lipsa = [];
  for (let l = 1; l <= 12; l++) {
    const p = `${an}-${String(l).padStart(2, '0')}`;
    if (ctx.note.some((n) => n.data.startsWith(p) && !n.auto) && !ctx.note.some((n) => n.autoPerioada === p && n.auto === 'inchidere')) lipsa.push(LUNI[l - 1]);
  }
  const rezervaMax = r2(sf.capital * 0.2 - sf.rezerve);
  const rezerva = sf.brut > 0 ? Math.max(0, Math.min(r2(sf.brut * 0.05), rezervaMax)) : 0;
  const areRezerva = ctx.note.some((n) => n.auto === 'rezerva' && n.autoPerioada === `${an}-12`);
  const pas = (ok, text, act = '') => `<li><span class="badge ${ok ? 'ok' : 'warn'}" style="margin-top:2px">${ok ? 'gata' : 'de făcut'}</span><div class="grow">${text}${act}</div></li>`;
  el.innerHTML = `<section class="panel" style="max-width:860px">
    <div class="row" style="justify-content:space-between;align-items:flex-start"><h2 style="margin:0">Închiderea exercițiului ${an}</h2>${selAn(an)}</div>
    <p class="muted">Pașii de la sfârșitul anului. Cei marcați „automat” îi face aplicația.</p>
    <ul class="list">
      ${pas(!lipsa.length, `<b>Toate lunile închise</b> (automat)${lipsa.length ? `<div class="m">Neînchise: ${lipsa.join(', ')}</div>` : ''}`, lipsa.length ? '<div class="act"><button class="btn sm ghost" data-go="#registre/inchidere">Închide lunile</button></div>' : '')}
      ${pas(true, '<b>Inventarierea anuală</b><div class="m">Numără casa, verifică soldurile bancare cu extrasele, confirmă soldurile cu clienții și furnizorii. Apoi tipărește registrul-inventar.</div>', '<div class="act"><button class="btn sm ghost" data-go="#registre/inventar">Registrul-inventar</button></div>')}
      ${pas(areRezerva || !rezerva, `<b>Rezerva legală</b><div class="m">5% din profitul brut, până când rezervele ajung la 20% din capitalul social. ${rezerva ? `Pentru ${an}: ${lei(rezerva)} lei (129 = 1061).` : 'Nu e cazul pentru acest an.'}</div>`, rezerva && !areRezerva ? '<div class="act"><button class="btn sm primary" id="rez">Înregistrează rezerva legală</button></div>' : '')}
      ${pas(true, `<b>Reportarea rezultatului</b> (automat)<div class="m">La 1 ianuarie ${an + 1}, ${sf.net >= 0 ? 'profitul' : 'pierderea'} trece din 121 în 1171. Soldurile tuturor conturilor se preiau automat în anul nou.</div>`)}
      ${pas(false, `<b>Situațiile financiare anuale</b><div class="m">Termen: 30 mai ${an + 1}. Profit net: ${lei(sf.net)} lei.</div>`, '<div class="act"><button class="btn sm ghost" data-go="#registre/situatii">Vezi situațiile financiare</button></div>')}
      ${pas(false, `<b>Hotărârea asociatului</b><div class="m">Aprobă situațiile financiare și decide ce se face cu profitul (rămâne în firmă sau se distribuie ca dividende).</div>`, '<div class="act"><button class="btn sm ghost" data-go="#formulare/hotarare">Generează hotărârea</button></div>')}
    </ul>
  </section>`;
  legaAn(el, rer);
  $('#rez', el) && ($('#rez', el).onclick = async (ev) => {
    await withLoad(() => salveazaNota({ data: `${an}-12-31`, document: 'Notă rezervă legală', auto: 'rezerva', autoPerioada: `${an}-12`, explicatie: `Constituirea rezervei legale ${an} (5% din profitul brut)`, linii: [{ d: '129', c: '1061', suma: rezerva }] }), ev.currentTarget);
    toast('Rezerva legală a fost înregistrată.'); await ctx.reload();
  });
}

function selAn(an) {
  return `<select id="sa-an" style="width:auto" class="no-print">${[an - 2, an - 1, an, an + 1].filter((y) => y <= new Date().getFullYear()).map((y) => `<option ${y === an ? 'selected' : ''}>${y}</option>`).join('')}</select>`;
}
function legaAn(el, rer) { const s = $('#sa-an', el); if (s) s.onchange = (ev) => rer({ an: Number(ev.target.value) }); }
