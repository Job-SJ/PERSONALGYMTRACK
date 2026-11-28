import {describe,expect,it} from 'vitest';
import {analyticalQuery,needsCoachRouting,partnerReply,planCoachAnalysis,strengthEvidence,trainingEvidence} from '../lib/coach-analysis';
import {conversationContext} from '../lib/coach-chat';
import {discoverPartners,type PartnerWorkout} from '../lib/coach-partners';
import {coachReadiness,recommendCoachModels} from '../lib/coach-setup';
import type {CoachModel} from '../lib/coach-provider';
import type {Workout,Template} from '../lib/model';

const today='2026-11-28';
const partner=(id:string,day:string,title:string,notes?:string,exerciseNote?:string):PartnerWorkout=>({
  id,title,notes,started_at:day+'T17:00:00Z',ended_at:day+'T18:00:00Z',workout_exercises:[{notes:exerciseNote}],
});
const workouts=[
  partner('one','2026-11-27','Push with Alex','Trained with ALEX.'),
  partner('two','2026-11-24','Leg day','Trained with Alex (aka Lex).'),
  partner('three','2026-10-11','Upper','Tough session.','Getraind met lex.'),
  partner('four','2026-10-07','Workout with Morgan'),
  partner('five','2026-10-06','Alex bench program','Morgan spotted my set.'),
  partner('six','2026-10-05','Upper','Will train with Alex tomorrow. Trained with resistance.'),
];

describe('Coach analytical routing',()=>{
  it('discovers the leading training partner without a name in the question',()=>{
    const [query]=planCoachAnalysis('Who do I usually train with?','',today);
    expect(query.tool).toBe('partners');
    const reply=partnerReply(workouts,query,'Who do I usually train with?','',false);
    expect(reply.text).toContain('**Alex** — 3 workouts');
    expect(reply.text).toContain('last on 2026-11-27');
    expect(reply.evidence.dates).toEqual(['2026-11-27','2026-11-24','2026-10-11']);
    expect(discoverPartners(workouts,today).partners.map(({key,count})=>({key,count})))
      .toEqual([{key:'alex',count:3},{key:'morgan',count:1}]);
    expect(partnerReply(workouts,query,'Who do I train with most often?','',false).text).toContain('**Alex**');
    expect(discoverPartners([partner('unknown','2026-11-07','Trained with purpose.')],today).partners).toEqual([]);
  });

  it('handles nickname questions, missing evidence and Dutch follow-ups',()=>{
    const [query]=planCoachAnalysis('En hoe vaak met Lex in de laatste 30 dagen?','Wie is mijn trainingspartner?',today);
    expect(query).toMatchObject({tool:'partners',from:'2026-10-30'});
    expect(partnerReply(workouts.slice(0,2),query,'Hoe vaak met Lex?','',false).text).toContain('2 trainingen');
    expect(partnerReply(workouts.slice(0,2),query,'Hoe vaak met Robin?','',false).text).toContain('geen expliciete vermelding');
    expect(partnerReply([],query,'Wie is mijn trainingspartner?','',false).evidence.dates).toEqual([]);
  });

  it('uses validated ranges and disallows caller-supplied owners or tools',()=>{
    expect(planCoachAnalysis('How long were my workouts from 2026-04-01 to 2026-04-30?','',today))
      .toEqual([{tool:'training',from:'2026-04-01',through:'2026-04-30',compare:false}]);
    expect(planCoachAnalysis('Compare this month with my previous three months of training','',today).map(row=>row.from))
      .toEqual(['2026-11-01','2026-08-01']);
    expect(planCoachAnalysis('What about the last 90 days?','Is my bodyweight changing?',today)[0]).toMatchObject({
      from:'2026-08-30',tool:'bodyweight',
    });
    expect(analyticalQuery.safeParse({tool:'sql',from:null,through:today}).success).toBe(false);
    expect(analyticalQuery.safeParse({tool:'training',from:null,through:today,owner:'different user'}).success).toBe(false);
    expect(needsCoachRouting('What does my log say?','')).toBe(true);
    expect(planCoachAnalysis('What does my log say?','',today)).toEqual([]);
  });

  it('withholds local answers and identifiers from later provider context',()=>{
    const context=conversationContext('[]',[
      {id:'local',created_at:today,prompt:'Was I with Alex?',answer:'Alex trained with you',local_analysis:true},
    ],'Progress for athlete@example.test? 00000000-0000-0000-0000-000000000001');
    expect(JSON.stringify(context)).not.toMatch(/Alex|athlete@example|00000000-0000/);
  });
});

describe('Coach calculated evidence',()=>{
  const templates=new Map<string,Template>([
    ['bench',{id:'bench',type:'weight_reps',title:'Bench press (Barbell)',secondary_muscles:[],primary_muscle:'chest'}],
    ['deadlift',{id:'deadlift',type:'weight_reps',title:'Deadlift',secondary_muscles:[],primary_muscle:'back'}],
  ]);
  const set=(weight:number)=>({position:0,type:'normal' as const,weight_kg:weight,reps:5});
  const lift=(row:PartnerWorkout,id:string,value:number):Workout=>({
    ...row,notes:row.notes,source:'csv',workout_exercises:[{title:id,position:0,template_id:id,notes:null,workout_sets:[set(value)]}],
  });
  const data=[lift(workouts[0],'bench',60),lift(workouts[1],'bench',50),lift(workouts[2],'deadlift',90)];

  it('uses elapsed days for weekly rates and suppresses capped denominators',()=>{
    const query=analyticalQuery.parse({tool:'muscles',from:'2026-11-21',through:'2026-11-27'});
    const report=trainingEvidence(data.slice(0,2),templates,query,false,'2026-10-11');
    expect(report).toMatchObject({workoutsPerWeek:2,meanDurationMinutes:60,meanWorkingSets:1,mappedVolumeKgPerWeek:550});
    expect(report.muscles?.chest).toEqual({directSets:2,secondarySets:0,sessions:2,directSetsPerWeek:2});
    expect(trainingEvidence(data,templates,query,true).workoutsPerWeek).toBeNull();
  });

  it('compares the matching exercise within its template',()=>{
    expect(strengthEvidence(data,templates,'And my bench press?')).toMatchObject({
      exerciseCount:1,exercises:[{sessions:2,changePercent:20,bestEstimated1RMKg:70,maxLoggedWeightKg:60}],
    });
  });
});

it('groups duplicate provider routes and blocks missing consent and exhausted credits',()=>{
  const base:CoachModel={model:'synthetic/model',endpoint:'host',prompt:0.000001,completion:0.000001,
    name:'Synthetic Model',provider:'Synthetic',free:false,capabilities:[],retention:'zero'};
  const better={...base,endpoint:'tools',capabilities:['tools','tool_choice']};
  const free={...base,model:'synthetic/free',prompt:0,completion:0,free:true};
  expect(recommendCoachModels([base,better,free]).grouped).toEqual([better,free]);
  const status={personal:true,instance:false,setting:{enabled:true,chatConsent:false,credential_source:'personal' as const,monthly_micros:2_000_000},usage:{usd:0}};
  expect(coachReadiness(status)?.action).toBe('Review consent');
  expect(coachReadiness({...status,setting:{...status.setting,chatConsent:true},connectionIssue:'credit-limit'})?.action)
    .toBe('Review OpenRouter connection');
});
