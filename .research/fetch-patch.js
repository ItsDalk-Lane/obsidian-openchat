const https = require('https');
const fs = require('fs');

const url = 'https://api.github.com/repos/agegr/pi-web/compare/v0.8.8...v0.8.9';
const req = https.get(url, { headers: { 'User-Agent': 'Node-Script', 'Accept': 'application/vnd.github.v3+json' } }, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('status=' + res.statusCode + ' len=' + data.length);
    fs.writeFileSync('C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\compare-088-089-full.json', data);
  });
});
req.on('error', e => console.log('err ' + e.message));
req.setTimeout(60000, () => req.destroy(new Error('timeout')));
