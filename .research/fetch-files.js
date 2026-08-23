const https = require('https');
const fs = require('fs');
const path = require('path');

const out = 'C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\upstream-v089';

// Files to fetch from upstream v0.8.9 (only those relevant to fork architecture)
const files = [
  // bin scripts
  'bin/pi-web.js',
  'bin/process-lifecycle.js',
  // lib (architecture-relevant)
  'lib/agent-event-wire.ts',
  'lib/agent-event-wire.test.mjs',
  'lib/http-dispatcher.ts',
  'lib/http-dispatcher.test.mjs',
  'lib/normalize.ts',
  'lib/normalize.test.mjs',
  'lib/pi-types.ts',
  'lib/model-scope.ts',
  'lib/model-scope.test.mjs',
  'lib/tool-execution-progress.ts',
  'lib/tool-execution-progress.test.mjs',
  'lib/project-identity.ts',
  'lib/project-identity.test.mjs',
  'lib/project-groups.ts',
  'lib/project-groups.test.mjs',
  'lib/project-command-env.ts',
  'lib/project-command-env.test.mjs',
  'lib/process-lifecycle.test.mjs',
  'lib/streaming-message.ts',
  'lib/streaming-message.test.mjs',
  'lib/session-reader.ts',
  'lib/workspace-memory.ts',
  'lib/workspace-memory.test.mjs',
  'lib/rpc-manager.ts',
  'lib/rpc-manager-shutdown.test.mjs',
  'lib/types.ts',
  // components
  'components/AppShell.tsx',
  'components/ChatWindow.tsx',
  'components/ChatWindow.notices.test.mjs',
  'components/MessageView.tsx',
  'components/MessageView.test.mjs',
  'components/ModelsConfig.tsx',
  'components/ModelsConfig.test.mjs',
  'components/SessionSidebar.tsx',
  'components/SessionSidebar.project-identity.test.mjs',
  'components/FileViewer.state.test.mjs',
  // hooks
  'hooks/useAgentSession.ts',
  'hooks/useAgentSession.test.mjs',
  // i18n
  'lib/i18n/messages/en.ts',
  'lib/i18n/messages/zh-CN.ts',
  // docs
  'docs/adr/0001-isolate-project-command-environments.md',
  'CONTEXT.md',
  // css
  'app/globals.css',
  // package.json
  'package.json',
];

fs.mkdirSync(out, { recursive: true });

const fetch = (url, dest) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers: { 'User-Agent': 'Node-Script' } }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        fs.writeFileSync(dest, data);
        console.log('OK ' + dest);
        resolve();
      } else if (res.statusCode === 404) {
        console.log('SKIP (404) ' + dest);
        resolve();
      } else {
        console.log('ERR ' + res.statusCode + ' ' + dest);
        reject(new Error('HTTP ' + res.statusCode));
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
    for (let i = 0; i < 3; i++) {
      try { await fetch(url, dest); break; }
      catch (e) {
        if (i < 2) { await new Promise(r => setTimeout(r, 1500)); }
        else console.log('Gave up ' + f + ': ' + e.message);
      }
    }
  }
  console.log('DONE');
})();
