import {createHash,timingSafeEqual} from 'node:crypto';
import {privateJson} from '../../../../lib/api-session';
import {operatorDb} from '../../../../lib/integration-credentials';
import {runNotifications} from '../../../../lib/notification-service';

export const maxDuration=120;
const digest=(value:string)=>createHash('sha256').update(value).digest();
export async function POST(request:Request){
  const secret=process.env.PGT_NOTIFICATION_JOB_SECRET;
  if(!secret||secret.length<32||!timingSafeEqual(digest(request.headers.get('authorization')??''),digest('Bearer '+secret))){
    return privateJson({error:'Job authorization required.'},401);
  }
  const admin=operatorDb();
  if(!admin) return privateJson({error:'Configure the scheduler database connection.'},503);
  try{
    const result=await runNotifications(admin);
    return privateJson(result,result.errors?503:200);
  }catch{return privateJson({error:'Notification job is unavailable.'},503);}
}
