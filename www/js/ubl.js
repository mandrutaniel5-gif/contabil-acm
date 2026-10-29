// Citirea facturilor e-Factura (UBL 2.1 / CIUS-RO): Invoice și CreditNote.
const NS = {
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
};
const kids = (el, ns, name) => (el ? [...el.children].filter((c) => c.localName === name && c.namespaceURI === NS[ns]) : []);
const kid = (el, ns, name) => kids(el, ns, name)[0] || null;
const path = (el, ...steps) => { let e = el; for (const s of steps) { const [ns, n] = s.split(':'); e = kid(e, ns, n); if (!e) return null; } return e; };
const txt = (el, ...steps) => (path(el, ...steps)?.textContent || '').trim();
const num = (el, ...steps) => { const v = parseFloat(txt(el, ...steps)); return Number.isFinite(v) ? v : 0; };

function partener(party) {
  if (!party) return {};
  const tax = txt(party, 'cac:PartyTaxScheme', 'cbc:CompanyID');
  const legal = txt(party, 'cac:PartyLegalEntity', 'cbc:CompanyID');
  const cui = (tax || legal || '').replace(/\s+/g, '');
  const adr = path(party, 'cac:PostalAddress');
  return {
    nume: txt(party, 'cac:PartyLegalEntity', 'cbc:RegistrationName') || txt(party, 'cac:PartyName', 'cbc:Name'),
    cui, regCom: /^J/i.test(legal) ? legal : '',
    platitorTVA: /^RO/i.test(tax),
    adresa: [txt(adr, 'cbc:StreetName'), txt(adr, 'cbc:CityName'), txt(adr, 'cbc:CountrySubentity')].filter(Boolean).join(', '),
    localitate: txt(adr, 'cbc:CityName'),
    tara: txt(adr, 'cac:Country', 'cbc:IdentificationCode') || 'RO',
    iban: txt(party, 'cac:FinancialAccount', 'cbc:ID'),
  };
}

export function citesteFactura(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const root = doc.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length) throw new Error('XML-ul facturii nu poate fi citit.');
  const creditNote = root.localName === 'CreditNote';
  const semn = creditNote ? -1 : 1;
  const total = path(root, 'cac:LegalMonetaryTotal');
  const cote = {};
  for (const tt of kids(root, 'cac', 'TaxTotal')) {
    for (const st of kids(tt, 'cac', 'TaxSubtotal')) {
      const pct = num(st, 'cac:TaxCategory', 'cbc:Percent');
      const k = String(Math.round(pct));
      cote[k] = cote[k] || { baza: 0, tva: 0, categorie: txt(st, 'cac:TaxCategory', 'cbc:ID') };
      cote[k].baza += num(st, 'cbc:TaxableAmount') * semn;
      cote[k].tva += num(st, 'cbc:TaxAmount') * semn;
    }
  }
  const linii = kids(root, 'cac', creditNote ? 'CreditNoteLine' : 'InvoiceLine').map((l) => ({
    denumire: txt(l, 'cac:Item', 'cbc:Name') || txt(l, 'cac:Item', 'cbc:Description'),
    cantitate: num(l, creditNote ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity'),
    valoare: num(l, 'cbc:LineExtensionAmount') * semn,
    cota: num(l, 'cac:Item', 'cac:ClassifiedTaxCategory', 'cbc:Percent'),
  }));
  const tvaTotal = Object.values(cote).reduce((s, c) => s + c.tva, 0);
  const plata = num(total, 'cbc:PayableAmount') || num(total, 'cbc:TaxInclusiveAmount');
  return {
    tip: creditNote ? 'storno' : 'factura',
    nr: txt(root, 'cbc:ID'),
    data: txt(root, 'cbc:IssueDate'),
    scadenta: txt(root, 'cbc:DueDate') || txt(root, 'cac:PaymentMeans', 'cbc:PaymentDueDate'),
    moneda: txt(root, 'cbc:DocumentCurrencyCode') || 'RON',
    furnizor: partener(path(root, 'cac:AccountingSupplierParty', 'cac:Party')),
    client: partener(path(root, 'cac:AccountingCustomerParty', 'cac:Party')),
    total: Math.round(plata * semn * 100) / 100,
    baza: Math.round(num(total, 'cbc:TaxExclusiveAmount') * semn * 100) / 100,
    tva: Math.round(tvaTotal * 100) / 100,
    cote,
    // la TVA cu taxare inversă (categoria AE) furnizorul nu pune TVA, dar cumpărătorul o calculează
    taxareInversa: Object.values(cote).some((c) => c.categorie === 'AE'),
    linii,
    note: kids(root, 'cbc', 'Note').map((n) => n.textContent.trim()).join(' ').slice(0, 300),
    ibanFurnizor: txt(root, 'cac:PaymentMeans', 'cac:PayeeFinancialAccount', 'cbc:ID'),
  };
}

export const curataCUI = (s) => String(s || '').toUpperCase().replace(/^RO/, '').replace(/\D/g, '');
