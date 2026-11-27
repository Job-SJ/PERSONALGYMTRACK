import {apiSession,privateJson,readJson} from '../../../lib/api-session';
import {operatorDb} from '../../../lib/integration-credentials';
import {changeNotifications,notificationCommand,notificationState} from '../../../lib/notification-service';

export async function GET(request:Request){
  const auth=await apiSession(request);
  if(auth.response) return auth.response;
  const admin=operatorDb();
  if(!admin) return privateJson({error:'Ask the administrator to enable notifications.'},503);
  try{return privateJson(await notificationState(admin,auth.session.user.id));}
  catch{return privateJson({error:'Notification storage is unavailable.'},503);}
}
export async function POST(request:Request){
  const auth=await apiSession(request);
  if(auth.response) return auth.response;
  const admin=operatorDb();
  if(!admin) return privateJson({error:'Ask the administrator to enable notifications.'},503);
  const input=notificationCommand.safeParse(await readJson(request));
  if(!input.success) return privateJson({error:'Check the notification settings or device registration.'},400);
  try{return privateJson(await changeNotifications(admin,auth.session.user.id,input.data));}
  catch{return privateJson({error:'Notification settings could not be saved.'},503);}
}
