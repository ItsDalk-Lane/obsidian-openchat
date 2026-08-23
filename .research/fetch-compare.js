const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research';

const fetch = (url, file) => new Promise((resolve, reject) => {
  const opts = {
    headers: { 'User-Agent': 'Node-Script', 'Accept': 'application/vnd.github.v3+json' }
  };
  const req = https.get(url, opts, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      process.stdout.write(file + ' status: ' + res.statusCode + ' length: ' + data.length + '\n');
      if (res.statusCode >= 200 && res.statusCode < 300) {
        fs.writeFileSync(path.join(dir, file), data);
        resolve(data);
      } else {
        reject(new Error('HTTP ' + res.statusCode));
      }
    });
  });
  req.on('error', reject);
  req.setTimeout(30000, () => req.destroy(new Error('timeout')));
});

(async () => {
  for (let i = 0; i < 3; i++) {
    try {
      // Compare v0.8.8...v0.8.9
      await fetch('https://api.github.com/repos/agegr/pi-web/compare/v0.8.8...v0.8.9', 'compare-0.8.8-0.8.9.json');
      process.stdout.write('DONE compare\n');
      return;
    } catch (e) {
      process.stdout.write('Retry compare ' + i + ': ' + e.message + '\n');
    }
  }
})();