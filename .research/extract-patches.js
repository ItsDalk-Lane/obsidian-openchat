const fs = require('fs');
const c = JSON.parse(fs.readFileSync('C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\compare-088-089-full.json', 'utf8'));

const targets = process.argv.slice(2);
const picked = targets.length
  ? c.files.filter(f => targets.some(t => f.filename === t || f.filename.endsWith('/' + t)))
  : c.files;

picked.forEach(f => {
  console.log('=== ' + f.filename + ' (' + f.status + ') ===');
  console.log(f.patch || '(no patch)');
  console.log('');
});
