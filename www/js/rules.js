// Reguli fiscale România — valabile 2026.
// Toate valorile sunt editabile din Setări → Reguli fiscale, ca să poată fi actualizate fără o versiune nouă.
export const RULES_2026 = {
  an: 2026,
  micro: {
    cota: 0.01,              // cotă unică 1% (OUG 89/2025)
    plafonEUR: 100000,       // plafon cifră de afaceri
    // conturi de venit excluse din baza impozabilă micro (art. 53 Cod fiscal) — prefixe
    excluseBaza: ['711', '712', '721', '722', '741', '781', '7815'],
  },
  profit: { cota: 0.16 },
  dividende: { cota: 0.16 },
  tva: {
    standard: 0.21,
    redusa: 0.11,
    plafonScutire: 395000,   // lei / an calendaristic
  },
  mijlocFixMin: 5000,        // lei — sub prag = obiect de inventar
  salarii: { cas: 0.25, cass: 0.10, impozit: 0.10, cam: 0.0225 },
};

// Termene: zi din luna următoare perioadei. 'last' = ultima zi a lunii.
export const DECLARATII = {
  D100: { nume: 'D100 — Impozit micro', perioada: 'trimestru', zi: 25, cand: (s) => s.regim === 'micro' },
  D101: { nume: 'D101 — Impozit pe profit (anual)', perioada: 'an', luna: 6, zi: 25, cand: (s) => s.regim === 'profit' },
  D100P: { nume: 'D100 — Plată anticipată impozit profit', perioada: 'trimestru', zi: 25, cand: (s) => s.regim === 'profit', faraT4: true },
  D300: { nume: 'D300 — Decont TVA', perioada: (s) => s.perioadaTVA, zi: 25, cand: (s) => s.platitorTVA },
  D394: { nume: 'D394 — Livrări/achiziții pe teritoriu', perioada: (s) => s.perioadaTVA, zi: 30, cand: (s) => s.platitorTVA },
  D406: { nume: 'D406 — SAF-T', perioada: (s) => (s.platitorTVA && s.perioadaTVA === 'luna') ? 'luna' : 'trimestru', zi: 'last', cand: () => true },
  D112: { nume: 'D112 — Contribuții salarii', perioada: 'luna', zi: 25, cand: (s) => s.areSalariati },
  SF:   { nume: 'Situații financiare anuale (bilanț)', perioada: 'an', luna: 5, zi: 30, cand: () => true },
};

// Încadrare automată a cheltuielilor (fallback local când AI-ul nu e disponibil).
// Ordinea contează: prima regulă potrivită câștigă.
export const KEYWORD_RULES = [
  { cont: '6022', eticheta: 'Combustibil', kw: ['benzina', 'motorina', 'diesel', 'combustibil', 'omv', 'petrom', 'rompetrol', 'mol ', 'lukoil', 'socar', 'carburant'] },
  { cont: '626', eticheta: 'Telefon și internet', kw: ['telekom', 'orange', 'vodafone', 'digi', 'rcs', 'internet', 'abonament telefon', 'telecomunic'] },
  { cont: '627', eticheta: 'Comisioane bancare', kw: ['comision', 'banca transilvania', 'bcr', 'brd', 'ing bank', 'revolut business', 'taxa administrare cont'] },
  { cont: '628', eticheta: 'Servicii software / cloud', kw: ['google', 'firebase', 'aws', 'amazon web', 'microsoft', 'github', 'adobe', 'figma', 'anthropic', 'openai', 'hosting', 'domeniu', 'rotld', 'cloudflare', 'vercel', 'netlify', 'apple developer', 'apple.com', 'google play', 'abonament'] },
  { cont: '6232', eticheta: 'Reclamă și publicitate', kw: ['facebook ads', 'meta platforms', 'google ads', 'publicitate', 'reclama', 'promovare', 'tiktok ads'] },
  { cont: '6231', eticheta: 'Protocol', kw: ['restaurant', 'cafenea', 'protocol', 'catering'] },
  { cont: '625', eticheta: 'Deplasări', kw: ['hotel', 'cazare', 'booking', 'airbnb', 'bilet avion', 'wizz', 'ryanair', 'tarom', 'cfr calatori', 'diurna'] },
  { cont: '624', eticheta: 'Transport', kw: ['curier', 'fan courier', 'sameday', 'cargus', 'dpd', 'gls', 'posta romana', 'uber', 'bolt', 'taxi'] },
  { cont: '612', eticheta: 'Chirii', kw: ['chirie', 'inchiriere', 'coworking'] },
  { cont: '613', eticheta: 'Asigurări', kw: ['asigurare', 'rca', 'casco', 'allianz', 'groupama', 'omniasig'] },
  { cont: '622', eticheta: 'Comisioane și onorarii (contabil, avocat)', kw: ['contabilitate', 'onorariu', 'avocat', 'notar', 'consultanta'] },
  { cont: '605', eticheta: 'Energie și apă', kw: ['energie', 'electrica', 'enel', 'eon', 'e.on', 'apa canal', 'gaz', 'engie', 'ppc'] },
  { cont: '611', eticheta: 'Întreținere și reparații', kw: ['reparatie', 'service', 'mentenanta', 'intretinere'] },
  { cont: '635', eticheta: 'Taxe și impozite locale', kw: ['taxa', 'impozit local', 'onrc', 'registrul comertului', 'timbru'] },
  { cont: '303', eticheta: 'Obiecte de inventar (echipamente sub 5.000 lei)', kw: ['laptop', 'monitor', 'tastatura', 'mouse', 'telefon mobil', 'iphone', 'imprimanta', 'casti', 'scaun', 'birou', 'emag', 'altex', 'flanco', 'pc garage'] },
  { cont: '6028', eticheta: 'Materiale consumabile', kw: ['hartie', 'papetarie', 'birotica', 'toner', 'cartus', 'consumabile', 'dedeman', 'kaufland', 'lidl', 'carrefour', 'auchan', 'mega image', 'profi', 'penny'] },
];

// Furnizori de servicii din străinătate (abonamente plătite cu cardul). Serviciile primite de la ei au locul
// prestării în România (art. 278 alin. 2): se aplică taxarea inversă; o firmă neplătitoare de TVA are nevoie de
// cod special de TVA (art. 317), depune D301 și plătește TVA-ul.
const STRAINI = ['google', 'github', 'anthropic', 'openai', 'apple.com', 'apple developer', 'amazon web', 'aws ', 'microsoft', 'adobe', 'figma', 'meta platforms', 'facebk', 'facebook', 'linkedin', 'cloudflare', 'vercel', 'netlify', 'notion', 'slack', 'zoom.us', 'jetbrains', 'digitalocean', 'atlassian', 'canva', 'dropbox', 'mailchimp', 'hetzner', 'ovh', 'namecheap', 'godaddy', 'udemy', 'upwork', 'fiverr', 'envato', 'shopify', 'twilio', 'heroku', 'expo.dev', 'sentry'];
export function furnizorStrain(text) {
  const t = ' ' + String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + ' ';
  if (STRAINI.some((k) => t.includes(k))) return true;
  return /\b(usd|gbp|chf)\s?\d/.test(t);
}
