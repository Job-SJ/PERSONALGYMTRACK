import {session} from '../../../lib/supabase';
import {Shell} from '../../../components/shell';
import {Notifications} from '../../../components/notifications';

export default async function NotificationsPage(){
  const {client}=await session();
  const prefs=await client.from('preferences').select('theme').maybeSingle();
  return <Shell theme={prefs.data?.theme??'dark'}><Notifications/></Shell>;
}
