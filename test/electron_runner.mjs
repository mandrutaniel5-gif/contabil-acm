// Rulează aplicația Windows (Electron) cu testul încorporat: capturi, „atingeri” cu mouse-ul, rezultate.
import { _electron } from 'playwright';
import fs from 'node:fs';
const OUT = process.argv[2] || 'rezultate-windows';
fs.mkdirSync(OUT, { recursive: true });
const consola = fs.createWriteStream(`${OUT}/consola.txt`);
const app = await _electron.launch({ args: ['.'], env: { ...process.env, ACM_TEST: '1' } });
const win = await app.firstWindow();
await win.setViewportSize?.({ width: 1280, height: 820 });
let gata;
const terminat = new Promise((res) => {
  win.on('console', async (m) => {
    const t = m.text();
    consola.write(t + '\n');
    let x;
    if ((x = t.match(/^ACMSHOT (\S+)/))) await win.screenshot({ path: `${OUT}/${x[1]}.png` }).catch(() => {});
    if ((x = t.match(/^ACMTAP (\d+) (\d+)/))) await win.mouse.click(+x[1], +x[2]).catch(() => {});
    if ((x = t.match(/^ACMDONE (.*)$/))) { gata = x[1]; res(); }
  });
  win.on('pageerror', (e) => consola.write('PAGEERROR ' + e.message + '\n'));
});
await Promise.race([terminat, new Promise((r) => setTimeout(r, 600000))]);
const rez = gata ? JSON.parse(gata) : [];
fs.writeFileSync(`${OUT}/rezultate.json`, JSON.stringify(rez, null, 1));
// mică verificare specifică Windows: titlul ferestrei și puntea nativă
fs.appendFileSync(`${OUT}/consola.txt`, `titlu: ${await win.title()} | acmHost: ${await win.evaluate(() => !!window.acmHost)}\n`);
await app.close();
const fail = rez.filter((r) => !r.ok);
console.log(`${rez.length} verificări, ${fail.length} eșuate`);
for (const r of fail) console.log('  FAIL', r.nume, r.detalii);
process.exit(gata ? 0 : 1);
