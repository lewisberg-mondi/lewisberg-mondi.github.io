let pc = new RTCPeerConnection({iceServers: [{urls: "stun:stun.l.google.com:19302"}]});
const peers = new Map();

pc.ondatachannel = e => {
  const chan = e.channel;
  chan.onmessage = async m => {
    const dec = await decrypt(m.data, chan.label);
    showMessage(dec, "friend");
  };
  peers.set(chan.label, chan);
};

async function connectTo(pubHex) {
  const chan = pc.createDataChannel(pubHex);
  chan.onopen = () => console.log("WebRTC LIVE");
  chan.onmessage = async m => {
    const dec = await decrypt(m.data, pubHex);
    showMessage(dec, "friend");
  };
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  // In real app you’d copy this SDP to clipboard or QR
  prompt("Copy this SDP and send to friend:", offer.sdp);
  peers.set(pubHex, chan);
}

navigator.clipboard?.writeText && setInterval(() => {
  navigator.clipboard.readText().then(txt => {
    if (txt.startsWith("sdp:")) {
      pc.setRemoteDescription({type:"answer", sdp: txt.slice(4)});
    }
  });
}, 3000);