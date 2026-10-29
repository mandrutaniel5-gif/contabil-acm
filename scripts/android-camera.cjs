// Adaugă permisiunea de cameră în manifestul Android (pentru scanarea bonurilor). Rulează o singură dată după `cap add android`.
const fs = require('fs');
const f = 'android/app/src/main/AndroidManifest.xml';
let c = fs.readFileSync(f, 'utf8');
if (!c.includes('permission.CAMERA')) {
  c = c.replace('<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.CAMERA" />');
  fs.writeFileSync(f, c);
}
console.log('Permisiune cameră: OK');

// Versiunea aplicației din package.json (Android cere versionCode crescător la fiecare actualizare).
const ver = require('../package.json').version;
const [a, b, p] = ver.split('.').map(Number);
const g = 'android/app/build.gradle';
let gr = fs.readFileSync(g, 'utf8');
gr = gr.replace(/versionCode \d+/, `versionCode ${a * 10000 + b * 100 + p}`).replace(/versionName "[^"]*"/, `versionName "${ver}"`);
fs.writeFileSync(g, gr);
console.log(`Versiune Android: ${ver} (${a * 10000 + b * 100 + p})`);
