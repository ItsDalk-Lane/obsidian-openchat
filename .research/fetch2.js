const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research';

const fetch = (url, file, headers) => new Promise((resolve, reject) => {
  const opts = { headers: Object.assign({ 'User-Agent': 'Node-Script' }, headers || {}) };
  const req = https.get(url, opts, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      process.stdout.write(file + ' status: ' + res.statusCode + ' length: ' + data.length + '\n');
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const out = path.join(dir, file);
        fs.writeFileSync(out, data);
        process.stdout.write('Saved ' + out + '\n');
        resolve(data);
      } else {
        reject(new Error('HTTP ' + res.statusCode));
      }
    });
  });
  req.on('error', reject);
  req.setTimeout(60000, () => req.destroy(new Error('timeout')));
});

(async () => {
  const jobs = [
    ['https://raw.githubusercontent.com/agegr/pi-web/main/package.json', 'upstream-package.json'],
    ['https://api.github.com/repos/agegr/pi-web/compare/v0.8.8...v0.8.9', 'compare-088-089.json', { 'Accept': 'application/vnd.github.v3+json' }],
    ['https://api.github.com/repos/agegr/pi-web/compare/v0.8.7...v0.8.9', 'compare-087-089.json', { 'Accept': 'application/vnd.github.v3+json' }],
    ['https://api.github.com/repos/agegr/pi-web/compare/v0.8.1...v0.8.9', 'compare-081-089.json', { 'Accept': 'application/vnd.github.v3+json' }],
    ['https://api.github.com/repos/agegr/pi-web/commits?sha=v0.8.9&per_page=100', 'commits-v089.json', { 'Accept': 'application/vnd.github.v3+json' }],
    ['https://api.github.com/repos/agegr/pi-web/commits?sha=v0.8.1&per_page=10', 'commits-v081.json', { 'Accept': 'application/vnd.github.v3+json' }],
  ];
  for (const [url, file, headers] of jobs) {
    let lastErr;
    for (let i = 0; i < 3; i++) {
      try { await fetch(url, file, headers); lastErr = null; break; }
      catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 800)); }
    }
    if (lastErr) process.stdout.write('Gave up ' + file + ': ' + lastErr.message + '\n');
  }
  process.stdout.write('DONE\n');
})();
