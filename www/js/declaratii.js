// Declarații: calendar termene, calcule D100/D101/D300/D112, export SAF-T (D406).
import { DECLARATII } from './rules.js';
import { cont } from './conturi.js';
import {
  r2, pad, iso, lunaInterval, trimInterval, LUNI, balanta, bazaMicro, calculTVA,
  rulajeClasa, cifraAfaceri, reguli, zileLucratoare,
} from './engine.js';

// ---- Calendar ----
export function termene(setari, deLa = new Date(), luniInainte = 4) {
  const out = [];
  const startY = deLa.getFullYear() - 1;
  for (const [cod, d] of Object.entries(DECLARATII)) {
    if (!d.cand(setari)) continue;
    const per = typeof d.perioada === 'function' ? d.perioada(setari) : d.perioada;
    for (let y = startY; y <= deLa.getFullYear() + 1; y++) {
      if (per === 'an') {
        out.push({ cod, nume: d.nume, perioada: `anul ${y}`, termen: zileLucratoare(new Date(y + 1, d.luna - 1, d.zi)), an: y });
        continue;
      }
      const pas = per === 'luna' ? 1 : 3;
      for (let l = pas; l <= 12; l += pas) {
        if (d.faraT4 && l === 12) continue;
        if ((cod === 'D300' || cod === 'D394') && setari.tvaDeLa && `${y}-${String(l).padStart(2, '0')}-31` < setari.tvaDeLa) continue;
        const ny = l === 12 ? y + 1 : y, nl = l === 12 ? 0 : l; // luna următoare (index 0)
        const zi = d.zi === 'last' ? new Date(ny, nl + 1, 0).getDate() : d.zi;
        out.push({
          cod, nume: d.nume, an: y, luna: l,
          perioada: per === 'luna' ? `${LUNI[l - 1]} ${y}` : `T${l / 3} ${y}`,
          termen: zileLucratoare(new Date(ny, nl, zi)),
        });
      }
    }
  }
  const lim = new Date(deLa); lim.setMonth(lim.getMonth() + luniInainte);
  const ieri = new Date(deLa); ieri.setDate(ieri.getDate() - 1);
  return out.filter((t) => t.termen >= ieri && t.termen <= lim).sort((a, b) => a.termen - b.termen);
}

export function zilePana(d) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

// ---- D100 micro ----
export function d100Micro(note, setari, an, t) {
  const R = reguli(setari);
  const iAn = `${an}-01-01`;
  const p = trimInterval(an, t);
  const bazaCum = bazaMicro(note, iAn, p.to, R);
  const bazaPrec = t > 1 ? bazaMicro(note, iAn, trimInterval(an, t - 1).to, R) : 0;
  const impCum = Math.round(bazaCum * R.micro.cota);
  const impPrec = Math.round(bazaPrec * R.micro.cota);
  const ca = cifraAfaceri(note, iAn, p.to);
  const plafonLei = R.micro.plafonEUR * (Number(setari.cursEUR) || 5);
  return {
    an, t, perioada: p, bazaTrim: r2(bazaCum - bazaPrec), bazaCum, cota: R.micro.cota,
    impozitCumulat: impCum, impozitTrimPrec: impPrec, impozitDePlata: impCum - impPrec,
    cifraAfaceri: ca, plafonLei, procentPlafon: plafonLei ? ca / plafonLei : 0,
  };
}

// ---- Impozit pe profit (estimare) ----
export function estimareProfit(note, setari, an, t) {
  const R = reguli(setari);
  const p = trimInterval(an, t);
  const rc = rulajeClasa(note, `${an}-01-01`, p.to, (l) => l.d !== '691' && l.c !== '691');
  const amenzi = note.filter((n) => n.data >= `${an}-01-01` && n.data <= p.to && n.auto !== 'inchidere')
    .flatMap((n) => n.linii).filter((l) => l.d === '6581').reduce((s, l) => s + l.suma, 0);
  const protocol = note.filter((n) => n.data >= `${an}-01-01` && n.data <= p.to && n.auto !== 'inchidere')
    .flatMap((n) => n.linii).filter((l) => l.d === '6231').reduce((s, l) => s + l.suma, 0);
  const profitImpozabil = Math.max(0, rc.rezultat + amenzi);
  return { ...rc, amenzi: r2(amenzi), protocol: r2(protocol), profitImpozabil: r2(profitImpozabil), impozit: Math.round(profitImpozabil * R.profit.cota), cota: R.profit.cota };
}

// ---- D300 ----
export function d300(note, setari, an, perioada /* luna 1-12 sau 'T1'.. */) {
  const p = String(perioada).startsWith('T') ? trimInterval(an, Number(String(perioada).slice(1))) : lunaInterval(an, Number(perioada));
  return { ...calculTVA(note, p.from, p.to), perioada: p };
}

// ---- Salarii (calculator simplu pentru D112) ----
export function calculSalariu(brut, deducerePersonala, setari) {
  const R = reguli(setari).salarii;
  const cas = Math.round(brut * R.cas);
  const cass = Math.round(brut * R.cass);
  const baza = Math.max(0, brut - cas - cass - (Number(deducerePersonala) || 0));
  const impozit = Math.round(baza * R.impozit);
  const net = brut - cas - cass - impozit;
  const cam = Math.round(brut * R.cam);
  return { brut, cas, cass, baza, impozit, net, cam, costTotal: brut + cam };
}

// ---- SAF-T D406 (schiță XML) ----
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const amt = (n) => r2(n).toFixed(2);
const tipSAFT = (t) => ({ A: 'Activ', P: 'Pasiv', B: 'Bifunctional', C: 'Activ', V: 'Pasiv' }[t] || 'Bifunctional');

export function saftXML(note, setari, parteneri, from, to, versiune) {
  const b = balanta(note, setari, from, to);
  const perNote = note.filter((n) => n.data >= from && n.data <= to);
  const totD = r2(perNote.flatMap((n) => n.linii).reduce((s, l) => s + l.suma, 0));
  const cui = String(setari.cui || '').replace(/\D/g, '');
  const lunar = setari.platitorTVA && setari.perioadaTVA === 'luna';
  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push('<n1:AuditFile xmlns:n1="mfp:anaf:dgti:d406:declaratie:v1">');
  L.push('<n1:Header>');
  L.push('<n1:AuditFileVersion>2.4.8</n1:AuditFileVersion><n1:AuditFileCountry>RO</n1:AuditFileCountry>');
  L.push(`<n1:AuditFileDateCreated>${iso(new Date())}</n1:AuditFileDateCreated>`);
  L.push(`<n1:SoftwareCompanyName>ACM CODE SRL</n1:SoftwareCompanyName><n1:SoftwareID>ACM Contabil</n1:SoftwareID><n1:SoftwareVersion>${esc(versiune)}</n1:SoftwareVersion>`);
  L.push(`<n1:Company><n1:RegistrationNumber>${esc(cui)}</n1:RegistrationNumber><n1:Name>${esc(setari.nume)}</n1:Name>`);
  L.push(`<n1:Address><n1:StreetName>${esc(setari.adresa)}</n1:StreetName><n1:City>${esc(setari.localitate || '')}</n1:City><n1:Country>RO</n1:Country></n1:Address>`);
  if (setari.iban) L.push(`<n1:BankAccount><n1:IBANNumber>${esc(setari.iban)}</n1:IBANNumber></n1:BankAccount>`);
  L.push('</n1:Company>');
  L.push('<n1:DefaultCurrencyCode>RON</n1:DefaultCurrencyCode>');
  const [fy, fm] = from.split('-').map(Number); const [, tm] = to.split('-').map(Number);
  L.push(`<n1:SelectionCriteria><n1:PeriodStart>${fm}</n1:PeriodStart><n1:PeriodStartYear>${fy}</n1:PeriodStartYear><n1:PeriodEnd>${tm}</n1:PeriodEnd><n1:PeriodEndYear>${fy}</n1:PeriodEndYear></n1:SelectionCriteria>`);
  L.push(`<n1:HeaderComment>${lunar ? 'L' : 'T'}</n1:HeaderComment><n1:SegmentIndex>1</n1:SegmentIndex><n1:TotalSegmentsInsequence>1</n1:TotalSegmentsInsequence><n1:TaxAccountingBasis>A</n1:TaxAccountingBasis>`);
  L.push('</n1:Header>');

  L.push('<n1:MasterFiles><n1:GeneralLedgerAccounts>');
  for (const r of b.rows) {
    const sid = r.sid - r.sic + r.rpd - r.rpc; // sold la începutul perioadei
    L.push(`<n1:Account><n1:AccountID>${r.cod}</n1:AccountID><n1:AccountDescription>${esc(r.nume)}</n1:AccountDescription><n1:StandardAccountID>${r.cod}</n1:StandardAccountID><n1:AccountType>${tipSAFT(r.tip)}</n1:AccountType>`
      + `<n1:OpeningDebitBalance>${amt(Math.max(0, sid))}</n1:OpeningDebitBalance><n1:OpeningCreditBalance>${amt(Math.max(0, -sid))}</n1:OpeningCreditBalance>`
      + `<n1:ClosingDebitBalance>${amt(r.sfd)}</n1:ClosingDebitBalance><n1:ClosingCreditBalance>${amt(r.sfc)}</n1:ClosingCreditBalance></n1:Account>`);
  }
  L.push('</n1:GeneralLedgerAccounts>');
  const part = (rol, tag, idTag) => {
    L.push(`<n1:${tag}s>`);
    for (const p of parteneri.filter((x) => x.roluri?.includes(rol))) {
      L.push(`<n1:${tag}><n1:CompanyStructure><n1:RegistrationNumber>${esc(String(p.cui || '').replace(/\s/g, ''))}</n1:RegistrationNumber><n1:Name>${esc(p.nume)}</n1:Name><n1:Address><n1:City>${esc(p.localitate || '')}</n1:City><n1:Country>RO</n1:Country></n1:Address></n1:CompanyStructure><n1:${idTag}>${esc(p.id)}</n1:${idTag}><n1:AccountID>${rol === 'client' ? '411' : '401'}</n1:AccountID></n1:${tag}>`);
    }
    L.push(`</n1:${tag}s>`);
  };
  part('client', 'Customer', 'CustomerID');
  part('furnizor', 'Supplier', 'SupplierID');
  L.push('<n1:TaxTable><n1:TaxTableEntry><n1:TaxType>300</n1:TaxType><n1:Description>TVA</n1:Description>'
    + '<n1:TaxCodeDetails><n1:TaxCode>310309</n1:TaxCode><n1:TaxPercentage>21</n1:TaxPercentage><n1:Country>RO</n1:Country></n1:TaxCodeDetails>'
    + '<n1:TaxCodeDetails><n1:TaxCode>310310</n1:TaxCode><n1:TaxPercentage>11</n1:TaxPercentage><n1:Country>RO</n1:Country></n1:TaxCodeDetails>'
    + '</n1:TaxTableEntry></n1:TaxTable>');
  L.push('</n1:MasterFiles>');

  L.push(`<n1:GeneralLedgerEntries><n1:NumberOfEntries>${perNote.length}</n1:NumberOfEntries><n1:TotalDebit>${amt(totD)}</n1:TotalDebit><n1:TotalCredit>${amt(totD)}</n1:TotalCredit>`);
  L.push('<n1:Journal><n1:JournalID>NC</n1:JournalID><n1:Description>Note contabile</n1:Description><n1:Type>NC</n1:Type>');
  let rec = 0;
  for (const n of perNote) {
    L.push(`<n1:Transaction><n1:TransactionID>${n.data.slice(0, 4)}-${n.nr}</n1:TransactionID><n1:Period>${Number(n.data.slice(5, 7))}</n1:Period><n1:PeriodYear>${n.data.slice(0, 4)}</n1:PeriodYear><n1:TransactionDate>${n.data}</n1:TransactionDate><n1:Description>${esc((n.explicatie || '').slice(0, 250))}</n1:Description><n1:SystemEntryDate>${(n.modificat || n.data).slice(0, 10)}</n1:SystemEntryDate><n1:GLPostingDate>${n.data}</n1:GLPostingDate>`);
    for (const l of n.linii) {
      for (const [ac, side] of [[l.d, 'Debit'], [l.c, 'Credit']]) {
        rec++;
        L.push(`<n1:TransactionLine><n1:RecordID>${rec}</n1:RecordID><n1:AccountID>${ac}</n1:AccountID><n1:Description>${esc((l.expl || n.explicatie || '').slice(0, 250))}</n1:Description><n1:${side}Amount><n1:Amount>${amt(l.suma)}</n1:Amount></n1:${side}Amount></n1:TransactionLine>`);
      }
    }
    L.push('</n1:Transaction>');
  }
  L.push('</n1:Journal></n1:GeneralLedgerEntries>');
  L.push('</n1:AuditFile>');
  return L.join('\n');
}

export { cont };
