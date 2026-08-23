const fs=require('fs');
const path=require('path');
const assert=require('assert');

function walk(dir){let out=[]; for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.name==='node_modules'||e.name.startsWith('.')) continue; const p=path.join(dir,e.name); if(e.isDirectory()) out=out.concat(walk(p)); else out.push(p);} return out;}
const files=walk('.');
const js=files.filter(f=>f.endsWith('.js'));
for(const f of js){
  const cp=require('child_process').spawnSync(process.execPath,['--check',f],{encoding:'utf8'});
  assert.strictEqual(cp.status,0,`Syntax error in ${f}: ${cp.stderr}`);
}

const html=fs.readFileSync('index.html','utf8');
const refs=[...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/g)].map(m=>m[1]);
for(const ref of refs) assert(fs.existsSync(ref),`Missing script referenced by index.html: ${ref}`);

const wallet=fs.readFileSync('lmt-wallet.js','utf8');
assert(wallet.includes('const CREATE_FEE_LMT = 10000'));
assert(!wallet.includes('Need 10000 💎 LMT to create a token') || wallet.includes('CREATE_FEE_LMT'));
assert(wallet.includes('function receiveAsync'));
assert(wallet.includes('Identity.attachProof'));
assert(wallet.includes('function tokenCreationQuote'));
assert(wallet.includes('if (sym === "LMT") return EMOJI;'));

const adv=fs.readFileSync('index.js','utf8');
assert(!/Create fee \*\*?1000/.test(adv),'stale 1000 LMT creation-fee text remains');
assert(!/1000 LMT|1,000 LMT/.test(adv),'stale 1000 LMT creation-fee text remains');

const reasoning=fs.readFileSync('reasoning.js','utf8');
assert(!reasoning.includes('Mission Control has been removed'));
assert(reasoning.includes('Mission Control / Space'));

const space=fs.readFileSync('space-comms.js','utf8');
assert(!space.includes('Mission Control removed — do not claim those commands'));
assert(space.includes('renderMissionControlText'));

console.log(`PASS: system static audit — ${js.length} JavaScript files syntax-checked, ${refs.length} HTML script references verified, economy/security/Mission-Control consistency checks passed.`);
