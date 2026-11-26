'use client';

import {useState} from 'react';
import type {trainingFingerprint} from '../lib/athlete-history';

type Profile=ReturnType<typeof trainingFingerprint>;
type Axis={key:keyof Profile['current'];label:string;method:string};

const coordinate=(index:number,score:number)=>{
  const angle=index*Math.PI/3-Math.PI/2;
  const radius=score*1.05;
  return [120+Math.cos(angle)*radius,120+Math.sin(angle)*radius] as const;
};

export function FingerprintRadar({profile,axes}:{profile:Profile;axes:readonly Axis[]}){
  const [selected,setSelected]=useState<Axis['key']>('strength');
  const axis=axes.find(item=>item.key===selected)??axes[0];
  const number=(value:number|null)=>value==null?'Unavailable':String(Math.round(value));
  const grid=(level:number)=>axes.map((_,index)=>coordinate(index,level).join(',')).join(' ');
  function shape(scores:Profile['current'],prior=false){
    const points=axes.map(({key},index)=>scores[key]==null?null:coordinate(index,scores[key]));
    const complete=points.every(point=>point!==null);
    return <g className={prior?'fingerprint-prior':'fingerprint-current'}>
      {complete?<polygon points={points.map(point=>point.join(',')).join(' ')}/>:
        points.map((a,index)=>{
          const b=points[(index+1)%points.length];
          return a&&b?<line key={index} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}/>:null;
        })}
      {points.map((point,index)=>point&&<circle className={selected===axes[index].key?'fingerprint-active-point':undefined}
        key={index} cx={point[0]} cy={point[1]} r={selected===axes[index].key?4:2.8}/>)}
    </g>;
  }
  return <div className="fingerprint-layout">
    <div className="fingerprint-visual">
      <svg viewBox="0 0 240 240" role="img" aria-label="Six-axis training fingerprint. Use the axis buttons for scores and calculations.">
        <g className="fingerprint-grid">{[25,50,75,100].map(level=><polygon key={level} points={grid(level)}/>)}
          {axes.map(({key},index)=>{const p=coordinate(index,100);return <line key={key} x1={120} y1={120} x2={p[0]} y2={p[1]}/>;})}</g>
        {shape(profile.previous,true)}{shape(profile.current)}
        {axes.map(({key},index)=>{
          const point=coordinate(index,100);
          return <circle key={key} className="fingerprint-hit" cx={point[0]} cy={point[1]} r={15} aria-hidden="true"
            onClick={()=>setSelected(key)} onPointerEnter={event=>{if(event.pointerType==='mouse')setSelected(key);}}/>;
        })}
      </svg>
      <p className="fingerprint-legend"><span>Current period</span>{profile.previousDates!=null&&Object.values(profile.previous).some(score=>score!=null)&&<span>Previous period</span>}</p>
    </div>
    <div className="fingerprint-dimensions">
      <div className="fingerprint-axis-list" aria-label="Radar dimensions">
        {axes.map(({key,label})=><button type="button" key={key} aria-pressed={selected===key} onClick={()=>setSelected(key)}
          onPointerEnter={event=>{if(event.pointerType==='mouse')setSelected(key);}} onFocus={()=>setSelected(key)}>
          <span>{label}</span><strong>{profile.current[key]==null?'—':Math.round(profile.current[key])}</strong>
        </button>)}
      </div>
      <div className="fingerprint-method" aria-live="polite">
        <h3>{axis.label}</h3>
        <p>{axis.method}</p>
        <small>Current {number(profile.current[axis.key])} · Previous {number(profile.previous[axis.key])}</small>
      </div>
    </div>
  </div>;
}
