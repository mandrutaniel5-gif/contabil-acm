// Autentificare anonimă Firebase (fără cont): fiecare dispozitiv primește un ID tehnic, folosit doar ca
// baza de date și serverul să nu poată fi folosite de oricine de pe internet. Nu conține date personale.
import { db } from './db.js';

export const FIREBASE = {
  apiKey: 'AIzaSyAIpeZp016SxxITzy1AgexMUI-e6WcFgTw',
  projectId: 'acm-contabil',
  // serverul (asistent AI, SPV) stă în proiectul ACM Docs, care e pe planul Blaze
  functions: 'https://europe-west1-acm-docs-52280.cloudfunctions.net',
};

export async function idToken() {
  let a = await db.get('meta', 'auth');
  if (a && a.exp > Date.now()) return a.idToken;
  let r, j;
  if (a && a.refreshToken) {
    r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${FIREBASE.apiKey}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(a.refreshToken)}`,
    });
    j = await r.json().catch(() => ({}));
    if (r.ok) {
      a = { id: 'auth', idToken: j.id_token, refreshToken: j.refresh_token, uid: j.user_id, exp: Date.now() + (Number(j.expires_in) - 120) * 1000 };
      await db.put('meta', a);
      return a.idToken;
    }
  }
  r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
  });
  j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = j.error?.message || String(r.status);
    throw new Error(/ADMIN_ONLY_OPERATION|OPERATION_NOT_ALLOWED/.test(m)
      ? 'Autentificarea anonimă nu este pornită în Firebase (Authentication → Sign-in method → Anonymous).'
      : 'Nu m-am putut conecta la server: ' + m);
  }
  a = { id: 'auth', idToken: j.idToken, refreshToken: j.refreshToken, uid: j.localId, exp: Date.now() + (Number(j.expiresIn) - 120) * 1000 };
  await db.put('meta', a);
  return a.idToken;
}
