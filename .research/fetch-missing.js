const https = require('https');
const fs = require('fs');
const path = require('path');

const out = 'C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\upstream-v089';

const files = [
  'lib/agent-event-wire.ts',
  'lib/normalize.ts',
  'lib/pi-types.ts',
  'lib/types.ts',
  'lib/rpc-manager.ts',
  'lib/session-reader.ts',
  'lib/workspace-memory.ts',
  'components/AppShell.tsx',
  'components/ChatWindow.tsx',
  'components/MessageView.tsx',
  'components/ModelsConfig.tsx',
  'components/SessionSidebar.tsx',
  'hooks/useAgentSession.ts',
  'bin/pi-web.js',
  'bin/process-lifecycle.js',
  'lib/i18n/messages/en.ts',
  'lib/i18n/messages/zh-CN.ts',
  'docs/adr/0001-isolate-project-command-environments.md',
  'app/globals.css',
];

const fetch = (url, dest) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers: { 'User-Agent': 'Node-Script' } }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      if (res.statusCode === 200) {
        fs.writeFileSync(dest, data);
        console.log('OK ' + dest);
        resolve();
      } else {
        console.log('skip ' + res.statusCode + ' ' + dest);
        resolve();
      }
    });
  });
  req.on('error', reject);
  req.setTimeout(45000, () => req.destroy(new Error('timeout')));
});

(async () => {
  for (const f of files) {
    const dest = path.join(out, f.replace(/\//g, path.sep));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const url = `https://raw.githubusercontent.com/agegr/pi-web/v0.8.9/${f}`;
    let ok = false;
    for (let i = 0; i < 3; i++) {
      try { await fetch(url, dest); if (fs.existsSync(dest) && fs.statSync(dest).size > 100) { ok = true; break; } }
      catch (e) { await new Promise(r => setTimeout(r, 1500)); }
    }
    if (!ok) console.log('GAVE UP ' + f);
  }
  console.log('DONE');
})();
