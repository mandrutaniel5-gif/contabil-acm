# ACM Contabil 1.1.0

Contabilitate în partidă dublă pentru ACM CODE S.R.L., pentru Windows, Android și iOS, cu asistent AI.
Este gândită pentru o persoană cu puțină experiență: operațiunile se aleg în cuvinte simple, iar aplicația scrie notele contabile.

## Ce face

**Automat, fără să apeși nimic:**
- **Facturi din SPV.** Cu firma conectată la SPV, facturile primite și cele emise (din ACM Docs sau din alt program) intră singure în Documente, cu PDF-ul și XML-ul ANAF și cu contul propus.
- **Extrase bancare.** CSV, MT940, CAMT.053 sau PDF, de la orice bancă. Plățile se potrivesc cu facturile după sumă, nume, CUI, numărul facturii și IBAN. Cele sigure se înregistrează singure: încasări, plăți, comisioane, dobânzi, numerar, taxe la ANAF.
- **Închiderea lunilor.** Amortizarea, regularizarea TVA, impozitul trimestrial și închiderea claselor 6/7 se refac singure când se modifică o lună trecută.
- **Anul nou.** Soldurile se preiau automat, iar rezultatul trece din 121 în 1171 la 1 ianuarie.
- **Curs BNR.** Se ia zilnic. Facturile în valută se convertesc la cursul zilei facturii, iar plafonul micro folosește cursul din 31 decembrie.
- **Sincronizare criptată.** Calculatorul, telefonul și iPhone-ul au aceleași date, fără cont. Asocierea se face prin cod QR.
- **Verificări.** Termene, documente de verificat, tranzacții neidentificate, restanțe, plafoane, solduri neobișnuite.

**Ecrane:**
- **Acasă:** banii firmei, rezultatul, impozitul estimat, ce ai de făcut, termenele și starea automatizărilor.
- **Documente:** poză sau PDF pentru bonuri și facturi (le citește AI-ul), import de e-Facturi ZIP/XML, filtrul „de verificat”.
- **Bancă:** importul extraselor și confirmarea, cu un buton, a tranzacțiilor nesigure.
- **Operațiuni:** 18 operațiuni frecvente fără factură și nota contabilă manuală.
- **Parteneri:** sold pe client și furnizor, restanțe, fișa partenerului, verificare la ANAF.
- **Registre:** jurnal, balanță, fișa contului, registrul de casă, jurnalele de TVA, mijloacele fixe, închiderea lunii, registrul-inventar, situațiile financiare (bilanț + cont de profit și pierdere) și închiderea anului (cu rezerva legală).
- **Declarații:** calendarul, D100, impozitul pe profit, D300, SAF-T D406 (XML) și salarii (D112).
- **Formulare:** chitanță, dispoziție de plată/încasare, decont, ordin de deplasare cu diurnă, proces-verbal de punere în funcțiune, hotărârea asociatului unic. Fiecare se tipărește și se înregistrează singur.
- **Ghid:** ce face fiecare ecran, ce se întâmplă automat și ce rămâne de făcut de mână.
- **Asistent AI:** vede soldurile și documentele firmei și răspunde concret.

**Ce nu se poate automatiza:**
- Depunerea declarațiilor. ANAF cere semnătura electronică; aplicația calculează sumele și generează SAF-T.
- Emiterea facturilor. Se face din ACM Docs.
- Semnătura pe situațiile anuale.

## Server și date

- **Date:** stau local pe fiecare dispozitiv (IndexedDB). Opțional, se sincronizează criptat end-to-end în Firestore, în proiectul `acm-contabil` (plan Spark): cheie AES-256-GCM derivată HKDF dintr-un secret de 256 de biți generat pe dispozitiv. Regulile sunt în `firestore.rules`. Autentificarea e anonimă.
- **Server:** asistentul AI, CUI-ul și conectarea la SPV rulează ca funcții în proiectul ACM Docs (`contabilAi`, `contabilCui`, `contabilAnaf*`). Folosesc același client OAuth ANAF și același callback. Cheia Claude e secretul GitHub `ANTHROPIC_API_KEY` din repo-ul ACM Docs.

## Pornire rapidă (browser)

```bash
npm run serve        # http://localhost:5173
npm test             # testele motorului contabil
```

## Build pe calculatorul tău (Windows)

Ai nevoie de [Node.js LTS](https://nodejs.org). Pentru Android îți trebuie și [Android Studio](https://developer.android.com/studio), pe care îl deschizi o dată ca să descarce SDK-ul.

- **Windows:** dublu-clic pe `build-windows.bat`. Installer-ul `.exe` apare în `dist\`.
- **Android:** dublu-clic pe `build-android.bat`.
  - La prima rulare creează cheia de semnare în `%USERPROFILE%\.acm-keys\acm-contabil.jks`, în afara proiectului, ca să nu ajungă niciodată în repo.
  - Notează parola și fă o copie de rezervă a cheii. Fără ea nu mai poți publica actualizări pe Google Play.
  - Rezultatul apare în `release\`: un `.apk` pentru instalare directă pe telefon și un `.aab` pentru Google Play.

Fără certificat de semnare de cod, Windows afișează la instalare un avertisment SmartScreen („Mai multe informații” → „Rulează oricum”).

## iOS (GitHub Actions)

Xcode rulează doar pe macOS, așa că iOS se construiește pe GitHub:
1. Deschide Actions → Build → Run workflow.
2. Alege `ios` (sau `toate`).
3. După aproximativ 10 minute, `.ipa` nesemnat apare la Artifacts și se instalează prin sideload.

Workflow-ul pornește doar manual, nu la fiecare push.

## Limitări cunoscute (v1)

- Bilanțul anual și declarațiile trebuie semnate de un contabil autorizat sau expert contabil dacă administratorul nu are studii economice.
- SAF-T: XML-ul urmează structura D406, dar trebuie validat în DUKIntegrator înainte de depunere. Secțiunea SourceDocuments nu este inclusă.
- D300: operațiunile intracomunitare și taxarea inversă (ex. servicii cloud din UE/SUA) nu sunt calculate automat.
- Facturile se emit din ACM Docs; aici intră singure din SPV.
- Sumele în valută se introduc în lei, la cursul BNR din ziua documentului.
- Termenele se mută peste weekend, dar nu peste sărbătorile legale.
- Salarii: există doar un calculator; statul de plată complet lipsește.
