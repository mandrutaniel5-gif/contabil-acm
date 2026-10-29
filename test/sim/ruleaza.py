# Simulare: un utilizator începător ține contabilitatea ACM CODE SRL timp de 2 ani, din aplicație.
# Ceasul paginii e mutat la fiecare sesiune (o dată pe lună + termenele), datele rămân în IndexedDB.
# Rulare: python3 -m http.server 5174 -d www &   python3 test/sim/ruleaza.py <folder_rezultate>
import asyncio, sys, os, json, re, datetime as dt, tempfile
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
import date as D

U = os.environ.get('SIM_URL', 'http://localhost:5174/index.html')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/sim/'
os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp()
JURNAL = []          # observații: (data, tip, text)
ERORI = []
def nota(data, tip, text):
    JURNAL.append((str(data), tip, text)); print(f'[{data}] {tip}: {text}', flush=True)

async def sesiune(pg, cand, ecran='acasa'):
    await pg.clock.set_fixed_time(dt.datetime.combine(cand, dt.time(9, 30)))
    await pg.goto('about:blank')          # aplicația se deschide din nou (pe telefon e închisă între sesiuni)
    await pg.goto(U + '#' + ecran)
    await pg.wait_for_timeout(2600)   # automatizările pornesc la 1,5 s; închiderile după încă 4 s se reprogramează
    await pg.wait_for_timeout(1500)

async def toast(pg):
    try: return (await pg.inner_text('#toast')).strip()
    except Exception: return ''

async def mergi(pg, h):
    await pg.evaluate(f"location.hash = '#{h}'"); await pg.wait_for_timeout(450)

async def sfaturi(pg):
    return [t.strip() for t in await pg.locator('.tip p').all_inner_texts()]

async def fisier(pg, sel, nume, continut):
    p = os.path.join(TMP, nume)
    with open(p, 'wb' if isinstance(continut, bytes) else 'w', **({} if isinstance(continut, bytes) else {'encoding': 'utf-8'})) as f: f.write(continut)
    await pg.set_input_files(sel, p)
    await pg.wait_for_timeout(1800)

async def eval_js(pg, cod):
    return await pg.evaluate(f"async () => {{ {cod} }}")

async def configurare(pg, cand):
    await sesiune(pg, cand)
    nota(cand, 'prima-deschidere', ' | '.join(await sfaturi(pg)))
    await pg.screenshot(path=OUT + '01_prima_deschidere.png')
    # urmează lista „Primii pași”: primul punct, datele firmei
    pp = pg.locator('#primi-pasi')
    nota(cand, 'primii-pasi', (await pp.inner_text()).replace('\n', ' · ')[:500] if await pp.count() else 'LIPSĂ')
    await pp.locator('li[data-go]').first.click(); await pg.wait_for_timeout(500)
    await pg.fill('#cui', D.FIRMA['cui']); await pg.fill('#adresa', D.FIRMA['adresa']); await pg.fill('#localitate', 'Avram Iancu')
    await pg.fill('#iban', D.FIRMA['iban']); await pg.fill('#banca', 'Banca Transilvania'); await pg.fill('#administrator', 'Mândruț Aniel-Ionatan')
    if await pg.locator('#dataInfiintare').count(): await pg.fill('#dataInfiintare', '2026-10-27')
    else: nota(cand, 'LIPSA', 'nu există câmp pentru data înființării')
    await pg.click('#save'); await pg.wait_for_timeout(600)
    nota(cand, 'setari', await toast(pg))
    await mergi(pg, 'acasa')
    pp = pg.locator('#primi-pasi')
    nota(cand, 'primii-pasi', (await pp.inner_text()).replace('\n', ' · ')[:400] if await pp.count() else 'LIPSĂ')
    # al doilea pas: regimul fiscal (nu știe ce e) — lasă implicit micro, neplătitor TVA, și salvează
    await mergi(pg, 'setari/fiscal')
    txt = await pg.inner_text('main')
    nota(cand, 'regim-fiscal', 'vede: ' + ('micro' if 'Microîntreprindere' in txt else '?') + '; mențiune salariat obligatoriu: ' + ('da' if 'salariat' in txt.lower() else 'NU'))
    await pg.click('#save'); await pg.wait_for_timeout(600)
    # înregistrează capitalul social din Operațiuni (așa cum îi spune lista)
    await mergi(pg, 'operatii')
    await pg.click('[data-op="capital"]'); await pg.wait_for_timeout(400)
    await pg.fill('#o-data', '2026-11-03'); await pg.fill('#o-suma', '200'); await pg.click('#o-save'); await pg.wait_for_timeout(600)
    nota(cand, 'capital', await toast(pg))

async def introdu_bon(pg, b):
    await mergi(pg, 'documente/nou'); await pg.wait_for_timeout(300)
    await pg.fill('#data', b['data'].isoformat()); await pg.select_option('#tipDocument', 'Bon fiscal')
    await pg.fill('#pnume', b['furn']); await pg.fill('#descriere', b['desc']); await pg.fill('#total', f"{b['total']:.2f}")
    await pg.wait_for_timeout(200)
    cont = await pg.eval_on_selector('#cont', 'e => e.value')
    try: await pg.select_option('#plata', b['plata'])
    except Exception as e: nota(b['data'], 'BUG', f'plata {b["plata"]} lipsă: {e}')
    await pg.click('#save'); await pg.wait_for_timeout(700)
    if await pg.locator('#sheet.open').count():
        q = (await pg.inner_text('#sheet .sheet-body')).strip()
        opt = pg.locator('#sheet [data-opt]')
        if await opt.count():
            nota(b['data'], 'intrebare', q[:200] + ' → aleg: ' + (await opt.first.inner_text()))
            await opt.first.click()
        else:
            nota(b['data'], 'confirmare', q[:200]); await pg.locator('#sheet [data-yes]').click()
        await pg.wait_for_timeout(700)
    t = await toast(pg)
    if 'salvat' not in t.lower(): nota(b['data'], 'BUG', f'bon nesalvat: {t}')
    return cont

async def verifica_documente(pg, cand):
    """Deschide fiecare document „de verificat”, se uită la cont și salvează (cum ar face un începător)."""
    n = 0
    for _ in range(40):
        ids = await eval_js(pg, "const {db} = await import('./js/db.js'); return (await db.all('documente')).filter(d => d.deVerificat).map(d => [d.id, d.cont, d.descriere, d.partener?.nume, d.total]);")
        if not ids: break
        i, contv, desc, part, tot = ids[0]
        await mergi(pg, 'documente/' + i)
        try:
            await pg.click('#save'); await pg.wait_for_timeout(600)
        except Exception as e:
            await pg.screenshot(path=OUT + f'BLOCAJ_save_{cand}.png')
            acoperit = await pg.evaluate("() => { const b = document.querySelector('#save'); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); return el ? (el.id || el.className || el.tagName) + ' | ' + (el.innerText||'').slice(0,60) : 'nimic'; }")
            nota(cand, 'BUG-UI', f'nu pot apăsa Salvează la „{desc}”: acoperit de {acoperit}')
            await pg.evaluate("document.querySelector('#save').click()"); await pg.wait_for_timeout(600)
        if '#registre/mijloace/nou' in pg.url:
            nota(cand, 'mijloc-fix', f'aplicația m-a dus la planul de amortizare pentru „{desc}” ({tot} lei)')
            await pg.click('#m-save'); await pg.wait_for_timeout(500)
        n += 1
        if (contv in ('628', '6588')) and part and re.search('POS|GOOGLE|GITHUB|ANTHROPIC|APPLE', (part or '') + (desc or ''), re.I):
            pass
    return n

async def banca(pg, cand, luna_csv, nume):
    await mergi(pg, 'banca')
    await fisier(pg, '#f', nume, luna_csv)
    await pg.wait_for_timeout(1500)
    t = await toast(pg)
    nota(cand, 'extras', t)
    # confirmă propunerile; pentru cele neidentificate alege ca un începător
    for _ in range(60):
        await mergi(pg, 'banca')
        li = pg.locator('li[data-tx]').first
        if not await li.count(): break
        text = (await li.inner_text()).replace('\n', ' · ')
        ok = li.locator('[data-ok]')
        if await ok.count():
            nota(cand, 'banca-propunere', text[:220])
            await ok.click(); await pg.wait_for_timeout(500)
            continue
        nota(cand, 'banca-NEIDENTIFICAT', text[:220])
        await li.locator('[data-alt]').click(); await pg.wait_for_timeout(500)
        s = pg.locator('#sheet')
        low = text.lower()
        # ce ar alege un începător
        if 'salariu' in low:
            await s.locator('#c').select_option('641')
        elif 'anaf' in low or 'trezorerie' in low or 'contributii' in low:
            await s.locator('#c').select_option('635')
        elif 'dividende' in low:
            await s.locator('#c').select_option('4551')
        else:
            await s.locator('#c').select_option('6588')
        await s.locator('#cok').click(); await pg.wait_for_timeout(600)

async def plateste_impozit(pg, cand, extra):
    await sesiune(pg, cand, 'declaratii/impozit')
    txt = await pg.inner_text('main')
    m = re.search(r'Impozit de plată pentru T(\d) (\d{4})\s+([\d.,]+)', txt)
    if not m:
        nota(cand, 'BUG', 'nu găsesc suma de plată la D100: ' + txt[:300]); return
    suma = float(m.group(3).replace('.', '').replace(',', '.'))
    nota(cand, 'D100', f'T{m.group(1)} {m.group(2)}: de plată {suma} lei')
    if suma > 0:
        extra.append(dict(data=cand, suma=-suma, desc=f'Plata impozit micro T{m.group(1)} {m.group(2)} cont unic', cp='TREZORERIE OPERATIVA ORADEA'))

async def stare(pg):
    return await eval_js(pg, """
      const e = await import('./js/engine.js'); const n = await e.toateNotele(); const s = await e.getSetari();
      const an = new Date().getFullYear();
      const b = e.balanta(n, s, `${an}-01-01`, `${an}-12-31`);
      const o = {}; for (const r of b.rows) o[r.cod] = Math.round((r.sfd - r.sfc) * 100) / 100;
      return { solduri: o, echilibru: Math.abs(b.tot.sfd - b.tot.sfc) < 0.01, note: n.length };""")

async def main():
    L, exp = D.construieste()
    extra = {k: [] for k in L}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, locale='ro-RO', timezone_id='Europe/Bucharest')
        pg = await ctx.new_page()
        pg.set_default_timeout(6000)
        pg.on('pageerror', lambda e: ERORI.append(f'pageerror: {e}'))
        pg.on('console', lambda m: ERORI.append(f'console: {m.text}') if m.type == 'error' and 'Failed to load' not in m.text and 'ERR_' not in m.text else None)
        pg.on('dialog', lambda dlg: asyncio.ensure_future(dlg.dismiss()))
        await pg.add_init_script("window.print = () => {};")
        await configurare(pg, D.d(2026, 11, 3))
        luni = list(L.keys())
        for i, (y, m) in enumerate(luni):
            try:
                await luna(pg, i, y, m, L, luni, extra)
            except Exception as e:
                nota(f'{y}-{m:02d}', 'EXCEPTIE', str(e).split('\n')[0][:300])
                await pg.screenshot(path=OUT + f'EXCEPTIE_{y}_{m:02d}.png')
        if True:
            pass
        await finalizeaza(pg, L, exp, extra, b)

async def luna(pg, i, y, m, L, luni, extra):
            ev = L[(y, m)]
            urm = luni[i + 1] if i + 1 < len(luni) else (2028, 11)
            cand = D.d(urm[0], urm[1], 3)       # la începutul lunii următoare ține evidența lunii trecute
            # pe desktop o lună din două (aceleași date)
            await pg.set_viewport_size({'width': 1366, 'height': 900} if i % 2 else {'width': 390, 'height': 844})
            # acțiunile din cursul lunii (termenul D100 pe 24, hotărârea de dividende), înaintea extrasului lunii
            for (tip, data, val) in ev['actiuni']:
                if tip == 'impozit':
                    await plateste_impozit(pg, data, extra[(y, m)])
                if tip == 'angajare':
                    await sesiune(pg, data, 'declaratii/salarii')
                    await pg.click('#s-add'); await pg.wait_for_timeout(400)
                    sh = pg.locator('#sheet')
                    await sh.locator('#a-nume').fill(D.SALARIAT['nume'].title()); await sh.locator('#a-dela').fill(data.isoformat())
                    await sh.locator('#a-brut').fill(str(D.SALARIAT['brut']))
                    nota(data, 'angajare', (await sh.locator('#a-info').inner_text()))
                    await sh.locator('#a-save').click(); await pg.wait_for_timeout(900)
                    nota(data, 'angajare', await toast(pg))
                    await mergi(pg, 'declaratii/salarii'); await pg.screenshot(path=OUT + 'salarii_angajare.png', full_page=True)
                if tip == 'dividende':
                    await sesiune(pg, data, 'formulare/hotarare')
                    await pg.fill('#an', '2027'); await pg.fill('#div', str(val)); await pg.check('#inreg'); await pg.click('#go'); await pg.wait_for_timeout(800)
                    nota(data, 'dividende', await toast(pg))
            await sesiune(pg, cand)
            sf = await sfaturi(pg)
            nota(cand, 'acasa', ' | '.join(x[:140] for x in sf))
            # 1. facturile din SPV (emise din ACM Docs și primite), ca ZIP
            await mergi(pg, 'documente')
            for f in ev['emise'] + ev['primite']:
                await fisier(pg, '#xmlf', f'{f["nr"].replace(" ", "_")}.zip', f['zip'])
                t = await toast(pg)
                if 'importat' not in t: nota(cand, 'BUG', f'import {f["nr"]}: {t}')
            # 2. bonurile lunii (pozele: AI indisponibil, le completează de mână)
            for bon in ev['bonuri']:
                c = await introdu_bon(pg, bon)
                if bon['furn'].startswith('OMV') and c != '6022': nota(cand, 'OBS', f'bon benzină încadrat automat la {c}')
            # 3. documentele de verificat
            nv = await verifica_documente(pg, cand)
            # 4. extrasul de cont al lunii
            tranz = ev['banca'] + extra[(y, m)]
            if tranz: await banca(pg, cand, D.csv_bt(tranz), f'extras_{y}_{m:02d}.csv')
            # 5. acțiuni speciale
            for (tip, data, val) in ev['actiuni']:
                if tip == 'an':
                    await sesiune(pg, D.d(y + 1, 1, 15), 'registre/an')
                    txt = await pg.inner_text('main'); nota(D.d(y + 1, 1, 15), 'inchidere-an', txt[:500].replace('\n', ' · '))
                    rez = pg.locator('#rez')
                    if await rez.count(): await rez.click(); await pg.wait_for_timeout(600); nota(D.d(y + 1, 1, 15), 'rezerva', await toast(pg))
                    await mergi(pg, 'registre/situatii'); await pg.screenshot(path=OUT + f'situatii_{y}.png', full_page=True)
                    txt = await pg.inner_text('main'); nota(D.d(y + 1, 1, 15), 'situatii', re.sub(r'\s+', ' ', txt)[:700])
            st = await stare(pg)
            if not st['echilibru']: nota(cand, 'BUG', 'balanța nu e echilibrată')
            neg = {k: v for k, v in st['solduri'].items() if (k in ('5121', '5311') and v < -0.01)}
            if neg: nota(cand, 'BUG', f'sold negativ: {neg}')
            nota(cand, 'solduri', json.dumps({k: st['solduri'].get(k) for k in ['5121', '5311', '401', '411', '4418', '4551', '121', '1171', '473', '4423', '4427', '4426']}, ensure_ascii=False))
            if (y, m) in ((2026, 12), (2027, 6), (2027, 12), (2028, 9), (2028, 10)):
                for r in ['acasa', 'banca', 'documente', 'parteneri', 'declaratii', 'registre/balanta']:
                    await mergi(pg, r); await pg.screenshot(path=OUT + f'{y}_{m:02d}_{r.replace("/", "_")}_{"d" if i % 2 else "m"}.png', full_page=False)
            # plafonul de TVA: dacă aplicația avertizează că a fost depășit, utilizatorul bifează plătitor de TVA
            await mergi(pg, 'acasa'); sf2 = await sfaturi(pg)
            if any('Ai depășit plafonul de scutire TVA' in x for x in sf2):
                nota(cand, 'TVA', 'aplicația spune că am depășit plafonul; apăs „Trec la TVA”')
                await pg.get_by_role('button', name='Trec la TVA').first.click(); await pg.wait_for_timeout(500)
                nota(cand, 'TVA', 'data propusă: ' + await pg.eval_on_selector('#tvaDeLa', 'e => e.value'))
                await pg.click('#save'); await pg.wait_for_timeout(1500)
                nota(cand, 'TVA', await toast(pg))
            elif any('plafonul de scutire TVA' in x for x in sf):
                nota(cand, 'TVA-avertizare', next(x for x in sf if 'plafonul de scutire TVA' in x)[:200])
async def finalizeaza(pg, L, exp, extra, b):
        fin = await eval_js(pg, """
          const e = await import('./js/engine.js'); const S = await import('./js/situatii.js'); const n = await e.toateNotele(); const s = await e.getSetari();
          const out = {};
          for (const an of [2026, 2027, 2028]) { const sf = S.situatiiFinanciare(n, s, an); out[an] = { cpp: Object.fromEntries(sf.cpp.map(x => [x[0], x[1]])), verif: sf.verificare }; }
          const b = e.balanta(n, s, '2028-10-01', '2028-10-31'); const o = {}; for (const r of b.rows) o[r.cod] = Math.round((r.sfd - r.sfc) * 100) / 100;
          return { an: out, solduri: o };""")
        banca_asteptat = round(sum(t['suma'] for k in L for t in L[k]['banca'] + extra[k]), 2)
        nota('final', 'verificare', f'bancă așteptat {banca_asteptat}, în aplicație {fin["solduri"].get("5121")}')
        for an in ('2026', '2027', '2028'):
            v = fin['an'][an]['cpp'].get('Cifra de afaceri netă')
            nota('final', 'verificare', f'{an}: cifra de afaceri aplicație {v}, așteptat {exp["venituri"][int(an)]}, bilanț închis: {abs(fin["an"][an]["verif"]) < 0.5}')
        with open(OUT + 'final.json', 'w') as f: json.dump(fin, f, ensure_ascii=False, indent=1)
        await b.close()
        scrie_jurnal()

def scrie_jurnal():
    with open(OUT + 'jurnal.txt', 'w') as f:
        for r in JURNAL: f.write(' | '.join(r) + '\n')
        f.write('\nERORI:\n' + '\n'.join(sorted(set(ERORI))))
    print('\nERORI JS:', len(set(ERORI)))
    for e in sorted(set(ERORI))[:20]: print(' ', e[:200])

asyncio.run(main())
