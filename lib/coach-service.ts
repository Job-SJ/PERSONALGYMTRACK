import 'server-only';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {apiSession} from './api-session';
import {coachInstructions} from './coach-context';
import {coachPrivacy,conversationContext,validChatPrompt,type ChatCommand,type ChatTurn} from './coach-chat';
import {coachCapabilities,type CoachAnalysis} from './coach-tools';
import {dayKey,estimate} from './analytics';
import type {Topic} from './coach-topics';
import {loadCoachingContext} from './coach-data';
import {CoachEvidenceError,retrieveCoachEvidence} from './coach-retrieval';
import {CoachConnectionError,CoachProviderError,isFree,openRouter,reserveChatMicros,reserveMicros,selectionSchema} from './coach-provider';
import {credentialsConfigured,integrationCredentials,operatorDb} from './integration-credentials';
import {isMealLogMessage,parseMealText} from './meal-preview';
import {portionSchema} from './nutrition';
import {previewMeal} from './nutrition-service';

type SignedIn=NonNullable<Awaited<ReturnType<typeof apiSession>>['session']>;
const credentialSource=z.enum(['personal','instance']);
export const setupSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('discover'),source:credentialSource,key:z.string().trim().regex(/^[\x21-\x7e]{10,512}$/).optional()}),
  z.object({action:z.literal('enable'),source:credentialSource,selection:selectionSchema,monthlyUsd:z.number().min(0).max(50),consent:z.literal(true),chatConsent:z.literal(true).optional()}),
  z.object({action:z.enum(['disable','remove','delete-history','rotate'])}),
]);
const settingsSchema=z.object({
  enabled:z.boolean(),consent_at:z.string().nullable(),chat_consent_at:z.string().nullable(),model:z.string(),endpoint:z.string(),
  credential_source:credentialSource,prompt_price:z.coerce.number(),completion_price:z.coerce.number(),
  monthly_micros:z.coerce.number(),revision:z.uuid(),
});
export class CoachError extends Error {
  constructor(message:string,readonly status=400){super(message);}
}
export const coachError=(error:unknown)=>error instanceof CoachError?{message:error.message,status:error.status}:
  error instanceof CoachEvidenceError?{message:error.message,status:503}:
  error instanceof CoachProviderError?{message:error.message,status:502}:{message:'Coach is temporarily unavailable.',status:503};

export function coachService(auth:SignedIn){
  const admin=operatorDb();
  if(!admin||!credentialsConfigured()) throw new CoachError('The instance administrator needs to configure encrypted integrations.',503);
  const client=admin;
  const id=auth.user.id;
  const vault=integrationCredentials(auth,'openrouter');
  const fields='enabled,consent_at,chat_consent_at,model,endpoint,credential_source,prompt_price,completion_price,monthly_micros,revision';
  const conversationFields='id,title,updated_at';
  const turnFields='id,prompt,answer,created_at,evidence,local_analysis';
  const conversations=()=>client.from('coach_conversations');
  const turns=()=>client.from('coach_turns');
  const usage=()=>client.from('coach_usage');
  const settings=()=>client.from('coach_settings');
  const checked=<T>(result:{data:T;error:unknown})=>{
    if(result.error) throw new CoachError('Coach storage is unavailable. Ask the administrator to check the database migrations.',503);
    return result.data;
  };
  async function configuration(){
    const data=checked(await settings().select(fields).eq('user_id',id).maybeSingle());
    return data ? settingsSchema.parse(data) : null;
  }
  async function provider(source:z.infer<typeof credentialSource>,replacement?:string){
    const key=source==='instance'?process.env.OPENROUTER_INSTANCE_KEY:replacement??await vault.read();
    if(!key) throw new CoachError(source==='instance'?'The administrator has not configured an instance key.':'Enter your OpenRouter key.');
    const timeout=Number(process.env.OPENROUTER_TIMEOUT_MS??20000);
    return openRouter(key,fetch,Number.isFinite(timeout)?Math.max(1000,Math.min(45000,timeout)):20000);
  }
  async function disable(){
    checked(await settings().update({enabled:false,consent_at:null,chat_consent_at:null,revision:crypto.randomUUID()}).eq('user_id',id));
  }
  async function chat(command:ChatCommand,signal:AbortSignal,onDelta?:(delta:string)=>void){
    if(command.action==='conversations'){
      return {conversations:checked(await auth.client.from('coach_conversations').select(conversationFields)
        .eq('user_id',id).order('updated_at',{ascending:false}).order('id').limit(100))??[]};
    }
    if(command.action==='chat-consent'){
      const saved=checked(await settings().update({chat_consent_at:new Date().toISOString(),revision:crypto.randomUUID()})
        .eq('user_id',id).eq('enabled',true).not('consent_at','is',null).select('user_id').maybeSingle());
      if(!saved) throw new CoachError('Enable Coach in settings before granting chat consent.',403);
      return {saved:true};
    }
    if(command.action==='new-chat'){
      const setting=await configuration();
      if(!setting?.enabled||!setting.chat_consent_at) throw new CoachError('Enable Coach and grant chat consent in settings.',403);
      const result=await conversations().insert({id:command.id,user_id:id}).select(conversationFields).single();
      if(result.error?.code==='P0001') throw new CoachError('Delete a conversation before starting another.',409);
      const conversation=checked(result);
      return {conversation};
    }
    const conversation=checked(await auth.client.from('coach_conversations').select(conversationFields)
      .eq('id',command.id).eq('user_id',id).maybeSingle());
    if(!conversation) throw new CoachError('Conversation not found.',404);
    if(command.action==='rename-chat'){
      checked(await conversations().update({title:command.title}).eq('id',command.id).eq('user_id',id));
      return {saved:true};
    }
    if(command.action==='delete-chat'){
      checked(await conversations().delete().eq('id',command.id).eq('user_id',id));
      return {saved:true};
    }
    if(command.action==='conversation'){
      const rows=checked(await auth.client.from('coach_turns').select(turnFields).eq('conversation_id',command.id)
        .eq('user_id',id).order('created_at').order('id').limit(120))??[];
      return {turns:rows};
    }

    const setting=await configuration();
    if(!setting?.enabled||!setting.consent_at||!setting.chat_consent_at) throw new CoachError('Enable Coach and grant chat consent in settings.',403);
    const revision=setting.revision;
    const selection=selectionSchema.parse({model:setting.model,endpoint:setting.endpoint,prompt:setting.prompt_price,completion:setting.completion_price});
    const [recent,existing]=await Promise.all([
      turns().select(turnFields).eq('conversation_id',command.id).eq('user_id',id)
        .order('created_at',{ascending:false}).order('id',{ascending:false}).limit(5),
      turns().select(turnFields).eq('conversation_id',command.id).eq('user_id',id).eq('id',command.turn).maybeSingle(),
    ]);
    const history=checked(recent) as ChatTurn[];
    let turn=checked(existing) as ChatTurn|null;
    if(turn&&command.action==='send'&&command.prompt!==turn.prompt) throw new CoachError('This message already exists.',409);
    if(turn?.answer) return {turn};
    if(turn&&turn.id!==history[0]?.id) throw new CoachError('Only the latest message can be retried.',409);
    const prompt=turn?.prompt??(command.action==='send'?command.prompt:'');
    if(!prompt) throw new CoachError('Message not found.',404);
    if(!validChatPrompt(prompt)) throw new CoachError('Use up to 1,800 UTF-8 bytes and remove any credentials from your message.');
    signal.throwIfAborted();
    const previous=history.filter(row=>row.id!==command.turn);
    const today=dayKey(new Date());
    const partnerLookup=/^(?:who (?:do|did) i (?:usually |normally |last )?train with|met wie train ik(?: meestal)?)[?.!]*$/i.test(prompt);
    const mealDescription=isMealLogMessage(prompt)&&!/[?]|\b(?:yesterday|gisteren|tomorrow|morgen|compare|vergelijk|\d{4}-\d{2}-\d{2})\b/i.test(prompt)?prompt:null;
    const local=partnerLookup||Boolean(mealDescription);
    const perCall=reserveMicros(selection);
    const reservation=local?0:reserveChatMicros(selection);
    const requestId=checked(await client.rpc('reserve_coach_request',{owner_id:id,settings_revision:setting.revision,cost_micros:reservation}));
    if(!requestId) throw new CoachError('Coach is cooling down or has reached the monthly usage limit.',429);
    let sent=false;
    try{
      const attempt=crypto.randomUUID();
      const started=new Date();
      const claim={attempt,started_at:started.toISOString()};
      checked(await turns().update({attempt:null,started_at:null}).eq('conversation_id',command.id)
        .eq('user_id',id).lt('started_at',new Date(started.getTime()-120_000).toISOString()));
      if(!turn){
        const result=await turns().insert({id:command.turn,conversation_id:command.id,user_id:id,prompt,...claim}).select(turnFields).single();
        if(result.error?.code==='P0001') throw new CoachError('This conversation is full. Start a new chat.',409);
        if(result.error?.code==='23505') throw new CoachError('A message in this conversation is already being processed.',409);
        turn=checked(result) as ChatTurn;
      }else{
        const result=await turns().update(claim).eq('id',turn.id).eq('conversation_id',command.id).eq('user_id',id)
          .is('answer',null).is('attempt',null).select('id').maybeSingle();
        if(result.error?.code==='23505'||!checked(result)) throw new CoachError('A message in this conversation is already being processed.',409);
      }
      try{
        checked(await conversations().update({updated_at:started.toISOString()}).eq('id',command.id).eq('user_id',id));
        const connection=local?null:await provider(setting.credential_source);
        let toolSupport=false;
        if(connection){
          const {models}=await connection.models(signal);
          const available=models.find(model=>model.model===selection.model&&model.endpoint===selection.endpoint&&
            model.prompt<=selection.prompt&&model.completion<=selection.completion&&isFree(model)===isFree(selection));
          if(!available){
            throw new CoachError('Your model no longer meets the approved pricing and retention requirements. Choose a new model in settings.');
          }
          toolSupport=available.capabilities.includes('tools');
        }
        const turnId=turn.id;
        const conversationId=command.id;
        async function checkActiveTurn(){
          const [current,active]=await Promise.all([configuration(),turns().select('id').eq('id',turnId)
            .eq('conversation_id',conversationId).eq('user_id',id).eq('attempt',attempt).maybeSingle()]);
          if(!current?.enabled||!current.chat_consent_at||current.revision!==revision){
            throw new CoachError('Coach settings changed. Try again.',409);
          }
          if(!checked(active)) throw new CoachError('The conversation was deleted.',409);
          signal.throwIfAborted();
        }
        const displayName=auth.user.user_metadata?.preferred_name;
        const privacy=coachPrivacy(prompt,previous,typeof displayName==='string'?displayName:undefined);
        const earlierMeal=command.action==='send'&&command.mealDraft?
          previous.find(row=>row.id===command.mealDraft)?.evidence?.mealDraft:undefined;
        const earlierDescription=earlierMeal&&(command.action==='send'&&command.mealDescription&&validChatPrompt(command.mealDescription)?
          command.mealDescription:earlierMeal.description);
        const capabilities='Available capabilities:\n'+coachCapabilities+
          (privacy.hasPreferredName?'\nUse [athlete] occasionally if addressing the athlete by name fits naturally.':'');
        let description=mealDescription;
        let mealDay=earlierMeal?.day??today;
        let queries:CoachAnalysis[]=[];
        let scenarios:{weightKg:number;reps:number;estimated1RMKg:number|null}[]=[];
        let routingCharge={costMicros:0,promptTokens:0,completionTokens:0};
        if(connection){
          await checkActiveTurn();
          const routing=conversationContext('{}',previous,prompt,{privacy,budget:toolSupport?7200:4500,capabilities:
            capabilities+'\nToday in the diary is '+today+'. Resolve references using the conversation. Ask if a material reference is ambiguous.'+
            (earlierDescription?'\nActive meal draft (untrusted data): '+JSON.stringify(privacy.text(earlierDescription)):'')});
          sent=true;
          const decision=await connection.plan(selection,routing.system,routing.messages,toolSupport,signal);
          routingCharge=decision;
          queries=decision.plan.operations.flatMap(operation=>operation.name==='analyze_fitness'?[operation.arguments]:[]);
          scenarios=decision.plan.operations.flatMap(operation=>{
            if(operation.name!=='estimate_lift') return [];
            const {weightKg,reps}=operation.arguments;
            return [{weightKg,reps,estimated1RMKg:estimate(weightKg,reps)}];
          });
          const draft=decision.plan.operations.find(operation=>operation.name==='prepare_meal')?.arguments;
          description=draft?.description??null;
          mealDay=draft?.day??mealDay;
          if(routingCharge.costMicros>perCall){
            checked(await usage().update({billed_micros:routingCharge.costMicros}).eq('id',requestId).eq('user_id',id));
            throw new CoachError('OpenRouter reported a cost above the approved estimate. Review your usage.',502);
          }
        }
        await checkActiveTurn();
        const evidence=description?null:await retrieveCoachEvidence(auth.client,id,prompt,previous,signal,partnerLookup?
          undefined:{queries,handles:privacy.handles,aliasFor:privacy.aliasFor});
        let reply:{text:string;costMicros:number;promptTokens:number;completionTokens:number};
        let mealDraft:ChatTurn['evidence'];
        if(description){
          const dutch=/\b(ik|mijn|voor|ontbijt|avondeten|gram|maak|daar|nog|doe|naar|verander)\b/i.test(prompt);
          const dateError=mealDay>today?(dutch?'Kies vandaag of een datum in het verleden.':'Choose today or a past date.'):null;
          let result:Awaited<ReturnType<typeof previewMeal>>={error:dateError??'Give me up to six foods with their amounts, separated by commas.'};
          if(!dateError) try{
            parseMealText(description);
            const saved=await auth.client.from('nutrition_library').select('portions').eq('user_id',id).eq('kind','food').limit(200).abortSignal(signal);
            const foods=(saved.data??[]).flatMap(row=>Array.isArray(row.portions)?row.portions.flatMap(portion=>{
              const parsed=portionSchema.safeParse(portion);
              return parsed.success?[parsed.data.food]:[];
            }):[]);
            result=await previewMeal(description,foods);
          }catch{signal.throwIfAborted();}
          if(result.preview){
            mealDraft={label:'Meal preview',dates:[],mealDraft:{description,day:mealDay,preview:result.preview}};
          }
          const review=dutch?'Kijk dit even na en bevestig het als het klopt.':'Check the portions, then confirm when they look right.';
          const dateLabel=mealDay===today?'':(dutch?'Maaltijd voor ':'Meal for ')+mealDay+'. ';
          reply={text:result.preview?dateLabel+review:dateError??(dutch?'Noem maximaal zes producten, met de hoeveelheden als je die weet.':
            result.error??'I couldn’t prepare that meal.'),
            costMicros:0,promptTokens:0,completionTokens:0};
        }else if(evidence?.local){
          reply={text:evidence.local.text,costMicros:0,promptTokens:0,completionTokens:0};
        }else{
          const material=scenarios.length?JSON.stringify({...JSON.parse(evidence?.material??'{}'),hypothetical:scenarios}):evidence?.material??'{}';
          const context=conversationContext(material,previous,prompt,{privacy,
            capabilities:capabilities+'\nPlanning for this turn is complete. If more evidence is needed, explain the gap or ask a focused question. Never claim an operation ran unless its result is present.'});
          sent=true;
          reply=await connection!.chat(selection,context.system,context.messages,signal,privacy.handles.size||privacy.hasPreferredName?undefined:onDelta);
          reply.text=privacy.restore(reply.text);
        }
        const billed=reply.costMicros+routingCharge.costMicros;
        checked(await usage().update({billed_micros:billed,prompt_tokens:reply.promptTokens+routingCharge.promptTokens,
          completion_tokens:reply.completionTokens+routingCharge.completionTokens})
          .eq('id',requestId).eq('user_id',id));
        if(billed>reservation||reply.costMicros>perCall) throw new CoachError('OpenRouter reported a cost above the approved estimate. Review your usage.',502);
        signal.throwIfAborted();
        const after=await configuration();
        if(after?.revision!==setting.revision) throw new CoachError('Coach settings changed during generation.',409);
        const saved=checked(await turns().update({answer:reply.text,attempt:null,started_at:null,
          evidence:mealDraft??evidence?.local?.evidence??evidence?.references??null,local_analysis:Boolean(evidence?.local)})
          .eq('id',turn.id).eq('conversation_id',command.id).eq('user_id',id).eq('attempt',attempt).select(turnFields).maybeSingle());
        if(!saved) throw new CoachError('The conversation changed during generation.',409);
        return {turn:saved as ChatTurn};
      }finally{
        checked(await turns().update({attempt:null,started_at:null}).eq('id',turn.id)
          .eq('conversation_id',command.id).eq('user_id',id).eq('attempt',attempt));
      }
    }finally{
      if(!sent) checked(await usage().update({billed_micros:0}).eq('id',requestId).eq('user_id',id));
    }
  }
  return {
    chat,
    async status(signal?:AbortSignal){
      const now=new Date();
      const month=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString();
      const cutoff=new Date(Date.now()-90*86400000).toISOString();
      const [personal,setting,history,currentUsage,schema,workoutSchema]=await Promise.all([
        vault.connected(),configuration(),
        usage().select('id,created_at,topic,answer').eq('user_id',id).not('answer','is',null).gte('created_at',cutoff).order('created_at',{ascending:false}).limit(20),
        usage().select('reserved_micros,billed_micros,prompt_tokens,completion_tokens').eq('user_id',id).gte('created_at',month).limit(240),
        auth.client.from('coach_turns').select('evidence').eq('user_id',id).limit(0),
        auth.client.from('workouts').select('routine_id').eq('user_id',id).limit(0),
      ]);
      checked(schema);
      checked(workoutSchema);
      const rows=checked(currentUsage)??[];
      const usd=rows.reduce((sum,row)=>sum+Number(row.billed_micros??row.reserved_micros),0)/1_000_000;
      let connectionIssue:null|'invalid-key'|'credit-limit'|'unavailable-model'|'provider-outage'=null;
      if(setting?.enabled&&setting.chat_consent_at&&(setting.credential_source==='personal'?personal:process.env.OPENROUTER_INSTANCE_KEY)){
        const selection=selectionSchema.parse({model:setting.model,endpoint:setting.endpoint,prompt:setting.prompt_price,completion:setting.completion_price});
        try{
          const connection=await provider(setting.credential_source);
          const [key,{models}]=await Promise.all([connection.test(signal),connection.models(signal)]);
          if(!models.some(model=>model.model===selection.model&&model.endpoint===selection.endpoint&&
            model.prompt<=selection.prompt&&model.completion<=selection.completion&&model.free===isFree(selection))) connectionIssue='unavailable-model';
          else if(isFree(selection)?key.freeLimitReached:key.paidLimitReached) connectionIssue='credit-limit';
        }catch(error){
          connectionIssue=error instanceof CoachConnectionError?error.kind:'provider-outage';
        }
      }
      const exposed=setting?{enabled:setting.enabled,model:setting.model,credential_source:setting.credential_source,
        monthly_micros:setting.monthly_micros,chatConsent:Boolean(setting.chat_consent_at)}:null;
      return {personal,instance:Boolean(process.env.OPENROUTER_INSTANCE_KEY),setting:exposed,history:checked(history)??[],connectionIssue,
        usage:{requests:rows.length,usd,
          tokens:rows.reduce((sum,row)=>sum+(row.prompt_tokens??0)+(row.completion_tokens??0),0)}};
    },
    async setup(input:z.infer<typeof setupSchema>,signal?:AbortSignal){
      if(input.action==='discover'){
        if(!await vault.reserveCheck()) throw new CoachError('Wait 15 seconds before testing again.',429);
        if(input.source==='instance'&&input.key) throw new CoachError('Use the personal option for a replacement key.');
        const connection=await provider(input.source,input.key);
        const [keyInfo,{models,diagnostic}]=await Promise.all([connection.test(signal),connection.models(signal)]);
        if(input.key){
          await disable();
          await vault.save(input.key);
        }
        const eligible=models.filter(model=>model.free?!keyInfo.freeLimitReached:!keyInfo.paidLimitReached);
        return {models:eligible.slice(0,300),diagnostic:diagnostic??(!eligible.length?'The OpenRouter key has no remaining usable budget or free requests.':null)};
      }
      if(input.action==='enable'){
        if(!await vault.reserveCheck(true)) throw new CoachError('Wait 15 seconds before saving again.',429);
        const connection=await provider(input.source);
        const {models,diagnostic}=await connection.models(signal);
        if(diagnostic) throw new CoachError(diagnostic);
        const selected=models.find(model=>model.model===input.selection.model&&model.endpoint===input.selection.endpoint);
        if(!selected||selected.prompt!==input.selection.prompt||selected.completion!==input.selection.completion){
          throw new CoachError('The model or its pricing changed. Test the connection and choose a model again.');
        }
        const monthlyMicros=Math.floor(input.monthlyUsd*1_000_000);
        if(reserveChatMicros(selected)>monthlyMicros) throw new CoachError('This budget is below the maximum cost of planning and answering one chat message. Choose a lower-priced model or update the budget.');
        checked(await settings().upsert({user_id:id,enabled:true,consent_at:new Date().toISOString(),revision:crypto.randomUUID(),
          model:selected.model,endpoint:selected.endpoint,credential_source:input.source,prompt_price:selected.prompt,
          completion_price:selected.completion,monthly_micros:monthlyMicros,chat_consent_at:input.chatConsent?new Date().toISOString():null}));
      }
      if(input.action==='disable'||input.action==='remove') await disable();
      if(input.action==='remove') await vault.disconnect();
      if(input.action==='rotate'){
        const key=await vault.read();
        if(!key) throw new CoachError('There is no personal key to rotate.');
        await vault.save(key);
      }
      if(input.action==='delete-history'){
        checked(await usage().update({discarded:true,answer:null,topic:null,context_hash:null}).eq('user_id',id));
        checked(await conversations().delete().eq('user_id',id));
      }
      return {saved:true};
    },
    async ask(topic:Topic,signal:AbortSignal){
      const setting=await configuration();
      if(!setting?.enabled||!setting.consent_at) throw new CoachError('Enable Coach and grant data processing consent in setup.',403);
      const selection=selectionSchema.parse({model:setting.model,endpoint:setting.endpoint,prompt:setting.prompt_price,completion:setting.completion_price});
      const connection=await provider(setting.credential_source);
      const context=await loadCoachingContext(auth.client,topic);
      const hash=createHash('sha256').update(setting.revision).update(coachInstructions).update(context).digest('hex');
      const cached=checked(await usage().select('id,created_at,topic,answer').eq('user_id',id).eq('context_hash',hash)
        .gt('created_at',new Date(Date.now()-86400000).toISOString()).not('answer','is',null).order('created_at',{ascending:false}).limit(1).maybeSingle());
      if(cached) return cached;
      const reservation=reserveMicros(selection);
      const requestId=checked(await client.rpc('reserve_coach_request',{owner_id:id,settings_revision:setting.revision,cost_micros:reservation}));
      if(!requestId) throw new CoachError('Coach is cooling down or has reached the monthly usage limit. Review your settings or try again later.',429);
      signal.throwIfAborted();
      const {models}=await connection.models(signal);
      const available=models.some(model=>model.model===selection.model&&model.endpoint===selection.endpoint&&
        model.prompt<=selection.prompt&&model.completion<=selection.completion&&isFree(model)===isFree(selection));
      if(!available){
        checked(await usage().update({billed_micros:0}).eq('id',requestId).eq('user_id',id));
        throw new CoachError('Your model no longer meets the approved pricing and retention requirements. Choose a new model in setup.');
      }
      const current=await configuration();
      if(!current?.enabled||current.revision!==setting.revision){
        checked(await usage().update({billed_micros:0}).eq('id',requestId).eq('user_id',id));
        throw new CoachError('Coach settings changed during this request. Try again when ready.',409);
      }
      const reply=await connection.answer(selection,coachInstructions,context,signal);
      checked(await usage().update({billed_micros:reply.costMicros,prompt_tokens:reply.promptTokens,completion_tokens:reply.completionTokens})
        .eq('id',requestId).eq('user_id',id));
      if(reply.costMicros>reservation) throw new CoachError('OpenRouter reported a cost above the approved estimate. Review your usage.',502);
      const row=checked(await usage().update({topic,answer:reply.text,context_hash:hash}).eq('id',requestId).eq('user_id',id)
        .eq('discarded',false).select('id,created_at,topic,answer').maybeSingle());
      if(!row) throw new CoachError('This conversation was cleared while the answer was in progress.',409);
      return row;
    },
  };
}
