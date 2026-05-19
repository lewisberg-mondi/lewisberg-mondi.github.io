// Phonechain E2EE – 100% in-browser
const keys = { pub: null, priv: null };
let session = {}; // {peerId: {key, counter}}

async function initE2EE() {
  const keypair = await crypto.subtle.generateKey(
    {name: "ECDH", namedCurve: "X25519"}, true, ["deriveKey"]
  );
  keys.priv = keypair.privateKey;
  keys.pub = await crypto.subtle.exportKey("raw", keypair.publicKey);
  document.getElementById('myPub').textContent = buf2hex(keys.pub);
}

async function deriveShared(peerPubHex) {
  const peerPub = await crypto.subtle.importKey(
    "raw", hex2buf(peerPubHex), {name: "ECDH", namedCurve: "X25519"}, false, []
  );
  const shared = await crypto.subtle.deriveKey(
    {name: "ECDH", public: peerPub}, keys.priv,
    {name: "AES-GCM", length: 256}, true, ["encrypt", "decrypt"]
  );
  return shared;
}

async function encrypt(msg, peerPubHex) {
  let s = session[peerPubHex];
  if (!s || s.counter > 50) {
    s = { key: await deriveShared(peerPubHex), counter: 0 };
    session[peerPubHex] = s;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(msg);
  const ct = await crypto.subtle.encrypt(
    {name: "AES-GCM", iv}, s.key, data
  );
  s.counter++;
  return JSON.stringify({iv: buf2hex(iv), ct: buf2hex(new Uint8Array(ct))});
}

async function decrypt(payload, peerPubHex) {
  const {iv, ct} = JSON.parse(payload);
  const s = session[peerPubHex];
  if (!s) return "[decryption failed]";
  const data = await crypto.subtle.decrypt(
    {name: "AES-GCM", iv: hex2buf(iv)}, s.key, hex2buf(ct)
  );
  return new TextDecoder().decode(data);
}

// utils
function buf2hex(buffer) { return [...new Uint8Array(buffer)]
  .map(x => x.toString(16).padStart(2, '0')).join(''); }
function hex2buf(hex) { return Uint8Array.from(hex.match(/.{2}/g)
  .map(b => parseInt(b, 16))); }