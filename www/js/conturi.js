// Plan de conturi general (OMFP 1802/2014) — conturile folosite de o firmă mică de servicii IT.
// tip: A = activ (sold debitor), P = pasiv (sold creditor), B = bifuncțional, C = cheltuieli, V = venituri
// ajutor: explicație pe înțelesul unei persoane fără experiență
export const PLAN_CONTURI = [
  // Clasa 1 — Capitaluri
  ['1011', 'Capital subscris nevărsat', 'P', 'Capitalul promis de asociați, dar încă nedepus.'],
  ['1012', 'Capital subscris vărsat', 'P', 'Banii puși de asociați la înființarea firmei.'],
  ['456', 'Decontări cu asociații privind capitalul', 'B', 'Cont de trecere pentru depunerea capitalului social.'],
  ['1061', 'Rezerve legale', 'P', '5% din profit, până ajunge la 20% din capital.'],
  ['1171', 'Rezultatul reportat — profit/pierdere nerepartizată', 'B', 'Profitul sau pierderea din anii trecuți, încă nedistribuite.'],
  ['121', 'Profit sau pierdere', 'B', 'Rezultatul anului curent. Se închid aici veniturile și cheltuielile.'],
  ['129', 'Repartizarea profitului', 'A', 'Profit repartizat pe rezerve în cursul anului.'],
  ['1621', 'Credite bancare pe termen lung', 'P', 'Împrumuturi de la bancă pe mai mult de 1 an.'],
  // Clasa 2 — Imobilizări
  ['2051', 'Licențe, programe informatice', 'A', 'Software cumpărat cu licență pe termen lung, peste 5.000 lei.'],
  ['2131', 'Echipamente tehnologice', 'A', 'Echipamente de peste 5.000 lei folosite mai mult de 1 an (ex. un PC performant, un server).'],
  ['2133', 'Mijloace de transport', 'A', 'Autoturisme, scutere ale firmei.'],
  ['214', 'Mobilier, aparatură birotică', 'A', 'Mobilier și aparatură de birou de peste 5.000 lei.'],
  ['2805', 'Amortizarea licențelor și programelor', 'P', 'Cât s-a consumat din valoarea software-ului (cont de corecție).'],
  ['2813', 'Amortizarea echipamentelor și mijloacelor de transport', 'P', 'Cât s-a consumat din valoarea echipamentelor (cont de corecție).'],
  ['2814', 'Amortizarea altor imobilizări corporale', 'P', 'Amortizarea mobilierului și aparaturii de birou.'],
  // Clasa 3 — Stocuri
  ['3022', 'Combustibili', 'A', 'Combustibil cumpărat și ținut pe stoc (rar la firmele de servicii).'],
  ['3028', 'Alte materiale consumabile', 'A', 'Consumabile ținute pe stoc.'],
  ['303', 'Materiale de natura obiectelor de inventar', 'A', 'Lucruri sub 5.000 lei folosite mai mult timp: laptop, monitor, scaun.'],
  ['371', 'Mărfuri', 'A', 'Produse cumpărate pentru a fi revândute.'],
  // Clasa 4 — Terți
  ['401', 'Furnizori', 'P', 'Cât datorează firma furnizorilor pentru facturi primite.'],
  ['404', 'Furnizori de imobilizări', 'P', 'Datorii pentru echipamente de peste 5.000 lei.'],
  ['408', 'Furnizori — facturi nesosite', 'P', 'Am primit bunul/serviciul dar nu și factura.'],
  ['411', 'Clienți', 'A', 'Cât au de plătit clienții pentru facturile emise.'],
  ['418', 'Clienți — facturi de întocmit', 'A', 'Servicii prestate pentru care încă nu s-a emis factura.'],
  ['419', 'Clienți — creditori (avansuri încasate)', 'P', 'Avansuri primite de la clienți.'],
  ['421', 'Personal — salarii datorate', 'P', 'Salariile nete de plătit angajaților.'],
  ['4315', 'Contribuția de asigurări sociale (CAS)', 'P', 'CAS 25% reținut din salariu, de plătit la stat.'],
  ['4316', 'Contribuția de asigurări sociale de sănătate (CASS)', 'P', 'CASS 10% reținut din salariu, de plătit la stat.'],
  ['436', 'Contribuția asiguratorie pentru muncă (CAM)', 'P', 'CAM 2,25% plătit de firmă peste salariu.'],
  ['444', 'Impozitul pe venituri de natura salariilor', 'P', 'Impozitul de 10% reținut din salariu.'],
  ['4411', 'Impozitul pe profit', 'P', 'Impozit pe profit datorat statului.'],
  ['4418', 'Impozitul pe venitul microîntreprinderilor', 'P', 'Impozitul micro de 1% datorat statului.'],
  ['4423', 'TVA de plată', 'P', 'TVA de virat la stat după decontul D300.'],
  ['4424', 'TVA de recuperat', 'A', 'TVA pe care statul îl datorează firmei.'],
  ['4426', 'TVA deductibilă', 'A', 'TVA-ul de pe facturile de cumpărare (doar plătitori de TVA).'],
  ['4427', 'TVA colectată', 'P', 'TVA-ul de pe facturile emise clienților (doar plătitori de TVA).'],
  ['4428', 'TVA neexigibilă', 'B', 'TVA care devine exigibil mai târziu (TVA la încasare).'],
  ['446', 'Alte impozite, taxe și vărsăminte asimilate', 'P', 'Impozit pe dividende, alte taxe datorate.'],
  ['4551', 'Asociați — conturi curente', 'P', 'Banii pe care administratorul i-a împrumutat firmei sau a plătit din buzunar pentru ea.'],
  ['457', 'Dividende de plată', 'P', 'Dividende aprobate, încă neplătite asociaților.'],
  ['461', 'Debitori diverși', 'A', 'Alte sume de încasat.'],
  ['462', 'Creditori diverși', 'P', 'Alte sume de plătit.'],
  ['471', 'Cheltuieli înregistrate în avans', 'A', 'Cheltuieli plătite în avans pentru perioade viitoare (ex. abonament anual).'],
  ['473', 'Decontări din operații în curs de clarificare', 'B', 'Sume neclare temporar — trebuie lămurite până la final de lună.'],
  // Clasa 5 — Trezorerie
  ['5121', 'Conturi la bănci în lei', 'A', 'Banii din contul bancar în lei.'],
  ['5124', 'Conturi la bănci în valută', 'A', 'Banii din contul bancar în valută (EUR, USD).'],
  ['5311', 'Casa în lei', 'A', 'Numerarul din casieria firmei.'],
  ['542', 'Avansuri de trezorerie', 'A', 'Bani dați cuiva din firmă pentru cheltuieli, de decontat.'],
  ['581', 'Viramente interne', 'B', 'Cont de trecere pentru mutări de bani între casă și bancă.'],
  // Clasa 6 — Cheltuieli
  ['6022', 'Cheltuieli privind combustibilii', 'C', 'Benzină, motorină.'],
  ['6028', 'Cheltuieli privind alte materiale consumabile', 'C', 'Hârtie, papetărie, consumabile mărunte.'],
  ['603', 'Cheltuieli privind obiectele de inventar', 'C', 'Darea în folosință a obiectelor de inventar (laptop, monitor sub 5.000 lei).'],
  ['604', 'Cheltuieli privind materialele nestocate', 'C', 'Materiale cumpărate și consumate direct.'],
  ['605', 'Cheltuieli privind energia și apa', 'C', 'Curent, apă, gaz.'],
  ['607', 'Cheltuieli privind mărfurile', 'C', 'Costul mărfurilor vândute.'],
  ['611', 'Cheltuieli cu întreținerea și reparațiile', 'C', 'Reparații, service.'],
  ['612', 'Cheltuieli cu redevențe, locații de gestiune și chirii', 'C', 'Chirii, coworking.'],
  ['613', 'Cheltuieli cu primele de asigurare', 'C', 'Asigurări.'],
  ['622', 'Cheltuieli privind comisioanele și onorariile', 'C', 'Contabil, avocat, notar, consultanți.'],
  ['6231', 'Cheltuieli de protocol', 'C', 'Mese de afaceri, cadouri pentru parteneri. Deductibile limitat.'],
  ['6232', 'Cheltuieli de reclamă și publicitate', 'C', 'Reclame Google, Facebook, promovare.'],
  ['624', 'Cheltuieli cu transportul de bunuri și persoane', 'C', 'Curierat, taxi, transport.'],
  ['625', 'Cheltuieli cu deplasări, detașări și transferări', 'C', 'Cazare, bilete, diurnă la deplasări.'],
  ['626', 'Cheltuieli poștale și taxe de telecomunicații', 'C', 'Telefon, internet, poștă.'],
  ['627', 'Cheltuieli cu serviciile bancare', 'C', 'Comisioane bancare, taxe de administrare cont.'],
  ['628', 'Alte cheltuieli cu serviciile executate de terți', 'C', 'Hosting, cloud, abonamente software, colaboratori.'],
  ['635', 'Cheltuieli cu alte impozite, taxe și vărsăminte asimilate', 'C', 'Taxe locale, taxe ONRC, timbre.'],
  ['641', 'Cheltuieli cu salariile personalului', 'C', 'Salariile brute ale angajaților.'],
  ['6461', 'Cheltuieli privind contribuția asiguratorie pentru muncă', 'C', 'CAM-ul plătit de firmă.'],
  ['6581', 'Despăgubiri, amenzi și penalități', 'C', 'Amenzi și penalități. Nedeductibile fiscal.'],
  ['6588', 'Alte cheltuieli de exploatare', 'C', 'Alte cheltuieli care nu se încadrează în altă parte.'],
  ['665', 'Cheltuieli din diferențe de curs valutar', 'C', 'Pierderi din schimbarea cursului valutar.'],
  ['666', 'Cheltuieli privind dobânzile', 'C', 'Dobânzi la credite.'],
  ['6811', 'Cheltuieli de exploatare privind amortizarea imobilizărilor', 'C', 'Amortizarea lunară a echipamentelor.'],
  ['691', 'Cheltuieli cu impozitul pe profit', 'C', 'Impozitul pe profit al perioadei.'],
  ['698', 'Cheltuieli cu impozitul pe venit și alte impozite', 'C', 'Impozitul micro al perioadei.'],
  // Clasa 7 — Venituri
  ['704', 'Venituri din servicii prestate', 'V', 'Facturile emise pentru servicii (dezvoltare web, mentenanță etc.).'],
  ['706', 'Venituri din redevențe, locații de gestiune și chirii', 'V', 'Venituri din licențe sau chirii.'],
  ['707', 'Venituri din vânzarea mărfurilor', 'V', 'Vânzări de mărfuri.'],
  ['7588', 'Alte venituri din exploatare', 'V', 'Alte venituri.'],
  ['765', 'Venituri din diferențe de curs valutar', 'V', 'Câștiguri din schimbarea cursului valutar.'],
  ['766', 'Venituri din dobânzi', 'V', 'Dobânzi primite de la bancă.'],
];

const MAP = new Map(PLAN_CONTURI.map(([cod, nume, tip, ajutor]) => [cod, { cod, nume, tip, ajutor }]));

export function cont(cod) {
  return MAP.get(cod) || { cod, nume: 'Cont ' + cod, tip: tipDinClasa(cod), ajutor: '' };
}

export function tipDinClasa(cod) {
  const c = cod[0];
  if (c === '6') return 'C';
  if (c === '7') return 'V';
  return 'B';
}

export function toateConturile(extra = []) {
  const all = [...MAP.values()];
  for (const e of extra) if (!MAP.has(e.cod)) all.push(e);
  return all.sort((a, b) => a.cod.localeCompare(b.cod));
}

export function clasa(cod) { return cod[0]; }
export const NUME_CLASE = {
  1: 'Capitaluri', 2: 'Imobilizări', 3: 'Stocuri', 4: 'Terți', 5: 'Trezorerie', 6: 'Cheltuieli', 7: 'Venituri',
};
