// Client AI: autentificare Firebase (REST, fără SDK) + apeluri către funcțiile „ai” și „cui”.
import { db } from './db.js';
import { getSetari } from './engine.js';
import { KEYWORD_RULES } from './rules.js';

const SESSION_ID = 'aiSession';

async function session() { return db.get('settings', SESSION_ID); }

export async function conectat() {
  const s = await session();
  return !!(s && s.refreshToken);
}

export async function login(email, password) {
  const set = await getSetari();
  if (!set.ai.firebaseApiKey) throw new Error('Completează întâi cheia web Firebase în Setări → Asistent AI.');
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(set.ai.firebaseApiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(mesajEroareFirebase(j.error?.message));
  await db.put('settings', { id: SESSION_ID, email: j.email, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (Number(j.expiresIn) - 60) * 1000 });
  return j.email;
}

export async function logout() { await db.del('settings', SESSION_ID); }

function mesajEroareFirebase(code = '') {
  if (code.includes('INVALID_LOGIN_CREDENTIALS') || code.includes('INVALID_PASSWORD') || code.includes('EMAIL_NOT_FOUND')) return 'Email sau parolă greșite.';
  if (code.includes('TOO_MANY_ATTEMPTS')) return 'Prea multe încercări. Încearcă din nou peste câteva minute.';
  if (code.includes('API_KEY')) return 'Cheia web Firebase nu este validă.';
  return 'Autentificare eșuată' + (code ? ` (${code})` : '') + '.';
}

async function token() {
  const s = await session();
  if (!s) throw new Error('Asistentul AI nu este conectat. Intră în Setări → Asistent AI.');
  if (Date.now() < s.exp) return s.idToken;
  const set = await getSetari();
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(set.ai.firebaseApiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(s.refreshToken)}`,
  });
  const j = await r.json();
  if (!r.ok) { await logout(); throw new Error('Sesiunea a expirat. Conectează-te din nou în Setări.'); }
  await db.put('settings', { ...s, idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + (Number(j.expires_in) - 60) * 1000 });
  return j.id_token;
}

async function call(fn, body) {
  const set = await getSetari();
  if (!set.ai.functionUrl) throw new Error('Adresa funcției AI lipsește. Completează-o în Setări → Asistent AI.');
  const base = set.ai.functionUrl.replace(/\/+$/, '');
  const r = await fetch(`${base}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (await token()) },
    body: JSON.stringify(body),
  });
  let j = {};
  try { j = await r.json(); } catch { /* răspuns gol */ }
  if (!r.ok) throw new Error(j.error || `Serverul a răspuns cu eroarea ${r.status}.`);
  return j;
}

export async function chat(messages, context) {
  return (await call('ai', { mode: 'chat', messages, context })).text;
}
export async function review(prompt, context) {
  return (await call('ai', { mode: 'review', messages: [{ role: 'user', content: prompt }], context })).text;
}
export async function extrage(file, context) {
  return (await call('ai', { mode: 'extract', file, context })).result;
}
export async function cautaCUI(cui) { return call('cui', { cui }); }

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
