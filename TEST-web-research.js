const fs=require('fs'),vm=require('vm'),assert=require('assert');
function load(file,ctx){vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});}
const store=new Map();
const ctx={console,Date,Math,JSON,String,Number,Object,Array,RegExp,Promise,Error,encodeURIComponent,decodeURIComponent,setTimeout,clearTimeout,URL,localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},navigator:{onLine:true},window:{},AbortController};
ctx.window=ctx;
ctx.fetch=async function(url){
  url=String(url);
  const body=url.includes('invidious') ? JSON.stringify([{type:'video',videoId:'abc123',title:'Jesus documentary',author:'Test Channel',lengthSeconds:120,videoThumbnails:[{quality:'high',url:'https://img.test/abc.jpg'}]}]) :
    url.includes('/search?q=') && url.includes('filter=videos') ? JSON.stringify([{type:'stream',videoId:'abc123',title:'Jesus documentary',uploaderName:'Test Channel',duration:120,thumbnail:'https://img.test/abc.jpg'}]) :
    url.includes('page/summary/') ? JSON.stringify({title:'Jesus',extract:'Jesus is a central figure in Christianity.',description:'religious figure',content_urls:{desktop:{page:'https://en.wikipedia.org/wiki/Jesus'}}}) :
    url.includes('w/api.php') && url.includes('list=search') ? JSON.stringify({query:{search:[{title:'Christianity',snippet:'Christianity is a religion.'}]}}) :
    url.includes('w/api.php') && url.includes('prop=extracts') ? JSON.stringify({query:{pages:{'1':{title:'Jesus',extract:'Full article text about Jesus. '.repeat(100)}}}}) :
    url.includes('wikidata') ? JSON.stringify({search:[{id:'Q302',label:'Jesus',description:'central figure of Christianity'}]}) :
    JSON.stringify({Heading:'Jesus',AbstractText:'Web overview about Jesus.',RelatedTopics:[]});
  return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>JSON.parse(body),text:async()=>body};
};
vm.createContext(ctx);
load('online.js',ctx); load('video-research.js',ctx); load('research-manager.js',ctx);
(async()=>{
  assert.strictEqual(ctx.VideoResearch.isIntent('search videos about Jesus').query,'Jesus');
  const vr=await ctx.VideoResearch.search('Jesus',5); assert(vr.videos.length>=1); assert(vr.videos[0].id==='abc123');
  ctx.Online.storeInMemory=()=>{};
  const rr=await ctx.ResearchManager.research('Jesus'); assert(rr.complete); assert(rr.content.length>100); assert(rr.chunks.length>=1); assert(rr.sources.length>=1);
  assert.strictEqual(ctx.Online.detectIntent('look up Jesus').query,'Jesus');
  console.log('PASS: web research + video integration tests');
})().catch(e=>{console.error(e);process.exit(1)});
