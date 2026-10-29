// Verifică asistentul AI de pe server, ca aplicația: autentificare anonimă + o întrebare + citirea unui bon.
import fs from 'node:fs';
const KEY = 'AIzaSyAIpeZp016SxxITzy1AgexMUI-e6WcFgTw';
const FN = 'https://europe-west1-acm-docs-52280.cloudfunctions.net/contabilAi';
const out = [];
const log = (...a) => { const t = a.join(' '); out.push(t); console.log(t); };
const s = await (await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"returnSecureToken":true}' })).json();
if (!s.idToken) { log('AUTH FAIL', JSON.stringify(s)); process.exit(1); }
const call = async (body) => { const t0 = Date.now(); const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.idToken }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); return { status: r.status, ms: Date.now() - t0, j }; };
const a = await call({ mode: 'chat', messages: [{ role: 'user', content: 'Cât mă costă pe lună un angajat cu salariul minim, normă întreagă, în noiembrie 2026? Dă-mi cifrele.' }], context: 'Firma: ACM CODE S.R.L., microîntreprindere, neplătitoare de TVA.' });
log('CHAT', a.status, a.ms + 'ms'); log(a.j.text || a.j.error);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="white"/><text x="20" y="40" font-size="20">OMV PETROM SA CUI RO1590082</text><text x="20" y="80" font-size="18">BON FISCAL 0045  12.10.2026</text><text x="20" y="120" font-size="18">BENZINA 95  245,30 LEI</text><text x="20" y="160" font-size="18">TOTAL 245,30  TVA 21% 42,57</text></svg>`;
let png;
try { const { chromium } = await import('playwright'); const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 400, height: 300 } }); await p.setContent(svg); png = (await p.screenshot()).toString('base64'); await b.close(); } catch (e) { log('fără playwright:', e.message); }
if (png) { const x = await call({ mode: 'extract', file: { type: 'image/png', data: png }, context: 'Firma NU este plătitoare de TVA.' }); log('EXTRACT', x.status, x.ms + 'ms', JSON.stringify(x.j.result || x.j.error)); }
fs.mkdirSync('rezultate-asistent', { recursive: true }); fs.writeFileSync('rezultate-asistent/rezultat.txt', out.join('\n'));
