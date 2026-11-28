import {dayKey, shiftDay} from './analytics';

export type PartnerWorkout = {
  id:string; title:string; notes?:string|null; started_at:string; ended_at:string;
  workout_exercises:{notes?:string|null}[];
};

const token=String.raw`[\p{L}]+(?:[’'-][\p{L}]+)*\.?`;
const candidate=new RegExp(String.raw`^(@?${token}(?: +${token}){0,2}|(?:\p{L}\.){2,4})(?:\s*\((?:aka\s+)?(@?${token}|(?:\p{L}\.){2,4})\))?$`,'iu');
const splitNames=/\s*(?:[,;&+/·\n]|\band\b|\ben\b|\s[-–—]\s)\s*/iu;
const explicit=/^(?:i\s+|ik\s+)?(?:trained with|worked out with|lifted with|getraind met|trainde met|training partner(?:s)?\s*:|trainingspartner(?:s)?\s*:|(?:push|pull|legs|upper|lower|full body|workout|training)\s+(?:with|met))\s*/iu;
const unrelated=new Set(('coach trainer partner partners friend friends nobody iemand niemand barbell dumbbell dumbbells belt straps bands weights pain machines music ease iedereen resistance intensity confidence fatigue caution equipment focus rest recovery cardio warmup cooldown deload solo alone alleen '+
  'push pull legs upper lower full body workout training session gym chest back leg arms shoulders core squat deadlift bench press strength run running cycling mobility easy hard good great day morning evening today yesterday vandaag gisteren morgen '+
  'rust herstel conditie benen borst rug schouders kracht goed prima lekker zwaar licht top personal record best progress tempo sets reps feeling felt voelde missed cancelled planned sore knee injury stretch routine circuit intervals warm cold pr pb rpe am pm').split(' '));

export function partnerKey(value:string){
  const normalized=value.normalize('NFKC').toLowerCase().replace(/^@/,'').replace(/’/g,"'").trim();
  if(/^(?:\p{L}\.\s*){2,4}$/u.test(normalized)) return normalized.replace(/[.\s]/g,'');
  return normalized.replace(/\./g,'').replace(/\s+/g,' ');
}

type Source='subtitle'|'title'|'exercise note';
type Mention={key:string;label:string;alias?:string;explicit:boolean;source:Source;recognizable:boolean};
function nameList(value:string,source:Source,confirmed:boolean):Mention[]{
  const parts=value.trim().split(splitNames);
  const found:Mention[]=[];
  for(const part of parts){
    const match=candidate.exec(part.trim().replace(/([\p{L}]{2}|\))\.$/u,'$1'));
    if(!match||part.length>65) return [];
    const [,label,alias]=match;
    const key=partnerKey(label);
    const words=label.replace(/^@/,'').split(/ +/);
    if(key.split(' ').some(word=>unrelated.has(word))||
      (words.length>1&&words.some(word=>!/^\p{Lu}/u.test(word)))) return [];
    found.push({key,label:label.replace(/^@/,''),alias:alias?partnerKey(alias):undefined,explicit:confirmed,source,
      recognizable:/^@|\p{Lu}|\./u.test(label)||parts.length>1});
  }
  return found;
}

function explicitMentions(value:string,source:Source){
  const found:Mention[]=[];
  for(const sentence of value.split(/[!?;\n]|(?<=[\p{L}]{2}|\))\.\s+/u)){
    const clause=sentence.trimStart();
    if(!explicit.test(clause)) continue;
    const list=clause.replace(explicit,'').split(/\s+(?:today|yesterday|vandaag|gisteren)\b/i)[0];
    found.push(...nameList(list,source,true));
  }
  return found;
}

export function discoverPartners(workouts:PartnerWorkout[],today:string){
  const aliases=new Map<string,Set<string>>();
  const known=new Set<string>();
  const lowercaseSubtitles=new Map<string,number>();
  const names=new Map<string,string>();
  const occurrences=workouts.map(workout=>{
    const subtitle=workout.notes?.trim()??'';
    const mentions=[
      ...explicitMentions(workout.title,'title'),
      ...explicitMentions(subtitle,'subtitle'),
      ...workout.workout_exercises.flatMap(exercise=>explicitMentions(exercise.notes??'','exercise note')),
      ...(subtitle.length<=240&&!explicit.test(subtitle)?nameList(subtitle,'subtitle',false):[]),
    ];
    for(const mention of mentions){
      const {key,label,alias,recognizable}=mention;
      if(recognizable) known.add(key);
      const previous=names.get(key);
      if(!previous||!/^\p{Lu}/u.test(previous)&&/^\p{Lu}/u.test(label)) names.set(key,label);
      if(alias&&alias!==key&&!unrelated.has(alias)){
        known.add(key);known.add(alias);
        const targets=aliases.get(alias)??new Set<string>();
        targets.add(key);
        aliases.set(alias,targets);
      }
    }
    for(const key of new Set(mentions.filter(mention=>!mention.explicit&&mention.key.length>1).map(mention=>mention.key))){
      lowercaseSubtitles.set(key,(lowercaseSubtitles.get(key)??0)+1);
    }
    return {workout,mentions};
  });
  const partners=new Map<string,{name:string; evidence:Map<string,{day:string;confirmed:boolean;source:Source}>}>();
  const referenced=new Set<string>();
  for(const {workout,mentions} of occurrences){
    for(const mention of mentions){
      const {key,explicit:confirmed,source}=mention;
      if(!known.has(key)&&(lowercaseSubtitles.get(key)??0)<2) continue;
      const candidates=aliases.get(key);
      const target=candidates?.size===1?[...candidates][0]:key;
      const canonical=aliases.has(target)?key:target;
      const partner=partners.get(canonical)??{name:names.get(canonical)??mention.label,evidence:new Map()};
      const previous=partner.evidence.get(workout.id);
      if(!previous||confirmed&&!previous.confirmed){
        partner.evidence.set(workout.id,{day:dayKey(workout.started_at),confirmed,source});
      }
      referenced.add(workout.id);
      partners.set(canonical,partner);
    }
  }
  const durations=(labelled:boolean)=>{
    const minutes=workouts.filter(workout=>referenced.has(workout.id)===labelled)
      .map(workout=>(Date.parse(workout.ended_at)-Date.parse(workout.started_at))/60000).filter(minutes=>minutes>0);
    return {count:minutes.length,mean:minutes.length?Math.round(minutes.reduce((sum,value)=>sum+value,0)/minutes.length):null};
  };
  return {aliases,partners:[...partners.entries()].map(([key,row])=>{
    const evidence=[...row.evidence.values()].sort((a,b)=>b.day.localeCompare(a.day));
    const confirmed=evidence.filter(item=>item.confirmed).length;
    return {key,name:row.name,count:evidence.length,confirmed,inferred:evidence.length-confirmed,last:evidence[0].day,
      recent:evidence.filter(({day})=>day>=shiftDay(today,-29)&&day<=today).length,
      percentage:Math.round(evidence.length/workouts.length*1000)/10,evidence};
  }).sort((a,b)=>b.count-a.count||b.confirmed-a.confirmed||a.name.localeCompare(b.name)),
  duration:{labelled:durations(true),unlabelled:durations(false)}};
}
