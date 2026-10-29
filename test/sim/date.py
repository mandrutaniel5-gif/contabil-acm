# Datele simulării: o microîntreprindere de servicii IT (ACM CODE SRL), noiembrie 2026 – octombrie 2028.
# Generează, lună de lună: facturile emise (e-Factura, ca din ACM Docs), facturile primite (ca din SPV),
# bonurile introduse de mână și extrasul bancar (CSV în formatul BT) — toate coerente între ele.
import datetime as dt, random, zipfile, io

random.seed(7)
FIRMA = dict(nume='ACM CODE SRL', cui='51234567', adresa='Nr. 344, Avram Iancu, jud. Bihor', iban='RO49BTRLRONCRT0512345601', admin='MÂNDRUȚ ANIEL-IONATAN')
CLIENTI = [
    dict(nume='CINEMA PALACE SRL', cui='40112233', iban='RO11BACX0000001111111111', plateste=18),
    dict(nume='TOP ITP SERVICE SRL', cui='38877665', iban='RO22RNCB0000002222222222', plateste=35),
    dict(nume='PESCOBAR MEDIA SRL', cui='47788990', iban='RO33INGB0000003333333333', plateste=10),
]
SALARIAT = dict(nume='POPESCU ANDREEA', de_la=dt.date(2027, 1, 4), brut=4325)

def d(y, m, z): return dt.date(y, m, z)
def luni():
    y, m = 2026, 11
    while (y, m) <= (2028, 10):
        yield y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)

def esc(v): return str(v).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

def ubl(nr, data, scad, furn, client, linii, cota=0.0, moneda='RON'):
    baza = round(sum(v for _, v in linii), 2)
    tva = round(baza * cota, 2)
    tot = round(baza + tva, 2)
    cat = 'S' if cota else 'O'
    def party(p, vat):
        tax = f'<cac:PartyTaxScheme><cbc:CompanyID>{"RO" if vat else ""}{p["cui"]}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>' if vat else ''
        return f'<cac:Party><cac:PostalAddress><cbc:StreetName>Str. Principala 1</cbc:StreetName><cbc:CityName>Oradea</cbc:CityName><cbc:CountrySubentity>RO-BH</cbc:CountrySubentity><cac:Country><cbc:IdentificationCode>RO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>{tax}<cac:PartyLegalEntity><cbc:RegistrationName>{esc(p["nume"])}</cbc:RegistrationName><cbc:CompanyID>{p["cui"]}</cbc:CompanyID></cac:PartyLegalEntity></cac:Party>'
    lines = ''.join(f'<cac:InvoiceLine><cbc:ID>{i+1}</cbc:ID><cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="{moneda}">{v:.2f}</cbc:LineExtensionAmount><cac:Item><cbc:Name>{esc(n)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>{cat}</cbc:ID>{f"<cbc:Percent>{cota*100:g}</cbc:Percent>" if cota else ""}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="{moneda}">{v:.2f}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>' for i, (n, v) in enumerate(linii))
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:efactura.mfinante.ro:CIUS-RO:1.0.1</cbc:CustomizationID>
<cbc:ID>{nr}</cbc:ID><cbc:IssueDate>{data}</cbc:IssueDate><cbc:DueDate>{scad}</cbc:DueDate><cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>{moneda}</cbc:DocumentCurrencyCode>
<cac:AccountingSupplierParty>{party(furn, furn.get("vat", False))}</cac:AccountingSupplierParty>
<cac:AccountingCustomerParty>{party(client, client.get("vat", False))}</cac:AccountingCustomerParty>
<cac:TaxTotal><cbc:TaxAmount currencyID="{moneda}">{tva:.2f}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="{moneda}">{baza:.2f}</cbc:TaxableAmount><cbc:TaxAmount currencyID="{moneda}">{tva:.2f}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>{cat}</cbc:ID>{f"<cbc:Percent>{cota*100:g}</cbc:Percent>" if cota else ""}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="{moneda}">{baza:.2f}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="{moneda}">{baza:.2f}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="{moneda}">{tot:.2f}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="{moneda}">{tot:.2f}</cbc:PayableAmount></cac:LegalMonetaryTotal>
{lines}</Invoice>'''

def zip_spv(nume_xml, xml):
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(nume_xml, xml); z.writestr('semnatura_' + nume_xml, '<Signature/>')
    return b.getvalue()

def construieste():
    """Întoarce evenimentele pe luni: {(y,m): dict(emise=[...], primite=[...], bonuri=[...], banca=[...], note=[...])} și totalurile așteptate."""
    L = {k: dict(emise=[], primite=[], bonuri=[], banca=[], actiuni=[]) for k in luni()}
    exp = dict(venituri={}, incasat=0, cheltuieli_bani=0)
    def tx(data, suma, desc, cp=''):
        k = (data.year, data.month)
        if k in L: L[k]['banca'].append(dict(data=data, suma=round(suma, 2), desc=desc, cp=cp))
    def add_month(data, zile):
        x = data + dt.timedelta(days=zile)
        return x
    nr = 0
    # pornire: capital social + împrumut de la administrator
    L[(2026, 11)]['actiuni'].append(('capital', d(2026, 11, 3), 200))
    tx(d(2026, 11, 3), 200, 'Depunere capital social', FIRMA['admin'])
    tx(d(2026, 11, 4), 5000, 'Imprumut asociat catre societate', FIRMA['admin'])
    tva_de_la = None
    venit_cumul = {}
    for (y, m) in luni():
        an = y
        # venituri lunare: cresc în timp; în 2028 depășesc plafonul de TVA (395.000 lei)
        baza_luna = 8000 if (y, m) < (2027, 1) else (15000 if y == 2027 else 46000)
        for ci, cl in enumerate(CLIENTI[: (2 if y == 2026 else 3)]):
            val = round(baza_luna * [0.5, 0.3, 0.2][ci] * random.uniform(0.85, 1.15), 2)
            nr += 1
            data = d(y, m, 5 + ci * 7)
            # depășirea plafonului de TVA: chiar factura care trece de 395.000 lei se emite cu TVA
            if tva_de_la is None and venit_cumul.get(y, 0) + val > 395000:
                tva_de_la = data
                exp['tva_de_la'] = tva_de_la
            platitor = tva_de_la is not None and data >= tva_de_la
            cota = 0.21 if platitor else 0.0
            numar = f'ACM-{nr:04d}'
            xml = ubl(numar, data.isoformat(), (data + dt.timedelta(days=30)).isoformat(), dict(**FIRMA, vat=platitor), dict(**cl, vat=True),
                      [('Dezvoltare si mentenanta aplicatii software', val)], cota)
            tot = round(val * (1 + cota), 2)
            L[(y, m)]['emise'].append(dict(nr=numar, data=data, total=tot, client=cl['nume'], zip=zip_spv(f'{4000000000 + nr}.xml', xml)))
            venit_cumul[y] = venit_cumul.get(y, 0) + val
            exp['venituri'][y] = round(exp['venituri'].get(y, 0) + val, 2)
            # plata: Cinema la timp; TopITP întârzie, iar o dată plătește în două tranșe; Pescobar rapid
            zile = cl['plateste'] + (25 if (cl is CLIENTI[1] and m in (3, 9)) else 0)
            pd = data + dt.timedelta(days=zile)
            if cl is CLIENTI[1] and (y, m) == (2027, 6):
                tx(pd, round(tot / 2, 2), f'Plata partiala factura {numar}', cl['nume'])
                tx(pd + dt.timedelta(days=20), round(tot - round(tot / 2, 2), 2), f'Rest plata {numar}', cl['nume'])
            else:
                tx(pd, tot, f'Plata factura {numar} conf contract', cl['nume'])
        # furnizori din SPV
        hst = dict(nume='HOSTERION SRL', cui='20198340', vat=True)
        rcs = dict(nume='RCS & RDS SA', cui='5888716', vat=True)
        emag = dict(nume='DANTE INTERNATIONAL SA', cui='14399840', vat=True)
        client_firma = dict(**FIRMA, vat=False)
        def primita(furn, data, linii, cota, plata_zile, nr_f, plata_desc):
            xml = ubl(nr_f, data.isoformat(), (data + dt.timedelta(days=15)).isoformat(), furn, client_firma, linii, cota)
            tot = round(sum(v for _, v in linii) * (1 + cota), 2)
            L[(data.year, data.month)]['primite'].append(dict(nr=nr_f, data=data, total=tot, furn=furn['nume'], zip=zip_spv(f'{5000000000 + random.randint(1, 9999999)}.xml', xml)))
            tx(data + dt.timedelta(days=plata_zile), -tot, plata_desc, furn['nume'])
            exp['cheltuieli_bani'] += tot
        primita(rcs, d(y, m, 2), [('Abonament internet fibra', 49.59)], 0.21, 12, f'RCS{y}{m:02d}', f'Plata factura RCS{y}{m:02d}')
        if m == 11:
            primita(hst, d(y, m, 8), [('Gazduire web 12 luni + domeniu .ro', 500.00)], 0.21, 5, f'HST {y}-{m}', f'OP fact HST {y}-{m}')
        if (y, m) == (2027, 1):
            primita(emag, d(2027, 1, 20), [('Laptop Apple MacBook Pro 14 M5', 6446.28)], 0.21, 0, 'EMG 778812', 'Plata factura EMG 778812 eMAG')
        # abonamente străine cu cardul (fără factură în SPV)
        tx(d(y, m, 3), -31.40, 'POS GOOGLE *Workspace g.co/helppay', 'GOOGLE')
        tx(d(y, m, 9), -93.10, 'POS GITHUB INC SAN FRANCISCO USD 20.00', 'GITHUB')
        tx(d(y, m, 14), -466.20, 'POS ANTHROPIC CLAUDE.AI SUBSCRIPTION USD 100.00', 'ANTHROPIC')
        exp['cheltuieli_bani'] += 31.40 + 93.10 + 466.20
        if m == 2:
            tx(d(y, m, 21), -460.00, 'POS APPLE.COM/BILL DEVELOPER PROGRAM', 'APPLE')
            exp['cheltuieli_bani'] += 460
        # bonuri de combustibil: plătite cu cardul (apar și în extras) — utilizatorul le pozează
        for z in (6, 20):
            v = round(random.uniform(220, 330), 2)
            L[(y, m)]['bonuri'].append(dict(data=d(y, m, z), total=v, furn='OMV PETROM SA', desc='benzina', plata='banca'))
            tx(d(y, m, z), -v, 'POS OMV PETROM ORADEA', 'OMV PETROM')
            exp['cheltuieli_bani'] += v
        # numerar: retragere și bonuri de papetărie plătite cash
        if m in (1, 4, 7, 10):
            tx(d(y, m, 10), -500, 'Retragere numerar ATM BT Oradea', '')
            L[(y, m)]['bonuri'].append(dict(data=d(y, m, 11), total=round(random.uniform(40, 90), 2), furn='DEDEMAN SRL', desc='hartie si birotica', plata='casa'))
        # comision bancar
        tx(d(y, m, 28), -15.00, 'Comision administrare cont pachet IMM', '')
        exp['cheltuieli_bani'] += 15
        # salarii (de la ianuarie 2027): net la salariat pe 10, contribuții la ANAF pe 25, luna următoare
        if (y, m) > (2027, 1):
            py, pm = (y - 1, 12) if m == 1 else (y, m - 1)
            tx(d(y, m, 10), -2699.00, f'Salariu {pm:02d}/{py} {SALARIAT["nume"]}', SALARIAT['nume'])
            tx(d(y, m, 24), -1723.00, 'Plata contributii si impozit salarii D112 cont unic ANAF', 'TREZORERIE OPERATIVA ORADEA')
        if (y, m) == (2027, 1):
            L[(y, m)]['actiuni'].append(('angajare', SALARIAT['de_la'], None))
        # impozit micro trimestrial, pe 24 a lunii de după trimestru (suma o află utilizatorul din aplicație)
        if m in (1, 4, 7, 10) and (y, m) != (2026, 1):
            L[(y, m)]['actiuni'].append(('impozit', d(y, m, 24), None))
        # rambursare împrumut administrator (iunie 2027)
        if (y, m) == (2027, 6):
            tx(d(2027, 6, 15), -5000, 'Rambursare imprumut asociat', FIRMA['admin'])
        # dividende din profitul 2027 (mai 2028)
        if (y, m) == (2028, 5):
            L[(y, m)]['actiuni'].append(('dividende', d(2028, 5, 20), 60000))
            tx(d(2028, 5, 22), -50400, 'Plata dividende 2027 asociat unic', FIRMA['admin'])
            tx(d(2028, 5, 23), -9600, 'Impozit pe dividende 2027 cont unic ANAF', 'TREZORERIE OPERATIVA ORADEA')
        # sfârșit de an: inventar, situații financiare
        if m == 12:
            L[(y, m)]['actiuni'].append(('an', d(y, 12, 31), None))
    return L, exp

def csv_bt(tranz):
    rows = ['Data tranzactie;Descriere;Debit;Credit;Beneficiar/Ordonator;Sold']
    for t in sorted(tranz, key=lambda x: x['data']):
        v = f'{abs(t["suma"]):,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')
        rows.append(f'{t["data"].strftime("%d.%m.%Y")};{t["desc"]};{v if t["suma"] < 0 else ""};{v if t["suma"] > 0 else ""};{t["cp"]};')
    return '﻿' + '\n'.join(rows) + '\n'
