const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research';

const fetch = (url, file) => new Promise((resolve, reject) => {
  const opts = {
    headers: { 'User-Agent': 'Node-Script' }
  };
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
  req.setTimeout(30000, () => req.destroy(new Error('timeout')));
});

(async () => {
  for (let i = 0; i < 3; i++) {
    try {
      await fetch('https://raw.githubusercontent.com/agegr/pi-web/main/package.json', 'package.json');
      process.stdout.write('DONE\n');
      return;
    } catch (e) {
      process.stdout.write('Retry ' + i + ': ' + e.message + '\n');
    }
  }
})();