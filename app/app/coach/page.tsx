import {Shell} from '../../../components/shell';
import {Coach} from '../../../components/coach';
import {session} from '../../../lib/supabase';

export default async function CoachPage(){
  const {client}=await session();
  const prefs=await client.from('preferences').select('theme').maybeSingle();
  return <Shell theme={prefs.data?.theme??'dark'}><Coach/></Shell>;
}
