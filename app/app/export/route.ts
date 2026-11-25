import {session} from '../../../lib/supabase';
import {dataFor} from '../../../lib/data';

export async function GET(){
  const {client}=await session();
  const data=await dataFor(client);
  return Response.json({version:1, exported_at:new Date().toISOString(), ...data},{headers:{
    'Content-Disposition':'attachment; filename="personalgymtrack.json"',
    'Cache-Control':'private, no-store',
  }});
}
