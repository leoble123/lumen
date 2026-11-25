// Tiny static server (no installs needed). Spotify only allows http redirects to 127.0.0.1,
// so the app is always served from http://127.0.0.1:8888
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 8888;
const URL_ = `http://127.0.0.1:${PORT}/`;
const ROOT = path.join(__dirname, 'public');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

function start() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.startsWith('/__net/')) p = p.slice(6);           // service worker's direct line to these files
      if (p === '/' || p === '/callback') p = '/index.html';
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
      });
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(URL_));
  });
}

// Open Lumen in Chrome or Edge (both include Spotify's DRM). A normal window is used so the
// browser can offer "Install Lumen"; after installing, Lumen opens from the Start menu / Dock.
function openWindow(url) {
  const exists = p => p && fs.existsSync(p);
  const run = (cmd, args) => spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
  if (process.platform === 'win32') {
    const pf = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], process.env['LOCALAPPDATA']];
    const candidates = pf.flatMap(b => b ? [
      path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(b, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ] : []);
    const exe = candidates.find(exists);
    if (exe) return run(exe, ['--new-window', url]);
    return run('cmd', ['/c', 'start', '', 'msedge', '--new-window', url]);
  }
  if (process.platform === 'darwin') {
    const apps = ['/Applications/Google Chrome.app', '/Applications/Microsoft Edge.app', '/Applications/Brave Browser.app']
      .concat(['Google Chrome.app', 'Microsoft Edge.app'].map(a => path.join(process.env.HOME || '', 'Applications', a)));
    const app = apps.find(exists);
    if (app) return run('open', ['-a', app, url]);
    console.log('Tip: install Google Chrome for the best experience. Opening your default browser instead.');
    return run('open', [url]);
  }
  run('xdg-open', [url]);
}

module.exports = { start, PORT };

if (require.main === module) {
  const open = process.argv.includes('--open');
  start().then(url => {
    console.log('');
    console.log('  Lumen is running at ' + url);
    console.log('  First time? Click "Install" in Lumen (bottom-left) - after that, open Lumen');
    console.log('  from your Start menu / Dock / Launchpad and you won\'t need this window.');
    console.log('');
    console.log('  Keep this window open while using Lumen in the browser. Close it to quit.');
    console.log('');
    if (open) openWindow(url);
  }).catch(err => {
    if (err.code === 'EADDRINUSE') {
      console.log('Lumen is already running - opening it.');
      if (open) openWindow(URL_);
      setTimeout(() => process.exit(0), 1500);
    } else {
      console.error('Could not start Lumen:', err.message);
      process.exitCode = 1;
    }
  });
}
