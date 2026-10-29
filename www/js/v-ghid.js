// Ghidul aplicației: ce face fiecare ecran, ce se întâmplă automat, ce rămâne de făcut de mână.
import { e, icon } from './ui.js';

const AUTOMAT = [
  ['Facturile din SPV', 'Cu firma conectată la SPV, facturile primite de la furnizori și cele emise (din ACM Docs sau din alt program) intră singure în Documente, cu PDF-ul și XML-ul ANAF. Contul se propune automat; cele marcate „de verificat” cer doar o privire.'],
  ['Potrivirea extraselor', 'Când încarci extrasul, plățile și încasările se potrivesc cu facturile după sumă, nume, CUI și numărul facturii. Cele sigure se înregistrează singure, iar facturile se marchează plătite.'],
  ['Salariile', 'Adaugi o dată salariații (și administratorul, dacă are contract de mandat). Statul de plată, nota lunară de salarii și contribuțiile se calculează singure, cu salariul minim, suma netaxabilă și deducerea personală; plata salariului și plata la ANAF se recunosc în extras.'],
  ['Plățile deja înregistrate', 'Dacă ai trecut un bon plătit cu cardul sau o operațiune înainte să încarci extrasul, plata din extras doar se leagă de ea, nu se mai înregistrează a doua oară. Abonamentele lunare (Google, GitHub…) se învață după prima confirmare.'],
  ['Plata la ANAF', 'O singură plată în contul unic poate stinge mai multe datorii (CAS, CASS, impozit pe salarii, CAM, impozit micro, dividende, TVA). Aplicația găsește singură combinația care dă exact suma plătită.'],
  ['TVA-ul', 'Aplicația te avertizează din timp când te apropii de plafonul de scutire (395.000 lei) și îți spune ziua depășirii. Cu un buton treci la TVA de la acea zi, iar documentele de după se refac singure. Serviciile din străinătate primesc automat taxare inversă.'],
  ['Notele contabile', 'Fiecare document, plată sau formular își face singur nota contabilă. Nu e nevoie să știi conturile.'],
  ['Închiderea lunilor', 'Amortizarea, regularizarea TVA, impozitul trimestrial și închiderea conturilor de venituri și cheltuieli se refac singure când apare ceva nou într-o lună trecută.'],
  ['Anul nou', 'La 1 ianuarie, soldurile se preiau automat, iar profitul sau pierderea trece din 121 în 1171.'],
  ['Cursul BNR', 'Se ia zilnic. Facturile în valută se convertesc la cursul din ziua facturii, iar plafonul micro se calculează la cursul din 31 decembrie.'],
  ['Sincronizarea', 'Calculatorul, telefonul și iPhone-ul au aceleași date, criptate pe dispozitiv. Fără cont și fără ca serverul să le poată citi.'],
  ['Verificările', 'Pe Acasă vezi mereu ce trebuie făcut: termene, documente de verificat, plăți neidentificate, solduri neobișnuite, plafoane.'],
];

const ECRANE = [
  ['home', 'Acasă', 'Banii din bancă și casă, rezultatul anului, impozitul estimat, ce ai de făcut și următoarele termene.'],
  ['doc', 'Documente', 'Bonuri, chitanțe și facturi. Faci o poză sau încarci PDF-ul (ori ZIP-ul/XML-ul din SPV), iar asistentul citește datele. Le vezi pe cele venite din SPV și pe cele de verificat.'],
  ['download', 'Bancă', 'Încarci extrasul (CSV, MT940, CAMT.053 sau PDF de la orice bancă). Confirmi cu un buton ce n-a putut fi potrivit sigur.'],
  ['swap', 'Operațiuni', 'Ce nu vine pe factură: depuneri și ridicări de numerar, bani puși sau scoși de administrator, capital social, dividende, plata taxelor, sume neclare. Plus nota contabilă manuală.'],
  ['book', 'Parteneri', 'Fiecare client și furnizor, cu ce are de plătit sau de încasat, facturile restante și fișa partenerului.'],
  ['book', 'Registre', 'Registrul jurnal, balanța de verificare, fișa contului, registrul de casă, mijloacele fixe, jurnalele de TVA, registrul-inventar, situațiile financiare și închiderea anului.'],
  ['file', 'Declarații', 'Calendarul termenelor și sumele calculate pentru D100 (impozit micro), D300 (TVA), D301 (servicii din străinătate), impozitul pe profit și pe dividende, salariații cu statul de plată și D112, și fișierul SAF-T (D406).'],
  ['print', 'Formulare', 'Chitanță, dispoziție de plată/încasare, decont, ordin de deplasare, proces-verbal de punere în funcțiune, hotărârea asociatului. Se tipăresc și se înregistrează singure.'],
  ['spark', 'Asistent', 'Întrebi orice, în cuvinte simple. Vede soldurile și documentele firmei, așa că răspunde concret și îți spune exact ce să apeși.'],
];

const MANUAL = [
  ['Depunerea declarațiilor', 'ANAF nu permite depunerea automată a declarațiilor de către programe: se depun cu semnătura electronică, în SPV sau pe e-guvernare.ro. Aplicația calculează sumele și îți arată pașii, iar pentru SAF-T generează fișierul XML.'],
  ['Emiterea facturilor', 'Facturile către clienți se emit și se trimit în SPV din ACM Docs. Aici apar singure, ca venituri.'],
  ['Semnătura pe situațiile anuale', 'Bilanțul se semnează de un contabil autorizat sau expert contabil dacă administratorul nu are studii economice.'],
  ['Inventarierea anuală', 'Numeri casa și verifici soldurile cu banca, clienții și furnizorii. Registrul-inventar se completează din aplicație.'],
  ['Facturile de la furnizori străini', 'Google, Meta, Anthropic etc. nu trimit prin SPV. Plata apare din extras ca cheltuială „de verificat”; atașezi PDF-ul facturii primit pe email.'],
];

const PASI = [
  'Completează datele firmei în Setări → Firma (CUI-ul aduce restul de la ANAF) și regimul fiscal.',
  'Creează seiful în Setări → Dispozitive și adaugă telefonul scanând codul QR.',
  'Conectează firma la SPV în Setări → SPV / e-Factura, cu certificatul digital.',
  'O dată pe lună: încarcă extrasul în Bancă, fă poze la bonuri în Documente, confirmă ce apare pe Acasă.',
  'La termene: deschide Declarații, copiază sumele în formularele ANAF și înregistrează plata din Bancă sau Operațiuni.',
];

export async function render(main) {
  main.innerHTML = `
  <div class="page-head"><div><h1>Ghid</h1><p class="sub">Ce poate face aplicația, ce face singură și ce rămâne de făcut de tine.</p></div>
  <div class="row"><button class="btn" data-ai="Explică-mi pe scurt cum folosesc aplicația ACM Contabil lună de lună, ca cineva fără experiență în contabilitate.">${icon('spark')}Întreabă asistentul</button></div></div>
  <section class="panel"><h2>Primii pași</h2><ol style="margin:0;padding-left:20px">${PASI.map((p) => `<li style="margin-bottom:8px">${e(p)}</li>`).join('')}</ol></section>
  <section class="panel"><h2>Ce face aplicația singură</h2><ul class="list">${AUTOMAT.map(([t, d]) => `<li style="align-items:flex-start"><span class="badge ok" style="margin-top:2px">automat</span><div class="grow"><div class="t" style="white-space:normal">${e(t)}</div><div class="m">${e(d)}</div></div></li>`).join('')}</ul></section>
  <section class="panel"><h2>Ecranele</h2><ul class="list">${ECRANE.map(([i, t, d]) => `<li style="align-items:flex-start"><span style="width:22px;color:var(--accent)">${icon(i)}</span><div class="grow"><div class="t">${e(t)}</div><div class="m">${e(d)}</div></div></li>`).join('')}</ul></section>
  <section class="panel"><h2>Ce rămâne de făcut de mână</h2><ul class="list">${MANUAL.map(([t, d]) => `<li style="align-items:flex-start"><div class="grow"><div class="t" style="white-space:normal">${e(t)}</div><div class="m">${e(d)}</div></div></li>`).join('')}</ul></section>`;
}
