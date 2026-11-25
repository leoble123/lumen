const { app, BrowserWindow, components, shell } = require('electron');
const { start } = require('./server');

async function createWindow() {
  // Wait for the Widevine DRM module (needed for Spotify playback)
  if (components && components.whenReady) {
    try { await components.whenReady(); } catch (e) { console.warn('Widevine not ready:', e); }
  }
  const url = await start();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#000000',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true },
  });
  // Open external links in the real browser
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL(url);
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
