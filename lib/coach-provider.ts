import {z} from 'zod';
import {coachPlan,coachTools,type CoachPlan} from './coach-tools';

export const outputTokens=700;
export const coachInputBytes=8000;
const inputTokenReserve=16000;
const modelId=z.string().max(160).regex(/^[a-z0-9._-]+\/[a-z0-9._-]+(?::free)?$/i);
const tag=z.string().max(100).regex(/^[a-z0-9._-]+(?:\/[a-z0-9._-]+)*$/);
const price=z.union([z.number(),z.string().regex(/^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i)]).transform(Number).pipe(z.number().min(0).max(1));
const endpointPricing=z.object({
  prompt:price,completion:price,request:price.default(0),
  input_cache_read:price.default(0),input_cache_write:price.default(0),input_cache_write_1h:price.default(0),
  internal_reasoning:price.default(0),overrides:z.array(z.unknown()).default([]),
});
const endpointSchema=z.object({
  model_id:modelId,model_name:z.string().min(1).max(160),provider_name:z.string().min(1).max(100),tag,
  context_length:z.number().int().nonnegative(),
  max_prompt_tokens:z.number().int().nullable().optional(),
  max_completion_tokens:z.number().int().nullable().optional(),
  supported_parameters:z.array(z.string()).max(100),
  safety_retention:z.boolean().optional(),
  latency_last_30m:z.object({p50:z.number().nonnegative().nullish()}).nullish(),
  pricing:z.unknown(),
});
export const selectionSchema=z.object({model:modelId,endpoint:tag,prompt:z.number().min(0).max(1),completion:z.number().min(0).max(1)});
export type Selection=z.infer<typeof selectionSchema>;
export type CoachModel=Selection&{name:string;provider:string;free:boolean;capabilities:string[];retention:'zero';medianLatency?:number};
export type CoachDiscovery={models:CoachModel[];diagnostic:string|null};
export const isFree=(selection:Selection)=>selection.prompt===0&&selection.completion===0;
export const reserveMicros=(selection:Selection)=>Math.ceil((selection.prompt*inputTokenReserve+selection.completion*outputTokens)*1_000_000);
export const reserveChatMicros=(selection:Selection)=>2*reserveMicros(selection);

export class CoachProviderError extends Error {}
export class CoachConnectionError extends CoachProviderError {
  constructor(message:string,readonly kind:'invalid-key'|'credit-limit'){super(message);}
}
type Answer={text:string;promptTokens:number;completionTokens:number;costMicros:number};
export type CoachMessage={role:'user'|'assistant';content:string};
export interface CoachProvider {
  test(signal?:AbortSignal):Promise<{paidLimitReached:boolean;freeLimitReached:boolean}>;
  models(signal?:AbortSignal):Promise<CoachDiscovery>;
  answer(selection:Selection,system:string,input:string,signal?:AbortSignal):Promise<Answer>;
  chat(selection:Selection,system:string,messages:CoachMessage[],signal:AbortSignal,onDelta?:(delta:string)=>void):Promise<Answer>;
  plan(selection:Selection,system:string,messages:CoachMessage[],nativeTools:boolean,signal:AbortSignal):Promise<Answer & {plan:CoachPlan}>;
}

const usageSchema=z.object({
  prompt_tokens:z.number().int().nonnegative().max(inputTokenReserve),
  completion_tokens:z.number().int().nonnegative().max(outputTokens),
  cost:z.number().nonnegative(),
});
const completionSchema=z.object({
  model:modelId,
  choices:z.tuple([z.object({finish_reason:z.enum(['stop','length']),message:z.object({
    role:z.literal('assistant'),content:z.string().trim().min(1).max(6000),tool_calls:z.array(z.unknown()).max(0).optional(),function_call:z.never().optional(),
  })})]),
  usage:usageSchema,
});
const chunkSchema=z.object({
  model:modelId.optional(),error:z.never().optional(),usage:usageSchema.nullish(),
  choices:z.array(z.object({finish_reason:z.enum(['stop','length']).nullish(),delta:z.object({
    content:z.string().nullish(),tool_calls:z.array(z.unknown()).max(0).optional(),function_call:z.never().optional(),
  })})).max(1),
});

function streamParser(model:string,onDelta:(delta:string)=>void){
  let text='';
  let modelSeen=false;
  let finished=false;
  let done=false;
  let usage:z.infer<typeof usageSchema>|undefined;
  const invalid=()=>new CoachProviderError('OpenRouter returned an invalid coaching stream.');
  return {
    line(line:string){
      if(!line.startsWith('data:')) return;
      if(done) throw invalid();
      const data=line.slice(5).trim();
      if(data==='[DONE]'){done=true;return;}
      const parsed=chunkSchema.safeParse(JSON.parse(data));
      if(!parsed.success) throw invalid();
      const chunk=parsed.data;
      if(chunk.model){
        if(chunk.model!==model) throw invalid();
        modelSeen=true;
      }
      if(chunk.usage) usage=chunk.usage;
      const choice=chunk.choices[0];
      if(choice?.delta.content){
        if(!modelSeen||finished) throw invalid();
        text+=choice.delta.content;
        if(new TextEncoder().encode(text).length>6000) throw invalid();
        onDelta(choice.delta.content);
      }
      if(choice?.finish_reason) finished=true;
    },
    result(){
      if(!done||!finished||!modelSeen||!usage||!text.trim()) throw invalid();
      return {model,choices:[{finish_reason:'stop',message:{role:'assistant',content:text}}],usage};
    },
  };
}

export function openRouter(key:string,transport=fetch,timeout=20_000):CoachProvider{
  async function request(path:string,limit:number,signal?:AbortSignal,body?:unknown,parser?:ReturnType<typeof streamParser>){
    try {
      const timeoutSignal=AbortSignal.timeout(timeout);
      const response=await transport('https://openrouter.ai/api/v1/'+path,{
        method:body?'POST':'GET',
        headers:{Authorization:'Bearer '+key,...(body?{'Content-Type':'application/json'}:{})},
        ...(body?{body:JSON.stringify(body)}:{}),
        signal:signal?AbortSignal.any([signal,timeoutSignal]):timeoutSignal,
        cache:'no-store',redirect:'error',
      });
      if(!response.ok||!response.body){
        await response.body?.cancel();
        if(response.status===401||response.status===403) throw new CoachConnectionError('OpenRouter rejected the connection. Review your key and privacy settings.','invalid-key');
        if(response.status===402) throw new CoachConnectionError('Check the credit or spending limit on this OpenRouter key.','credit-limit');
        if(response.status===429) throw new CoachProviderError('OpenRouter is busy. Try again later.');
        throw new CoachProviderError('OpenRouter could not serve this request. Review the model or try again later.');
      }
      const reader=response.body.getReader();
      const decoder=new TextDecoder();
      const stream=response.headers.get('content-type')?.includes('text/event-stream')?parser:undefined;
      let text='';
      let bytes=0;
      try{
        for(;;){
          const {done,value}=await reader.read();
          if(done){
            text+=decoder.decode();
            if(!stream) return JSON.parse(text) as unknown;
            stream.line(text);
            return stream.result();
          }
          bytes+=value.byteLength;
          if(bytes>limit){await reader.cancel();throw new CoachProviderError('OpenRouter returned an oversized response.');}
          text+=decoder.decode(value,{stream:true});
          if(stream){
            const lines=text.split('\n');
            text=lines.pop()!;
            lines.forEach(stream.line);
          }
        }
      }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
    }catch(error){
      if(error instanceof CoachProviderError) throw error;
      throw new CoachProviderError(signal?.aborted?'Request cancelled.':'OpenRouter is unavailable or returned an invalid response.');
    }
  }
  const routing=(selection:Selection)=>({only:[selection.endpoint],allow_fallbacks:false,require_parameters:true,
    data_collection:'deny',zdr:true,max_price:{prompt:selection.prompt*1_000_000,completion:selection.completion*1_000_000,request:0,image:0}});
  async function complete(selection:Selection,system:string,messages:CoachMessage[],signal?:AbortSignal,onDelta?:(delta:string)=>void){
    const input=[system,...messages.map(row=>row.content)].join('');
    if(new TextEncoder().encode(input).length>coachInputBytes) throw new CoachProviderError('The coaching summary is too large.');
    if(input.includes(key)) throw new CoachProviderError('Remove credentials from your message.');
    const raw=await request('chat/completions',128_000,signal,{
      model:selection.model,max_tokens:outputTokens,stream:Boolean(onDelta),
      messages:[{role:'system',content:system},...messages],
      provider:routing(selection),
    },onDelta?streamParser(selection.model,onDelta):undefined);
    const parsed=completionSchema.safeParse(raw);
    if(!parsed.success||parsed.data.model!==selection.model) throw new CoachProviderError('OpenRouter returned an invalid coaching response.');
    const {usage,choices}=parsed.data;
    const text=choices[0].message.content;
    if(new TextEncoder().encode(text).length>6000) throw new CoachProviderError('OpenRouter returned an oversized coaching response.');
    return {text,promptTokens:usage.prompt_tokens,completionTokens:usage.completion_tokens,costMicros:Math.ceil(usage.cost*1_000_000)};
  }
  return {
    async test(signal){
      const result=z.object({data:z.object({label:z.string(),is_management_key:z.literal(false).optional(),
        is_provisioning_key:z.literal(false).optional(),limit_remaining:z.number().nullish(),
        effective_budget:z.object({remaining_usd:z.number().nullish()}).nullish(),
        free_model_daily_requests:z.object({remaining:z.number()}).nullish()})}).safeParse(await request('key',65536,signal));
      if(!result.success) throw new CoachProviderError('OpenRouter returned an invalid key response.');
      const keyInfo=result.data.data;
      return {paidLimitReached:(keyInfo.limit_remaining??Infinity)<=0||(keyInfo.effective_budget?.remaining_usd??Infinity)<=0,
        freeLimitReached:(keyInfo.free_model_daily_requests?.remaining??Infinity)<=0};
    },
    async models(signal){
      const catalog=z.object({data:z.array(z.unknown()).max(12000)}).safeParse(await request('endpoints/zdr',8_000_000,signal));
      if(!catalog.success) throw new CoachProviderError('OpenRouter returned an invalid model catalog.');
      const models=new Map<string,CoachModel>();
      const rejected={metadata:0,retention:0,capabilities:0,pricing:0};
      for(const entry of catalog.data.data){
        const parsed=endpointSchema.safeParse(entry);
        if(!parsed.success||parsed.data.model_id.toLowerCase().startsWith('openrouter/')){
          rejected.metadata++;
          continue;
        }
        const row=parsed.data;
        if(row.safety_retention){
          rejected.retention++;
          continue;
        }
        if(row.context_length<inputTokenReserve+outputTokens||
          (row.max_prompt_tokens??inputTokenReserve)<inputTokenReserve||(row.max_completion_tokens??outputTokens)<outputTokens||
          !row.supported_parameters.includes('max_tokens')){
          rejected.capabilities++;
          continue;
        }
        const pricing=endpointPricing.safeParse(row.pricing);
        if(!pricing.success||pricing.data.request!==0||pricing.data.overrides.length||
          pricing.data.internal_reasoning!==0||Math.max(pricing.data.input_cache_read,pricing.data.input_cache_write,
            pricing.data.input_cache_write_1h)>pricing.data.prompt){
          rejected.pricing++;
          continue;
        }
        const selection={model:row.model_id,endpoint:row.tag,prompt:pricing.data.prompt,completion:pricing.data.completion};
        const record:CoachModel={...selection,name:row.model_name,provider:row.provider_name,free:isFree(selection),
          capabilities:row.supported_parameters.slice(0,30),retention:'zero',medianLatency:row.latency_last_30m?.p50??undefined};
        const id=row.model_id+'|'+row.tag;
        const existing=models.get(id);
        if(!existing||reserveMicros(record)<reserveMicros(existing)) models.set(id,record);
      }
      const sorted=[...models.values()].sort((a,b)=>reserveMicros(a)-reserveMicros(b)||a.name.localeCompare(b.name));
      let diagnostic=null;
      if(!sorted.length){
        diagnostic=catalog.data.data.length===0?'OpenRouter returned no Zero Data Retention endpoints.':
          `OpenRouter returned ${catalog.data.data.length} Zero Data Retention endpoints, but none qualified for Coach. `+
          `Unsupported endpoint metadata or model ID: ${rejected.metadata}. Safety retention: ${rejected.retention}. `+
          `Missing output token limit support or insufficient token capacity: ${rejected.capabilities}. Unverified pricing: ${rejected.pricing}.`;
      }
      return {models:sorted,diagnostic};
    },
    async answer(selection,system,input,signal){
      return complete(selection,system,[{role:'user',content:input}],signal);
    },
    chat:complete,
    async plan(selection,system,messages,nativeTools,signal){
      const instruction=nativeTools?
        'Call the tools needed for the latest message. If none are needed, make no calls. Request up to four operations.' :
        'Return only JSON: {"operations":[{"name":"tool name","arguments":{}}]}. Use up to four operations, or an empty list if no tool is needed. Tool schemas: '+JSON.stringify(coachTools);
      const planningSystem=system+'\n'+instruction;
      const input=[planningSystem,...messages.map(row=>row.content)].join('');
      if(input.includes(key)||new TextEncoder().encode(input).length>coachInputBytes){
        throw new CoachProviderError('The coaching request exceeded the privacy or size limit.');
      }
      const raw=await request('chat/completions',128_000,signal,{
        model:selection.model,max_tokens:outputTokens,provider:routing(selection),
        messages:[{role:'system',content:planningSystem},...messages],
        ...(nativeTools?{tools:coachTools}:{}),
      });
      const parsed=z.object({model:modelId,usage:usageSchema,choices:z.tuple([z.object({message:z.object({
        role:z.literal('assistant'),content:z.string().max(6000).nullish(),
        tool_calls:z.array(z.object({type:z.literal('function'),function:z.object({
          name:z.string(),arguments:z.string().max(2000),
        })})).max(4).optional(),
      })})])}).safeParse(raw);
      const invalid=()=>new CoachProviderError('The selected model could not plan this request. Try again or choose a different model.');
      if(!parsed.success||parsed.data.model!==selection.model) throw invalid();
      const {usage,choices}=parsed.data;
      const {tool_calls,content}=choices[0].message;
      let plan;
      try{
        const value=nativeTools?{operations:(tool_calls??[]).map(call=>({
          name:call.function.name,arguments:JSON.parse(call.function.arguments),
        }))}:JSON.parse((content??'').trim().replace(/^```(?:json)?\s*|\s*```$/gi,''));
        plan=coachPlan.parse(value);
      }catch{throw invalid();}
      return {text:content??'',plan,promptTokens:usage.prompt_tokens,completionTokens:usage.completion_tokens,
        costMicros:Math.ceil(usage.cost*1_000_000)};
    },
  };
}
