// Client AI: apelează funcțiile serverului firmei. Autentificarea e anonimă (fără cont), cheia Claude stă pe server.
import { idToken, FIREBASE } from './auth.js';
import { KEYWORD_RULES } from './rules.js';

export async function conectat() { return navigator.onLine; }

async function call(fn, body) {
  if (!navigator.onLine) throw new Error('Nu ai conexiune la internet. Asistentul AI are nevoie de internet.');
  let r;
  try {
    r = await fetch(`${FIREBASE.functions}/${{ ai: 'contabilAi', cui: 'contabilCui' }[fn] || fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await idToken()) },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Serverul ACM Contabil nu răspunde. Verifică internetul sau încearcă peste un minut.');
  }
  let j = {};
  try { j = await r.json(); } catch { /* răspuns gol */ }
  if (r.status === 404) throw new Error('Serverul ACM Contabil nu este încă publicat (funcțiile Firebase).');
  if (!r.ok) throw new Error(j.error || `Serverul a răspuns cu eroarea ${r.status}.`);
  return j;
}
export { call as apelServer };

export async function chat(messages, context) {
  return (await call('ai', { mode: 'chat', messages, context })).text;
}
export async function review(prompt, context) {
  return (await call('ai', { mode: 'review', messages: [{ role: 'user', content: prompt }], context })).text;
}
export async function extrage(file, context) {
  return (await call('ai', { mode: 'extract', file, context })).result;
}
export async function extrageExtras(file) {
  return (await call('ai', { mode: 'extras', file })).result;
}
export async function incadreaza(items, context) {
  return (await call('ai', { mode: 'incadrare', items, context })).result;
}

// Căutare firmă după CUI direct în registrul public ANAF (din aplicația instalată), cu serverul ca rezervă.
export async function cautaCUI(cui) {
  const { nativeFetch, areHttpNativ } = await import('./host.js');
  const c = String(cui || '').replace(/\D/g, '');
  if (!c) throw new Error('CUI invalid');
  if (areHttpNativ()) {
    const r = await nativeFetch('https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ cui: Number(c), data: new Date().toISOString().slice(0, 10) }]),
    });
    if (r.ok) {
      const f = r.json().found?.[0];
      if (!f) throw new Error('CUI negăsit la ANAF');
      return { nume: f.date_generale?.denumire || '', cui: c, adresa: f.date_generale?.adresa || '', regCom: f.date_generale?.nrRegCom || '', platitorTVA: !!f.inregistrare_scop_Tva?.scpTVA, tvaLaIncasare: !!f.inregistrare_RTVAI?.statusTvaIncasare };
    }
  }
  return call('cui', { cui: c });
}

// Încadrare locală după cuvinte cheie — folosită când AI-ul nu e conectat sau ca sugestie instantă.
export function sugestieLocala(text, total) {
  const t = ' ' + (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + ' ';
  for (const r of KEYWORD_RULES) {
    if (r.kw.some((k) => t.includes(k))) {
      let cont = r.cont;
      if (cont === '303' && Number(total) >= 5000) cont = '2131';
      return { cont, motiv: `Am recunoscut „${r.eticheta}” din descriere.`, tvaDeductibil: cont === '6022' ? 50 : 100 };
    }
  }
  if (Number(total) >= 5000) return { cont: '2131', motiv: 'Peste 5.000 lei: dacă îl folosești mai mult de un an, e mijloc fix.', tvaDeductibil: 100 };
  return null;
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// Micșorează imaginile mari înainte de trimitere (mai rapid, mai ieftin).
export async function pregatesteImagine(file, maxSide = 1800) {
  if (!file.type.startsWith('image/')) return { type: file.type, data: await fileToBase64(file) };
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL('image/jpeg', 0.85);
  return { type: 'image/jpeg', data: url.split(',')[1], preview: url };
}
