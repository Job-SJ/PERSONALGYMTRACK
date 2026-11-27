import {z} from 'zod';

export const outputTokens=700;
export const coachInputBytes=8000;
const inputTokenReserve=16000;
const modelId=z.string().max(160).regex(/^[a-z0-9._-]+\/[a-z0-9._:-]+$/i);
const tag=z.string().max(100).regex(/^[a-z0-9._/-]+$/);
const price=z.union([z.number(),z.string().regex(/^\d+(?:\.\d+)?(?:e-\d+)?$/i)]).transform(Number).pipe(z.number().min(0).max(1));
const endpointSchema=z.object({
  model_id:modelId,model_name:z.string().min(1).max(160),provider_name:z.string().min(1).max(100),tag,
  context_length:z.number().int().min(inputTokenReserve+outputTokens),
  max_prompt_tokens:z.number().int().nullable().optional(),
  max_completion_tokens:z.number().int().nullable().optional(),
  supported_parameters:z.array(z.string()).max(100),
  pricing:z.object({prompt:price,completion:price,request:price.optional()}),
});
export const selectionSchema=z.object({model:modelId,endpoint:tag,prompt:z.number().min(0).max(1),completion:z.number().min(0).max(1)});
export type Selection=z.infer<typeof selectionSchema>;
export type CoachModel=Selection&{name:string;provider:string;free:boolean;capabilities:string[];retention:'zero'};
export const isFree=(selection:Selection)=>selection.prompt===0&&selection.completion===0;
export const reserveMicros=(selection:Selection)=>Math.ceil((selection.prompt*inputTokenReserve+selection.completion*outputTokens)*1_000_000);

export class CoachProviderError extends Error {}
type Answer={text:string;promptTokens:number;completionTokens:number;costMicros:number};
export interface CoachProvider {
  test(signal?:AbortSignal):Promise<void>;
  models(signal?:AbortSignal):Promise<CoachModel[]>;
  answer(selection:Selection,system:string,input:string,signal?:AbortSignal):Promise<Answer>;
}

const completionSchema=z.object({
  model:modelId,
  choices:z.tuple([z.object({finish_reason:z.enum(['stop','length']),message:z.object({
    role:z.literal('assistant'),content:z.string().trim().min(1).max(6000),tool_calls:z.array(z.unknown()).max(0).optional(),
  })})]),
  usage:z.object({
    prompt_tokens:z.number().int().nonnegative().max(inputTokenReserve),
    completion_tokens:z.number().int().nonnegative().max(outputTokens),
    cost:z.number().nonnegative(),
  }),
});

export function openRouter(key:string,transport=fetch,timeout=20_000):CoachProvider{
  async function request(path:string,limit:number,signal?:AbortSignal,body?:unknown){
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
        if(response.status===401||response.status===403) throw new CoachProviderError('OpenRouter rejected the connection. Review your key and privacy settings.');
        if(response.status===402) throw new CoachProviderError('Check the credit or spending limit on this OpenRouter key.');
        if(response.status===429) throw new CoachProviderError('OpenRouter is busy. Try again later.');
        throw new CoachProviderError('OpenRouter could not serve this request. Review the model or try again later.');
      }
      const reader=response.body.getReader();
      const decoder=new TextDecoder();
      let text='';
      let bytes=0;
      try{
        for(;;){
          const {done,value}=await reader.read();
          if(done) return JSON.parse(text+decoder.decode()) as unknown;
          bytes+=value.byteLength;
          if(bytes>limit){await reader.cancel();throw new CoachProviderError('OpenRouter returned an oversized response.');}
          text+=decoder.decode(value,{stream:true});
        }
      }finally{reader.releaseLock();}
    }catch(error){
      if(error instanceof CoachProviderError) throw error;
      throw new CoachProviderError(signal?.aborted?'Request cancelled.':'OpenRouter is unavailable or returned an invalid response.');
    }
  }
  return {
    async test(signal){
      const result=z.object({data:z.object({label:z.string(),is_management_key:z.literal(false).optional(),
        is_provisioning_key:z.literal(false).optional()})}).safeParse(await request('key',65536,signal));
      if(!result.success) throw new CoachProviderError('OpenRouter returned an invalid key response.');
    },
    async models(signal){
      const catalog=z.object({data:z.array(z.unknown()).max(12000)}).safeParse(await request('endpoints/zdr',8_000_000,signal));
      if(!catalog.success) throw new CoachProviderError('OpenRouter returned an invalid model catalog.');
      const models=new Map<string,CoachModel>();
      for(const entry of catalog.data.data){
        const parsed=endpointSchema.safeParse(entry);
        if(!parsed.success) continue;
        const row=parsed.data;
        if(row.model_id.startsWith('openrouter/')||row.model_id.includes('@')||row.pricing.request!==0||
          (row.max_prompt_tokens??inputTokenReserve)<inputTokenReserve||(row.max_completion_tokens??outputTokens)<outputTokens||
          !row.supported_parameters.includes('max_tokens')) continue;
        const selection={model:row.model_id,endpoint:row.tag,prompt:row.pricing.prompt,completion:row.pricing.completion};
        const record:CoachModel={...selection,name:row.model_name,provider:row.provider_name,free:isFree(selection),
          capabilities:row.supported_parameters.slice(0,30),retention:'zero'};
        const id=row.model_id+'|'+row.tag;
        const existing=models.get(id);
        if(!existing||reserveMicros(record)<reserveMicros(existing)) models.set(id,record);
      }
      return [...models.values()].sort((a,b)=>reserveMicros(a)-reserveMicros(b)||a.name.localeCompare(b.name));
    },
    async answer(selection,system,input,signal){
      if(new TextEncoder().encode(system+input).length>coachInputBytes) throw new CoachProviderError('The coaching summary is too large.');
      const raw=await request('chat/completions',128_000,signal,{
        model:selection.model,max_tokens:outputTokens,stream:false,
        messages:[{role:'system',content:system},{role:'user',content:input}],
        provider:{only:[selection.endpoint],allow_fallbacks:false,require_parameters:true,
          data_collection:'deny',zdr:true,max_price:{prompt:selection.prompt*1_000_000,completion:selection.completion*1_000_000,request:0,image:0}},
      });
      const parsed=completionSchema.safeParse(raw);
      if(!parsed.success||parsed.data.model!==selection.model) throw new CoachProviderError('OpenRouter returned an invalid coaching response.');
      const {usage,choices}=parsed.data;
      return {text:choices[0].message.content,promptTokens:usage.prompt_tokens,
        completionTokens:usage.completion_tokens,costMicros:Math.ceil(usage.cost*1_000_000)};
    },
  };
}
