import assert from 'node:assert/strict';

// Loaded only in the private Playwright server process. No provider requests leave the fixture.
const realFetch=globalThis.fetch;
const usage={prompt_tokens:450,completion_tokens:65,cost:0};
const respond=(model,message)=>Response.json({model,usage,choices:[{finish_reason:'stop',message:{role:'assistant',...message}}]});
const analyze=(tool,through,options={})=>({name:'analyze_fitness',arguments:{tool,from:null,through,...options}});
const meal=description=>({name:'prepare_meal',arguments:{description}});
const streamed=(model,parts,finish='stop')=>new Response([
  ...parts.map(content=>({model,choices:[{delta:{content},finish_reason:null}]})),
  {model,choices:[{delta:{},finish_reason:finish}]},{model,choices:[],usage},
].map(event=>'data: '+JSON.stringify(event)+'\n\n').join('')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream'}});

globalThis.fetch=async(input,options)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.hostname.endsWith('.openfoodfacts.org')){
    return Response.json({hits:url.searchParams.get('q')?.toLowerCase()==='banaan'?[{
      code:'1234567890123',product_name_nl:'Banaan',nutrition_data_per:'serving',
      nutrition:{input_sets:[{per:'serving',preparation:'as_sold',source:'packaging',
        nutrients:{'energy-kcal':{value:105,unit:'kcal'}}}]},
    }]:[]});
  }
  if(url.origin!=='https://openrouter.ai') return realFetch(input,options);
  assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer synthetic-test-provider-key');
  if(url.pathname.endsWith('/key')) return Response.json({data:{label:'Synthetic key'}});
  if(url.pathname.endsWith('/endpoints/zdr')) return Response.json({data:['free','fallback'].map(model=>({
    model_id:'synthetic/'+model,model_name:'Synthetic model '+model,provider_name:'Synthetic',tag:'synthetic',
    context_length:32000,supported_parameters:model==='free'?['max_tokens','tools']:['max_tokens'],pricing:{prompt:0,completion:0},
  }))});
  assert.equal(url.pathname,'/api/v1/chat/completions');
  const {model,messages,tools,provider}=JSON.parse(options.body);
  assert.equal(provider.zdr,true);
  assert.equal(provider.data_collection,'deny');
  assert.deepEqual(provider.only,['synthetic']);
  assert.ok(!/synthetic_partner7|synthetic\.track2|synthetic_isolated|great session|example\.invalid/i.test(JSON.stringify(messages)));
  const system=messages[0].content;
  assert.match(system,/PERSONALGYMTRACK Coach/);
  const current=messages.findLast(row=>row.role==='user')?.content??'';
  const broad=messages.findLast(row=>row.role==='user')?.content.includes('goede punten van mijn trainingen');
  if(system.includes('Today in the diary')){
    const today=system.match(/Today in the diary is (\d{4}-\d{2}-\d{2})/)[1];
    let operations=[];
    if(broad){
      operations=[analyze('training',today),analyze('muscles',today)];
      return Response.json({model,usage,choices:[{finish_reason:'tool_calls',message:{role:'assistant',
        content:'Even je data checken voor je echte punten en valkuilen.',
        tool_calls:operations.map(({name,arguments:args},index)=>({
          id:'review_'+index,type:'function',function:{name,arguments:JSON.stringify(args)},
        })),
      }}]});
    }else if(current.includes('bnch')){
      assert.match(current,/Partner 1/);
      operations=[analyze('strength',today,{exercise:'bnch press',partner:'Partner 1',reps:5})];
    }else if(current.includes('en vorige maand')){
      assert.ok(messages.some(row=>row.role==='user'&&row.content.includes('bnch')));
      const end=new Date(Date.parse(today.slice(0,7)+'-01')-86400000).toISOString().slice(0,10);
      const from=end.slice(0,7)+'-01';
      operations=[analyze('strength',end,{from,exercise:'bench press',partner:'Partner 1',reps:5}),analyze('nutrition',end,{from})];
    }else if(current.includes('banaan')){
      assert.match(system,/Active meal draft.*40.*Synthetic oat bowl/i);
      operations=[meal('Lunch: 40 g Synthetic oat bowl, 1 serving Banaan')];
    }else if(current.includes('300 gram')){
      assert.match(system,/Active meal draft.*Banaan/);
      operations=[meal('Lunch: 300 g Synthetic oat bowl, 1 serving Banaan')];
    }else if(current.includes('naar mijn ontbijt')){
      assert.match(system,/Active meal draft.*300/);
      operations=[meal('Breakfast: 300 g Synthetic oat bowl, 1 serving Banaan')];
    }else if(current.includes('secret SQL')){
      operations=[{name:'run_sql',arguments:{statement:'select private data'}}];
    }else if(current.includes('weegschaal')){
      operations=[analyze('bodyweight',today)];
    }else if(current.includes('dated scale sample')){
      operations=[analyze('bodyweight',today,{from:'2020-01-02'})];
    }else if(current.includes('wie duikt')){
      operations=[analyze('partners',today)];
    }else if(current.includes('95 kg')){
      operations=[{name:'estimate_lift',arguments:{weightKg:95,reps:5}}];
    }
    return respond(model,tools?{tool_calls:operations.map(({name,arguments:args},index)=>({
      id:'call_'+index,type:'function',function:{name,arguments:JSON.stringify(args)},
    }))}:{content:JSON.stringify({operations})});
  }
  if(broad){
    const tools=messages.filter(row=>row.role==='tool');
    if(!tools.length) return respond(model,{content:'Even je data checken voor je echte punten en valkuilen.'});
    assert.deepEqual(tools.map(row=>row.tool_call_id),['review_0','review_1']);
    const [training,muscles]=tools.map(row=>JSON.parse(row.content).result);
    const parts=[`Sterk: je deed ${training.workouts} trainingen. `,
      `Een aandachtspunt: ${muscles.muscles.chest.directSets} directe borstsets, zonder andere directe spiergroepen in dit overzicht.`];
    return streamed(model,parts);
  }
  const evidence=JSON.parse(system.split('Fitness evidence (JSON): ')[1]);
  const returned=messages.filter(row=>row.role==='tool').map(row=>JSON.parse(row.content));
  if(returned.length){
    const calls=messages.findLast(row=>row.tool_calls)?.tool_calls;
    assert.deepEqual(messages.filter(row=>row.role==='tool').map(row=>row.tool_call_id),calls.map(call=>call.id));
    evidence.results=returned.filter(result=>result.tool);
    evidence.hypothetical=returned.flatMap(result=>result.hypothetical?[result.hypothetical]:[]);
  }
  const strength=evidence.results.find(row=>row.tool==='strength')?.result.exercises[0];
  if(current.includes('bnch')){
    const {tagged,other}=strength.partnerComparison;
    return respond(model,{content:`Met Partner 1 was je zwaarste set van vijf gemiddeld ${tagged.meanSessionHeaviestKg} kg (${tagged.sessions} trainingen), tegenover ${other.meanSessionHeaviestKg} kg (${other.sessions} trainingen).`});
  }
  if(current.includes('en vorige maand')){
    const nutrition=evidence.results.find(row=>row.tool==='nutrition');
    assert.equal(nutrition.result.completedDaysWithEntries,0);
    assert.equal(evidence.results[0].from,nutrition.from);
    return respond(model,{content:'Voor die maand heb je geen voltooide voedingsdagen. Te weinig om je eten aan die sets te koppelen.'});
  }
  if(current.includes('weegschaal')){
    const {latest,changeKg}=evidence.results.find(row=>row.tool==='bodyweight').result;
    return respond(model,{content:`Je weegschaal gaf ${latest.value} kg aan. ${changeKg===null?'Met één meting heb je nog geen trend.':''}`});
  }
  if(current.includes('wie duikt')){
    const {partners}=evidence.results.find(row=>row.tool==='partners').result;
    return respond(model,{content:`${partners[0].partner} zie ik het vaakst terug: ${partners[0].workouts} getagde trainingen.`});
  }
  if(current.includes('95 kg')){
    const [scenario]=evidence.hypothetical;
    return respond(model,{content:`Bij ${scenario.weightKg} kg voor ${scenario.reps} reps schat ik je 1RM op ${Math.round(scenario.estimated1RMKg)} kg. Dat is hypothetisch.`});
  }
  if(current.includes('delete my workouts')){
    assert.deepEqual(evidence.results,[]);
    return respond(model,{content:'I can analyze your workouts, but deleting them is outside the available Coach tools.'});
  }
  if(current.includes('scan the big picture')) return streamed(model,['I’ll ', 'check your training history.']);
  if(current.includes('recovery week structure')) return streamed(model,['An incomplete'], 'length');
  return respond(model,{content:'Welke bedoel je precies?'});
};
