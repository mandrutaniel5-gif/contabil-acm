// Aplicația desktop Windows: încarcă interfața din www/ într-o fereastră securizată.
const { app, BrowserWindow, shell, protocol, net } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

// Protocol propriu (app://) — modulele ES și IndexedDB funcționează ca pe un site, cu origine stabilă.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1320, height: 860, minWidth: 380, minHeight: 600,
    title: 'ACM Contabil', backgroundColor: '#f3f5f8', autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.loadURL('app://local/index.html');
  // Linkurile externe se deschid în browser, nu în aplicație
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'allow' };
  });
  win.webContents.on('will-navigate', (ev, url) => { if (!url.startsWith('app://')) ev.preventDefault(); });
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
