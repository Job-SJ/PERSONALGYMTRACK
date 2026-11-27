'use client';

import {useState,type FormEvent} from 'react';
import {energyEstimate,labels,targetSchema,type Target} from '../lib/nutrition';
import {amount} from './nutrition-charts';
import {adaptiveTarget,type adaptiveMaintenance} from '../lib/adaptive-nutrition';

type Targets=Omit<Target,'day'>;
const keys=['kcal','protein','carbs','fat'] as const;
const activityLevels=[
  [1.2,'Mostly seated'],[1.375,'Lightly active'],[1.55,'Moderately active'],[1.725,'Very active'],[1.9,'Highly active'],
] as const;

export function NutritionTargets({day,target,weight,adaptation,busy,onSave}:{day:string;target?:Target;weight?:number;adaptation:ReturnType<typeof adaptiveMaintenance>;busy:boolean;onSave:(targets:Targets)=>void}){
  const [estimate,setEstimate]=useState<{resting:number;maintenance:number;goal:number}>();
  const [calories,setCalories]=useState(String(target?.kcal??''));
  const [error,setError]=useState('');
  const [offset,setOffset]=useState(0);
  const suggestion=adaptation.estimate?adaptiveTarget(adaptation.estimate.kcal,offset,target?.kcal):null;
  function calculate(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const value=(key:string)=>Number(data.get(key));
    const result=energyEstimate(value('age'),value('height'),value('weight'),value('profile'),value('activity'));
    setEstimate({...result,goal:Math.round(result.maintenance+value('goal'))});
  }
  function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const parsed=targetSchema.safeParse(Object.fromEntries(keys.map(key=>[key,Number(data.get(key))])));
    if(parsed.success){setError('');onSave(parsed.data);}
    else setError('Enter a positive calorie target and valid macro targets.');
  }
  return <div className="nut-grid">
    <form className="panel nut-panel nut-form" onSubmit={save}>
      <h2>Daily targets</h2><p className="muted nut-caption">Targets take effect on {day} and carry forward until the next change.</p>
      <div className="nut-form-grid">
        <label className="nut-field">Calories (kcal)<input type="number" required name="kcal" min="1" max="20000" step="1" value={calories} onChange={event=>setCalories(event.target.value)}/></label>
        {keys.slice(1).map(key=><label className="nut-field" key={key}>{labels[key]} (g)<input type="number" required min="0" max="2000" step="any" name={key} defaultValue={target?.[key]}/></label>)}
      </div>
      {error&&<p role="alert">{error}</p>}
      <button className="button" disabled={busy}>Save targets</button>
    </form>
    <section className="panel nut-panel nut-form">
      <h2>Adaptive nutrition</h2>
      <p className="muted nut-caption">{adaptation.start} to {adaptation.end} · {adaptation.days} complete days with known intake</p>
      {adaptation.estimate?<><p>Estimated maintenance <strong>{amount(adaptation.estimate.kcal)} kcal/day</strong></p>
        <p>Average logged intake was {amount(Math.round(adaptation.estimate.intakeMean))} kcal/day. Average weight changed by {adaptation.estimate.weightChange.toFixed(2)} kg between the first and last weeks.</p>
        <p className="muted nut-caption">This estimate is reviewed weekly. Water weight and gaps in logging can affect it.</p>
        <label className="nut-field">Goal<select value={offset} onChange={event=>setOffset(Number(event.target.value))}>
          <option value={0}>Maintain weight</option><option value={150}>Gradual muscle gain</option>
          <option value={-150}>Gradual fat loss</option><option value={50}>Training performance</option>
        </select></label>
        {suggestion!==null?<button className="quiet" type="button" disabled={busy} onClick={()=>setCalories(String(suggestion))}>Copy {amount(suggestion)} kcal/day to targets</button>:
          <p>Review your records and set a manual target.</p>}
      </>:<p>Review becomes available with at least 21 complete food logs across four weeks and at least three measurements in each of the first and last weeks.</p>}
    </section>
    <form className="panel nut-panel nut-form" onSubmit={calculate}>
      <h2>Energy needs estimate</h2>
      <p className="muted nut-caption">For adults. Mifflin–St Jeor estimates resting energy as 10 × kg + 6.25 × cm − 5 × age + profile constant. Maintenance multiplies this by your overall activity, including exercise.</p>
      <div className="nut-form-grid">
        <label className="nut-field">Age<input name="age" type="number" required min="18" max="120"/></label>
        <label className="nut-field">Height (cm)<input name="height" type="number" step="any" required min="100" max="260"/></label>
        <label className="nut-field">Bodyweight (kg)<input name="weight" type="number" step="any" required min="25" max="400" defaultValue={weight}/></label>
        <label className="nut-field">Equation profile<select name="profile" required defaultValue=""><option value="" disabled>Select profile</option><option value="5">Male (+5)</option><option value="-161">Female (−161)</option></select></label>
        <label className="nut-field">Overall activity<select name="activity" defaultValue="1.375">{activityLevels.map(([factor,label])=><option key={factor} value={factor}>{label} (×{factor})</option>)}</select></label>
        <label className="nut-field">Goal<select name="goal"><option value="0">Maintain weight</option><option value="200">Gradual muscle gain (+200 kcal)</option><option value="-250">Gradual weight loss (−250 kcal)</option></select></label>
      </div>
      <button className="quiet">Calculate estimate</button>
      {estimate&&<div className="nut-estimate" role="status">
        <p>Estimated resting energy <strong>{amount(Math.round(estimate.resting))} kcal/day</strong></p>
        <p>Estimated maintenance <strong>{amount(Math.round(estimate.maintenance))} kcal/day</strong></p>
        <p>Estimated goal intake <strong>{amount(estimate.goal)} kcal/day</strong></p>
        <button className="quiet" type="button" disabled={estimate.goal<=0} onClick={()=>setCalories(String(estimate.goal))}>Copy to calorie target</button>
      </div>}
      <small><a className="nut-link" href="https://pubmed.ncbi.nlm.nih.gov/2305711/">Mifflin–St Jeor equation reference</a></small>
    </form>
  </div>;
}
