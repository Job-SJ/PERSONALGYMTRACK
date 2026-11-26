'use client';

import {useState} from 'react';
import Link from 'next/link';
import {formatDate,type Locale} from '../lib/format';

type Milestone={day:string;title:string;detail:string;href:string};

export function ReplayMilestones({milestones,locale}:{milestones:Milestone[];locale:Locale}){
  const [selection,setSelection]=useState(0);
  const index=Math.min(selection,milestones.length-1);
  const mark=milestones[index];
  if(!mark) return null;
  return <details className="athlete-disclosure">
    <summary>Explore milestones <small>{milestones.length} recorded</small></summary>
    {milestones.length>1&&<label className="replay-timeline">Milestone timeline
      <input type="range" min={0} max={milestones.length-1} value={index} onChange={event=>setSelection(Number(event.target.value))}
        aria-valuetext={formatDate(mark.day,locale,{dateStyle:'medium'})+' · '+mark.title}/>
    </label>}
    <p className="replay-milestone" aria-live="polite">
      <span><time dateTime={mark.day}>{formatDate(mark.day,locale,{dateStyle:'medium'})}</time><strong>{mark.title} · {mark.detail}</strong></span>
      <Link href={mark.href}>Open workout</Link>
    </p>
  </details>;
}
