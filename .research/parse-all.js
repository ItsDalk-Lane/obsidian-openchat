const fs = require('fs');
const releases = JSON.parse(fs.readFileSync('C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\releases.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\package.json', 'utf8'));
const cmp = JSON.parse(fs.readFileSync('C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\compare-0.8.8-0.8.9.json', 'utf8'));

// --- 0.8.9 release body ---
const v089 = releases.find(r => r.tag_name === 'v0.8.9');
console.log('=== 0.8.9 RELEASE BODY (FULL) ===');
console.log(v089.body);

// --- Comparison summary ---
console.log('=== COMPARE ===');
console.log('Status:', cmp.status);
console.log('Ahead by:', cmp.ahead_by);
console.log('Behind by:', cmp.behind_by);
console.log('Total commits:', cmp.total_commits);
console.log('Base:', cmp.base_commit_sha);
console.log('Merge base:', cmp.merge_base_commit);
console.log('Head SHA:', cmp.head_sha);
console.log('Files changed:', cmp.files ? cmp.files.length : 'n/a');
console.log('Commits:');
if (cmp.commits) {
  cmp.commits.forEach(c => {
    console.log('-', c.sha.substring(0,7), '|', c.commit.author.date, '|', c.commit.message.split('\n')[0]);
  });
}

// --- package.json key fields ---
console.log('=== PACKAGE.JSON ===');
console.log('name:', pkg.name);
console.log('version:', pkg.version);
console.log('description:', pkg.description);
console.log('main:', pkg.main);
console.log('repository:', pkg.repository && pkg.repository.url);
console.log('homepage:', pkg.homepage);
console.log('author:', pkg.author);
console.log('license:', pkg.license);
console.log('engines:', JSON.stringify(pkg.engines));
console.log('Dependencies:');
Object.entries(pkg.dependencies || {}).forEach(([k,v]) => console.log('  ', k, v));
console.log('DevDependencies:');
Object.entries(pkg.devDependencies || {}).forEach(([k,v]) => console.log('  ', k, v));