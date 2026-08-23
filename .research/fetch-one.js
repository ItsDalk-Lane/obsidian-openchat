const https = require('https');
const fs = require('fs');
const path = require('path');

const dest = 'C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\upstream-v089\\lib\\model-scope.ts';
fs.mkdirSync(path.dirname(dest), { recursive: true });

const fetch = (url) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers: { 'User-Agent': 'Node-Script' } }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      console.log('status=' + res.statusCode + ' len=' + data.length);
      if (res.statusCode === 200) {
        fs.writeFileSync(dest, data);
        resolve();
      } else {
        reject(new Error('HTTP ' + res.statusCode));
      }
    });
  });
  req.on('error', reject);
  req.setTimeout(45000, () => req.destroy(new Error('timeout')));
});

(async () => {
  for (let i = 0; i < 4; i++) {
    try { await fetch('https://raw.githubusercontent.com/agegr/pi-web/v0.8.9/lib/model-scope.ts'); break; }
    catch (e) { console.log('retry ' + i + ': ' + e.message); await new Promise(r => setTimeout(r, 1500)); }
  }
})();
