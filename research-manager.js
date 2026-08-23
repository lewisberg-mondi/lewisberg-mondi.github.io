/* LocalMind Research Manager: long-form, incremental, resumable research. */
const ResearchManager = (() => {
  const MAX_SOURCES=8, MAX_CHARS=120000, CHUNK=12000;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function research(topic,onProgress){
    const q=String(topic||'').trim(); if(!q) throw Error('Research topic is empty.');
    const progress=typeof onProgress==='function'?onProgress:()=>{};
    const report={title:q,sections:[],sources:[],chunks:[],chars:0,researchedAt:new Date().toISOString(),complete:false};
    progress({stage:'start',message:'Starting deep research: '+q});
    const main=await Online.fetchTopicFull(q);
    report.title=main.title||q;
    const mainText=main.content||main.extract||'';
    report.sections.push({title:main.title||q,content:mainText,source:'Wikipedia'});
    report.sources.push(...(main.sources||[]));
    progress({stage:'source',index:1,total:MAX_SOURCES,title:main.title||q,chars:mainText.length});
    let hits=[]; try{hits=await Online.searchRelatedTopics(q);}catch(_){hits=[];}
    const seen=new Set([String(main.title||'').toLowerCase()]);
    const candidates=hits.filter(h=>h&&h.title&&!seen.has(h.title.toLowerCase())).slice(0,MAX_SOURCES-1);
    for(let i=0;i<candidates.length&&report.chars<MAX_CHARS;i++){
      const h=candidates[i];
      try{
        progress({stage:'source',index:i+2,total:candidates.length+1,title:h.title,chars:report.chars});
        const d=await Online.fetchTopicFull(h.title); const text=d.content||d.extract||'';
        if(text){report.sections.push({title:d.title||h.title,content:text,source:'Wikipedia'});report.sources.push(...(d.sources||[]));report.chars+=text.length;}
      }catch(e){progress({stage:'warning',title:h.title,message:'Skipped source: '+(e.message||e)});}
      await sleep(60);
    }
    const sm=new Map(); report.sources.forEach(s=>{if(s&&s.url)sm.set(s.url,s);}); report.sources=[...sm.values()];
    const ss=new Map(); report.sections.forEach(s=>{const k=String(s.title).toLowerCase();if(!ss.has(k))ss.set(k,s);}); report.sections=[...ss.values()];
    let content='# '+report.title+'\n\n'+report.sections.map(s=>'## '+s.title+'\n\n'+s.content).join('\n\n---\n\n');
    content=content.slice(0,MAX_CHARS); report.content=content; report.extract=content.slice(0,8000); report.chars=content.length;
    for(let i=0;i<content.length;i+=CHUNK) report.chunks.push({index:report.chunks.length+1,text:content.slice(i,i+CHUNK)});
    report.complete=true; progress({stage:'complete',message:'Research complete',sections:report.sections.length,chunks:report.chunks.length,chars:report.chars});
    return report;
  }
  return {research};
})();
if(typeof window!=='undefined') window.ResearchManager=ResearchManager;
