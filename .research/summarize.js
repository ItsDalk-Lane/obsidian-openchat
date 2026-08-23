const fs = require('fs');
const path = require('path');
const dir = 'C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research';

const read = (n) => JSON.parse(fs.readFileSync(path.join(dir, n), 'utf8'));

// 088 -> 089 diff
const c089 = read('compare-088-089.json');
const files089 = (c089.files || []).map(f => f.filename);
fs.writeFileSync(path.join(dir, 'changed-files-088-089.txt'), files089.join('\n'));

// 081 -> 089 diff (everything since our sync base)
const c081 = read('compare-081-089.json');
const files081 = (c081.files || []).map(f => f.filename);
fs.writeFileSync(path.join(dir, 'changed-files-081-089.txt'), files081.join('\n'));

// Count commits
console.log('Commits 0.8.8..0.8.9:', c089.commits ? c089.commits.length : 0);
console.log('Commits 0.8.1..0.8.9:', c081.commits ? c081.commits.length : 0);

// Files changed 088..089 with stat
console.log('\nFiles changed 0.8.8..0.8.9:');
c089.files.forEach(f => console.log(`  ${f.status}  +${f.additions}/-${f.deletions}  ${f.filename}`));

console.log('\nTotal files changed 0.8.1..0.8.9:', c081.files.length);
const extStats = {};
c081.files.forEach(f => {
  const ext = path.extname(f.filename) || '(no ext)';
  extStats[ext] = (extStats[ext] || 0) + 1;
});
console.log('Extension distribution:');
Object.entries(extStats).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));
