const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research';

const fetch = (url, file) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers: { 'User-Agent': 'Node-Script' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log(file + ' status=' + res.statusCode + ' len=' + data.length);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        fs.writeFileSync(path.join(dir, file), data);
        resolve();
      } else {
        reject(new Error('HTTP ' + res.statusCode));
      }
    });
  });
  req.on('error', reject);
  req.setTimeout(60000, () => req.destroy(new Error('timeout')));
});

(async () => {
  for (let i = 0; i < 4; i++) {
    try { await fetch('https://raw.githubusercontent.com/agegr/pi-web/main/package.json', 'upstream-package.json'); break; }
    catch (e) { console.log('retry ' + i + ': ' + e.message); await new Promise(r => setTimeout(r, 1500)); }
  }
})();
