'use client';
import {useId,useState} from 'react';

export function Trend({points,unit}:{points:{label:string;value:number;at?:string}[];unit:string}){
  const id=useId();
  const [active,setActive]=useState<number|null>(null);
  const width=660,height=218,left=42,bottom=187;
  const max=Math.max(1,...points.map(p=>p.value));
  const scale=10**Math.floor(Math.log10(max));
  const ceiling=Math.ceil(max/scale)*scale;
  const first=Date.parse(points[0]?.at ?? "");
  const last=Date.parse(points.at(-1)?.at ?? "");
  const span=last-first;
  const coords=points.map((p,i)=>[left+(span>0 ? (Date.parse(p.at ?? "")-first)/span : i/Math.max(points.length-1,1))*(width-left-25),bottom-p.value/ceiling*(bottom-18)]);
  const line=coords.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ');
  const marker=active==null?undefined:coords[active];
  return <div className="trend"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={points.length?`Trend measured in ${unit}`:'No data to plot'} onPointerLeave={()=>setActive(null)}>
    <defs><linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%"><stop stopColor="var(--accent)" stopOpacity=".25"/><stop offset="1" stopColor="var(--accent)" stopOpacity=".015"/></linearGradient></defs>
    {[0,1,2,3,4].map(i=>{const y=18+i*(bottom-18)/4;return <g key={i}><line x1={left} x2={width-25} y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 4"/><text x={left-10} y={y+4} textAnchor="end">{points.length?Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(ceiling*(4-i)/4):'—'}</text></g>;})}
    {coords.length>1&&<path d={line+` L${coords.at(-1)![0]} ${bottom} L${left} ${bottom}Z`} fill={`url(#${id})`}/>}
    {coords.length>0&&<path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5"/>}
    {coords.map(([x,y],i)=><g key={i}>{(i===0||i===coords.length-1||i===Math.floor(coords.length/2))&&<text x={x} y={211} textAnchor={i===0?'start':i===coords.length-1?'end':'middle'}>{points[i].label}</text>}
    {(coords.length===1||i===active)&&<circle cx={x} cy={y} r="4" fill="var(--accent)"/>}<rect x={x-8} y={13} width={16} height={175} fill="transparent" onPointerEnter={()=>setActive(i)}/></g>)}
    {marker&&<line x1={marker[0]} x2={marker[0]} y1={16} y2={bottom} stroke="var(--muted)" strokeDasharray="4 4" pointerEvents="none"/>}
  </svg>{!points.length&&<div className="plot-empty">No observations in this range</div>}{active!==null&&points[active]&&<output className="plot-tooltip">{points[active].label} · {points[active].value.toLocaleString(undefined,{maximumFractionDigits:2})} {unit}</output>}
  {points.length>0&&<details className="chart-data"><summary>View chart data</summary><table><thead><tr><th>Date</th><th>{unit}</th></tr></thead><tbody>{points.map((p,i)=><tr key={i}><td>{p.label}</td><td>{p.value.toLocaleString(undefined,{maximumFractionDigits:2})}</td></tr>)}</tbody></table></details>}</div>;
}
