const https = require('https');
const fs = require('fs');

const url = 'https://api.github.com/repos/agegr/pi-web/compare/2a6e537...HEAD';
const req = https.get(url, { headers: { 'User-Agent': 'Node-Script', 'Accept': 'application/vnd.github.v3+json' } }, (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log('status=' + res.statusCode + ' len=' + data.length);
    fs.writeFileSync('C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\compare-from-089-to-head.json', data);
    if (res.statusCode === 200) {
      try {
        const j = JSON.parse(data);
        console.log('commits ahead:', j.total_commits);
        console.log('files changed:', (j.files||[]).length);
      } catch {}
    }
  });
});
req.on('error', e => console.log('err ' + e.message));
req.setTimeout(60000, () => req.destroy(new Error('timeout')));
