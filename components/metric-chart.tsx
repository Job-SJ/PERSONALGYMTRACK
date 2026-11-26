'use client';

import {useState} from 'react';
import {Trend, type TrendPoint} from './charts';
import type {Locale} from '../lib/format';

type Series = {key:string; label:string; unit:string; points:TrendPoint[]; detailScale?:boolean;observedOnly?:boolean};
export function MetricChart({series,locale,selectorLabel='Metric'}:{series:Series[];locale:Locale;selectorLabel?:string}) {
  const [key,setKey]=useState(series[0].key);
  const selected=series.find(item=>item.key===key)??series[0];
  return <><label className="chart-controls">{selectorLabel} <select aria-label={selectorLabel==='Metric'?'Chart metric':selectorLabel} value={selected.key} onChange={e=>setKey(e.target.value)}>
    {series.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
  </select></label>
  <Trend key={[selected.key,selected.points.length,selected.points[0]?.at,selected.points.at(-1)?.at].join('|')} points={selected.points} unit={selected.unit} locale={locale} detailScale={selected.detailScale} observedOnly={selected.observedOnly}/></>;
}
