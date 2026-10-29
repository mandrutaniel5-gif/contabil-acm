// Funcții Firebase pentru ACM Contabil.
// Cheia Claude stă doar aici (secret Firebase), niciodată în aplicație.
//   firebase functions:secrets:set ANTHROPIC_API_KEY
//   firebase functions:config  → setează ALLOWED_EMAILS în .env (vezi README)
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');

admin.initializeApp();
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const ALLOWED_EMAILS = defineString('ALLOWED_EMAILS', { default: '' }); // listă separată prin virgulă
const MODEL = 'claude-sonnet-5-5';

const SYSTEM = `Ești asistentul contabil din aplicația ACM Contabil, folosită de o persoană cu puțină experiență în contabilitate, pentru un SRL din România (servicii IT).
Reguli:
- Răspunzi în română, simplu, pe pași, fără jargon inutil. Când folosești un termen tehnic, îl explici într-o propoziție.
- Te bazezi pe legislația românească în vigoare în 2026: OMFP 1802/2014, Codul fiscal. Impozit micro cotă unică 1%, plafon 100.000 EUR; impozit pe profit 16%; TVA 21% standard și 11% redus, plafon de scutire 395.000 lei; impozit pe dividende 16%; prag mijloc fix 5.000 lei.
- Pentru fiecare operațiune indici notele contabile sub forma „cont debitor = cont creditor : sumă” și unde se face în aplicație.
- Dacă nu ești sigur sau situația e neobișnuită (ex. operațiuni intracomunitare, dividende, angajați, plafoane depășite), spui clar asta și recomanzi confirmarea cu un contabil autorizat. Nu inventa articole de lege, cote sau termene.
- Bilanțul și declarațiile anuale trebuie semnate de o persoană autorizată, dacă administratorul nu are studii economice — amintește asta când e relevant.
- Ești concis: maximum 8–10 rânduri, dacă nu ți se cere mai mult.`;

const EXTRACT_PROMPT = `Extrage datele din acest document de cheltuială (bon fiscal, chitanță sau factură). Răspunde DOAR cu JSON valid, fără text în plus:
{
 "tipDocument": "Bon fiscal" | "Factura" | "Chitanta",
 "nr": string,
 "data": "YYYY-MM-DD",
 "furnizor": { "nume": string, "cui": string },
 "descriere": string scurtă (ce s-a cumpărat, max 60 caractere),
 "total": număr (total de plată, lei),
 "tva": număr (suma TVA, 0 dacă nu apare),
 "tvaCota": 0.21 | 0.11 | 0,
 "moneda": "RON" | "EUR" | "USD",
 "cont": contul de cheltuială din planul OMFP 1802 cel mai potrivit (ex. "6022","6028","303","2131","605","611","612","613","622","6231","6232","624","625","626","627","628","635","6588"),
 "motivCont": o propoziție simplă care explică alegerea contului,
 "tvaDeductibil": procent 0-100 (50 pentru combustibil auto cu utilizare mixtă, altfel 100),
 "avertismente": [ listă de lucruri de verificat de om, ex. "Bonul nu are CUI-ul firmei — TVA nu se poate deduce", "Peste 5.000 lei: posibil mijloc fix" ],
 "incredere": număr 0-1
}
Dacă un câmp nu se vede, pune "" sau 0 și adaugă un avertisment.`;

function cors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

async function auth(req) {
  const h = req.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw Object.assign(new Error('Neautentificat'), { code: 401 });
  const u = await admin.auth().verifyIdToken(token);
  const allowed = ALLOWED_EMAILS.value().split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!u.email_verified) throw Object.assign(new Error('Emailul nu este confirmat'), { code: 403 });
  if (allowed.length && !allowed.includes((u.email || '').toLowerCase())) throw Object.assign(new Error('Cont neautorizat'), { code: 403 });
  return u;
}

function parseJSON(text) {
  const m = text.match(/\{[\s\S]*\}/);
  return JSON.parse(m ? m[0] : text);
}

exports.ai = onRequest({ secrets: [ANTHROPIC_API_KEY], region: 'europe-west1', timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).send('');
  try {
    await auth(req);
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    const { mode, messages = [], context = '', file } = req.body || {};

    if (mode === 'extract') {
      if (!file || !file.data || !file.type) return res.status(400).json({ error: 'Lipsește fișierul' });
      if (file.data.length > 14_000_000) return res.status(413).json({ error: 'Fișier prea mare (max ~10 MB)' });
      const block = file.type === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: file.data } }
        : { type: 'image', source: { type: 'base64', media_type: file.type, data: file.data } };
      const r = await client.messages.create({
        model: MODEL, max_tokens: 1500, system: SYSTEM,
        messages: [{ role: 'user', content: [block, { type: 'text', text: EXTRACT_PROMPT + (context ? `\n\nContext firmă: ${context}` : '') }] }],
      });
      const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return res.json({ result: parseJSON(text) });
    }

    // chat / review
    const clean = messages.slice(-20).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content).slice(0, 20000) }));
    if (!clean.length || clean[clean.length - 1].role !== 'user') return res.status(400).json({ error: 'Mesaj invalid' });
    const r = await client.messages.create({
      model: MODEL, max_tokens: mode === 'review' ? 2000 : 1200,
      system: SYSTEM + (context ? `\n\nSituația curentă din aplicație (date reale ale firmei):\n${String(context).slice(0, 30000)}` : ''),
      messages: clean,
    });
    return res.json({ text: r.content.filter((b) => b.type === 'text').map((b) => b.text).join('') });
  } catch (e) {
    console.error(e);
    return res.status(e.code && Number.isInteger(e.code) ? e.code : 500).json({ error: e.message || 'Eroare' });
  }
});

// Căutare firmă după CUI în registrul ANAF (date publice), ca aplicația să completeze automat furnizorul/clientul.
exports.cui = onRequest({ region: 'europe-west1' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    await auth(req);
    const cui = String(req.body?.cui || '').replace(/\D/g, '');
    if (!cui) return res.status(400).json({ error: 'CUI invalid' });
    const today = new Date().toISOString().slice(0, 10);
    const r = await fetch('https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ cui: Number(cui), data: today }]),
    });
    const j = await r.json();
    const f = j.found && j.found[0];
    if (!f) return res.status(404).json({ error: 'CUI negăsit la ANAF' });
    return res.json({
      nume: f.date_generale?.denumire || '', cui, adresa: f.date_generale?.adresa || '',
      regCom: f.date_generale?.nrRegCom || '', platitorTVA: !!f.inregistrare_scop_Tva?.scpTVA,
    });
  } catch (e) {
    return res.status(e.code && Number.isInteger(e.code) ? e.code : 500).json({ error: e.message || 'Eroare' });
  }
});
