'use client';
import {useState} from 'react';
import {estimate} from '../lib/analytics';
export function RepMaxCalculator(){
  const [weight,setWeight]=useState('');
  const [reps,setReps]=useState('');
  const [formula,setFormula]=useState<'epley'|'brzycki'>('epley');
  const value=estimate(Number(weight),Number(reps),formula);
  return <details className="chart-data"><summary>Rep-max calculator</summary>
    <div className="form">
      <label>Recorded load (kg)<input type="number" value={weight} min=".01" step="any" onChange={e=>setWeight(e.target.value)}/></label>
      <label>Repetitions<input type="number" value={reps} min="1" max="10" onChange={e=>setReps(e.target.value)}/></label>
      <label>Formula<select value={formula} onChange={e=>setFormula(e.target.value==='epley'?'epley':'brzycki')}><option value="epley">Epley</option><option value="brzycki">Brzycki</option></select></label>
      <output>{value==null?'Enter a positive load and 1–10 reps.':`Estimated 1RM · ${value.toFixed(1)} kg`}</output>
      <p>Use a comparable loaded working set. Actual maximal strength depends on effort, technique and equipment.</p>
    </div>
  </details>;
}
