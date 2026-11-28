import 'server-only';
import {z} from 'zod';
import type {session} from './supabase';
import {credentialsConfigured,integrationCredentials} from './integration-credentials';
import {hevy,HevyError} from './hevy';

type Owner=Awaited<ReturnType<typeof session>>;
export async function connectHevy(owner:Owner,input:unknown,signal?:AbortSignal){
  if(!credentialsConfigured()) throw new HevyError('Encrypted integrations are unavailable on this workspace.');
  const key=z.string().trim().regex(/^[\x21-\x7e]{8,512}$/).safeParse(input);
  if(!key.success) throw new HevyError('Enter a valid Hevy API key.');
  const credentials=integrationCredentials(owner,'hevy');
  if(!await credentials.reserveCheck()) throw new HevyError('Wait 15 seconds before testing again.');
  const deadline=AbortSignal.timeout(12000);
  await hevy(key.data).test(signal?AbortSignal.any([signal,deadline]):deadline);
  await credentials.save(key.data);
  return key.data;
}
