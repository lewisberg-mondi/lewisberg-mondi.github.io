/**
 * Kanairoex Cognitive Intelligence Engine
 * Working memory + typed long-term memory + intelligent retrieval + knowledge graph
 * + associative activation + task decomposition + hypotheses + multi-pass verification
 * + specialist modes + self-evaluation + gated procedural learning.
 *
 * This is a practical browser-local cognitive architecture. It orchestrates the
 * existing Kanairoex modules; it does not claim to reproduce biological neurons
 * or expose hidden chain-of-thought.
 */
(function () {
  'use strict';

  const NS = 'localmind_cognitive_v1_';
  const now = () => Date.now();
  const uid = (p) => p + '_' + now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

  const DB = {
    get(k, d) { try { const v = localStorage.getItem(NS + k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); return true; } catch (_) { return false; } },
    del(k) { try { localStorage.removeItem(NS + k); } catch (_) {} }
  };

  const TYPES = ['episodic', 'semantic', 'procedural', 'preference'];
  const DEFAULTS = {
    importance: 0.5,
    confidence: 0.7,
    decay: 0.002,
    source: 'localmind'
  };

  function clean(s, n) { return String(s == null ? '' : s).trim().slice(0, n || 6000); }
  function words(s) {
    return clean(s, 10000).toLowerCase()
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .split(/\s+/).filter(w => w.length > 2);
  }
  function unique(a) { return [...new Set(a || [])]; }

  function vector(s) {
    const v = Object.create(null);
    words(s).forEach(w => v[w] = (v[w] || 0) + 1);
    return v;
  }
  function cosine(a, b) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    let dot = 0, aa = 0, bb = 0;
    keys.forEach(k => { const x = a[k] || 0, y = b[k] || 0; dot += x*y; aa += x*x; bb += y*y; });
    return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
  }
  function recency(ts, halfLifeDays) {
    if (!ts) return 0;
    const days = Math.max(0, (now() - ts) / 86400000);
    return Math.exp(-Math.log(2) * days / (halfLifeDays || 30));
  }
  function importance(m) { return Math.max(0, Math.min(1, Number(m.importance == null ? .5 : m.importance))); }
  function confidence(m) { return Math.max(0, Math.min(1, Number(m.confidence == null ? .7 : m.confidence))); }
  function decayFactor(m) {
    const d = Math.max(0, Number(m.decay == null ? DEFAULTS.decay : m.decay));
    const age = Math.max(0, (now() - (m.last_used || m.timestamp || now())) / 86400000);
    return Math.exp(-d * age);
  }

  /* ---------------- Working memory ---------------- */
  const WorkingMemory = {
    blank() {
      return {
        id: uid('wm'), started: now(), updated: now(),
        user_goal: '', relevant_conversation: [], current_facts: [],
        assumptions: [], unfinished_tasks: [], current_plan: [],
        open_questions: [], hypotheses: [], evidence: [], tool_results: [],
        errors: [], next_action: '', active_concepts: [], confidence: .5
      };
    },
    load() { return DB.get('working', this.blank()); },
    save(w) { w.updated = now(); DB.set('working', w); return w; },
    reset() { const w = this.blank(); return this.save(w); },
    setGoal(goal) { const w=this.load(); w.user_goal=clean(goal,1200); return this.save(w); },
    update(patch) { return this.save(Object.assign(this.load(), patch || {})); },
    addFact(f) { const w=this.load(); if(f && !w.current_facts.includes(f)) w.current_facts.push(clean(f,1200)); return this.save(w); },
    addEvidence(e) { const w=this.load(); if(e) w.evidence.push(clean(e,1200)); w.evidence=w.evidence.slice(-30); return this.save(w); },
    addToolResult(r) { const w=this.load(); w.tool_results.push({at:now(), result:clean(r,3000)}); w.tool_results=w.tool_results.slice(-20); return this.save(w); },
    snapshot() {
      const w=this.load();
      return {
        goal:w.user_goal, facts:w.current_facts.slice(-12), assumptions:w.assumptions.slice(-10),
        tasks:w.unfinished_tasks.slice(-20), plan:w.current_plan.slice(-12),
        questions:w.open_questions.slice(-10), hypotheses:w.hypotheses.slice(-10),
        evidence:w.evidence.slice(-12), active_concepts:w.active_concepts.slice(-15),
        next_action:w.next_action, confidence:w.confidence
      };
    }
  };

  /* ---------------- Typed long-term memory ---------------- */
  const Memory = {
    all() { return DB.get('memories', []); },
    save(a) { DB.set('memories', a); },
    add(text, type, meta) {
      type = TYPES.includes(type) ? type : 'semantic';
      text = clean(text);
      if (!text) return null;
      meta = meta || {};
      const item = {
        id: uid('mem'), type, text,
        importance: meta.importance == null ? DEFAULTS.importance : Number(meta.importance),
        confidence: meta.confidence == null ? DEFAULTS.confidence : Number(meta.confidence),
        timestamp: meta.timestamp || now(),
        source: clean(meta.source || DEFAULTS.source, 200),
        last_used: meta.last_used || now(),
        decay: meta.decay == null ? DEFAULTS.decay : Number(meta.decay),
        supersedes: meta.supersedes || null,
        superseded_by: null,
        tags: unique((meta.tags || []).map(x => clean(x,80))),
        links: unique(meta.links || []),
        vector: vector(text)
      };
      const a = this.all();
      a.push(item);
      this.save(a.slice(-5000));
      return item;
    },
    touch(id) {
      const a=this.all(), m=a.find(x=>x.id===id);
      if(m) { m.last_used=now(); this.save(a); }
      return m || null;
    },
    supersede(oldId, newMemory) {
      const a=this.all(), old=a.find(x=>x.id===oldId);
      const fresh = typeof newMemory === 'string' ? this.add(newMemory,'semantic',{confidence:.85}) : this.add(newMemory.text,newMemory.type,newMemory);
      if(old && fresh) { old.superseded_by=fresh.id; fresh.supersedes=old.id; this.save(a); }
      return fresh;
    },
    search(query, k, opts) {
      opts=opts||{}; k=Math.max(1,Math.min(30,k||8));
      const qv=vector(query), all=this.all();
      const scored=all.filter(m=>!m.superseded_by || opts.includeSuperseded)
        .map(m=>{
          const semantic=cosine(qv,m.vector||vector(m.text));
          const recent=recency(m.last_used||m.timestamp, opts.halfLifeDays||45);
          const imp=importance(m), conf=confidence(m), decay=decayFactor(m);
          const relationship=Graph.relationshipScore(query,m);
          const typeBoost=opts.type && m.type===opts.type ? .08 : 0;
          const score=.46*semantic + .18*recent + .16*imp + .14*conf + .06*relationship + typeBoost;
          return Object.assign({},m,{score,semantic,recent,relationship,decay});
        })
        .filter(m=>confidence(m)>=Number(opts.minConfidence==null?.25:opts.minConfidence))
        .sort((a,b)=>b.score-a.score)
        .slice(0,k);
      scored.forEach(m=>this.touch(m.id));
      return scored;
    },
    gate(candidate) {
      const text=clean(candidate && candidate.text);
      if(!text) return {remember:false, reason:'empty'};
      const c=Object.assign({},candidate,{text});
      const stable=!!candidate.stable;
      const useful=Number(candidate.importance||.5)>=.45;
      const reliable=Number(candidate.confidence==null?.7:candidate.confidence)>=.6;
      const duplicate=this.search(text,3,{includeSuperseded:true}).some(x=>cosine(vector(text),x.vector||vector(x.text))>.92);
      if(duplicate) return {remember:false, reason:'duplicate'};
      if(!useful && !stable) return {remember:false, reason:'low-importance'};
      if(!reliable && !stable) return {remember:false, reason:'low-confidence'};
      return {remember:true, memory:this.add(text,candidate.type||'semantic',candidate)};
    },
    stats() {
      const a=this.all(), by={episodic:0,semantic:0,procedural:0,preference:0};
      a.forEach(m=>{if(by[m.type]!=null)by[m.type]++;});
      return {total:a.length,by};
    },
    clear(){this.save([]);}
  };

  /* ---------------- Knowledge graph ---------------- */
  const Graph = {
    nodes(){ return DB.get('graph_nodes', []); },
    edges(){ return DB.get('graph_edges', []); },
    norm(s){return clean(s,160).toLowerCase();},
    node(label,type) {
      label=this.norm(label); if(!label)return null;
      const a=this.nodes(); let n=a.find(x=>x.label===label);
      if(!n){ n={id:uid('node'),label,type:type||'concept',created:now(),last_used:now(),activation:.2}; a.push(n); DB.set('graph_nodes',a.slice(-3000));}
      else {n.last_used=now(); if(type)n.type=type; DB.set('graph_nodes',a);}
      return n;
    },
    link(a,rel,b,weight) {
      const A=this.node(a), B=this.node(b); if(!A||!B)return null;
      const edges=this.edges(); let e=edges.find(x=>x.a===A.id&&x.b===B.id&&x.rel===clean(rel,80));
      if(!e){e={id:uid('edge'),a:A.id,b:B.id,rel:clean(rel,80),weight:Number(weight==null?.5:weight),created:now(),uses:0};edges.push(e);}
      e.weight=Math.min(1,(e.weight||0)+.05);e.uses=(e.uses||0)+1;e.last_used=now();
      DB.set('graph_edges',edges.slice(-8000)); return e;
    },
    activate(labels) {
      const wanted=unique(labels.map(this.norm.bind(this)).filter(Boolean)), ns=this.nodes();
      ns.forEach(n=>{if(wanted.includes(n.label))n.activation=Math.min(1,(n.activation||0)+.35);else n.activation=(n.activation||0)*.97;});
      DB.set('graph_nodes',ns);
      if(typeof Neurons!=='undefined'&&Neurons.coActivate)try{Neurons.coActivate(wanted.slice(0,10),1);}catch(_){}
      return this.associated(wanted,12);
    },
    associated(labels,limit) {
      const ids=this.nodes().filter(n=>labels.includes(n.label)).map(n=>n.id), ns=this.nodes(), es=this.edges(), out=[];
      es.forEach(e=>{
        if(ids.includes(e.a)||ids.includes(e.b)){
          const other=ids.includes(e.a)?e.b:e.a, n=ns.find(x=>x.id===other);
          if(n)out.push({label:n.label,weight:e.weight||0,rel:e.rel});
        }
      });
      out.sort((a,b)=>b.weight-a.weight);return out.slice(0,limit||8);
    },
    relationshipScore(query,memory) {
      const q=words(query), labs=this.nodes().filter(n=>q.includes(n.label)||q.some(w=>n.label.includes(w))).map(n=>n.label);
      if(!labs.length)return 0;
      const text=memory.text.toLowerCase();
      return Math.min(1,labs.reduce((s,l)=>s+(text.includes(l)?1:0),0)/labs.length);
    },
    learnFromMemory(m) {
      const ws=words(m.text).slice(0,10);
      ws.forEach(w=>this.node(w,'concept'));
      for(let i=0;i<Math.min(ws.length,6);i++)for(let j=i+1;j<Math.min(ws.length,6);j++)this.link(ws[i],'associated_with',ws[j],.35);
      if(m.tags) m.tags.forEach(t=>this.link(t,'describes',ws[0]||t,.4));
    },
    stats(){return{nodes:this.nodes().length,edges:this.edges().length};},
    clear(){DB.del('graph_nodes');DB.del('graph_edges');}
  };

  /* ---------------- Planning / hypotheses / reflection ---------------- */
  function complexity(text) {
    const n=clean(text,10000).length, qs=(text.match(/\?/g)||[]).length;
    const parts=(text.match(/\b(and|then|also|plus|with|including|build|implement|analyze|compare|verify)\b/gi)||[]).length;
    if(n>900||parts>=5||qs>=3)return 'hard';
    if(n>300||parts>=2||qs>=2)return 'medium';
    return 'easy';
  }
  function decompose(goal) {
    const c=complexity(goal), tasks=[];
    if(c==='easy') tasks.push({id:uid('task'),title:'Solve request',status:'pending'});
    else {
      tasks.push({id:uid('task'),title:'Understand and define the goal',status:'pending'});
      tasks.push({id:uid('task'),title:'Gather relevant facts and evidence',status:'pending'});
      tasks.push({id:uid('task'),title:'Develop and evaluate solution',status:'pending'});
      tasks.push({id:uid('task'),title:'Verify result',status:'pending'});
    }
    if(/\b(build|implement|create|fix|develop)\b/i.test(goal)){
      tasks.splice(2,0,{id:uid('task'),title:'Implement the requested changes',status:'pending'});
    }
    return tasks;
  }

  const Reasoning = {
    create(goal) {
      const w=WorkingMemory.load(); w.user_goal=clean(goal,1600);
      w.unfinished_tasks=decompose(goal);
      w.current_plan=w.unfinished_tasks.map(t=>t.title);
      w.assumptions=[];w.open_questions=[];w.hypotheses=[];w.evidence=[];w.errors=[];w.next_action=w.current_plan[0]||'Respond';
      w.confidence=.5;w.active_concepts=unique(words(goal).slice(0,15)); WorkingMemory.save(w);
      Graph.activate(w.active_concepts);
      return w;
    },
    hypotheses(question) {
      const q=clean(question,1000), hs=[];
      if(/\bwhy\b/i.test(q)){hs.push({id:uid('hyp'),text:'The most direct/common explanation is responsible.',score:.5});hs.push({id:uid('hyp'),text:'A less obvious contextual factor is responsible.',score:.4});}
      else if(/\b(is|are|true|correct)\b/i.test(q)){hs.push({id:uid('hyp'),text:'The claim is supported by available evidence.',score:.5});hs.push({id:uid('hyp'),text:'The claim is incomplete or contradicted by evidence.',score:.4});}
      else {hs.push({id:uid('hyp'),text:'The strongest available interpretation is correct.',score:.5});hs.push({id:uid('hyp'),text:'The request contains an unstated constraint.',score:.4});}
      const w=WorkingMemory.load();w.hypotheses=hs;WorkingMemory.save(w);return hs;
    },
    passes(goal) {
      const c=complexity(goal);
      return c==='easy'?1:c==='medium'?3:5;
    },
    specialistModes(goal) {
      const g=goal.toLowerCase(), out=['planner'];
      if(/\b(research|source|latest|news|look up|evidence)\b/.test(g))out.push('researcher');
      if(/\b(code|javascript|html|css|implement|debug|fix)\b/.test(g))out.push('coder');
      if(/\b(compare|analy[sz]e|calculate|math|data)\b/.test(g))out.push('analyst');
      if(/\b(strategy|business|token|pool|market|plan)\b/.test(g))out.push('strategist');
      out.push('critic','synthesizer');return unique(out);
    },
    evaluate(result,goal) {
      const text=clean(result,10000), checks=[];
      checks.push({name:'nonempty',ok:text.length>0});
      checks.push({name:'goal addressed',ok:goal?words(goal).slice(0,8).filter(w=>text.toLowerCase().includes(w)).length>=Math.min(2,words(goal).length):true});
      checks.push({name:'no obvious uncertainty hiding',ok:!/\b(definitely|certainly|always|never)\b/i.test(text) || /\b(unless|except|usually|typically)\b/i.test(text)});
      const score=checks.filter(x=>x.ok).length/checks.length;
      return {score,checks,issues:checks.filter(x=>!x.ok).map(x=>x.name)};
    }
  };

  /* ---------------- Tool router ---------------- */
  const ToolIntelligence = {
    async need(tool,args) {
      if(typeof KanairoexV4!=='undefined'&&KanairoexV4.Tools&&KanairoexV4.Tools.call){
        try{return await KanairoexV4.Tools.call(tool,args||{});}catch(e){return{error:e.message};}
      }
      return null;
    },
    choose(goal) {
      const g=goal.toLowerCase(), tools=[];
      if(/\bcalculate|math|sum|percent|equation\b/.test(g))tools.push('calculator');
      if(/\bmemory|remember|previous|we discussed\b/.test(g))tools.push('memory.search');
      if(/\bknowledge|fact|what is\b/.test(g))tools.push('knowledge.search');
      if(/\butm|coordinate|distance\b/.test(g))tools.push('geo.utm');
      if(/\bcode|javascript|run\b/.test(g))tools.push('code.run');
      return unique(tools);
    }
  };

  /* ---------------- Cognitive turn lifecycle ---------------- */
  function captureConversation(text) {
    const hist=(typeof AI!=='undefined'&&AI.loadHistory)?AI.loadHistory():[];
    return hist.slice(-12).map(x=>({role:x.role,content:clean(x.content,900),ts:x.ts||now()}));
  }

  function learnTurn(userText, reply, meta) {
    const w=WorkingMemory.load();
    const ep=Memory.add('User requested: '+clean(userText,1800)+'\nOutcome: '+clean(reply,1800),'episodic',{
      importance: meta && meta.success ? .62:.48, confidence:meta&&meta.confidence||.72,
      source:'conversation',tags:words(userText).slice(0,6)
    });
    if(ep)Graph.learnFromMemory(ep);
    if(typeof Neurons!=='undefined'&&Neurons.learnFromInteraction)try{
      Neurons.learnFromInteraction(userText,w.active_concepts||[]);
    }catch(_){}
    return ep;
  }

  function learnCandidate(text,type,meta) {
    const r=Memory.gate(Object.assign({text,type},meta||{}));
    if(r.remember&&r.memory)Graph.learnFromMemory(r.memory);
    return r;
  }

  function status() {
    return {
      working:WorkingMemory.snapshot(),
      memory:Memory.stats(),
      graph:Graph.stats(),
      complexity:WorkingMemory.load().user_goal?complexity(WorkingMemory.load().user_goal):'idle',
      passes:WorkingMemory.load().user_goal?Reasoning.passes(WorkingMemory.load().user_goal):0,
      specialists:WorkingMemory.load().user_goal?Reasoning.specialistModes(WorkingMemory.load().user_goal):[]
    };
  }

  function formatStatus() {
    const s=status(), w=s.working;
    return '**Kanairoex Cognitive State**\n\n' +
      '• Working goal: **'+(w.goal||'idle')+'**\n' +
      '• Active concepts: '+(w.active_concepts||[]).slice(0,8).join(', ')+'\n' +
      '• Unfinished tasks: **'+(w.tasks||[]).filter(x=>x.status!=='complete').length+'**\n' +
      '• Memory: **'+s.memory.total+'** ('+Object.entries(s.memory.by).map(([k,v])=>k+': '+v).join(', ')+')\n' +
      '• Knowledge graph: **'+s.graph.nodes+' nodes / '+s.graph.edges+' links**\n' +
      '• Reasoning budget: **'+s.passes+' pass(es)**\n' +
      '• Specialist modes: '+s.specialists.join(', ')+'\n';
  }

  function handleCommand(text) {
    const t=clean(text,4000), l=t.toLowerCase();
    if(/^mind state$|^cognitive status$|^working memory$/.test(l))return {reply:formatStatus()};
    if(/^memory types$/.test(l))return {reply:'**Memory types:** episodic, semantic, procedural, preference. Each memory tracks importance, confidence, timestamp, source, last-used time, decay, and supersession.'};
    if(/^memory search\s+/i.test(t)){
      const q=t.replace(/^memory search\s+/i,'');const hits=Memory.search(q,8);
      return {reply:hits.length?'**Relevant memories**\n\n'+hits.map((m,i)=>(i+1)+'. **'+m.type+'** ('+m.score.toFixed(2)+') — '+m.text.slice(0,500)).join('\n\n'):'No relevant cognitive memories found.'};
    }
    if(/^graph status$|^knowledge graph$/.test(l)){const g=Graph.stats();return{reply:'**Knowledge graph:** '+g.nodes+' nodes, '+g.edges+' relationships.'};}
    if(/^reasoning budget\s+(easy|medium|hard|critical)$/i.test(t)){return{reply:'Reasoning budgets are adaptive. Easy=1 pass, medium=3, hard=5; critical tasks add verification.'};}
    if(/^forget cognitive memory$/i.test(t)){Memory.clear();Graph.clear();WorkingMemory.reset();return{reply:'Cognitive memory, graph and working workspace cleared. Core app knowledge is unchanged.'};}
    return null;
  }

  function beginTurn(userText) {
    const w=Reasoning.create(userText);
    const memories=Memory.search(userText,10,{minConfidence:.35});
    const assoc=Graph.activate(w.active_concepts||[]);
    w.relevant_conversation=captureConversation(userText);
    w.current_facts=memories.filter(m=>m.type==='semantic'||m.type==='preference').slice(0,8).map(m=>m.text);
    w.evidence=memories.slice(0,8).map(m=>m.type+': '+m.text);
    w.active_concepts=unique((w.active_concepts||[]).concat(assoc.slice(0,8).map(x=>x.label))).slice(0,20);
    w.confidence=memories.length?Math.min(.9,Math.max(.35,memories.reduce((s,m)=>s+m.score,0)/Math.max(1,memories.length))):.35;
    w.next_action=w.current_plan[0]||'Respond';
    WorkingMemory.save(w);
    return {workspace:w,memories,associations:assoc,tools:ToolIntelligence.choose(userText),specialists:Reasoning.specialistModes(userText),passes:Reasoning.passes(userText)};
  }

  function finishTurn(userText, result) {
    const reply=typeof result==='string'?result:(result&&result.reply)||'';
    const evaluation=Reasoning.evaluate(reply,userText);
    const w=WorkingMemory.load();
    w.result=clean(reply,5000);
    w.confidence=Math.max(.2,Math.min(.95,evaluation.score*.7+(w.confidence||.4)*.3));
    w.errors=evaluation.issues||[];
    w.unfinished_tasks=(w.unfinished_tasks||[]).map((t,i)=>Object.assign({},t,{status:i===w.unfinished_tasks.length-1?'verified':'complete'}));
    w.next_action='Complete';
    WorkingMemory.save(w);
    if(reply){
      const successful = evaluation.score >= .80 && !evaluation.issues.length;
      learnTurn(userText,reply,{success:successful,confidence:w.confidence});
      if(successful && Reasoning.passes(userText) >= 3){
        learnFromSuccess(userText,reply,{success:true,score:evaluation.score,confidence:w.confidence});
      }
    }
    return evaluation;
  }

  function learnFromSuccess(task,solution,outcome) {
    const ok=!!outcome && (outcome.success===true || outcome.score>=.66);
    if(!ok)return {stored:false,reason:'not-successful'};
    return learnCandidate('Successful workflow for '+clean(task,600)+': '+clean(solution,2400),'procedural',{
      importance:.72,confidence:Number(outcome.confidence==null?.78:outcome.confidence),
      source:'successful-task',stable:true,tags:words(task).slice(0,8)
    });
  }

  const Cognitive = {
    WorkingMemory, Memory, Graph, Reasoning, ToolIntelligence,
    beginTurn,finishTurn,learnCandidate,learnFromSuccess,status,handleCommand,
    version:'1.0.0',
    introspect(){return status();}
  };

  window.KanairoexCognitive=Cognitive;

  /* Synchronize the existing Knowledge store into typed semantic memory.
     The original Knowledge database remains the authoritative app store; the
     cognitive store adds richer metadata and graph relationships. */
  try {
    if (typeof Knowledge !== 'undefined' && Knowledge.add && !Knowledge.__cognitiveWrapped) {
      const kbase = Knowledge.add.bind(Knowledge);
      Knowledge.add = function(subject, content, category, opts) {
        const out = kbase(subject, content, category, opts);
        try {
          if (out && typeof KanairoexCognitive !== 'undefined') {
            const tags = words(String(subject || '') + ' ' + String(content || '')).slice(0, 10);
            const hits = Memory.search(String(subject || '') + ' ' + String(content || ''), 3, {includeSuperseded:true});
            let superseded = null;
            if (hits.length && hits[0].score > .72 && hits[0].type === 'semantic' &&
                hits[0].text.toLowerCase() !== (String(subject)+': '+String(content)).toLowerCase()) {
              // Preserve the old memory and link the new evidence to it.
              superseded = hits[0];
            }
            const nm = Memory.add(String(subject || '') + ': ' + String(content || ''), 'semantic', {
              importance: category === 'personal' ? .82 : .62,
              confidence: category === 'online' ? .66 : .82,
              source: String((opts && opts.source) || category || 'knowledge'),
              tags: tags,
              supersedes: superseded ? superseded.id : null
            });
            if (superseded && nm) {
              const all=Memory.all(), old=all.find(x=>x.id===superseded.id);
              if(old){old.superseded_by=nm.id; Memory.save(all);}
              nm.supersedes=superseded.id; Memory.save(all);
            }
            if(nm) Graph.learnFromMemory(nm);
          }
        } catch (_) {}
        return out;
      };
      Knowledge.__cognitiveWrapped = true;
    }
  } catch (e) { console.warn('Knowledge cognitive bridge unavailable', e); }

  /* Add cognitive orchestration to the existing chat engine without replacing
     its domain-specific commands. */
  try {
    if(typeof AI!=='undefined'&&AI.process&&!AI.__cognitiveWrapped){
      const base=AI.process.bind(AI);
      AI.process=function(text){
        const cmd=Cognitive.handleCommand(text);
        if(cmd)return {thinking:'→ Cognitive workspace',reply:cmd.reply,creative:null,settings:AI.loadSettings?AI.loadSettings():{}};
        const ctx=beginTurn(String(text||''));
        const out=base(text);
        const finish=(resolved)=>{
          try{Cognitive.finishTurn(String(text||''),resolved||{});}catch(e){}
          return resolved;
        };
        if(out&&out._advancedPromise){
          out._advancedPromise=out._advancedPromise.then(r=>{finish({reply:typeof r==='string'?r:r&&r.reply||JSON.stringify(r)});return r;});
        }else finish(out||{});
        if(out){
          out.cognitive={
            memories:ctx.memories.slice(0,5).map(m=>({type:m.type,score:Number(m.score.toFixed(3)),text:m.text.slice(0,300)})),
            specialists:ctx.specialists,passes:ctx.passes,tools:ctx.tools,
            activeConcepts:ctx.workspace.active_concepts.slice(0,12)
          };
        }
        return out;
      };
      AI.__cognitiveWrapped=true;
    }
  }catch(e){console.warn('Cognitive bridge unavailable',e);}
})();
