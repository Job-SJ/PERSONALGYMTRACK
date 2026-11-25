'use client';
import {useId,useState,type PointerEvent} from 'react';

import Link from 'next/link';
import {formatDate,formatNumber,type Locale} from '../lib/format';

export type TrendPoint = {label:string;value:number;at?:string;incomplete?:boolean;href?:string;record?:boolean};

export function Trend({points:observations,unit,locale='en-GB',detailScale=false}:{points:TrendPoint[];unit:string;locale?:Locale;detailScale?:boolean}){
  const id=useId();
  const [active,setActive]=useState<number|null>(null);
  const [detail,setDetail]=useState(detailScale);
  const [zoom,setZoom]=useState(0);
  const [average,setAverage]=useState(0);
  const points=observations.slice(zoom);
  const width=660,height=218,left=50,bottom=187;
  const values=points.map(p=>p.value);
  const min=values.length?Math.min(...values):0;
  const max=values.length?Math.max(...values):1;
  const padding=Math.max((max-min)*.1,Math.abs(max)*.015,.01);
  const floor=detail?(min>=0?Math.max(0,min-padding):min-padding):Math.min(0,min);
  const ceiling=max<=0&&!detail?0:max+padding;
  const first=Date.parse(points[0]?.at ?? "");
  const last=Date.parse(points.at(-1)?.at ?? "");
  const span=last-first;
  const coords=points.map((p,i)=>[left+(span>0 ? (Date.parse(p.at ?? "")-first)/span : i/Math.max(points.length-1,1))*(width-left-25),p.value]);
  const averages=average>0?points.flatMap((_,index)=>{
    const end=zoom+index+1;
    if(end<average) return [];
    const value=observations.slice(end-average,end).reduce((total,point)=>total+point.value,0)/average;
    return [{x:coords[index][0],value}];
  }):[];
  const lowest=Math.min(floor,...averages.map(point=>point.value));
  const highest=Math.max(ceiling,lowest+.01,...averages.map(point=>point.value));
  const yFor=(value:number)=>bottom-(value-lowest)/(highest-lowest)*(bottom-18);
  const averageLine=averages.map(({x,value},i)=>(i?'L':'M')+x+' '+yFor(value)).join(' ');
  function inspect(event:PointerEvent<SVGSVGElement>) {
    const matrix=event.currentTarget.getScreenCTM();
    if(!matrix||!coords.length) return;
    const x=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()).x;
    setActive(coords.reduce((nearest,[position],i)=>Math.abs(x-position)<Math.abs(x-coords[nearest][0])?i:nearest,0));
  }
  const plotted=coords.map(([x,value])=>[x,yFor(value)]);
  const line=plotted.map(([x,y],i)=>(i?'L':'M')+x+' '+y).join(' ');
  const marker=active==null?undefined:coords[active];
  return <div className="trend">
    {observations.length>=3&&<div className="chart-controls chart-options">
      <button className="quiet" type="button" disabled={points.length<4} onClick={()=>{setZoom(zoom+Math.floor(points.length/2));setActive(null);}}>Zoom in</button>
      {zoom>0&&<button className="quiet" type="button" onClick={()=>{setZoom(0);setActive(null);}}>Reset zoom</button>}
      <label>Moving average <select value={average} onChange={event=>setAverage(Number(event.target.value))}><option value={0}>Off</option>{[3,5,10].filter(n=>n<=observations.length).map(n=><option key={n} value={n}>{n} observations</option>)}</select></label>
    </div>}
    {detailScale&&points.length>0&&<div className="chart-controls"><button className="quiet" type="button" onClick={()=>setDetail(!detail)}>{detail?'Use zero-based scale':'Use detail scale'}</button><small>{detail?'Detail scale':'Zero-based scale'}</small></div>}<svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={points.length?`Trend measured in ${unit}`:'No data to plot'} onPointerLeave={()=>setActive(null)} onPointerMove={inspect} onPointerDown={inspect}>
    <defs><linearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%"><stop stopColor="var(--accent)" stopOpacity=".25"/><stop offset="1" stopColor="var(--accent)" stopOpacity=".015"/></linearGradient></defs>
    {[0,1,2,3,4].map(i=>{const y=18+i*(bottom-18)/4;return <g key={i}><line x1={left} x2={width-25} y1={y} y2={y} stroke="var(--line)" strokeDasharray="3 4"/><text x={left-10} y={y+4} textAnchor="end">{points.length?Intl.NumberFormat(locale,{notation:'compact',maximumFractionDigits:1}).format(lowest+(highest-lowest)*(4-i)/4):'—'}</text></g>;})}
    {coords.length>1&&!detail&&<path d={line+` L${coords.at(-1)![0]} ${bottom} L${left} ${bottom}Z`} fill={`url(#${id})`}/>}
    {coords.length>0&&<path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.5"/>}
    {averages.length>1&&<path d={averageLine} fill="none" stroke="var(--chart-average)" strokeWidth="2" strokeDasharray="5 4"/>}
    {plotted.map(([x,y],i)=><g key={i}>{(i===0||i===coords.length-1||i===Math.floor(coords.length/2))&&<text x={x} y={211} textAnchor={i===0?'start':i===coords.length-1?'end':'middle'}>{points[i].label}</text>}
    {(coords.length===1||i===active||points[i].incomplete||points[i].record)&&<circle cx={x} cy={y} r={points[i].record?5:4} className={points[i].record?'record-marker':undefined} fill={points[i].incomplete?'var(--panel)':'var(--accent)'} stroke="var(--accent)" strokeWidth="2"/>}</g>)}
    {marker&&<line x1={marker[0]} x2={marker[0]} y1={16} y2={bottom} stroke="var(--muted)" strokeDasharray="4 4" pointerEvents="none"/>}
  </svg>{!points.length&&<div className="plot-empty">No observations in this range</div>}{active!==null&&points[active]&&<output className="plot-tooltip">{points[active].at?formatDate(points[active].at!,locale,{dateStyle:'medium'}):points[active].label} · {formatNumber(points[active].value,2,locale)} {unit}{points[active].record?' / Personal record':''}{points[active].incomplete?' / Partial week':''}</output>}
  {average>0&&<p className="legend average-label">{average}-observation moving average</p>}
  {points.some(p=>p.record)&&<p className="legend">Gold markers indicate personal records</p>}
  {points.some(p=>p.incomplete)&&<p className="legend">Open markers indicate partial weeks</p>}
  {points.length>0&&<details className="chart-data"><summary>View chart data</summary><table><thead><tr><th>Date</th><th>{unit}</th></tr></thead><tbody>{points.map((p,i)=><tr key={i}><td>{p.href?<Link href={p.href}>{p.at?formatDate(p.at,locale,{dateStyle:'medium'}):p.label}</Link>:p.at??p.label}{p.record?' (record)':''}{p.incomplete?' · In progress':''}</td><td>{formatNumber(p.value,2,locale)}</td></tr>)}</tbody></table></details>}</div>;
}
