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
vm.runInContext(fs.readFileSync("advanced/lmt-wallet.js","utf8"), context);
const W=context.LMTWallet;
const Identity=context.Identity;

(async()=>{
  assert.strictEqual(W.SYMBOL,"LMT");
  assert.strictEqual(W.EMOJI,"💎");
  assert.strictEqual(W.displaySymbol("LMT"),"💎");
  assert.strictEqual(W.format(1234.5,"LMT"),"1,234.5 💎 LMT");

  for (const e of ["🚀","🔥","⭐","🌟","🪙","🏳️‍🌈","👨‍💻","1️⃣","🇰🇪"]) assert(W.isEmojiSymbol(e),`valid emoji rejected: ${e}`);
  for (const e of ["Cafe","Café","€","$","™","abc","🚀x","🚀 🔥"]) assert(!W.isEmojiSymbol(e),`invalid emoji accepted: ${e}`);
  assert.strictEqual(W.extractEmojiFromText("MYT MyToken 1000000 0.01 🚀"),"🚀");
  assert.strictEqual(W.extractEmojiFromText("MYT Café 1000000 0.01"),"");
  assert.strictEqual(W.extractEmojiFromText("MYT Name 1000000 0.01 🚀 🔥"),"🔥");

  // Verify insufficient-funds creation is atomic.
  W.resetWallet();
  W.creditPurchase(5000,{orderId:"test-insufficient"});
  const beforeFailedCreate=W.getBalance("LMT");
  assert.throws(()=>W.createToken("BAD","Bad",1000000,100,"🔥"),/Need .* LMT to create/);
  assert.strictEqual(W.getBalance("LMT"),beforeFailedCreate,"failed token creation must be atomic");

  // Fund enough for the real token + liquidity regression tests.
  W.creditPurchase(1000000,{orderId:"test-funding"});
  const quote=W.tokenCreationQuote("MYT",1000000,0.01);
  assert(quote.totalRequiredLmt >= quote.creationFeeLmt);
  assert(quote.poolToken > quote.creatorShare);

  const created=W.createToken("MYT","My Token",1000000,0.01,"🚀");
  assert.strictEqual(created.emoji,"🚀");
  assert.strictEqual(W.getTokenMeta("MYT").emoji,"🚀");
  assert(created.creatorShare>0&&created.availableInPool>0);
  assert.strictEqual(created.totalRequiredLmt, quote.totalRequiredLmt);

  assert.throws(()=>W.createToken("BAD2","Bad",100,0.01,"💎"),/reserved/);
  assert.throws(()=>W.createToken("BAD3","Bad",Infinity,0.01,"🔥"),/Invalid supply/);
  assert.throws(()=>W.createToken("BAD4","Bad",100,-1,"🔥"),/Invalid starting USD price/);
  assert.throws(()=>W.createToken("BAD5","Bad",100,0.01,"🚀"),/already used/);

  const unsigned=W.createTransfer(1,"LMT-OTHER1","test","MYT");
  assert.strictEqual((await W.receiveAsync(unsigned)).ok,false,"unsigned P2P transfer must be rejected");

  const txBase=W.createTransfer(1,"LMT-OTHER1","signed test","MYT");
  await Identity.ensure();
  const signed=await Identity.attachProof(txBase);
  assert((await Identity.verifyObject(signed)).ok,"signed transaction must verify");
  const walletState=JSON.parse(store.get("localmind_lmt_wallet_v2"));
  walletState.address="LMT-OTHER1";
  store.set("localmind_lmt_wallet_v2",JSON.stringify(walletState));
  assert.strictEqual((await W.receiveAsync(signed)).ok,true,"valid signed transfer should be accepted");

  const beforeLpLmt=W.getAssetBalance("LMT");
  const beforeLpToken=W.getAssetBalance("MYT");
  const market=W.tokenStats("MYT");
  const addLmt=100;
  const addToken=addLmt*market.poolToken/market.poolLmt;
  const added=W.addLiquidity(addLmt,"MYT",addToken);
  assert(added.lpShares>0);
  assert.strictEqual(W.getAssetBalance("LMT"),beforeLpLmt-addLmt);
  assert.strictEqual(W.getAssetBalance("MYT"),beforeLpToken-addToken);
  assert(W.getLpBalance("MYT")>=added.lpShares);
  const lpStats=W.tokenStats("MYT");
  assert(lpStats.lpSupply>added.lpShares);
  const removed=W.removeLiquidity("MYT",added.lpShares/2);
  assert(removed.amountLmt>0&&removed.amountToken>0);
  assert(W.getLpBalance("MYT")>0);
  assert(W.tokenStats("MYT").poolLmt>0&&W.tokenStats("MYT").poolToken>0);

  const swapBefore=W.getAssetBalance("LMT");
  const swapped=W.swap(10,"LMT","MYT");
  assert(swapped.amountOut>0);
  assert.strictEqual(W.getAssetBalance("LMT"),swapBefore-10);
  assert(W.getAssetBalance("MYT")>0);

  console.log("PASS: wallet display, emoji validation, atomic token creation, creation economics, signed P2P verification, liquidity add/remove, and swap regression suite");
})().catch(e=>{ console.error(e); process.exit(1); });
