// Aplicația desktop Windows: încarcă interfața din www/ într-o fereastră securizată.
const { app, BrowserWindow, shell, protocol, net, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Protocol propriu (app://) — modulele ES și IndexedDB funcționează ca pe un site, cu origine stabilă.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// Doar aceste servicii pot fi apelate prin puntea nativă (fără CORS).
const PERMISE = ['api.anaf.ro', 'webservicesp.anaf.ro', 'logincert.anaf.ro', 'www.bnr.ro', 'bnr.ro', 'curs.bnr.ro'];

ipcMain.handle('acm-fetch', async (_ev, url, opts = {}) => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !PERMISE.includes(u.hostname)) return { error: 'Adresă nepermisă: ' + u.hostname };
    let body;
    if (opts.body && opts.body.text != null) body = opts.body.text;
    else if (opts.body && opts.body.b64 != null) body = Buffer.from(opts.body.b64, 'base64');
    const r = await net.fetch(url, { method: opts.method || 'GET', headers: opts.headers || {}, body });
    const buf = Buffer.from(await r.arrayBuffer());
    const headers = {};
    r.headers.forEach((v, k) => { headers[k] = v; });
    return { status: r.status, headers, b64: buf.toString('base64') };
  } catch (e) {
    return { error: (e && e.message) || 'Cererea a eșuat' };
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 380, minHeight: 600,
    title: 'ACM Contabil', backgroundColor: '#f3f5f8', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadURL('app://local/index.html');
  // Linkurile externe se deschid în browser, nu în aplicație
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith('app://')) ev.preventDefault(); });
  // Camera (scanarea bonurilor și a codului QR de asociere)
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(['media', 'clipboard-sanitized-write'].includes(permission)));
}

app.whenReady().then(() => {
  const root = path.join(__dirname, '..', 'www');
  protocol.handle('app', (req) => {
    const p = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(root)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
