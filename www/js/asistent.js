// Asistentul AI: conversație cu contextul real al firmei, sugestii pe ecranul curent.
import { e, $, icon, mdLite } from './ui.js';
import { db } from './db.js';
import * as ai from './ai.js';
import { contextAsistent } from './indicatii.js';

const SUGESTII = {
  acasa: ['Ce am de făcut luna aceasta?', 'Verifică-mi contabilitatea și spune-mi dacă e ceva greșit.', 'Explică-mi pe scurt ce înseamnă impozitul micro.'],
  documente: ['Am plătit un abonament software din SUA. Cum îl înregistrez?', 'Ce fac cu un bon fără CUI-ul firmei?', 'Când un laptop e mijloc fix și când e obiect de inventar?'],
  operatii: ['Administratorul a plătit ceva din bani proprii. Ce înregistrez?', 'Cum înregistrez o sumă din extras pe care nu o înțeleg?', 'Cum scot bani din firmă legal?'],
  registre: ['Explică-mi balanța de verificare.', 'De ce trebuie închisă luna?', 'Ce înseamnă sold debitor și sold creditor?'],
  declaratii: ['Ce declarații trebuie să depun și când?', 'Cum depun D112 pentru salarii?', 'Cum depun o declarație în SPV?'],
  setari: ['Cum aflu dacă firma e microîntreprindere?', 'Ce înseamnă să fii plătitor de TVA?', 'Am nevoie de cod special de TVA pentru abonamentele din străinătate?'],
  banca: ['Cum export extrasul din internet banking?', 'Ce fac cu o plată pe care nu o recunosc?', 'Cum înregistrez o plată cu cardul la Google sau Facebook?'],
  parteneri: ['Ce fac cu un client care nu plătește?', 'Cum compensez o datorie cu o creanță?', 'Cum confirm soldurile cu partenerii la final de an?'],
  formulare: ['Când folosesc o dispoziție de plată?', 'Cât e diurna neimpozabilă?', 'Cum fac decontul unui avans?'],
  ghid: ['Ce trebuie să fac lunar?', 'Ce declarații depune firma mea?', 'Ce face aplicația singură?'],
  salarii: ['Cât mă costă un angajat cu salariul minim?', 'Ce acte trebuie la angajare?', 'Pot să-mi fac contract de mandat ca administrator?'],
};

let ecranCurent = 'acasa';
let ctxRef = null;
export function seteazaEcran(ecran, ctx) { if (ecran !== 'asistent') ecranCurent = ecran; ctxRef = ctx; }

async function istoric() { return (await db.get('chat', 'main'))?.messages || []; }
async function salveaza(messages) { await db.put('chat', { id: 'main', messages: messages.slice(-60) }); }

let intrebareInAsteptare = null;
/** Deschide asistentul ca ecran separat (nu peste aplicație). Întrebarea, dacă există, se trimite imediat. */
export function deschide(intrebare) {
  intrebareInAsteptare = intrebare || null;
  if (location.hash === '#asistent') render.reia?.(); else location.hash = '#asistent';
}

export async function render(main, ctx) {
  ctxRef = ctx;
  const on = await ai.conectat();
  main.innerHTML = `
  <div class="chat-page">
    <div class="page-head" style="margin-bottom:8px"><div><button class="btn ghost sm" id="inapoi" style="padding-left:0">‹ Înapoi</button><h1>Asistent</h1>
      <p class="sub">Întreabă în cuvinte simple. Vede soldurile, documentele, salariații și termenele firmei.</p></div>
      <div class="row"><button class="btn sm" id="clear">Conversație nouă</button></div></div>
    <section class="panel chat-panel">
      <div class="msgs" id="msgs"></div>
      <div id="sug" style="margin-top:16px"></div>
    </section>
    <div class="composer-bar">
      <div class="composer"><textarea id="q" rows="1" placeholder="${on ? 'Întreabă orice…' : 'Asistentul are nevoie de internet'}" ${on ? '' : 'disabled'}></textarea><button class="btn primary" id="send" aria-label="Trimite" ${on ? '' : 'disabled'}>${icon('send')}</button></div>
      <p class="muted small" style="margin:6px 4px 0">Răspunsurile pot conține greșeli. Pentru decizii importante, confirmă cu un contabil autorizat.</p>
    </div>
  </div>`;
  const msgsEl = $('#msgs', main);
  let messages = await istoric();
  const jos = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  const draw = () => {
    msgsEl.innerHTML = messages.length ? messages.map((m) => `<div class="msg ${m.role}">${m.role === 'assistant' ? mdLite(m.content) : e(m.content)}</div>`).join('')
      : `<div class="msg assistant">${on ? `Bună! Sunt aici să te ajut cu contabilitatea ${e(ctx?.setari?.nume || 'firmei')}. Văd soldurile, documentele, salariații și termenele, așa că pot răspunde concret. Ce vrei să faci?` : 'Asistentul are nevoie de internet. Până revine conexiunea, aplicația îți dă indicații automate pe fiecare ecran, iar fiecare cont are explicația lui.'}</div>`;
    $('#sug', main).innerHTML = on && messages.length < 2 ? `<div class="chips">${(SUGESTII[ecranCurent] || SUGESTII.acasa).map((x) => `<button class="chip">${e(x)}</button>`).join('')}</div>` : '';
    $('#sug', main).querySelectorAll('.chip').forEach((c) => (c.onclick = () => trimite(c.textContent)));
  };
  let ocupat = false;
  const trimite = async (text) => {
    text = (text || '').trim();
    if (!text || ocupat) return;
    ocupat = true; $('#send', main).disabled = true;
    messages.push({ role: 'user', content: text });
    draw();
    const wait = document.createElement('div'); wait.className = 'msg assistant'; wait.innerHTML = '<span class="muted">Mă uit în contabilitate…</span>';
    msgsEl.appendChild(wait); jos();
    document.getElementById('loadbar').classList.add('on');
    let eroare = null;
    try {
      const context = ctxRef ? await contextAsistent(ctxRef, ecranCurent) : '';
      const r = await ai.chat(messages, context);
      messages.push({ role: 'assistant', content: r });
      await salveaza(messages);
    } catch (err) {
      eroare = err.message;
      messages.pop();
    } finally {
      document.getElementById('loadbar').classList.remove('on');
      ocupat = false; if ($('#send', main)) $('#send', main).disabled = !on;
    }
    if (!main.isConnected) return; // utilizatorul a plecat de pe ecran; răspunsul e salvat în istoric
    draw();
    if (eroare) {
      // întrebarea nu se pierde: rămâne pe ecran, cu buton de reîncercare
      const d = document.createElement('div'); d.className = 'msg user'; d.textContent = text; msgsEl.appendChild(d);
      const x = document.createElement('div'); x.className = 'msg assistant';
      x.innerHTML = `<span class="badge err">nu a mers</span> ${e(eroare)}<div class="row" style="margin-top:8px"><button class="btn sm" data-retry>Încearcă din nou</button></div>`;
      msgsEl.appendChild(x);
      x.querySelector('[data-retry]').onclick = () => { d.remove(); x.remove(); trimite(text); };
    }
    jos();
  };
  draw();
  const q = $('#q', main);
  q.oninput = () => { q.style.height = 'auto'; q.style.height = Math.min(140, q.scrollHeight) + 'px'; };
  q.onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); const t = q.value; q.value = ''; q.oninput(); trimite(t); } };
  $('#send', main).onclick = () => { const t = q.value; q.value = ''; q.oninput(); trimite(t); };
  $('#clear', main).onclick = async () => { messages = []; await salveaza(messages); draw(); };
  $('#inapoi', main).onclick = () => { if (history.length > 1) history.back(); else location.hash = '#acasa'; };
  render.reia = () => { const t = intrebareInAsteptare; intrebareInAsteptare = null; if (t && on) trimite(t); };
  if (messages.length) setTimeout(() => window.scrollTo(0, document.documentElement.scrollHeight), 50);
  if (intrebareInAsteptare && on) render.reia();
}
