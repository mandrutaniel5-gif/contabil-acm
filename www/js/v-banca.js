import { e, $, $$, icon, withLoad, toast, openSheet, closeSheet, eqHTML, confirma } from './ui.js';
import { db } from './db.js';
import { lei, dataRo, balanta, OPERATII, reguli, r2 } from './engine.js';
import { cont, toateConturile } from './conturi.js';
import * as ex from './extrase.js';
import * as ai from './ai.js';

export async function render(main, ctx, params) {
  if (params[0]) return detaliu(main, ctx, params[0]);
  const extrase = (await db.all('extrase')).sort((a, b) => b.importat - a.importat);
  const an = new Date().getFullYear();
  const b = balanta(ctx.note, ctx.setari, `${an}-01-01`, `${an}-12-31`);
  const sold = (c) => { const r = b.rows.find((x) => x.cod === c); return r ? r.sfd - r.sfc : 0; };
  const pend = extrase.flatMap((x) => x.tranzactii.filter((t) => t.stare === 'propus' || t.stare === 'neclar' || t.stare === 'nou').map((t) => ({ ex: x, t }))).sort((a, b) => a.t.data.localeCompare(b.t.data));

  main.innerHTML = `
  <div class="page-head">
    <div><h1>Bancă</h1><p class="sub">Încarcă extrasul de cont: aplicația recunoaște încasările și plățile, le potrivește cu facturile și le înregistrează.</p></div>
    <div class="row"><button class="btn primary" id="imp">${icon('download')}Importă extras</button><input type="file" id="f" hidden accept=".csv,.txt,.sta,.mt940,.940,.xml,.pdf,image/*"></div>
  </div>
  <section class="panel"><div class="figures">
    <div class="figure"><div class="label">Cont în lei (5121)</div><div class="value num">${lei(sold('5121'))}<small>lei</small></div></div>
    <div class="figure"><div class="label">Cont în valută (5124)</div><div class="value num">${lei(sold('5124'))}<small>lei</small></div></div>
    <div class="figure"><div class="label">De confirmat</div><div class="value num">${pend.length}</div><div class="hint">tranzacții</div></div>
    <div class="figure"><div class="label">Extrase importate</div><div class="value num">${extrase.length}</div></div>
  </div></section>
  <div id="prog"></div>
  <section class="panel" style="margin-top:16px">
    <h2>De confirmat</h2>
    ${pend.length ? `<ul class="list">${pend.map(({ ex: x, t }) => rand(x, t)).join('')}</ul>`
      : `<div class="empty"><h3>Nimic de confirmat</h3><p>Exportă extrasul din internet banking (CSV, MT940, CAMT.053 sau PDF) și încarcă-l aici. Funcționează cu orice bancă: BT, BCR, ING, BRD, Revolut, Raiffeisen.</p></div>`}
  </section>
  <section class="panel">
    <h2>Extrase importate</h2>
    ${extrase.length ? `<ul class="list">${extrase.map((x) => {
      const inr = x.tranzactii.filter((t) => t.stare === 'inregistrat').length;
      const dts = x.tranzactii.map((t) => t.data).sort();
      return `<li class="clickable" data-go="#banca/${x.id}"><div class="grow"><div class="t">${e(x.banca || 'Extras')} ${x.iban ? '· ' + e(x.iban.slice(-8)) : ''}</div><div class="m">${dts.length ? `${dataRo(dts[0])} – ${dataRo(dts[dts.length - 1])} · ` : ''}${x.tranzactii.length} tranzacții, ${inr} înregistrate</div></div><span class="muted">›</span></li>`;
    }).join('')}</ul>` : '<p class="muted">Niciun extras încă.</p>'}
  </section>`;

  $('#imp', main).onclick = () => $('#f', main).click();
  $('#f', main).onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (f) importaFisier(f, ctx, main); };
  legaActiuni(main, ctx);
}

function rand(x, t) {
  const p = t.propunere || { linii: [], motiv: '' };
  return `<li data-ex="${x.id}" data-tx="${t.id}" style="align-items:flex-start">
    <div class="grow">
      <div class="t">${e(t.contraparte || t.detalii || 'Tranzacție')}</div>
      <div class="m">${dataRo(t.data)} · ${e((t.detalii || '').slice(0, 90))}</div>
      <div class="small" style="margin-top:6px">${p.linii.length ? `${p.linii.map((l) => eqHTML(l.d, l.c, null, cont)).join(' ')} <span class="muted">${e(p.motiv)}</span>` : `<span class="badge warn">neidentificată</span> <span class="muted">Alege ce reprezintă.</span>`}</div>
      <div class="row" style="margin-top:8px">${p.linii.length ? '<button class="btn sm primary" data-ok>Confirmă</button>' : ''}<button class="btn sm" data-alt>${p.linii.length ? 'Altceva' : 'Alege'}</button><button class="btn sm ghost" data-ign>Ignoră</button></div>
    </div>
    <div class="amt num" style="color:${t.suma > 0 ? 'var(--ok)' : 'inherit'}">${t.suma > 0 ? '+' : '−'}${lei(Math.abs(t.suma))}</div>
  </li>`;
}

function legaActiuni(root, ctx) {
  $$('li[data-tx]', root).forEach((li) => {
    const exId = li.dataset.ex, txId = li.dataset.tx;
    const ok = $('[data-ok]', li), alt = $('[data-alt]', li), ign = $('[data-ign]', li);
    ok && (ok.onclick = async (ev) => { await withLoad(() => ex.confirma(exId, txId), ev.currentTarget); toast('Înregistrat.'); await ctx.reload(); });
    ign && (ign.onclick = async () => { await ex.ignora(exId, txId); toast('Tranzacția a fost ignorată.'); await ctx.reload(); });
    alt && (alt.onclick = () => alege(ctx, exId, txId));
  });
}

async function importaFisier(f, ctx, main) {
  const prog = $('#prog', main);
  try {
    await withLoad(async () => {
      let r = await ex.citesteFisier(f);
      if (r.necesitaAI) {
        prog.innerHTML = '<div class="tip" style="margin-top:16px"><span class="dot"></span><div class="grow"><p>Asistentul citește extrasul PDF. Poate dura până la un minut…</p></div></div>';
        const file = await ai.pregatesteImagine(f, 2200);
        r = await ai.extrageExtras({ type: file.type, data: file.data });
        r.tranzactii = (r.tranzactii || []).map((t) => ({ ...t, data: ex.dataISO(t.data), suma: r2(t.suma) })).filter((t) => t.data && t.suma);
      }
      if (!r.tranzactii || !r.tranzactii.length) throw new Error('Nu am găsit tranzacții în fișier.');
      const res = await ex.importa({ banca: r.banca || ctx.setari.banca, iban: r.iban, moneda: r.moneda, tranzactii: r.tranzactii, perioada: r.perioada }, { autoPrag: ctx.setari.extrasAutomat === false ? 101 : 80 });
      toast(`${res.total} tranzacții noi: ${res.auto} înregistrate automat, ${res.deConfirmat} de confirmat.`);
    });
    await ctx.reload();
  } catch (err) { prog.innerHTML = ''; toast(err.message); }
}

async function detaliu(main, ctx, id) {
  const x = await db.get('extrase', id);
  if (!x) { main.innerHTML = '<div class="empty"><h3>Extrasul nu mai există</h3></div>'; return; }
  const nume = { inregistrat: ['ok', 'înregistrată'], propus: ['warn', 'de confirmat'], neclar: ['warn', 'neidentificată'], ignorat: ['', 'ignorată'], nou: ['', 'nouă'] };
  main.innerHTML = `
  <div class="page-head"><div><button class="btn ghost sm" data-go="#banca" style="padding-left:0">‹ Bancă</button><h1>${e(x.banca || 'Extras')}</h1><p class="sub">${e(x.iban || '')} · importat ${new Date(x.importat).toLocaleDateString('ro-RO')}</p></div>
  <div class="row"><button class="btn" id="re">Potrivește din nou</button><button class="btn danger" id="del">Șterge extrasul</button></div></div>
  <section class="panel"><ul class="list">${x.tranzactii.slice().sort((a, b) => a.data.localeCompare(b.data)).map((t) => {
    if (t.stare === 'propus' || t.stare === 'neclar' || t.stare === 'nou') return rand(x, t);
    const [cls, txt] = nume[t.stare] || ['', t.stare];
    return `<li data-ex="${x.id}" data-txr="${t.id}"><div class="grow"><div class="t">${e(t.contraparte || t.detalii || 'Tranzacție')}</div><div class="m">${dataRo(t.data)} · ${e((t.propunere?.motiv || t.detalii || '').slice(0, 90))}</div></div>
      <span class="badge ${cls}">${txt}</span>${t.stare === 'inregistrat' || t.stare === 'ignorat' ? '<button class="btn sm ghost" data-undo>Anulează</button>' : ''}
      <div class="amt num" style="color:${t.suma > 0 ? 'var(--ok)' : 'inherit'}">${t.suma > 0 ? '+' : '−'}${lei(Math.abs(t.suma))}</div></li>`;
  }).join('')}</ul></section>`;
  legaActiuni(main, ctx);
  $$('[data-undo]', main).forEach((b) => (b.onclick = async () => {
    const li = b.closest('li');
    await ex.anuleaza(x.id, li.dataset.txr); toast('Înregistrarea a fost anulată.'); await ctx.reload();
  }));
  $('#re', main).onclick = async (ev) => { const r = await withLoad(() => ex.proceseaza(x.id, { autoPrag: ctx.setari.extrasAutomat === false ? 101 : 80 }), ev.currentTarget); toast(`${r.auto} înregistrate automat, ${r.deConfirmat} de confirmat.`); await ctx.reload(); };
  $('#del', main).onclick = async () => {
    if (!(await confirma('Ștergi extrasul? Înregistrările făcute din el se anulează.', 'Șterge'))) return;
    for (const t of x.tranzactii) if (t.notaId || t.docId) await ex.anuleaza(x.id, t.id);
    await db.del('extrase', x.id); toast('Extras șters.'); await ctx.reload(); location.hash = '#banca';
  };
}

/** Alege manual ce reprezintă tranzacția: o factură deschisă, o operațiune frecventă sau un cont. */
async function alege(ctx, exId, txId) {
  const x = await db.get('extrase', exId);
  const t = x.tranzactii.find((y) => y.id === txId);
  const S = Math.abs(t.suma), sens = t.suma > 0 ? 1 : -1, B = x.contBanca || '5121';
  const deschise = ctx.documente.filter((d) => d.plata === 'neplatit' && !d.achitat && (sens > 0 ? d.tip === 'venit' : d.tip === 'cheltuiala'));
  const ops = OPERATII.filter((o) => {
    const l = o.linii(S, reguli(ctx.setari), sens > 0 ? 'intrare' : 'iesire');
    return l.some((y) => (sens > 0 ? y.d === '5121' : y.c === '5121'));
  });
  const conturiCh = toateConturile().filter((c) => (sens < 0 ? c.cod[0] === '6' : c.cod[0] === '7') || ['4551', '473', '462', '461', '1012', '456', '419', '542'].includes(c.cod));
  const s = openSheet(`${sens > 0 ? 'Încasare' : 'Plată'} ${lei(S)} lei`, `
    <p class="muted" style="margin-top:0">${dataRo(t.data)} · ${e(t.contraparte || '')} ${e(t.detalii || '')}</p>
    ${deschise.length ? `<h3>Factură ${sens > 0 ? 'emisă, neîncasată' : 'primită, neplătită'}</h3><ul class="list">${deschise.map((d) => `<li class="clickable" data-doc="${d.id}"><div class="grow"><div class="t">${e(d.partener?.nume || d.descriere)}</div><div class="m">${dataRo(d.data)} · ${e(d.nr || '')}</div></div><div class="amt num">${lei(d.total)}</div></li>`).join('')}</ul>` : ''}
    <h3 style="margin-top:14px">Operațiune</h3><ul class="list">${ops.map((o) => `<li class="clickable" data-op="${o.id}"><div class="grow"><div class="t">${e(o.titlu)}</div><div class="m">${e(o.ajutor)}</div></div></li>`).join('')}</ul>
    <h3 style="margin-top:14px">Alt cont</h3>
    <div class="row" style="flex-wrap:nowrap"><select id="c">${conturiCh.map((c) => `<option value="${c.cod}">${c.cod} · ${e(c.nume)}</option>`).join('')}</select><button class="btn primary" id="cok">Înregistrează</button></div>
    <p class="muted small" id="ch"></p>
    ${sens < 0 ? '<label class="check"><input type="checkbox" id="doc" checked><span>Creează și documentul de cheltuială (atașezi factura mai târziu)</span></label>' : ''}
    <div class="row" style="margin-top:10px"><button class="btn sm" data-ai="Am în extras o ${sens > 0 ? 'încasare' : 'plată'} de ${S} lei pe ${t.data}: „${e((t.contraparte + ' ' + t.detalii).trim())}”. Ce reprezintă probabil și cum o înregistrez?">${icon('spark')}Întreabă asistentul</button></div>`);
  const q = (y) => $(y, s);
  const help = () => { q('#ch').textContent = cont(q('#c').value).ajutor; };
  q('#c').onchange = help; help();
  const aplica = async (p) => { await ex.confirma(exId, txId, p); closeSheet(); toast('Înregistrat.'); await ctx.reload(); };
  $$('[data-doc]', s).forEach((li) => (li.onclick = () => {
    const d = deschise.find((y) => y.id === li.dataset.doc);
    const cp = d.tip === 'venit' ? '411' : (String(d.cont).startsWith('2') ? '404' : '401');
    aplica({ docId: d.id, motiv: `${sens > 0 ? 'Încasare' : 'Plată'} factura ${d.nr || ''} — ${d.partener?.nume || ''}`, partener: d.partener?.nume, linii: sens > 0 ? [{ d: B, c: cp, suma: S }] : [{ d: cp, c: B, suma: S }] });
  }));
  $$('[data-op]', s).forEach((li) => (li.onclick = () => {
    const o = OPERATII.find((y) => y.id === li.dataset.op);
    const linii = o.linii(S, reguli(ctx.setari), sens > 0 ? 'intrare' : 'iesire').map((l) => ({ ...l, d: l.d === '5121' ? B : l.d, c: l.c === '5121' ? B : l.c }));
    aplica({ motiv: o.titlu, linii });
  }));
  q('#cok').onclick = () => {
    const c = q('#c').value;
    if (sens < 0 && c[0] === '6' && q('#doc')?.checked) return aplica({ motiv: cont(c).nume, cheltuialaNoua: { cont: c, tvaDeductibil: 100 }, linii: [{ d: c, c: B, suma: S }] });
    aplica({ motiv: cont(c).nume, linii: sens > 0 ? [{ d: B, c, suma: S }] : [{ d: c, c: B, suma: S }] });
  };
}
