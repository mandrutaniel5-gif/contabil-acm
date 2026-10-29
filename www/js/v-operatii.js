import { e, $, $$, icon, withLoad, toast, openSheet, closeSheet, eqHTML, confirma } from './ui.js';
import { OPERATII, lei, r2, azi, salveazaNota, stergeNota, reguli, dataRo } from './engine.js';
import { cont, toateConturile } from './conturi.js';

export async function render(main, ctx) {
  const grupuri = [...new Set(OPERATII.map((o) => o.grup))];
  const manuale = ctx.note.filter((n) => n.tipNota === 'operatie' || n.tipNota === 'manuala').slice(-12).reverse();
  main.innerHTML = `
  <div class="page-head">
    <div><h1>Operațiuni</h1><p class="sub">Mișcări din extrasul de cont, din casă sau cu administratorul. Alege ce s-a întâmplat — aplicația scrie nota contabilă.</p></div>
    <div class="row"><button class="btn" id="manual">${icon('plus')}Notă contabilă manuală</button></div>
  </div>
  <div class="grid g2">
    ${grupuri.map((g) => `<section class="panel"><h2>${e(g)}</h2><ul class="list">
      ${OPERATII.filter((o) => o.grup === g).map((o) => `<li class="clickable" data-op="${o.id}"><div class="grow"><div class="t">${e(o.titlu)}</div><div class="m">${e(o.ajutor)}</div></div><span class="muted">›</span></li>`).join('')}
    </ul></section>`).join('')}
  </div>
  <section class="panel" style="margin-top:16px">
    <h2>Înregistrate recent</h2>
    ${manuale.length ? `<ul class="list">${manuale.map((n) => `<li class="clickable" data-nota="${n.id}"><div class="grow"><div class="t">${e(n.explicatie)}</div><div class="m">${dataRo(n.data)} · nota ${n.nr} · ${n.linii.map((l) => `${l.d} = ${l.c}`).join(', ')}</div></div><div class="amt num">${lei(n.linii[0]?.suma)}</div></li>`).join('')}</ul>` : '<p class="muted">Nicio operațiune înregistrată încă.</p>'}
  </section>`;
  $$('[data-op]', main).forEach((li) => (li.onclick = () => formular(ctx, OPERATII.find((o) => o.id === li.dataset.op))));
  $('#manual', main).onclick = () => notaManuala(ctx);
  $$('[data-nota]', main).forEach((li) => (li.onclick = () => notaManuala(ctx, ctx.note.find((n) => n.id === li.dataset.nota))));
}

function formular(ctx, op) {
  const R = reguli(ctx.setari);
  const parteneri = ctx.parteneri;
  const s = openSheet(op.titlu, `
    <p class="muted" style="margin-top:0">${e(op.ajutor)}</p>
    <div class="fields-2">
      <label class="field"><span>Data</span><input type="date" id="o-data" value="${azi()}"></label>
      <label class="field"><span>Suma (lei)</span><input type="number" step="0.01" id="o-suma" inputmode="decimal"></label>
    </div>
    ${op.sens ? `<label class="field"><span>Sensul</span><select id="o-sens"><option value="intrare">Au intrat bani în cont</option><option value="iesire">Au ieșit bani din cont</option></select></label>` : ''}
    ${op.partener ? `<label class="field"><span>${op.id === 'incasare' ? 'Client' : 'Furnizor'}</span><input type="text" id="o-part" list="o-plist" placeholder="Numele firmei"><datalist id="o-plist">${parteneri.map((p) => `<option value="${e(p.nume)}">`).join('')}</datalist></label>` : ''}
    <label class="field"><span>Document justificativ</span><input type="text" id="o-doc" placeholder="ex. Extras de cont 12/2026, OP 15"></label>
    <label class="field"><span>Explicație</span><input type="text" id="o-expl" value="${e(op.titlu)}"></label>
    <h3 style="margin-top:6px">Ce se înregistrează</h3><div id="o-prev" class="muted">Introdu suma.</div>`,
    `<div class="row end"><button class="btn" data-x>Renunță</button><button class="btn primary" id="o-save">Înregistrează</button></div>`);
  const q = (x) => $(x, s);
  const linii = () => {
    const suma = r2(q('#o-suma').value);
    if (!suma) return [];
    return op.linii(suma, R, q('#o-sens')?.value);
  };
  const prev = () => {
    const l = linii();
    q('#o-prev').innerHTML = l.length ? `<ul class="list">${l.map((x) => `<li><div class="grow">${eqHTML(x.d, x.c, null, cont)}<div class="m">${e(cont(x.d).nume)} / ${e(cont(x.c).nume)}</div></div><div class="amt num">${lei(x.suma)}</div></li>`).join('')}</ul>` : 'Introdu suma.';
  };
  s.addEventListener('input', prev); s.addEventListener('change', prev);
  q('[data-x]').onclick = closeSheet;
  q('#o-save').onclick = async (ev) => {
    const l = linii();
    if (!l.length) { toast('Introdu suma.'); return; }
    const part = q('#o-part')?.value.trim();
    await withLoad(() => salveazaNota({
      data: q('#o-data').value, document: q('#o-doc').value.trim() || 'Notă contabilă', partener: part || '',
      explicatie: q('#o-expl').value.trim() + (part ? ` — ${part}` : ''), linii: l, tipNota: 'operatie', operatie: op.id,
    }), ev.currentTarget);
    if (part && ['incasare', 'plataFurn'].includes(op.id)) await marcheazaPlatit(ctx, part, op.id);
    closeSheet(); toast('Operațiune înregistrată.'); await ctx.reload(); location.hash = '#operatii';
  };
  setTimeout(() => q('#o-suma').focus(), 300);
}

// Când se înregistrează o încasare/plată, marchează cea mai veche factură neachitată a partenerului.
async function marcheazaPlatit(ctx, nume, opId) {
  const { db } = await import('./db.js');
  const tip = opId === 'incasare' ? 'venit' : 'cheltuiala';
  const d = ctx.documente.filter((x) => x.tip === tip && x.plata === 'neplatit' && (x.partener?.nume || '').toLowerCase() === nume.toLowerCase())
    .sort((a, b) => a.data.localeCompare(b.data))[0];
  if (d) await db.put('documente', { ...d, achitat: true });
}

function notaManuala(ctx, existent) {
  const n = existent ? structuredClone(existent) : { data: azi(), document: 'Notă contabilă', explicatie: '', linii: [{ d: '', c: '', suma: '' }], tipNota: 'manuala' };
  const conturi = toateConturile();
  const dl = `<datalist id="m-conturi">${conturi.map((c) => `<option value="${c.cod}">${e(c.nume)}</option>`).join('')}</datalist>`;
  const autoGen = existent && (existent.auto || existent.sursa?.docId);
  const s = openSheet(existent ? `Nota ${existent.nr}` : 'Notă contabilă manuală', `
    ${autoGen ? `<div class="tip warn"><span class="dot"></span><div class="grow"><p>Nota a fost generată automat ${existent.auto ? 'la închiderea lunii' : 'dintr-un document'}. Modific-o din ${existent.auto ? 'Registre → Închiderea lunii' : 'documentul respectiv'}, altfel modificările se pierd.</p></div></div>` : `<p class="muted" style="margin-top:0">Pentru operațiuni care nu apar în listă. Dacă nu știi ce conturi să folosești, întreabă asistentul.</p>`}
    <div class="fields-2">
      <label class="field"><span>Data</span><input type="date" id="m-data" value="${e(n.data)}"></label>
      <label class="field"><span>Document</span><input type="text" id="m-doc" value="${e(n.document)}"></label>
    </div>
    <label class="field"><span>Explicație</span><input type="text" id="m-expl" value="${e(n.explicatie)}"></label>
    <table><thead><tr><th>Debit</th><th>Credit</th><th class="n">Sumă</th><th></th></tr></thead><tbody id="m-rows"></tbody></table>
    <button class="btn sm ghost" id="m-add" style="margin-top:8px">${icon('plus')}Adaugă rând</button>
    <div id="m-help" class="small muted" style="margin-top:12px"></div>${dl}`,
    `<div class="row end">${existent && !autoGen ? '<button class="btn danger" id="m-del" style="margin-right:auto">Șterge</button>' : ''}<button class="btn" data-x>Renunță</button><button class="btn primary" id="m-save">Salvează nota</button></div>`, { wide: true });
  const q = (x) => $(x, s);
  const rows = () => {
    q('#m-rows').innerHTML = n.linii.map((l, i) => `<tr data-i="${i}">
      <td><input type="text" list="m-conturi" data-k="d" value="${e(l.d)}" placeholder="ex. 628"></td>
      <td><input type="text" list="m-conturi" data-k="c" value="${e(l.c)}" placeholder="ex. 401"></td>
      <td><input type="number" step="0.01" data-k="suma" value="${e(l.suma)}" style="text-align:right"></td>
      <td><button class="icon-btn" data-rm="${i}" aria-label="Șterge rândul">${icon('x')}</button></td></tr>`).join('');
    $$('[data-rm]', s).forEach((b) => (b.onclick = () => { n.linii.splice(Number(b.dataset.rm), 1); if (!n.linii.length) n.linii.push({ d: '', c: '', suma: '' }); rows(); }));
  };
  rows();
  s.addEventListener('input', (ev) => {
    const tr = ev.target.closest('tr[data-i]');
    if (tr) {
      n.linii[Number(tr.dataset.i)][ev.target.dataset.k] = ev.target.value.trim();
      const c = cont(ev.target.value.trim());
      if (ev.target.dataset.k !== 'suma' && ev.target.value) q('#m-help').textContent = `${c.cod} — ${c.nume}. ${c.ajutor}`;
    }
  });
  q('#m-add').onclick = () => { n.linii.push({ d: '', c: '', suma: '' }); rows(); };
  q('[data-x]').onclick = closeSheet;
  q('#m-save').onclick = async (ev) => {
    n.data = q('#m-data').value; n.document = q('#m-doc').value; n.explicatie = q('#m-expl').value;
    n.linii = n.linii.filter((l) => l.d || l.c || l.suma).map((l) => ({ ...l, suma: r2(l.suma) }));
    try {
      await withLoad(() => salveazaNota(n), ev.currentTarget);
      closeSheet(); toast('Notă salvată.'); await ctx.reload();
    } catch (err) { toast(err.message); }
  };
  if (q('#m-del')) q('#m-del').onclick = async () => {
    closeSheet();
    if (!(await confirma(`Ștergi nota ${existent.nr}?`, 'Șterge'))) return;
    await stergeNota(existent.id); toast('Notă ștearsă.'); await ctx.reload();
  };
}

export { notaManuala };
