const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research';

const fetch = (url, file) => new Promise((resolve, reject) => {
  const opts = {
    headers: { 'User-Agent': 'Node-Script', 'Accept': 'application/vnd.github.v3+json' }
  };
  https.get(url, opts, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const out = path.join(dir, file);
        fs.writeFileSync(out, data);
        process.stdout.write('Saved ' + out + ': ' + data.length + ' bytes\n');
        resolve(data);
      } else {
        process.stdout.write('Failed ' + file + ': HTTP ' + res.statusCode + '\n');
        reject(new Error('HTTP ' + res.statusCode));
      }
    });
  }).on('error', err => {
    process.stdout.write('Error for ' + file + ': ' + err.message + '\n');
    reject(err);
  });
});

(async () => {
  try {
    await fetch('https://api.github.com/repos/agegr/pi-web/releases', 'releases.json');
    await fetch('https://raw.githubusercontent.com/agegr/pi-web/main/package.json', 'package.json');
    process.stdout.write('DONE\n');
  } catch (e) {
    process.stdout.write('FATAL: ' + e.message + '\n');
  }
})();