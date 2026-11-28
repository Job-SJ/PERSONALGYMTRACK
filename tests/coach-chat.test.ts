import {expect,it,vi} from 'vitest';
import {chatSchema,coachPrivacy,conversationContext,validChatPrompt,type ChatTurn} from '../lib/coach-chat';
import {readChatResponse} from '../lib/coach-chat-client';
import {coachMarkdown} from '../lib/coach-markdown';
import {coachInputBytes,openRouter} from '../lib/coach-provider';

const key='synthetic-inference-credential';
const model='synthetic/chat-model';
const selection={model,endpoint:'synthetic/us-east-1',prompt:0.000002,completion:0.000004};
const turn=(id:string,prompt:string,answer:string|null):ChatTurn=>({id,prompt,answer,created_at:'2026-11-28T10:00:00Z'});
const sse=(...chunks:unknown[])=>chunks.map(chunk=>'data: '+JSON.stringify(chunk)+'\r\n\r\n').join('');
const reply={prompt_tokens:400,completion_tokens:10,cost:0.00084};

it('builds chronological bounded context from recent completed turns with no metadata or known identifiers',()=>{
  const older=turn('older','How much training did I log?','You logged 12 sessions.');
  const newer=turn('private-row-id','Email me at synthetic@example.invalid','Average: 4.');
  const context=conversationContext('{"evidence":{"sessions":12}}',[newer,turn('pending','Interrupted question',null),older],
    'How does that compare to last month? 10000000-0000-0000-0000-000000000001');
  expect(context.messages).toEqual([
    {role:'user',content:older.prompt},{role:'assistant',content:older.answer},
    {role:'user',content:'Email me at [email removed]'},{role:'assistant',content:newer.answer},
    {role:'user',content:'How does that compare to last month? [identifier removed]'},
  ]);
  expect(context.system).toContain('"sessions":12');
  expect(context.system).toContain('untrusted data');
  expect(JSON.stringify(context)).not.toContain('private-row-id');
  const long=conversationContext('{}',Array.from({length:10},(_,index)=>turn(String(index),'Question','é'.repeat(2000))),'Follow up');
  expect(long.messages.length).toBeLessThan(9);
  expect(Buffer.byteLength(long.system+long.messages.map(row=>row.content).join(''))).toBeLessThanOrEqual(coachInputBytes);
});

it('requires explicit consent and rejects likely secrets and oversized UTF-8 messages',()=>{
  expect(chatSchema.safeParse({action:'chat-consent',consent:false}).success).toBe(false);
  expect(chatSchema.safeParse({action:'chat-consent',consent:true}).success).toBe(true);
  expect(validChatPrompt('Bearer '+'x'.repeat(24))).toBe(false);
  expect(validChatPrompt('sk-or-v1-'+'x'.repeat(32))).toBe(false);
  expect(validChatPrompt('é'.repeat(901))).toBe(false);
  expect(validChatPrompt('Compare my lifts')).toBe(true);
});

it('uses temporary partner references and restores a preferred name locally',()=>{
  const prior={...turn('local','Who do I usually train with?','@synthetic_partner after 3 workouts.'),local_analysis:true};
  const privacy=coachPrivacy('Did @Synthetic_Partner help, Sam?', [prior], 'Sam');
  const context=conversationContext('{}',[prior],'Did @Synthetic_Partner help, Sam?',{privacy});
  expect(JSON.stringify(context)).not.toMatch(/synthetic_partner|\bSam\b|3 workouts/i);
  expect(context.messages.at(-1)?.content).toBe('Did Partner 1 help, [athlete]?');
  expect(privacy.restore('Partner 1 was tagged in those workouts, [athlete].')).toBe('@synthetic_partner was tagged in those workouts, Sam.');
});

it('streams content with usage while retaining paid routing caps and sending neither identifiers nor tools',async()=>{
  const raw=': OPENROUTER PROCESSING\n\n'+sse(
    {model,choices:[{delta:{role:'assistant',reasoning:'private reasoning'},finish_reason:null}]},
    {model,choices:[{delta:{content:'**Two** '},finish_reason:null}]},
    {model,choices:[{delta:{content:'sessions.'},finish_reason:null}]},
    {model,choices:[{delta:{},finish_reason:'stop'}]},
    {model,choices:[],usage:reply},
  )+'data: [DONE]\n\n';
  const transport=vi.fn(async(_url:string|URL|Request,init?:RequestInit)=>{
    const body=JSON.parse(String(init?.body));
    expect(body).toEqual({model,max_tokens:700,stream:true,messages:[
      {role:'system',content:'Fitness instructions'},{role:'user',content:'How is my training?'},{role:'assistant',content:'Two workouts.'},
      {role:'user',content:'How about last month?'},
    ],provider:{only:[selection.endpoint],allow_fallbacks:false,require_parameters:true,data_collection:'deny',zdr:true,
      max_price:{prompt:2,completion:4,request:0,image:0}}});
    return new Response(new ReadableStream({
      start(controller){
        for(const part of raw.match(/.{1,11}|\n/g)??[]) controller.enqueue(new TextEncoder().encode(part));
        controller.close();
      },
    }),{headers:{'Content-Type':'text/event-stream'}});
  });
  const delta=vi.fn();
  const result=await openRouter(key,transport).chat(selection,'Fitness instructions',[
    {role:'user',content:'How is my training?'},{role:'assistant',content:'Two workouts.'},{role:'user',content:'How about last month?'},
  ],new AbortController().signal,delta);
  expect(delta.mock.calls).toEqual([['**Two** '],['sessions.']]);
  expect(result).toMatchObject({text:'**Two** sessions.',costMicros:840,completionTokens:10});
});

it('fails closed on truncated streams, tools, model changes and pasted provider keys',async()=>{
  for(const raw of [
    sse({model,choices:[{delta:{content:'unfinished'}}]}),
    sse({model,choices:[{delta:{tool_calls:[{type:'function'}]}}]}),
    sse({model:'synthetic/alternate',choices:[{delta:{content:'unexpected model'}}]}),
    sse({model,choices:[],error:{message:'private upstream detail'}}),
  ]){
    const client=openRouter(key,async()=>new Response(raw,{headers:{'content-type':'text/event-stream'}}));
    await expect(client.chat(selection,'Instructions',[{role:'user',content:'Fitness question'}],new AbortController().signal,()=>{}))
      .rejects.toThrow('invalid coaching stream');
  }
  const transport=vi.fn();
  await expect(openRouter(key,transport).chat(selection,'Instructions',[{role:'user',content:key}],new AbortController().signal))
    .rejects.toThrow('Remove credentials');
  expect(transport).not.toHaveBeenCalled();
});

it('accepts regular responses and only commits a completed streamed result',async()=>{
  const finished=turn('row','Question','**Answer**');
  const delta=vi.fn();
  await expect(readChatResponse(Response.json({turn:finished}),delta)).resolves.toEqual({turn:finished});
  const ndjson=(...events:unknown[])=>new Response(events.map(event=>JSON.stringify(event)+'\n').join(''),
    {headers:{'content-type':'application/x-ndjson'}});
  await expect(readChatResponse(ndjson({delta:'partial'}),delta)).rejects.toThrow('interrupted');
  await expect(readChatResponse(ndjson({delta:'a'},{error:'Generation stopped.'}),delta)).rejects.toThrow('Generation stopped');
  await expect(readChatResponse(ndjson({delta:'**Answer**'},{turn:finished}),delta)).resolves.toEqual({turn:finished});
  await expect(readChatResponse(ndjson({turn:{...finished,answer:null}}),delta)).rejects.toThrow('interrupted');
  const utf8=new TextEncoder().encode(JSON.stringify({turn:{...finished,answer:'Twee sessies in één week.'}}));
  const split=new Response(new ReadableStream({
    start(controller){
      for(const byte of utf8) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  }),{headers:{'Content-Type':'application/x-ndjson'}});
  await expect(readChatResponse(split,delta)).resolves.toMatchObject({turn:{answer:'Twee sessies in één week.'}});
});

it('distinguishes a provider timeout from exhausted OpenRouter credits',async()=>{
  const timed=openRouter(key,async(_url,init)=>new Promise<Response>((_,reject)=>{
    init?.signal?.addEventListener('abort',()=>reject(init.signal?.reason),{once:true});
  }),10);
  const signal=new AbortController().signal;
  await expect(timed.plan(selection,'Instructions',[{role:'user',content:'How did my training go?'}],false,signal))
    .rejects.toThrow(/too long.*retry/i);
  const depleted=openRouter(key,async()=>new Response('payment required',{status:402}));
  await expect(depleted.chat(selection,'Instructions',[{role:'user',content:'What did I do?'}],signal))
    .rejects.toThrow(/credit or spending limit/i);
});

it('formats Markdown as inert text tokens, including HTML, links and images',()=>{
  const parsed=coachMarkdown('## Summary\n- **4 sets**\n<img src=x> ![private](https://example.invalid)\n<script>alert(1)</script>');
  expect(parsed[0]).toEqual({kind:'heading',parts:[{style:'plain',text:'Summary'}]});
  expect(parsed[1].parts).toContainEqual({style:'strong',text:'4 sets'});
  expect(parsed[2].parts[0].style).toBe('plain');
  expect(parsed[3].parts).toEqual([{style:'plain',text:'<script>alert(1)</script>'}]);
});
