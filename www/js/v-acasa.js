import { e, icon } from './ui.js';
import { balanta, lei, LUNI, trimDinLuna, rulajeClasa, dataRo, iso } from './engine.js';
import { d100Micro, estimareProfit, termene, zilePana } from './declaratii.js';
import { indicatii, primiPasi } from './indicatii.js';
import { lista as listaSalariati } from './salarii.js';
import { saveSetari } from './engine.js';
import * as auto from './auto.js';
import { areHttpNativ } from './host.js';

export async function render(main, ctx) {
  const { note, setari, documente } = ctx;
  const now = new Date(); const an = now.getFullYear(); const luna = now.getMonth() + 1; const t = trimDinLuna(luna);
  const b = balanta(note, setari, `${an}-01-01`, `${an}-12-31`);
  const sold = (pref) => b.rows.filter((r) => r.cod.startsWith(pref)).reduce((s, r) => s + r.sfd - r.sfc, 0);
  const rc = rulajeClasa(note, `${an}-01-01`, `${an}-12-31`);
  let imp, impHint;
  if (setari.regim === 'micro') {
    const d = d100Micro(note, setari, an, t);
    imp = d.impozitDePlata; impHint = `Micro 1% pentru T${t}`;
  } else {
    const p = estimareProfit(note, setari, an, t);
    imp = p.impozit; impHint = `Profit 16%, cumulat ${an}`;
  }
  const tips = await indicatii(ctx);
  const pasi = primiPasi({ ...ctx, salariati: await listaSalariati() }, areHttpNativ());
  const tm = termene(setari, now, 3).slice(0, 5);
  const recente = [...documente].sort((a, b) => (b.data || '').localeCompare(a.data || '')).slice(0, 6);

  main.innerHTML = `
  <div class="page-head">
    <div><h1>${e(setari.nume)}</h1><p class="sub">${LUNI[luna - 1][0].toUpperCase() + LUNI[luna - 1].slice(1)} ${an} · ${setari.regim === 'micro' ? 'microîntreprindere' : 'impozit pe profit'} · ${setari.platitorTVA ? 'plătitoare de TVA' : 'neplătitoare de TVA'}</p></div>
    <div class="row">
      <button class="btn" data-go="#operatii">${icon('swap')}Operațiune</button>
      <button class="btn primary" data-go="#documente/nou">${icon('scan')}Adaugă document</button>
    </div>
  </div>

  <section class="panel">
    <div class="figures">
      <div class="figure"><div class="label">În bancă</div><div class="value num">${lei(sold('512'))}<small>lei</small></div></div>
      <div class="figure"><div class="label">În casă</div><div class="value num">${lei(sold('5311'))}<small>lei</small></div></div>
      <div class="figure"><div class="label">Rezultat ${an}</div><div class="value num" style="color:${rc.rezultat < 0 ? 'var(--err)' : 'inherit'}">${lei(rc.rezultat)}<small>lei</small></div><div class="hint">${lei(rc.venituri)} venituri, ${lei(rc.cheltuieli)} cheltuieli</div></div>
      <div class="figure"><div class="label">Impozit estimat</div><div class="value num">${lei(imp)}<small>lei</small></div><div class="hint">${impHint}</div></div>
    </div>
  </section>

  ${pasi ? `<section class="panel" style="margin-top:16px" id="primi-pasi">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">Primii pași · ${pasi.filter((x) => x.ok).length} din ${pasi.length}</h2><button class="btn sm ghost" id="pp-ascunde">Ascunde</button></div>
    <p class="muted small">Fă-i o singură dată, în ordinea de mai jos. Apoi aplicația lucrează aproape singură: tu adaugi bonurile și extrasul de cont o dată pe lună.</p>
    <ul class="list">${pasi.map((x, i) => `<li class="${x.ok ? '' : 'clickable'}" ${x.ok ? '' : `data-go="${x.act}"`}><span class="badge ${x.ok ? 'ok' : ''}" style="min-width:28px;justify-content:center">${x.ok ? '✓' : i + 1}</span><div class="grow"><div class="t" style="${x.ok ? 'text-decoration:line-through;opacity:.6' : ''}">${e(x.text)}</div></div></li>`).join('')}</ul>
  </section>` : ''}

  <div class="split" style="margin-top:16px">
    <section class="panel">
      <h2>Ce ai de făcut</h2>
      ${tips.map((x) => `<div class="tip ${x.grav === 'info' ? '' : x.grav}"><span class="dot"></span><div class="grow"><p>${e(x.text)}</p>${x.act ? `<div class="act"><button class="btn sm ghost" ${x.ai ? `data-ai="${e(x.ai)}"` : `data-go="${e(x.act[1])}"`}>${e(x.act[0])}</button></div>` : ''}</div></div>`).join('')}
      <div class="row" style="margin-top:8px"><button class="btn sm" data-ai="Verifică-mi te rog contabilitatea pe luna aceasta și spune-mi dacă am uitat ceva sau dacă e ceva greșit.">${icon('spark')}Cere asistentului o verificare completă</button></div>
    </section>
    <div>
      <section class="panel">
        <h2>Termene</h2>
        ${tm.length ? `<ul class="list">${tm.map((x) => { const z = zilePana(x.termen); return `<li><div class="grow"><div class="t">${e(x.nume)}</div><div class="m">Pentru ${e(x.perioada)} · ${dataRo(iso(x.termen))}</div></div><span class="badge ${z <= 5 ? 'err' : z <= 14 ? 'warn' : ''}">${z === 0 ? 'azi' : z < 0 ? 'depășit' : `${z} zile`}</span></li>`; }).join('')}</ul>` : '<p class="muted">Niciun termen în următoarele 3 luni.</p>'}
      </section>
      <section class="panel">
        <h2>Automat</h2>
        <ul class="list">
          <li><div class="grow"><div class="t">Sincronizare</div><div class="m">${ctx.seif ? (ctx.seif.eroare ? e(ctx.seif.eroare) : ctx.seif.ultima ? 'Ultima: ' + new Date(ctx.seif.ultima).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' }) : 'Pornită') : 'Doar pe acest dispozitiv'}</div></div>${ctx.seif ? `<span class="badge ${ctx.seif.eroare ? 'err' : 'ok'}">${ctx.seif.eroare ? 'eroare' : 'criptat'}</span>` : '<button class="btn sm ghost" data-go="#setari/sync">Pornește</button>'}</li>
          <li><div class="grow"><div class="t">Facturi din SPV</div><div class="m">${ctx.anaf ? (ctx.spv?.ultima ? 'Verificat ' + new Date(ctx.spv.ultima).toLocaleString('ro-RO', { dateStyle: 'short', timeStyle: 'short' }) : 'Conectat') : areHttpNativ() ? 'Neconectat' : 'Doar în aplicația instalată'}</div></div>${ctx.anaf ? '<span class="badge ok">conectat</span>' : '<button class="btn sm ghost" data-go="#setari/spv">Conectează</button>'}</li>
          <li><div class="grow"><div class="t">Curs EUR pentru plafonul micro</div><div class="m">${setari.cursAn ? `BNR 31.12.${setari.cursAn}` : 'Implicit, până la prima actualizare'}</div></div><div class="num">${Number(setari.cursEUR).toFixed(4)}</div></li>
          <li><div class="grow"><div class="t">Închiderea lunilor</div><div class="m">${setari.inchidereAutomata === false ? 'Manuală' : 'Se face singură'}</div></div><span class="badge ${setari.inchidereAutomata === false ? '' : 'ok'}">${setari.inchidereAutomata === false ? 'oprită' : 'automat'}</span></li>
        </ul>
        ${auto.ultimele().slice(0, 3).map((x) => `<p class="small ${x.tip === 'eroare' ? '' : 'muted'}" style="margin:8px 0 0">${x.tip === 'eroare' ? '<span class="badge err">eroare</span> ' : ''}${e(x.text)}</p>`).join('')}
      </section>
      <section class="panel">
        <h2>Ultimele documente</h2>
        ${recente.length ? `<ul class="list">${recente.map((d) => `<li class="clickable" data-go="#documente/${d.id}"><div class="grow"><div class="t">${e(d.partener?.nume || d.descriere || 'Document')}</div><div class="m">${dataRo(d.data)} · ${e(d.descriere || '')}</div></div><div class="amt num" style="color:${d.tip === 'venit' ? 'var(--ok)' : 'inherit'}">${d.tip === 'venit' ? '+' : '−'}${lei(d.total)}</div></li>`).join('')}</ul>`
          : `<div class="empty"><h3>Niciun document încă</h3><p>Fă o poză unui bon sau încarcă o factură. Asistentul citește datele și le înregistrează.</p><button class="btn primary" data-go="#documente/nou">Adaugă primul document</button></div>`}
      </section>
    </div>
  </div>`;
  const pp = main.querySelector('#pp-ascunde');
  if (pp) pp.onclick = async () => { await saveSetari({ ...setari, primiPasiAscuns: true }); await ctx.reload(); };
}
