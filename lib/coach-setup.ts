import {reserveMicros,type CoachModel} from './coach-provider';

export const defaultCoachBudget=2;

export function recommendCoachModels(models:CoachModel[]){
  const scores=(model:CoachModel)=>Number(model.capabilities.includes('tools')&&model.capabilities.includes('tool_choice'))+
    Number(model.capabilities.includes('reasoning'));
  const sorted=[...models].sort((a,b)=>scores(b)-scores(a)||reserveMicros(a)-reserveMicros(b)||
    (a.medianLatency??Infinity)-(b.medianLatency??Infinity));
  const byModel=new Map<string,CoachModel>();
  for(const model of sorted) if(!byModel.has(model.model)) byModel.set(model.model,model);
  const grouped=[...byModel.values()];
  const affordable=grouped.filter(model=>reserveMicros(model)<=defaultCoachBudget*1_000_000);
  const paid=affordable.filter(model=>!model.free);
  const recommended=affordable[0]??grouped[0];
  const value=[...paid].sort((a,b)=>reserveMicros(a)-reserveMicros(b)).find(model=>model!==recommended);
  const advanced=paid.find(model=>model!==recommended&&model!==value&&scores(model)>0);
  const free=affordable.find(model=>model.free&&model!==recommended);
  return {grouped,featured:[
    {label:'Recommended',model:recommended},{label:'Best value',model:value},
    {label:'More capabilities',model:advanced},{label:'Free',model:free},
  ].flatMap(({label,model})=>model?[{label,model}]:[])};
}

export type CoachReadiness={reason:string;action:string};
export type CoachConnectionIssue='invalid-key'|'credit-limit'|'unavailable-model'|'provider-outage'|null;
export function coachReadiness(status:{
  personal:boolean;instance:boolean;
  setting:{enabled:boolean;chatConsent:boolean;credential_source:'personal'|'instance';monthly_micros:number}|null;
  usage:{usd:number};
  connectionIssue?:CoachConnectionIssue;
}):CoachReadiness|null{
  const {setting}=status;
  if(setting?.credential_source==='instance'?!status.instance:!status.personal){
    return {reason:'Connect an OpenRouter API key to start.',action:'Connect OpenRouter'};
  }
  if(!setting?.enabled) return {reason:'Choose an eligible model and enable Coach.',action:'Choose a model'};
  if(!setting.chatConsent) return {reason:'Review how Coach processes your messages before starting a chat.',action:'Review consent'};
  if(setting.monthly_micros>0&&status.usage.usd*1_000_000>=setting.monthly_micros){
    return {reason:'You reached your GymTrack spending limit for this UTC month.',action:'Review spending limit'};
  }
  switch(status.connectionIssue){
    case 'invalid-key': return {reason:'OpenRouter rejected the saved API key.',action:'Replace API key'};
    case 'credit-limit': return {reason:'The OpenRouter key reached its spending or free-request limit.',action:'Review OpenRouter connection'};
    case 'unavailable-model': return {reason:'Your selected model is unavailable at its approved price and privacy settings.',action:'Choose another model'};
    case 'provider-outage': return {reason:'Coach could not reach OpenRouter.',action:'Check connection again'};
    default:return null;
  }
}
