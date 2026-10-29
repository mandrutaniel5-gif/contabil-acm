# Rulează aplicația iOS în simulator: pornește testul încorporat (www/autotest.js), face capturi la „ACMSHOT”,
# atinge ecranul la „ACMTAP x y” (cu idb) și salvează rezultatele. Folosit de workflow-ul „Teste pe dispozitive”.
import subprocess, sys, re, json, time, os, shutil
UDID, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
idb = (os.path.expanduser('~/.local/bin/idb') if os.path.exists(os.path.expanduser('~/.local/bin/idb')) else None) or shutil.which('idb') or next((p for p in [os.path.expanduser('~/.local/bin/idb')] + [os.path.join(os.path.expanduser('~/Library/Python'), v, 'bin', 'idb') for v in (os.listdir(os.path.expanduser('~/Library/Python')) if os.path.isdir(os.path.expanduser('~/Library/Python')) else [])] if os.path.exists(p)), None)
log = open(os.path.join(OUT, 'consola.txt'), 'w')
p = subprocess.Popen(['xcrun', 'simctl', 'launch', '--console-pty', '--terminate-running-process', UDID, 'ro.acmcode.contabil'],
                     stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
gata, t0, rez = None, time.time(), []
for line in p.stdout:
    log.write(line); log.flush()
    if time.time() - t0 > 900: break
    m = re.search(r'ACMSHOT (\S+)', line)
    if m and 'ACMTEST' not in line:
        subprocess.run(['xcrun', 'simctl', 'io', UDID, 'screenshot', os.path.join(OUT, m.group(1) + '.png')], capture_output=True)
    m = re.search(r'ACMTAP (\d+) (\d+) (.+)', line)
    if m:
        if idb:
            r = subprocess.run([idb, 'ui', 'tap', '--udid', UDID, m.group(1), m.group(2)], capture_output=True, text=True)
            log.write(f'[runner] tap {m.group(1)},{m.group(2)} rc={r.returncode} {r.stderr[-400:]}\n')
        else:
            log.write('[runner] idb lipsă: atingerea nu s-a putut face\n')
        time.sleep(0.5)
        subprocess.run(['xcrun', 'simctl', 'io', UDID, 'screenshot', os.path.join(OUT, 'tap_' + re.sub(r'\W+', '_', m.group(3)) + '.png')], capture_output=True)
    m = re.search(r'ACMRES (\{.*\})\s*$', line)
    if m:
        try: rez.append(json.loads(m.group(1)))
        except Exception as e: log.write(f'[runner] rezultat necitit: {e}\n')
    m = re.search(r'ACMDONE (\d+)', line)
    if m:
        gata = m.group(1); break
p.terminate()
with open(os.path.join(OUT, 'rezultate.json'), 'w') as f: json.dump(rez, f, ensure_ascii=False, indent=1)
fail = [r for r in rez if not r['ok']]
print(f'{len(rez)} verificări, {len(fail)} eșuate; idb: {"da" if idb else "nu"}')
for r in fail: print('  FAIL', r['nume'], r['detalii'])
sys.exit(0 if gata else 1)
