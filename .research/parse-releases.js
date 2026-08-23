const fs = require('fs');
const releases = JSON.parse(fs.readFileSync('C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\releases.json', 'utf8'));
const pkg = JSON.parse(fs.readFileSync('C:\\Users\\Its_D\\Desktop\\Project\\Code\\pi-Desktop\\.research\\package.json', 'utf8'));

console.log('Total releases:', releases.length);
console.log('---');
console.log('Package version:', pkg.version);
console.log('Package name:', pkg.name);
console.log('---');

// List all releases
releases.forEach((r, i) => {
  console.log(`${i}: ${r.tag_name} | ${r.published_at} | ${r.name}`);
});

console.log('---LATEST---');
const latest = releases[0];
console.log('Latest tag:', latest.tag_name);
console.log('Latest name:', latest.name);
console.log('Latest published:', latest.published_at);
console.log('Latest body length:', latest.body.length);
console.log('Latest body (first 500):', latest.body.substring(0, 500));

// Find 0.89
console.log('---0.89---');
const v089 = releases.find(r => r.tag_name === 'v0.8.9' || r.tag_name === 'v0.89' || r.tag_name === '0.8.9' || r.tag_name === '0.89');
if (v089) {
  console.log('Found:', v089.tag_name);
  console.log('Published:', v089.published_at);
  console.log('Name:', v089.name);
  console.log('Body length:', v089.body.length);
}

// Find prior to latest
console.log('---PRIOR---');
if (releases.length > 1) {
  const prior = releases[1];
  console.log('Prior tag:', prior.tag_name);
  console.log('Prior published:', prior.published_at);
  console.log('Prior name:', prior.name);
}

// Find prior to 0.89
console.log('---PRIOR TO 0.89---');
const idx089 = releases.findIndex(r => r.tag_name === 'v0.8.9' || r.tag_name === 'v0.89');
if (idx089 >= 0 && idx089 + 1 < releases.length) {
  const prior089 = releases[idx089 + 1];
  console.log('Prior to 0.89 tag:', prior089.tag_name);
  console.log('Prior to 0.89 published:', prior089.published_at);
  console.log('Prior to 0.89 name:', prior089.name);
}