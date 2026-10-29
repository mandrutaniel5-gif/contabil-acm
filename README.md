# ACM Contabil 1.0.0

Contabilitate în partidă dublă pentru ACM CODE S.R.L., pentru Windows, Android și iOS, cu asistent AI.
Este gândită pentru o persoană cu puțină experiență: operațiunile se aleg în cuvinte simple, iar aplicația scrie notele contabile.

## Ce face

- **Documente**: poză sau PDF pentru bon sau factură. Asistentul citește datele și propune contul, iar nota contabilă se generează automat. Obiectele de inventar trec direct în cheltuială (603 = 303). Cheltuielile de peste 5.000 lei te trimit la planul de amortizare.
- **Operațiuni**: 18 șabloane pentru încasări, plăți, comisioane, numerar, avansuri, împrumuturi de la administrator, capital social, dividende (cu impozitul de 16%) și plăți de taxe. Există și o notă contabilă manuală pentru cazurile rare.
- **Registre**: registrul jurnal, balanța de verificare cu 5 egalități, fișa contului, registrul de casă pe zile și mijloacele fixe. Toate se pot tipări și exporta în CSV.
- **Închiderea lunii**: înregistrează automat amortizarea, regularizarea TVA (4427/4426 → 4423/4424), impozitul micro sau pe profit la final de trimestru și închiderea claselor 6/7 în 121. Se poate rula din nou fără să apară dubluri.
- **Declarații**:
  - calendarul termenelor, generat din setările firmei
  - D100 micro (calcul cumulat) cu indicatorul plafonului de 100.000 €
  - estimarea impozitului pe profit
  - D300, pe cote de TVA
  - SAF-T D406 (schiță XML de validat cu DUKIntegrator)
  - calculatorul de salariu pentru D112
- **Indicații automate** (fără AI): termene apropiate, luni neînchise, casă sau bancă cu sold negativ, solduri neobișnuite, plafoane, documente fără fișier și mijloace fixe fără amortizare.
- **Asistent AI**: un chat care vede soldurile, documentele și termenele firmei și ghidează pas cu pas. Butoanele „Ghidează-mă” de pe ecrane îi trimit întrebarea deja completată.
- **Date**: totul este stocat local (IndexedDB). Backup-ul este criptat AES-256-GCM, cu cheie derivată prin PBKDF2 (600.000 de iterații).

Valorile fiscale din 2026 sunt editabile din Setări → Regim fiscal:
- micro 1%, plafon 100.000 €
- impozit pe profit 16%
- TVA 21% / 11%, plafon de scutire 395.000 lei
- mijloc fix de la 5.000 lei
- impozit pe dividende 16%

## Pornire rapidă (browser)

```bash
npm run serve        # http://localhost:5173
npm test             # testele motorului contabil
```

## Asistentul AI (Firebase + Claude)

1. Creează un proiect Firebase (plan Blaze) și activează **Authentication → Email/Password**. Creează contul persoanei care ține contabilitatea și confirmă-i emailul.
2. `firebase use --add` (alegi proiectul), apoi:
   ```bash
   firebase functions:secrets:set ANTHROPIC_API_KEY
   echo "ALLOWED_EMAILS=email@firma.ro" > functions/.env
   npm run deploy:functions
   ```
3. În aplicație, mergi la Setări → Asistent AI:
   - Adresa funcțiilor: `https://europe-west1-<proiect>.cloudfunctions.net`
   - Cheia web Firebase
   - Email și parolă → Conectează

Funcția `ai` verifică token-ul Firebase, emailul confirmat și lista `ALLOWED_EMAILS`. Cheia Claude nu ajunge niciodată pe dispozitiv. Funcția `cui` caută firme după CUI în registrul public ANAF.

## Windows (Electron)

```bash
npm install
npm run desktop      # rulează local
npm run build:win    # installer NSIS în dist/ (pune o iconiță 512×512 în build/icon.png)
```

## Android și iOS (Capacitor)

```bash
npm install
npx cap add android && npx cap add ios   # o singură dată
npm run cap:sync
npm run cap:android                       # Android Studio
```

Pentru iOS, `npx cap add ios` și build-ul rulează pe macOS. Fără Mac, folosește un workflow GitHub Actions pe `macos-latest`, ca la ACM Docs. Camera funcționează prin selectorul de fișiere. Pe iOS adaugă `NSCameraUsageDescription` și `NSPhotoLibraryUsageDescription` în `Info.plist`.

## Limitări cunoscute (v1)

- Bilanțul anual și declarațiile trebuie semnate de un contabil autorizat sau expert contabil dacă administratorul nu are studii economice.
- SAF-T: XML-ul urmează structura D406, dar trebuie validat în DUKIntegrator înainte de depunere. Secțiunea SourceDocuments nu este inclusă.
- D300: operațiunile intracomunitare și taxarea inversă (ex. servicii cloud din UE/SUA) nu sunt calculate automat.
- Nu are module de facturare sau e-Factura. Facturile emise se înregistrează ca documente (pot veni din ACM Docs).
- Sumele în valută se introduc în lei, la cursul BNR din ziua documentului.
- Termenele se mută peste weekend, dar nu peste sărbătorile legale.
- Salarii: există doar un calculator; statul de plată complet lipsește.
