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
