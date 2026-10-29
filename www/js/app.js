import { db } from './db.js';
import { getSetari, toateNotele, balanta } from './engine.js';
import { icon, $, $$, openSheet, closeSheet } from './ui.js';
import * as asistent from './asistent.js';
import { render as acasa } from './v-acasa.js';
import { render as documente } from './v-documente.js';
import { render as operatii } from './v-operatii.js';
import { render as registre } from './v-registre.js';
import { render as declaratii } from './v-declaratii.js';
import { render as setari } from './v-setari.js';
import { render as banca } from './v-banca.js';
import { render as parteneri } from './v-parteneri.js';
import { render as formulare } from './v-formulare.js';
import { render as ghid } from './v-ghid.js';
import * as auto from './auto.js';
export { VERSIUNE } from './version.js';

const MAI_MULT = ['operatii', 'parteneri', 'declaratii', 'formulare', 'ghid', 'setari'];
const ROUTES = {
  acasa: { titlu: 'Acasă', icon: 'home', render: acasa },
  documente: { titlu: 'Documente', icon: 'doc', render: documente },
  banca: { titlu: 'Bancă', icon: 'bank', render: banca },
  operatii: { titlu: 'Operațiuni', icon: 'swap', render: operatii },
  parteneri: { titlu: 'Parteneri', icon: 'users', render: parteneri },
  registre: { titlu: 'Registre', icon: 'book', render: registre },
  declaratii: { titlu: 'Declarații', icon: 'file', render: declaratii },
  formulare: { titlu: 'Formulare', icon: 'form', render: formulare },
  ghid: { titlu: 'Ghid', icon: 'help', render: ghid },
  setari: { titlu: 'Setări', icon: 'gear', render: setari },
};

const ctx = {
  note: [], documente: [], parteneri: [], mijloace: [], setari: null, extrase: [], seif: null, spv: null, anaf: null,
  async load() {
    [this.note, this.documente, this.parteneri, this.mijloace, this.setari, this.extrase, this.seif, this.spv, this.anaf] = await Promise.all([
      toateNotele(), db.all('documente'), db.all('parteneri'), db.all('mijloace'), getSetari(), db.all('extrase'),
      db.get('meta', 'seif'), db.get('meta', 'spv'), db.get('settings', 'anaf'),
    ]);
    applyTheme(this.setari.tema);
  },
  async reload() { await this.load(); await route(); },
  // după o actualizare venită automat (sincronizare, SPV): reîmprospătează doar dacă nu ești în mijlocul unei completări
  async reloadDiscret() {
    await this.load();
    const h = location.hash.slice(1) || 'acasa';
    const editor = /^(documente\/.+|formulare\/.+|setari|operatii|registre\/mijloace\/nou)/.test(h);
    const deschis = document.getElementById('sheet').classList.contains('open');
    const scrie = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (!editor && !deschis && !scrie) await route({ pastreazaScroll: true });
  },
  soldCasa() {
    const an = new Date().getFullYear();
    const r = balanta(this.note, this.setari, `${an}-01-01`, `${an}-12-31`).rows.find((x) => x.cod === '5311');
    return r ? r.sfd - r.sfc : 0;
  },
};

function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

function shell() {
  const nav = Object.entries(ROUTES).map(([k, r]) => `<button class="nav-btn" data-go="#${k}" data-r="${k}">${icon(r.icon)}${r.titlu}</button>`).join('');
  const tabs = ['acasa', 'documente', 'banca', 'registre'].map((k) => `<button data-go="#${k}" data-r="${k}">${icon(ROUTES[k].icon)}${ROUTES[k].titlu}</button>`).join('')
    + `<button id="more" data-r="more">${icon('more')}Mai mult</button>`;
  document.getElementById('app').innerHTML = `
  <div class="shell">
    <aside class="side" aria-label="Navigare">
      <div class="brand"><div class="brand-mark">AC</div><div><b>ACM Contabil</b><small>${''}</small></div></div>
      ${nav}
      <div class="spacer"></div>
      <button class="nav-btn ai-side" id="ai-btn">${icon('spark')}Asistent</button>
    </aside>
    <main id="main"></main>
  </div>
  <nav class="tabbar" aria-label="Navigare">${tabs}</nav>
  <button class="fab" id="fab">${icon('spark')}Asistent</button>`;
  $('#ai-btn').onclick = () => asistent.deschide();
  $('#fab').onclick = () => asistent.deschide();
  $('#more').onclick = () => {
    const s = openSheet('Mai mult', `<ul class="list">${MAI_MULT.map((k) => `<li class="clickable" data-go="#${k}"><span style="width:22px;color:var(--accent)">${icon(ROUTES[k].icon)}</span><div class="grow"><div class="t">${ROUTES[k].titlu}</div></div><span class="muted">›</span></li>`).join('')}</ul>`);
    s.addEventListener('click', (ev) => { if (ev.target.closest('[data-go]')) closeSheet(); });
  };
}

async function route(opt = {}) {
  const y = window.scrollY;
  const [name, ...params] = (location.hash.slice(1) || 'acasa').split('/');
  const r = ROUTES[name] || ROUTES.acasa;
  const key = ROUTES[name] ? name : 'acasa';
  document.body.classList.toggle('editor', (['documente', 'parteneri'].includes(key) && params.length > 0) || (key === 'registre' && params[1] === 'nou') || key === 'setari' || key === 'formulare' && params.length > 0);
  $$('[data-r]').forEach((b) => b.setAttribute('aria-current', b.dataset.r === key || (b.dataset.r === 'more' && MAI_MULT.includes(key)) ? 'page' : 'false'));
  document.querySelector('.brand small').textContent = ctx.setari.nume;
  asistent.seteazaEcran(key === 'declaratii' && params[0] === 'salarii' ? 'salarii' : key, ctx);
  const main = $('#main');
  const view = document.createElement('div'); // container nou la fiecare randare: fără ascultători rămași
  main.replaceChildren(view);
  document.title = `${r.titlu} — ACM Contabil`;
  try {
    await r.render(view, ctx, params);
    if (opt.pastreazaScroll) window.scrollTo(0, y);
    view.querySelectorAll('.seg [aria-pressed="true"]').forEach((b) => { const sg = b.parentElement; if (sg.scrollWidth > sg.clientWidth) sg.scrollLeft = b.offsetLeft - (sg.clientWidth - b.offsetWidth) / 2; });
  }
  catch (err) {
    console.error(err);
    view.innerHTML = `<div class="panel"><h2>Ecranul nu s-a putut afișa</h2><p class="muted">${String(err.message || err)}</p><button class="btn" data-go="#acasa">Înapoi acasă</button></div>`;
  }
}

// Navigare și acțiuni globale
document.addEventListener('click', (ev) => {
  const go = ev.target.closest('[data-go]');
  if (go) {
    ev.preventDefault();
    const h = go.dataset.go;
    if (location.hash === h) route(); else location.hash = h;
    window.scrollTo({ top: 0 });
    return;
  }
  const q = ev.target.closest('[data-ai]');
  if (q) { ev.preventDefault(); asistent.deschide(q.dataset.ai); }
});
document.getElementById('sheet-back').onclick = closeSheet;
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSheet(); });
window.addEventListener('hashchange', () => { if (document.getElementById('sheet').classList.contains('open')) closeSheet(); route(); });

(async () => {
  await ctx.load();
  shell();
  await route();
  auto.porneste(() => ctx.reloadDiscret());
})();
