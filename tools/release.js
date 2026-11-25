// Prepare a new Lumen version for over-the-air delivery.
//   node tools/release.js 0.4.1 "What changed"
// Writes public/version.json (version, notes, SHA-256 of every file). Commit + push to GitHub
// and every installed copy of Lumen picks it up automatically.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'public');
const SKIP = new Set(['sw.js', 'version.json']);   // the service worker updates through the launcher only
const [, , version, ...noteParts] = process.argv;
if (!/^\d+\.\d+\.\d+$/.test(version || '')) { console.error('Usage: node tools/release.js 1.2.3 "notes"'); process.exit(1); }

const files = {};
(function walk(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const rel = path.relative(ROOT, full).split(path.sep).join('/');
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (!SKIP.has(rel) && !name.startsWith('.')) files[rel] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }
})(ROOT);

const manifest = { version, notes: noteParts.join(' '), released: new Date().toISOString(), files };
fs.writeFileSync(path.join(ROOT, 'version.json'), JSON.stringify(manifest, null, 2) + '\n');
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Lumen ${version}: ${Object.keys(files).length} files fingerprinted.`);
