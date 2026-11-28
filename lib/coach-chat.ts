import {z} from 'zod';
import {coachInputBytes,type CoachMessage} from './coach-provider';
import {coachPersonality} from './coach-personality';
import {taggedUsernames} from './coach-partners';
import {maxMealText,type MealPreview} from './meal-preview';

export const chatConsent='I agree that OpenRouter and the selected AI provider process my typed messages, recent chat history, and summarized fitness records. GymTrack stores my conversations until I delete them. My OpenRouter workspace has prompt and response logging disabled.';
export const chatSuggestions=['What changed in my training this month?','Who do I usually train with?','Which lifts have improved most?'];
const uuid=z.uuid();
const prompt=z.string().trim().min(1).max(1800);
export const chatSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('conversations')}),
  z.object({action:z.literal('conversation'),id:uuid}),
  z.object({action:z.literal('new-chat'),id:uuid}),
  z.object({action:z.literal('rename-chat'),id:uuid,title:z.string().trim().min(1).max(80)}),
  z.object({action:z.literal('delete-chat'),id:uuid}),
  z.object({action:z.literal('chat-consent'),consent:z.literal(true)}),
  z.object({action:z.literal('send'),id:uuid,turn:uuid,prompt,mealDraft:uuid.optional(),
    mealDescription:z.string().trim().max(maxMealText).optional(),stream:z.boolean().default(false)}),
  z.object({action:z.literal('retry'),id:uuid,turn:uuid,stream:z.boolean().default(false)}),
]);
export type ChatCommand=z.input<typeof chatSchema>;
export type Conversation={id:string;title:string;updated_at:string};
export type CoachEvidence={label:string;dates:string[];details?:string[];mealDraft?:{description:string;day:string;preview:MealPreview}};
export type ChatTurn={id:string;prompt:string;answer:string|null;created_at:string;evidence?:CoachEvidence|null;local_analysis?:boolean};
export type ChatEvent={delta:string}|{turn:ChatTurn}|{error:string};
const bytes=(text:string)=>new TextEncoder().encode(text).length;
const credentials=/\b(?:bearer\s+[a-z\d._~+/=-]{16,}|sk-(?:or-v1-)?[a-z\d_-]{20,}|eyJ[a-z\d_-]+\.eyJ[a-z\d_-]+\.[a-z\d_-]+)\b/i;
export const validChatPrompt=(text:string)=>bytes(text)<=1800&&!credentials.test(text);
export const scrubCoachText=(text:string)=>text
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,'[email removed]')
  .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi,'[identifier removed]');

export function coachPrivacy(prompt:string,history:ChatTurn[],preferredName?:string){
  const aliases=new Map<string,string>();
  const handles=new Map<string,string>();
  function aliasFor(handle:string){
    const prior=aliases.get(handle);
    if(prior) return prior;
    if(aliases.size>=99) return '[handle removed]';
    const alias='Partner '+(aliases.size+1);
    aliases.set(handle,alias);
    handles.set(alias,handle);
    return alias;
  }
  for(const text of [prompt,...history.flatMap(turn=>[turn.prompt,turn.answer??''])]){
    for(const handle of taggedUsernames(text)) aliasFor(handle);
  }
  const name=preferredName?.trim();
  const privateName=name&&/^[\p{L}\p{M} '-]{2,40}$/u.test(name)?name:undefined;
  const namePattern=privateName?new RegExp('(?<![\\p{L}\\p{N}])'+privateName+'(?![\\p{L}\\p{N}])','giu'):undefined;
  return {
    hasPreferredName:Boolean(privateName),
    text:(text:string)=>{
      const safe=scrubCoachText(text).replace(/(?<!@)@([\p{L}\p{N}_]+(?:\.+[\p{L}\p{N}_]+)*)/gu,
        (_,handle:string)=>aliases.get(handle.toLowerCase())??'[handle removed]');
      return namePattern?safe.replace(namePattern,'[athlete]'):safe;
    },
    handles,
    aliasFor,
    restore:(text:string)=>text.replace(/\bPartner [1-9][0-9]?\b/g,alias=>handles.has(alias)?'@'+handles.get(alias):alias)
      .replaceAll('[athlete]',privateName??''),
  };
}

export function conversationContext(evidence:string,history:ChatTurn[],prompt:string,options?:{
  capabilities?:string;privacy?:ReturnType<typeof coachPrivacy>;budget?:number;
}){
  const instructions=coachPersonality+(options?.capabilities?'\n'+options.capabilities:'');
  const scrub=options?.privacy?.text??scrubCoachText;
  const budget=options?.budget??coachInputBytes;
  const current={role:'user',content:scrub(prompt)} as const;
  const withEvidence=instructions+'\nFitness evidence (JSON): '+evidence;
  const system=bytes(withEvidence+current.content)<=budget?withEvidence:instructions+'\nThe fitness summary exceeded the size limit.';
  let remaining=budget-bytes(system+current.content);
  const messages:CoachMessage[]=[];
  for(const turn of history.slice(0,4)){
    if(!turn.answer||turn.local_analysis&&!options?.privacy||credentials.test(turn.prompt)||credentials.test(turn.answer)) continue;
    const previous=scrub(turn.prompt);
    const answer=turn.local_analysis&&options?.privacy?
      'Local analysis. Known references: '+[...taggedUsernames(turn.answer)].slice(0,8).map(handle=>scrub('@'+handle)).join(', '):scrub(turn.answer);
    remaining-=bytes(previous+answer);
    if(remaining<0) break;
    messages.unshift({role:'user',content:previous},{role:'assistant',content:answer});
  }
  messages.push(current);
  return {system,messages};
}
