import {z} from 'zod';
import {apiSession,privateJson,readJson} from '../../../lib/api-session';
import {topicSchema} from '../../../lib/coach-topics';
import {coachError,coachService,setupSchema} from '../../../lib/coach-service';
import {chatSchema,type ChatEvent} from '../../../lib/coach-chat';

export const maxDuration=120;

export async function GET(request:Request){
  const auth=await apiSession(request);
  if(auth.response) return auth.response;
  try{return privateJson(await coachService(auth.session).status());}
  catch(error){const failure=coachError(error);return privateJson({error:failure.message},failure.status);}
}

export async function POST(request:Request){
  const auth=await apiSession(request);
  if(auth.response) return auth.response;
  const input=await readJson(request);
  const ask=z.object({action:z.literal('ask'),topic:topicSchema}).safeParse(input);
  const setup=setupSchema.safeParse(input);
  const chat=chatSchema.safeParse(input);
  if(!ask.success&&!setup.success&&!chat.success) return privateJson({error:'Choose a valid Coach action or shorten your message.'},400);
  try{
    const coach=coachService(auth.session);
    if(chat.success){
      const command=chat.data;
      if((command.action==='send'||command.action==='retry')&&command.stream){
        const cancellation=new AbortController();
        const signal=AbortSignal.any([request.signal,cancellation.signal]);
        const encoder=new TextEncoder();
        const stream=new ReadableStream({
          async start(controller){
            const emit=(event:ChatEvent)=>{
              if(!signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));
            };
            try{
              const result=await coach.chat(command,signal,delta=>emit({delta}));
              if(result.turn) emit({turn:result.turn});
            }catch(error){emit({error:coachError(error).message});}
            finally{if(!cancellation.signal.aborted) controller.close();}
          },
          cancel(){cancellation.abort();},
        });
        return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'private, no-store, no-transform',
          Vary:'Authorization, Cookie','X-Accel-Buffering':'no'}});
      }
      return privateJson(await coach.chat(command,request.signal));
    }
    return privateJson(ask.success?await coach.ask(ask.data.topic,request.signal):await coach.setup(setup.data!,request.signal));
  }catch(error){const failure=coachError(error);return privateJson({error:failure.message},failure.status);}
}
