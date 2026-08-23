const fs = require('fs');
const cmp = JSON.parse(fs.readFileSync('C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\compare-0.8.8-0.8.9.json', 'utf8'));

// Group files by status
const files = cmp.files || [];
console.log('Total files changed:', files.length);
console.log('---');

// Aggregate by status
const byStatus = {};
let totalAdd = 0, totalDel = 0;
files.forEach(f => {
  byStatus[f.status] = (byStatus[f.status] || 0) + 1;
  totalAdd += f.additions || 0;
  totalDel += f.deletions || 0;
});
console.log('By status:', byStatus);
console.log('Total additions:', totalAdd);
console.log('Total deletions:', totalDel);
console.log('---');

// List files
files.forEach(f => {
  console.log(`[${f.status}] +${f.additions}/-${f.deletions} ${f.filename}`);
});