/* Run every deterministic Kanairoex regression suite with: node RUN-ALL-TESTS.js */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = __dirname;
const files = [];
for (const dir of ['tests']) {
  const p = path.join(root, dir);
  for (const f of fs.readdirSync(p).filter(x => x.endsWith('.test.js')).sort()) files.push(path.join(p, f));
}
for (const f of fs.readdirSync(root).filter(x => /^TEST-.*\.js$/i.test(x)).sort()) files.push(path.join(root, f));
let passed = 0;
for (const f of files) {
  console.log('\n=== ' + path.relative(root, f) + ' ===');
  const r = spawnSync(process.execPath, [f], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status || 1);
  passed++;
}
console.log('\nPASS: ' + passed + ' test suites completed successfully.');
