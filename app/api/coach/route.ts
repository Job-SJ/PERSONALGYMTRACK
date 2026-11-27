import {z} from 'zod';
import {apiSession,privateJson,readJson} from '../../../lib/api-session';
import {topicSchema} from '../../../lib/coach-topics';
import {coachError,coachService,setupSchema} from '../../../lib/coach-service';

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
  if(!ask.success&&!setup.success) return privateJson({error:'Choose a valid Coach action.'},400);
  try{
    const coach=coachService(auth.session);
    return privateJson(ask.success?await coach.ask(ask.data.topic,request.signal):await coach.setup(setup.data!,request.signal));
  }catch(error){const failure=coachError(error);return privateJson({error:failure.message},failure.status);}
}
