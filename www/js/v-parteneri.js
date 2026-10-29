import { e, $, $$, icon, withLoad, toast } from './ui.js';
import { db } from './db.js';
import { lei, dataRo, azi, r2 } from './engine.js';
import { curataCUI } from './ubl.js';
import * as ai from './ai.js';

const cheie = (p) => curataCUI(p?.cui) || String(p?.nume || '').trim().toLowerCase();
const rest = (d) => r2(Number(d.total) - Number(d.platitPartial || 0));
const deschis = (d) => d.plata === 'neplatit' && !d.achitat && rest(d) > 0.009;
export const scadenta = (d) => d.scadenta || (() => { const x = new Date(d.data); x.setDate(x.getDate() + 30); return x.toISOString().slice(0, 10); })();

export function situatie(documente) {
  const m = new Map();
  for (const d of documente) {
    const k = cheie(d.partener);
    if (!k) continue;
    if (!m.has(k)) m.set(k, { k, nume: d.partener?.nume || '', cui: d.partener?.cui || '', incasat: 0, platit: 0, deIncasat: 0, dePlatit: 0, restante: 0, docs: [] });
    const p = m.get(k);
    if (d.partener?.nume && d.partener.nume.length > p.nume.length) p.nume = d.partener.nume;
    p.docs.push(d);
    if (deschis(d)) {
      if (d.tip === 'venit') p.deIncasat = r2(p.deIncasat + rest(d)); else p.dePlatit = r2(p.dePlatit + rest(d));
      if (scadenta(d) < azi()) p.restante++;
    }
  }
  return [...m.values()].sort((a, b) => (b.deIncasat + b.dePlatit) - (a.deIncasat + a.dePlatit) || a.nume.localeCompare(b.nume));
}

export async function render(main, ctx, params) {
  const lista = situatie(ctx.documente);
  if (params[0]) return fisa(main, ctx, lista.find((p) => encodeURIComponent(p.k) === params[0]));
  const st = render.st || (render.st = { f: 'toti' });
  const tot = lista.reduce((t, p) => ({ i: t.i + p.deIncasat, p: t.p + p.dePlatit, r: t.r + p.restante }), { i: 0, p: 0, r: 0 });
  const vis = lista.filter((p) => st.f === 'toti' || (st.f === 'clienti' ? p.docs.some((d) => d.tip === 'venit') : st.f === 'furnizori' ? p.docs.some((d) => d.tip === 'cheltuiala') : p.restante));
  main.innerHTML = `
  <div class="page-head"><div><h1>Parteneri</h1><p class="sub">Clienții și furnizorii firmei, cu ce au de plătit și ce ai tu de plătit. Se completează singur din facturi și extrase.</p></div></div>
  <section class="panel"><div class="figures">
    <div class="figure"><div class="label">Clienții îți datorează</div><div class="value num">${lei(tot.i)}<small>lei</small></div></div>
    <div class="figure"><div class="label">Datorezi furnizorilor</div><div class="value num">${lei(tot.p)}<small>lei</small></div></div>
    <div class="figure"><div class="label">Facturi restante</div><div class="value num" style="color:${tot.r ? 'var(--err)' : 'inherit'}">${tot.r}</div><div class="hint">peste scadență</div></div>
    <div class="figure"><div class="label">Parteneri</div><div class="value num">${lista.length}</div></div>
  </div></section>
  <section class="panel" style="margin-top:16px">
    <div class="seg" style="margin-bottom:10px">${[['toti', 'Toți'], ['clienti', 'Clienți'], ['furnizori', 'Furnizori'], ['restante', 'Cu restanțe']].map(([k, l]) => `<button data-f="${k}" aria-pressed="${st.f === k}">${l}</button>`).join('')}</div>
    ${vis.length ? `<ul class="list">${vis.map((p) => `<li class="clickable" data-go="#parteneri/${encodeURIComponent(p.k)}"><div class="grow"><div class="t">${e(p.nume || p.cui)}</div><div class="m">${p.cui ? 'CUI ' + e(p.cui) + ' · ' : ''}${p.docs.length} documente${p.restante ? ` · <span style="color:var(--err)">${p.restante} restante</span>` : ''}</div></div>
      <div class="amt num">${p.deIncasat ? `<span style="color:var(--ok)">+${lei(p.deIncasat)}</span>` : ''}${p.deIncasat && p.dePlatit ? '<br>' : ''}${p.dePlatit ? `−${lei(p.dePlatit)}` : ''}${!p.deIncasat && !p.dePlatit ? '<span class="muted">la zi</span>' : ''}</div></li>`).join('')}</ul>`
      : '<div class="empty"><h3>Niciun partener aici</h3><p>Partenerii apar singuri din documente și din SPV.</p></div>'}
  </section>`;
  $$('[data-f]', main).forEach((b) => (b.onclick = () => { st.f = b.dataset.f; render(main, ctx, []); }));
}

function fisa(main, ctx, p) {
  if (!p) { main.innerHTML = '<div class="empty"><h3>Partenerul nu a fost găsit</h3></div>'; return; }
  const docs = p.docs.slice().sort((a, b) => a.data.localeCompare(b.data));
  let sold = 0;
  const rows = [];
  for (const d of docs) {
    const semn = d.tip === 'venit' ? 1 : -1;
    sold = r2(sold + semn * Number(d.total));
    rows.push({ data: d.data, txt: `${d.tipDocument || 'Factura'} ${d.nr || ''}`, d, val: semn * Number(d.total), sold });
    const pl = Number(d.platitPartial || 0) || (d.plata !== 'neplatit' ? Number(d.total) : (d.achitat ? Number(d.total) : 0));
    if (pl) { sold = r2(sold - semn * pl); rows.push({ data: d.dataPlata || d.data, txt: d.tip === 'venit' ? 'Încasare' : 'Plată', val: -semn * pl, sold }); }
  }
  rows.sort((a, b) => a.data.localeCompare(b.data));
  main.innerHTML = `
  <div class="page-head"><div><button class="btn ghost sm" data-go="#parteneri" style="padding-left:0">‹ Parteneri</button><h1>${e(p.nume)}</h1><p class="sub">${p.cui ? 'CUI ' + e(p.cui) : ''}</p></div>
  <div class="row">${p.cui ? '<button class="btn" id="anaf">Verifică la ANAF</button>' : ''}<button class="btn" id="print">${icon('print')}Tipărește fișa</button></div></div>
  <div id="info"></div>
  <section class="panel"><div class="figures">
    <div class="figure"><div class="label">De încasat de la el</div><div class="value num">${lei(p.deIncasat)}<small>lei</small></div></div>
    <div class="figure"><div class="label">De plătit lui</div><div class="value num">${lei(p.dePlatit)}<small>lei</small></div></div>
    <div class="figure"><div class="label">Restante</div><div class="value num">${p.restante}</div></div>
    <div class="figure"><div class="label">Documente</div><div class="value num">${p.docs.length}</div></div>
  </div></section>
  <section class="panel" style="margin-top:16px"><h2>Fișa partenerului</h2>
    <div class="table-wrap"><table><thead><tr><th>Data</th><th>Document</th><th>Scadență</th><th class="n">Valoare</th><th class="n">Sold</th></tr></thead><tbody>
    ${rows.map((r) => `<tr${r.d ? ` class="row-click" data-go="#documente/${r.d.id}"` : ''}><td>${dataRo(r.data)}</td><td>${e(r.txt)}${r.d && deschis(r.d) && scadenta(r.d) < azi() ? ' <span class="badge err">restantă</span>' : ''}</td><td>${r.d ? dataRo(scadenta(r.d)) : ''}</td><td class="n">${lei(r.val)}</td><td class="n">${lei(r.sold)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="muted small">Sold pozitiv: partenerul îți datorează. Sold negativ: tu îi datorezi.</p>
  </section>`;
  $('#print', main).onclick = () => window.print();
  $('#anaf', main) && ($('#anaf', main).onclick = async (ev) => {
    try {
      const r = await withLoad(() => ai.cautaCUI(p.cui), ev.currentTarget);
      $('#info', main).innerHTML = `<div class="tip ok" style="margin-bottom:16px"><span class="dot"></span><div class="grow"><p><b>${e(r.nume)}</b> · ${e(r.adresa)}<br>${r.platitorTVA ? 'Plătitor de TVA' : 'Neplătitor de TVA'}${r.tvaLaIncasare ? ', TVA la încasare' : ''}</p></div></div>`;
    } catch (err) { toast(err.message); }
  });
}

export { deschis, rest };
