// Utilitare de interfață: escape, iconițe, bară de încărcare, toast, foaie laterală, confirmare.
export const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const P = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  doc: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  book: '<path d="M4 4h6a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-6a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h6z"/>',
  file: '<path d="M8 3h8l4 4v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="m10 14 2 2 4-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  scan: '<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  download: '<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15.5 4.8a3.2 3.2 0 0 1 0 6.4M17 14.2c2.4.6 4 2.9 4 5.8"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.3-2.5 3.8M12 17.2v.1"/>',
  form: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  sync: '<path d="M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

// Bara de încărcare — orice așteptare se vede.
let busy = 0;
export async function withLoad(fn, btn) {
  busy++; document.getElementById('loadbar').classList.add('on');
  const old = btn && btn.innerHTML;
  if (btn) { btn.disabled = true; }
  try { return await fn(); }
  finally {
    busy = Math.max(0, busy - 1);
    if (!busy) document.getElementById('loadbar').classList.remove('on');
    if (btn) { btn.disabled = false; btn.innerHTML = old; }
  }
}

let tt;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 3200);
}

// Foaie laterală
let onCloseCb = null;
export function openSheet(title, bodyHTML, footHTML = '', { wide = false, onClose } = {}) {
  const s = document.getElementById('sheet');
  s.classList.toggle('wide', wide);
  s.innerHTML = `<div class="sheet-head"><h2>${e(title)}</h2><button class="icon-btn" data-close aria-label="Închide">${icon('x')}</button></div>
    <div class="sheet-body">${bodyHTML}</div>${footHTML ? `<div class="sheet-foot">${footHTML}</div>` : ''}`;
  s.classList.add('open'); document.getElementById('sheet-back').classList.add('open');
  s.setAttribute('aria-hidden', 'false');
  onCloseCb = onClose || null;
  s.querySelector('[data-close]').onclick = closeSheet;
  return s;
}
export function closeSheet() {
  const s = document.getElementById('sheet');
  s.classList.remove('open'); document.getElementById('sheet-back').classList.remove('open');
  s.setAttribute('aria-hidden', 'true');
  if (onCloseCb) { const f = onCloseCb; onCloseCb = null; f(); }
}

export function confirma(text, ok = 'Confirmă') {
  return new Promise((res) => {
    const s = openSheet('Confirmare', `<p>${e(text)}</p>`,
      `<div class="row end"><button class="btn" data-no>Renunță</button><button class="btn primary" data-yes>${e(ok)}</button></div>`,
      { onClose: () => res(false) });
    s.querySelector('[data-no]').onclick = () => closeSheet();
    s.querySelector('[data-yes]').onclick = () => { onCloseCb = null; closeSheet(); res(true); };
  });
}

/** Întrebare cu mai multe răspunsuri: optiuni = [[valoare, eticheta, principal?]]; rezolvă cu valoarea sau null. */
export function alege(titlu, text, optiuni) {
  return new Promise((res) => {
    const s = openSheet(titlu, `<p>${e(text)}</p>`,
      `<div style="display:flex;flex-direction:column;gap:8px">${optiuni.map(([v, l, p], i) => `<button class="btn ${p ? 'primary' : ''}" data-opt="${i}" style="width:100%;justify-content:center">${e(l)}</button>`).join('')}<button class="btn ghost" data-no style="width:100%;justify-content:center">Renunță</button></div>`,
      { onClose: () => res(null) });
    s.querySelector('[data-no]').onclick = () => closeSheet();
    s.querySelectorAll('[data-opt]').forEach((b) => (b.onclick = () => { onCloseCb = null; closeSheet(); res(optiuni[Number(b.dataset.opt)][0]); }));
  });
}

export function descarca(nume, continut, tip = 'application/octet-stream') {
  const url = URL.createObjectURL(new Blob([continut], { type: tip }));
  const a = document.createElement('a'); a.href = url; a.download = nume; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

// Ecuația debit = credit, cu explicația contului la hover
export function eqHTML(d, c, suma, cont) {
  const cd = cont(d), cc = cont(c);
  return `<span class="eq"><abbr class="d" title="${e(cd.nume)}">${e(d)}</abbr><span class="is">=</span><abbr class="c" title="${e(cc.nume)}">${e(c)}</abbr>${suma != null ? `<span class="is">:</span><span>${e(suma)}</span>` : ''}</span>`;
}

// Formatare simplă markdown pentru răspunsurile asistentului (doar bold și liste)
export function mdLite(s) {
  return e(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^#{1,4}\s*(.+)$/gm, '<strong>$1</strong>');
}
