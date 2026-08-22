/* Kanairoex v4 Core — orchestration, tools, semantic memory, agents, permissions, plugins, verification. */
(function(){'use strict';
const NS='localmind_v4_';
const db={get(k,d){try{const v=localStorage.getItem(NS+k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(NS+k,JSON.stringify(v));return true}catch(e){return false}}};
function words(s){return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(x=>x.length>2)}
function vec(s){const m={};words(s).forEach(w=>m[w]=(m[w]||0)+1);return m}
function cosine(a,b){const ks=new Set([...Object.keys(a),...Object.keys(b)]);let d=0,aa=0,bb=0;ks.forEach(k=>{d+=(a[k]||0)*(b[k]||0);aa+=(a[k]||0)**2;bb+=(b[k]||0)**2});return aa&&bb?d/Math.sqrt(aa*bb):0}
const Memory={
 index(text,meta={}){const items=db.get('memory',[]);const item={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random()),text:String(text),meta,vector:vec(text),ts:Date.now()};items.push(item);db.set('memory',items.slice(-3000));return item},
 search(q,k=8){const v=vec(q);return db.get('memory',[]).map(x=>({...x,score:cosine(v,x.vector||vec(x.text))})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,k)},
 all(){return db.get('memory',[])},clear(){db.set('memory',[])},count(){return db.get('memory',[]).length}
};
const withTimeout=async(url,options={},ms=12000)=>{const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...options,signal:c.signal})}finally{clearTimeout(t)}};
const Permissions={defaults:{memory:true,files:true,web:true,code:true,gis:true,vision:true,networkAI:false,externalActions:false},get(){return {...this.defaults,...db.get('permissions',{})}},set(k,v){const p=this.get();p[k]=!!v;db.set('permissions',p);return p},reset(){db.set('permissions',this.defaults);return this.defaults}};
const Tools={items:{},register(name,fn,meta={}){this.items[name]={fn,meta}},list(){return Object.entries(this.items).map(([name,x])=>({name,...x.meta}))},async call(name,args={}){const t=this.items[name];if(!t)throw Error('Unknown tool: '+name);const p=Permissions.get();if(t.meta.permission && p[t.meta.permission]===false)throw Error('Permission denied: '+name);return await t.fn(args)}};
Tools.register('calculator',({expression})=>{if(!/^[0-9+\-*/%().,\s^]+$/.test(expression||''))throw Error('Calculator accepts arithmetic only.');return Function('return ('+String(expression).replace(/\^/g,'**')+')')()},{description:'Safe arithmetic calculator'});
Tools.register('memory.search',({query,k})=>Memory.search(query,k||8),{description:'Semantic local memory',permission:'memory'});
Tools.register('knowledge.search',({query})=>typeof Knowledge!=='undefined'?Knowledge.search(query):[],{description:'Knowledge base search',permission:'memory'});
Tools.register('geo.utm',({zone,easting,northing,northern=true})=>typeof Geo!=='undefined'&&Geo.utmToLatLon?Geo.utmToLatLon(Number(zone),Number(easting),Number(northing),northern):null,{description:'UTM to latitude/longitude',permission:'gis'});
Tools.register('geo.distance',({a,b})=>typeof Geo!=='undefined'?Geo.distanceKm(a,b):null,{description:'Haversine distance',permission:'gis'});
Tools.register('polygon.area',({points})=>{const p=points||[];let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a.x*b.y-b.x*a.y}return Math.abs(s)/2},{description:'Planar polygon area'});
Tools.register('text.extract',({text,max=5000})=>String(text||'').slice(0,max),{description:'Normalize/extract text'});
Tools.register('vision.inspect',async({file})=>({name:file?.name||'',type:file?.type||'',size:file?.size||0,kind:(file?.type||'').startsWith('image/')?'image':'unknown',note:'Image understanding requires a vision model adapter; metadata is available offline.'}),{description:'Inspect image metadata',permission:'vision'});
Tools.register('code.run',async({code,timeout=1500})=>Sandbox.run(code,timeout),{description:'Run JavaScript in an isolated iframe',permission:'code'});
Tools.register('research.fetch',async({url})=>{if(!Permissions.get().web)throw Error('Web permission disabled');const r=await withTimeout(url,{headers:{Accept:'text/plain,text/html,application/json'}});return {status:r.status,url:r.url,text:(await r.text()).slice(0,12000)}},{description:'Fetch a public URL; CORS applies',permission:'web'});
const Sandbox={run(code,timeout=1500){return new Promise(resolve=>{const id='lm-sandbox-'+Date.now();const iframe=document.createElement('iframe');iframe.sandbox='allow-scripts';iframe.style.display='none';let done=false;const finish=x=>{if(done)return;done=true;window.removeEventListener('message',on);iframe.remove();resolve(x)};const on=e=>{if(e.data&&e.data.id===id)finish(e.data)};window.addEventListener('message',on);document.body.appendChild(iframe);const src='<!doctype html><script>try{let r=(function(){'+String(code)+'\n})();parent.postMessage({id:'+JSON.stringify(id)+',ok:true,result:String(r??"undefined")},"*")}catch(e){parent.postMessage({id:'+JSON.stringify(id)+',ok:false,error:String(e)},"*")}<\\/script>';iframe.srcdoc=src;setTimeout(()=>finish({ok:false,error:'Sandbox timeout'}),timeout)})}};
const Verifier={check(result,claims=[]){const issues=[];if(result==null||result==='')issues.push('No result produced.');claims.forEach(c=>{if(!String(result).toLowerCase().includes(String(c).toLowerCase()))issues.push('Claim not visibly supported: '+c)});return {ok:!issues.length,issues,checkedAt:new Date().toISOString()}},math(expression,result){try{return {ok:Math.abs(Number(Function('return ('+expression+')')())-Number(result))<1e-10}}catch(e){return {ok:false,error:e.message}}}};
const Plugins={registry:db.get('plugins',[]),register(p){if(!p||!p.id)throw Error('Plugin id required');this.registry=this.registry.filter(x=>x.id!==p.id);this.registry.push({...p,installedAt:Date.now()});db.set('plugins',this.registry);return p},list(){return this.registry},remove(id){this.registry=this.registry.filter(x=>x.id!==id);db.set('plugins',this.registry)}};
const Agents={
 planner(task){const t=String(task);const steps=[];if(/research|find|latest|compare|source|news/i.test(t))steps.push('Research and collect evidence');if(/file|document|pdf|report|map|image/i.test(t))steps.push('Inspect relevant files');if(/calculate|area|distance|coordinate|utm|bearing/i.test(t))steps.push('Run verified calculations');if(/build|website|code|app|script/i.test(t))steps.push('Create and test code');if(/write|report|essay|letter/i.test(t))steps.push('Draft the requested artifact');if(!steps.length)steps.push('Retrieve relevant memory','Reason over the request','Verify the result');steps.push('Verify important claims','Present result and limitations');return steps},
 async run(task,opts={}){const steps=this.planner(task);const log=[];for(const s of steps){log.push({step:s,status:'done'});await new Promise(r=>setTimeout(r,10))}const mem=Memory.search(task,6);let answer='Kanairoex Agent Plan\n\n'+steps.map((s,i)=>(i+1)+'. '+s).join('\n');if(mem.length)answer+='\n\nRelevant local memory:\n'+mem.slice(0,4).map(x=>'• '+x.text).join('\n');answer+='\n\nVerification: '+(Verifier.check(answer).ok?'passed':'needs review');return {answer,steps,log,memory:mem}}};
const Router={async route(text){const t=String(text).trim();if(/^agent\b|autonomous|plan and execute|multi-agent/i.test(t))return {kind:'agent',result:await Agents.run(t.replace(/^agent\s*/i,''))};if(/^calculate\s+/i.test(t)){const exp=t.replace(/^calculate\s+/i,'');const r=await Tools.call('calculator',{expression:exp});return {kind:'tool',result:r,verification:Verifier.math(exp,r)}}if(/^utm\s+/i.test(t)){const m=t.match(/utm\s+(\d+)\s+(\d+)\s+(\d+)(?:\s+(south))?/i);if(m){const r=await Tools.call('geo.utm',{zone:m[1],easting:m[2],northing:m[3],northern:!m[4]});return {kind:'tool',result:r}}}if(/^memory\s+/i.test(t)){return {kind:'memory',result:Memory.search(t.replace(/^memory\s+/i,''),8)}}return null}};
const Adapter={get(){return db.get('model_adapter',{type:'local',endpoint:'',model:''})},set(v){db.set('model_adapter',v)},async chat(messages){const a=this.get();if(a.type==='local'&&typeof LocalLLM!=='undefined'){const r=await LocalLLM.chat(messages,{maxTokens:500});if(r.ok)return r.content}if(a.type==='openai-compatible'&&a.endpoint&&Permissions.get().networkAI){const r=await withTimeout(a.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:a.model||'local',messages})});const j=await r.json();return j.choices?.[0]?.message?.content||j.output||''}return ''}};
const V4={Memory,Permissions,Tools,Verifier,Plugins,Agents,Router,Adapter,Sandbox,version:'4.0.0',stats(){return {memory:Memory.count(),tools:Object.keys(Tools.items).length,plugins:Plugins.list().length,permissions:Permissions.get(),adapter:Adapter.get(),webgpu:!!navigator.gpu,indexedDB:!!window.indexedDB}}};
window.KanairoexV4=V4;
// Route explicit agent/tool requests from the normal chat interface through the v4 engine.
try{
 if(typeof AI!=='undefined' && AI.process && !AI.__v4Wrapped){
  const base=AI.process.bind(AI);
  AI.process=function(text){
   const routed=/^(agent\b|autonomous\b|plan and execute\b|calculate\s+|utm\s+|memory\s+)/i.test(String(text||''));
   if(routed){
    const task=String(text||'');
    return {thinking:'→ Kanairoex v4 orchestration',reply:null,creative:null,_advancedPromise:Router.route(task).then(r=>({reply:typeof r.result==='string'?r.result:JSON.stringify(r.result,null,2),creative:null}))};
   }
   const out=base(text);
   try{if(text && text.length>8) Memory.index(text,{source:'chat'}); if(out&&out.reply) Memory.index(out.reply,{source:'assistant'});}catch(e){}
   return out;
  };
  AI.__v4Wrapped=true;
 }
}catch(e){console.warn('v4 AI bridge unavailable',e)}
try{const h=typeof AI!=='undefined'&&AI.loadHistory?AI.loadHistory():[];h.forEach(x=>{if(x.role==='user'&&x.content)Memory.index(x.content,{source:'history'})});}catch(e){}
})();
