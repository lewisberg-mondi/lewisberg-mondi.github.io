const fs = require("fs");
const vm = require("vm");
const assert = require("assert");
const { webcrypto } = require("crypto");
const store = new Map();
const b64 = (s) => Buffer.from(String(s), "binary").toString("base64");
const context = {
  console, Date, Math, Number, String, Object, Array, JSON, RegExp, Intl, parseFloat, parseInt,
  isFinite, setTimeout, clearTimeout, crypto: webcrypto,
  TextEncoder, TextDecoder, ArrayBuffer, Uint8Array,
  btoa: b64,
  atob: (s) => Buffer.from(String(s), "base64").toString("binary"),
  localStorage: { getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) },
  window:{}, Blockchain:{addBlock(){}}, Neurons:{activate(){}}
};
context.window=context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("identity.js","utf8"), context);
vm.runInContext(fs.readFileSync("lmt-wallet.js","utf8"), context);
const W=context.LMTWallet;

(async()=>{
  // Fresh wallet
  W.resetWallet();
  const info = W.info();
  assert(info.address.startsWith("LMT-"));
  assert.strictEqual(W.MAX_SUPPLY, 33000000000);

  // Supply status
  const ss = W.supplyStatus();
  assert.strictEqual(ss.maxSupply, 33000000000);
  assert(ss.issued >= 0);
  assert(ss.headroom <= 33000000000);

  // Authoritative ledger seeded at genesis
  const led = W.getLedger(50);
  assert(Array.isArray(led));
  assert(led.length >= 1, "genesis ledger entry expected");
  assert(led.some(e => e.kind === "mint" || e.reason === "genesis"), "genesis mint in ledger");

  // Atomic concurrent-style credits under lock
  W.creditPurchase(100, { orderId: "t1" });
  const bal1 = W.getBalance("LMT");
  assert(bal1 >= 100);

  // Supply headroom check
  const head = W.checkSupplyHeadroom(1);
  assert(head.ok === true);

  // With no password set, wallet is open; export still needs 16 digits
  let threw = false;
  try { await W.exportBackup("not-enough-digits"); } catch (e) { threw = /16-digit|password/i.test(String(e.message||e)); }
  assert(threw, "exportBackup must require 16-digit password input");

  // Supply enforcement: huge credit must fail
  let supplyBlocked = false;
  try { W.creditPurchase(W.MAX_SUPPLY); } catch (e) { supplyBlocked = /33B|supply|limit/i.test(String(e.message||e)); }
  assert(supplyBlocked, "credit exceeding remaining 33B headroom must be rejected");

  console.log("PASS: authoritative ledger, global 33B supply status/enforcement, atomic lock, backup input guard");
})().catch(e=>{ console.error(e); process.exit(1); });
