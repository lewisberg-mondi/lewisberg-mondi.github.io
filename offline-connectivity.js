/* Offline connectivity capability registry. Uses standards exposed by the browser; no server is bundled. */
(function(){'use strict';
const caps={serviceWorker:'serviceWorker' in navigator,indexedDB:'indexedDB' in window,cache:'caches' in window,webRTC:'RTCPeerConnection' in window,webBluetooth:'bluetooth' in navigator,webSerial:'serial' in navigator,webUSB:'usb' in navigator,webNFC:'NDEFReader' in window,webGPU:'gpu' in navigator,webNN:'ml' in navigator,opfs:'storage' in navigator&&'getDirectory' in navigator.storage,workers:'Worker' in window,wasm:'WebAssembly' in window,clipboard:'clipboard' in navigator,geolocation:'geolocation' in navigator,filesystem:'showDirectoryPicker' in window};
async function storageEstimate(){return navigator.storage?.estimate?await navigator.storage.estimate():{};}
async function persist(){return navigator.storage?.persist?navigator.storage.persist():false;}
async function connectPeer(){if(!caps.webRTC)throw Error('WebRTC unavailable');return new RTCPeerConnection();}
async function requestBluetooth(){if(!caps.webBluetooth)throw Error('Web Bluetooth unavailable');return navigator.bluetooth.requestDevice({acceptAllDevices:true});}
async function requestSerial(){if(!caps.webSerial)throw Error('Web Serial unavailable');return navigator.serial.requestPort();}
async function requestUSB(){if(!caps.webUSB)throw Error('WebUSB unavailable');return navigator.usb.requestDevice({filters:[]});}
window.KanairoexConnectivity={caps,storageEstimate,persist,connectPeer,requestBluetooth,requestSerial,requestUSB};
})();
