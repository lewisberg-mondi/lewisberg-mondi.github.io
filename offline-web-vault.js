/* Kanairoex Offline Web Vault v6
 * Online research cache with IndexedDB + Cache API. Browser CORS limits still apply.
 */
(function(){'use strict';
const DB='localmind_web_vault_v1', STORE='pages';
function open(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:'id'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
async function put(page){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(page);tx.oncomplete=()=>res(page);tx.onerror=()=>rej(tx.error);});}
async function get(id){const db=await open();return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error);});}
async function all(){const db=await open();return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>res(r.result||[]);r.onerror=()=>rej(r.error);});}
async function remove(id){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
async function save(url,title,content,meta={}){const id=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(url)).then(b=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''));return put({id,url,title:title||url,content:String(content||''),savedAt:new Date().toISOString(),meta});}
async function fetchAndSave(url,opts={}){const r=await fetch(url,{mode:'cors',credentials:'omit',...opts});if(!r.ok)throw Error('HTTP '+r.status);const text=await r.text();const title=(text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||url;await save(url,title,text,{contentType:r.headers.get('content-type')||''});return {url,title,content:text,saved:true};}
async function searchAndSave(query){if(window.Online&&Online.learnTopic){const d=await Online.learnTopic(query);await save(d.url||('topic:'+query),d.title||query,d.content||d.extract||d.summary||'',{sources:d.sources||[]});return d;}throw Error('Online search adapter unavailable');}
window.KanairoexWebVault={save,get,all,remove,fetchAndSave,searchAndSave,count:async()=> (await all()).length};
})();
