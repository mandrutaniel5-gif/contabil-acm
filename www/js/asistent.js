// Asistentul AI: conversație cu contextul real al firmei, sugestii pe ecranul curent.
import { e, $, icon, openSheet, mdLite } from './ui.js';
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
export function seteazaEcran(ecran, ctx) { ecranCurent = ecran; ctxRef = ctx; }

async function istoric() { return (await db.get('chat', 'main'))?.messages || []; }
async function salveaza(messages) { await db.put('chat', { id: 'main', messages: messages.slice(-60) }); }

export async function deschide(intrebare) {
  const on = await ai.conectat();
  const s = openSheet('Asistent', `<div class="msgs" id="msgs"></div><div id="sug" style="margin-top:16px"></div>`,
    `<div class="composer"><textarea id="q" rows="1" placeholder="${on ? 'Întreabă orice…' : 'Asistentul are nevoie de internet'}" ${on ? '' : 'disabled'}></textarea><button class="btn primary" id="send" aria-label="Trimite" ${on ? '' : 'disabled'}>${icon('send')}</button></div>
     <div class="row" style="justify-content:space-between;margin-top:8px"><span class="muted small">Răspunsurile pot conține greșeli. Pentru decizii importante, confirmă cu un contabil autorizat.</span><button class="btn sm ghost" id="clear">Conversație nouă</button></div>`);
  const msgsEl = $('#msgs', s);
  let messages = await istoric();
  const draw = () => {
    msgsEl.innerHTML = messages.length ? messages.map((m) => `<div class="msg ${m.role}">${m.role === 'assistant' ? mdLite(m.content) : e(m.content)}</div>`).join('')
      : `<div class="msg assistant">${on ? `Bună! Sunt aici să te ajut cu contabilitatea ${e(ctxRef?.setari?.nume || 'firmei')}. Văd soldurile, documentele, salariații și termenele, așa că pot răspunde concret. Ce vrei să faci?` : 'Asistentul are nevoie de internet. Până revine conexiunea, aplicația îți dă indicații automate pe fiecare ecran, iar fiecare cont are explicația lui.'}</div>`;
    $('#sug', s).innerHTML = on && messages.length < 2 ? `<div class="chips">${(SUGESTII[ecranCurent] || SUGESTII.acasa).map((x) => `<button class="chip">${e(x)}</button>`).join('')}</div>` : '';
    $('#sug', s).querySelectorAll('.chip').forEach((c) => (c.onclick = () => trimite(c.textContent)));
    s.querySelector('.sheet-body').scrollTop = 1e9;
  };
  const trimite = async (text) => {
    text = (text || '').trim();
    if (!text) return;
    messages.push({ role: 'user', content: text });
    draw();
    const wait = document.createElement('div'); wait.className = 'msg assistant'; wait.innerHTML = '<span class="muted">Mă uit în contabilitate…</span>';
    msgsEl.appendChild(wait); s.querySelector('.sheet-body').scrollTop = 1e9;
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
      draw();
    }
    if (eroare) {
      // întrebarea nu se pierde: rămâne pe ecran, cu buton de reîncercare
      const d = document.createElement('div'); d.className = 'msg assistant';
      d.innerHTML = `<span class="badge err">nu a mers</span> ${e(eroare)}<div class="row" style="margin-top:8px"><button class="btn sm" data-retry>Încearcă din nou</button></div>`;
      msgsEl.appendChild(d); s.querySelector('.sheet-body').scrollTop = 1e9;
      d.querySelector('[data-retry]').onclick = () => { d.remove(); trimite(text); };
    }
  };
  draw();
  const q = $('#q', s);
  q.oninput = () => { q.style.height = 'auto'; q.style.height = Math.min(140, q.scrollHeight) + 'px'; };
  q.onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); const t = q.value; q.value = ''; trimite(t); } };
  $('#send', s).onclick = () => { const t = q.value; q.value = ''; trimite(t); };
  $('#clear', s).onclick = async () => { messages = []; await salveaza(messages); draw(); };
  if (intrebare && on) trimite(intrebare);
  else if (on) setTimeout(() => q.focus(), 300);
}
