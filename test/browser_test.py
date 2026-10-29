# Test în browser (Chromium): e-Factura din ZIP, sincronizare criptată între două dispozitive pe un Firestore
# simulat (aceleași cereri REST ca serverul real) și toate ecranele pe telefon și desktop.
# Rulare: python3 -m http.server 5174 -d www &  python3 test/browser_test.py
import asyncio, json, sys, time, base64, re
from datetime import datetime, timezone
from playwright.async_api import async_playwright

U = 'http://localhost:5174/index.html'
FIX = __file__.rsplit('/', 1)[0] + '/fixtures/'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/'
errs = []

# ---------------- Firestore + Auth simulate ----------------
DOCS = {}      # name -> {fields, t}
SEQ = [0]
def now_ts():
    SEQ[0] += 1
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.') + f'{SEQ[0]:06d}Z'

async def fake(route):
    req = route.request
    url = req.url
    if 'identitytoolkit' in url:
        SEQ[0] += 1
        return await route.fulfill(json={'idToken': f'tok{SEQ[0]}', 'refreshToken': 'r', 'localId': f'u{SEQ[0]}', 'expiresIn': '3600'})
    if 'firestore.googleapis.com' in url:
        if req.method == 'OPTIONS':
            return await route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'})
        assert req.headers.get('authorization', '').startswith('Bearer tok'), 'fără token'
        body = json.loads(req.post_data or '{}') if req.post_data else {}
        if url.endswith(':commit'):
            for w in body['writes']:
                name = w['update']['name']
                f = dict(w['update']['fields'])
                assert re.search(r'/seifuri/[A-Za-z0-9_-]{43}/inregistrari/[A-Za-z0-9_-]{1,40}$', name), name
                assert set(f) <= {'c', 'iv', 't', 'n', 'p'}, f.keys()
                for x in w.get('updateTransforms', []):
                    f['t'] = {'timestampValue': now_ts()}
                DOCS[name] = f
            return await route.fulfill(json={'writeResults': []})
        if url.endswith(':runQuery'):
            vault = re.search(r'/seifuri/([^:/]+):runQuery', url).group(1)
            q = body['structuredQuery']
            after = q.get('where', {}).get('fieldFilter', {}).get('value', {}).get('timestampValue')
            rows = [(n, f) for n, f in DOCS.items() if f'/seifuri/{vault}/' in n and 't' in f and (not after or f['t']['timestampValue'] > after)]
            rows.sort(key=lambda r: r[1]['t']['timestampValue'])
            rows = rows[:q.get('limit', 200)]
            return await route.fulfill(json=[{'document': {'name': n, 'fields': f, 'updateTime': f['t']['timestampValue']}} for n, f in rows] or [{'readTime': now_ts()}])
        name = re.search(r'documents/(.+)$', url).group(1)
        full = [n for n in DOCS if n.endswith(name)]
        return await route.fulfill(json={'name': full[0], 'fields': DOCS[full[0]]} if full else {}, status=200 if full else 404)
    return await route.continue_()

async def page_for(b, w, h, mobile=False):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2 if mobile else 1, is_mobile=mobile, has_touch=mobile)
    await ctx.route(re.compile(r'https://(identitytoolkit|securetoken|firestore)\.googleapis\.com/.*'), fake)
    pg = await ctx.new_page()
    pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
    pg.on('console', lambda m: errs.append(f'console {m.type}: {m.text}') if m.type == 'error' and 'cloudfunctions' not in m.text and 'Failed to load resource' not in m.text else None)
    await pg.goto(U); await pg.wait_for_timeout(700)
    return ctx, pg

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ok = 0
        # ---------------- A: desktop ----------------
        ca, A = await page_for(b, 1360, 900)
        await A.goto(U + '#setari/firma'); await A.wait_for_timeout(300)
        await A.fill('#cui', '51234567'); await A.fill('#administrator', 'Mândruț Aniel-Ionatan'); await A.click('#save'); await A.wait_for_timeout(400)
        # e-Factura din ZIP (SPV)
        await A.goto(U + '#documente'); await A.wait_for_timeout(300)
        await A.set_input_files('#xmlf', FIX + 'spv.zip'); await A.wait_for_timeout(1500)
        d = await A.evaluate("async () => { const {db} = await import('./js/db.js'); return (await db.all('documente')).map(d => ({nr: d.nr, total: d.total, tip: d.tip, cont: d.cont, p: d.partener.nume, cui: d.partener.cui, scad: d.scadenta, ver: d.deVerificat, fis: d.fisier && d.fisier.type})); }")
        assert len(d) == 1 and d[0]['nr'] == 'HST 771' and d[0]['total'] == 119.5 and d[0]['tip'] == 'cheltuiala' and d[0]['cont'] == '628' and d[0]['scad'] == '2026-10-20' and d[0]['ver'], d
        print('✓ e-Factura din ZIP SPV:', d[0]); ok += 1
        await A.screenshot(path=OUT + 'b_documente.png', full_page=True)
        # seif: creare
        await A.goto(U + '#setari/sync'); await A.wait_for_timeout(300)
        await A.click('#creeaza'); await A.wait_for_timeout(2500)
        cod = await A.evaluate("async () => { const s = await import('./js/sync.js'); return s.codAsociere(await s.stare()); }")
        assert cod.startswith('ACMC1-') and len(cod) == 49, cod
        assert any('/inregistrari/' in n for n in DOCS), 'nimic trimis'
        blob = json.dumps(DOCS)
        assert 'HOSTERION' not in blob and '119.5' not in blob and 'documente' not in blob, 'date necriptate pe server!'
        print('✓ seif creat, date criptate pe server:', len(DOCS), 'înregistrări'); ok += 1
        await A.click('#arata'); await A.wait_for_timeout(200)
        await A.screenshot(path=OUT + 'b_sync.png', full_page=True)

        # ---------------- B: telefon, asociere ----------------
        cb, B = await page_for(b, 390, 844, mobile=True)
        await B.goto(U + '#setari/sync'); await B.wait_for_timeout(300)
        await B.click('#manual'); await B.fill('#cod', cod); await B.click('#ok'); await B.wait_for_timeout(2500)
        db_ = await B.evaluate("async () => { const {db} = await import('./js/db.js'); return { docs: (await db.all('documente')).map(d => d.nr), cui: (await db.get('settings','firma')).cui, note: (await db.all('note')).length }; }")
        assert db_['docs'] == ['HST 771'] and db_['cui'] == '51234567' and db_['note'] >= 1, db_
        print('✓ telefonul a primit datele prin seif:', db_); ok += 1
        # B adaugă o operațiune → ajunge pe A
        await B.goto(U + '#operatii'); await B.wait_for_timeout(300)
        await B.click('[data-op="capital"]'); await B.wait_for_timeout(400)
        await B.fill('#o-data', '2026-10-02'); await B.fill('#o-suma', '200'); await B.click('#o-save'); await B.wait_for_timeout(500)
        await B.evaluate("async () => { const s = await import('./js/sync.js'); await s.sincronizeaza(); }")
        await A.evaluate("async () => { const s = await import('./js/sync.js'); await s.sincronizeaza(); }")
        na = await A.evaluate("async () => { const {db} = await import('./js/db.js'); return (await db.all('note')).filter(n => n.operatie === 'capital').length; }")
        assert na == 1, na
        print('✓ operațiunea de pe telefon a ajuns pe calculator'); ok += 1
        # ștergere sincronizată
        await A.evaluate("async () => { const {db} = await import('./js/db.js'); const e = await import('./js/engine.js'); const d = (await db.all('documente'))[0]; await e.stergeDocument(d); const s = await import('./js/sync.js'); await s.sincronizeaza(); }")
        await B.evaluate("async () => { const s = await import('./js/sync.js'); await s.sincronizeaza(); }")
        nb = await B.evaluate("async () => { const {db} = await import('./js/db.js'); return (await db.all('documente')).length; }")
        assert nb == 0, nb
        print('✓ ștergerea se sincronizează'); ok += 1

        # ---------------- toate ecranele, telefon și desktop ----------------
        await A.evaluate("async () => { const {db} = await import('./js/db.js'); const {importaFisier} = await import('./js/anaf.js'); }")
        await A.set_input_files('#xmlf', FIX + 'spv.zip') if await A.query_selector('#xmlf') else None
        routes = ['acasa', 'documente', 'documente/nou', 'banca', 'operatii', 'parteneri', 'registre/jurnal', 'registre/balanta', 'registre/tva', 'registre/inventar', 'registre/situatii', 'registre/an', 'registre/inchidere', 'declaratii', 'declaratii/impozit', 'declaratii/saft', 'formulare', 'formulare/chitanta', 'formulare/decont', 'formulare/deplasare', 'formulare/hotarare', 'ghid', 'setari/firma', 'setari/sync', 'setari/spv', 'setari/auto', 'setari/date']
        for pg, nume in [(A, 'd'), (B, 'm')]:
            for r in routes:
                await pg.goto(U + '#' + r); await pg.wait_for_timeout(250)
                txt = await pg.inner_text('main')
                assert 'nu s-a putut afișa' not in txt, f'{nume} {r}: {txt[:200]}'
                ov = await pg.evaluate('() => [innerWidth, visualViewport.width, document.documentElement.scrollWidth]')
                assert ov[0] == ov[1] and ov[2] <= ov[0], f'{nume} {r} depășește lățimea: {ov}'
                if r in ('acasa', 'banca', 'parteneri', 'registre/situatii', 'formulare/chitanta', 'ghid', 'setari/spv', 'setari/auto'):
                    await pg.screenshot(path=OUT + f'b_{nume}_{r.replace("/", "_")}.png', full_page=(nume == 'd'))
        print(f'✓ {len(routes)} ecrane × 2 dimensiuni, fără erori și fără depășiri'); ok += 1
        await b.close()
        bad = [e for e in errs if 'cloudfunctions' not in e and 'net::ERR' not in e]
        print('\n'.join(bad) if bad else 'FĂRĂ ERORI ÎN CONSOLĂ')
        print(f'{ok} teste în browser trecute.')
        if bad: sys.exit(1)

asyncio.run(main())
