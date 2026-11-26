'use client';

import {useState} from 'react';
import {labels,shiftDay,type Target,type Values} from '../lib/nutrition';
import {movingAverage,weekKey} from '../lib/analytics';
import type {Measurement} from '../lib/model';

export type StrengthPoint={day:string;id:string;name:string;absolute:number;relative:number|null};
export type Intake={values:Values;complete:boolean};
export const macros=['protein','carbs','fat'] as const;
export const amount=(value:number|null|undefined)=>value==null?'—':new Intl.NumberFormat('en',{maximumFractionDigits:1}).format(value);
const colors=['var(--accent)','var(--chart-average,#76aafa)','var(--chart-record,#e9a854)'];
type Series={name:string;values:(number|null)[]};

function Plot({days,series,unit,incomplete,zero=false}:{days:string[];series:Series[];unit:string;incomplete?:boolean[];zero?:boolean}){
  const [active,setActive]=useState<number>();
  const values=series.flatMap(line=>line.values.flatMap(value=>value??[]));
  if(!values.length) return <p className="nut-empty">No values in this range.</p>;
  const min=zero?0:Math.floor(Math.min(...values)*0.97);
  const max=Math.max(min+1,Math.max(...values)*1.04);
  const x=(i:number)=>50+i*530/Math.max(1,days.length-1);
  const y=(v:number)=>144-(v-min)*126/(max-min);
  const index=active!=null&&active<days.length?active:undefined;
  const ticks=[max,min+(max-min)/2,min];
  return <div className="nut-plot">
    <div className="nut-legend">{series.map((line,i)=><span key={line.name}><i style={{background:colors[i]}}/>{line.name}</span>)}</div>
    <svg viewBox="0 0 600 166" role="img" aria-label={series.map(line=>line.name).join(', ')}
      onPointerMove={event=>{
        const transform=event.currentTarget.getScreenCTM();
        if(!transform) return;
        const pointer=new DOMPoint(event.clientX,event.clientY).matrixTransform(transform.inverse());
        setActive(Math.max(0,Math.min(days.length-1,Math.round((pointer.x-50)*(days.length-1)/530))));
      }} onPointerLeave={()=>setActive(undefined)}>
      {ticks.map(value=><g key={value}><line x1="50" x2="580" y1={y(value)} y2={y(value)} stroke="var(--line)"/><text x="44" y={y(value)+4} textAnchor="end">{amount(value)}</text></g>)}
      {series.map((line,s)=>{
        const sparse=unit==='kg'||unit==='× BW';
        let started=false;
        const path=line.values.map((value,i)=>{
          if(value==null){if(!sparse) started=false;return '';}
          const command=started?'L':'M';
          started=true;
          return `${command}${x(i)},${y(value)}`;
        }).join(' ');
        return <g key={line.name}><path d={path} fill="none" stroke={colors[s]} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
          {line.values.map((value,i)=>value==null?null:<circle key={days[i]} cx={x(i)} cy={y(value)} r={incomplete?.[i]&&s===0?3.5:2.4} stroke={colors[s]} fill={incomplete?.[i]&&s===0?'var(--panel)':colors[s]}/>)}</g>;
      })}
      {[0,Math.floor((days.length-1)/2),days.length-1].filter((i,j,list)=>list.indexOf(i)===j).map(i=><text key={i} x={x(i)} y="162" textAnchor={i===days.length-1?'end':i===0?'start':'middle'}>{days[i].slice(5)}</text>)}
      {index!=null&&<line x1={x(index)} x2={x(index)} y1="18" y2="144" stroke="var(--muted)" strokeDasharray="4 3"/>}
    </svg>
    <div className="nut-tooltip" aria-live="polite">{index==null?<small>Hover or choose a date to inspect values.</small>:<>
      <strong>{days[index]}</strong>{series.map(line=><span key={line.name}>{line.name} {amount(line.values[index])} {unit}</span>)}
      {incomplete?.[index]&&<small>Incomplete logging day</small>}</>}</div>
    <label className="nut-scrubber"><span>Inspect date</span><input type="range" min="0" max={days.length-1} value={index??days.length-1}
      aria-valuetext={days[index??days.length-1]} onChange={event=>setActive(Number(event.target.value))} onFocus={()=>setActive(index??days.length-1)}/></label>
  </div>;
}

export function NutritionCharts({day,intake,targets,weights,strength}:{day:string;intake:Map<string,Intake>;targets:Target[];weights:Measurement[];strength:StrengthPoint[]}){
  const [range,setRange]=useState(30);
  const [view,setView]=useState('energy');
  const [exercise,setExercise]=useState('');
  const days=Array.from({length:range},(_,i)=>shiftDay(day,i+1-range));
  const targetFor=(date:string)=>targets.find(target=>target.day<=date);
  const calorie=(date:string)=>intake.get(date)?.values.kcal??null;
  const incomplete=days.map(date=>!intake.get(date)?.complete||calorie(date)==null);
  const average=(dates:string[])=>{
    const values=dates.flatMap(date=>intake.get(date)?.complete?calorie(date)??[]:[]);
    return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
  };
  const calories=days.map(calorie);
  const exercises=[...new Map(strength.map(point=>[point.id,point.name]))].sort((a,b)=>a[1].localeCompare(b[1]));
  const activeExercise=exercise||exercises[0]?.[0];
  const selected=new Map(strength.filter(point=>point.id===activeExercise).map(point=>[point.day,point]));
  const weightByDay=days.map(date=>{
    const values=weights.filter(row=>row.day===date);
    return values.length?values.reduce((sum,row)=>sum+row.value,0)/values.length:null;
  });
  const weekly=[...new Set(days.map(weekKey))];
  const weeklyValues=weekly.map(start=>average(days.filter(date=>weekKey(date)===start)));
  const macroEnergy=macros.map((key,i)=>days.reduce((sum,date)=>sum+(intake.get(date)?.complete&&macros.every(macro=>intake.get(date)?.values[macro]!=null)?intake.get(date)?.values[key]??0:0),0)*(i===2?9:4));
  const distribution=macroEnergy.reduce((sum,value)=>sum+value,0);
  return <section className="panel nut-panel nut-analytics">
    <div className="nut-between"><h2>Nutrition trends</h2><div className="nut-controls">
      <label><span className="nut-visually-hidden">Trend</span><select aria-label="Trend" value={view} onChange={e=>setView(e.target.value)}>
        <option value="energy">Energy</option><option value="macros">Macronutrients</option><option value="weight">Bodyweight & intake</option><option value="strength">Strength & protein</option>
      </select></label>
      <label><span className="nut-visually-hidden">Date range</span><select aria-label="Date range" value={range} onChange={e=>setRange(Number(e.target.value))}>
        <option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option>
      </select></label>
    </div></div>
    <p className="muted nut-caption">{days[0]} to {day} · {incomplete.filter(flag=>!flag).length} of {range} days complete with known calories. Open markers indicate incomplete days.</p>
    {(view==='energy'||view==='weight')&&<Plot key={view+'-calories'} days={days} unit="kcal" zero incomplete={incomplete} series={[
      {name:'Logged calories',values:calories},{name:'7-day mean · complete days',values:days.map(date=>average(Array.from({length:7},(_,i)=>shiftDay(date,i-6))))},
      {name:'Calorie target',values:days.map(date=>targetFor(date)?.kcal??null)},
    ]}/>}
    {view==='energy'&&<><h3>Weekly average calories</h3><Plot key="weekly" days={weekly} unit="kcal" zero series={[{name:'Complete days in range',values:weeklyValues}]}/></>}
    {view==='macros'&&<>
      <Plot key="macros" days={days} unit="g" zero incomplete={days.map(date=>!intake.get(date)?.complete)}
        series={macros.map(key=>({name:labels[key],values:days.map(date=>intake.get(date)?.values[key]??null)}))}/>
      <h3>Macro energy distribution</h3>
      {distribution>0?<div className="nut-distribution">{macros.map((key,i)=><div key={key} data-macro={key}><span>{labels[key]} {amount(macroEnergy[i]*100/distribution)}%</span>
        <progress max={distribution} value={macroEnergy[i]} aria-label={labels[key]}/></div>)}</div>:<p className="muted">No confirmed days with all three macros and recorded macro energy.</p>}
    </>}
    {view==='weight'&&<><h3>Bodyweight on the same dates</h3><Plot key="weight" days={days} unit="kg" series={[
      {name:'Weigh-ins',values:weightByDay},{name:'7-day moving mean',values:days.map(date=>movingAverage(weights,date,7))},
    ]}/></>}
    {view==='strength'&&<>
      <Plot key="protein" days={days} unit="g" zero incomplete={days.map(date=>!intake.get(date)?.complete)} series={[{name:'Protein',values:days.map(date=>intake.get(date)?.values.protein??null)}]}/>
      <label className="nut-field">Exercise<select value={activeExercise??''} onChange={e=>setExercise(e.target.value)}>
        {!exercises.length&&<option value="">No eligible strength sessions</option>}{exercises.map(([id,name])=><option key={id} value={id}>{name}</option>)}
      </select></label>
      <Plot key="absolute" days={days} unit="kg" series={[{name:'Best estimated 1RM (kg)',values:days.map(date=>selected.get(date)?.absolute??null)}]}/>
      <Plot key="relative" days={days} unit="× BW" series={[{name:'Estimated 1RM ÷ recent bodyweight',values:days.map(date=>selected.get(date)?.relative??null)}]}/>
    </>}
    {(view==='weight'||view==='strength')&&<p className="muted nut-caption">These timelines show associations. Intake, weight and strength can all change for several reasons.</p>}
  </section>;
}
