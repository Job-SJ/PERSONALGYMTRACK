import Papa from 'papaparse';
import {createHash} from 'node:crypto';
import {normalize,workoutSchema} from './model';
import {zone} from './analytics';
import type {z} from 'zod';

const columns=['title','start_time','end_time','exercise_title','set_index','set_type','weight_kg','reps'];
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const months='Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
const local=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,dateStyle:'short',timeStyle:'medium'});
function timestamp(value:string) {
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)) return new Date(value).toISOString();
  const match=/^(\d{1,2}) ([A-Za-z]{3}) (\d{4}), (\d\d:\d\d)(?::(\d\d))?$/.exec(value);
  if (!match || !months.includes(match[2])) throw new Error('Invalid timestamp');
  const wall=match[3]+'-'+String(months.indexOf(match[2])+1).padStart(2,'0')+'-'+match[1].padStart(2,'0')+' '+match[4]+':'+(match[5] ?? '00');
  const utc=Date.parse(wall.replace(' ','T')+'Z');
  const candidates=[1,2].map(offset=>new Date(utc-offset*3600000)).filter(d=>Number.isFinite(+d)&&local.format(d)===wall);
  if (candidates.length!==1) throw new Error('Ambiguous or invalid local timestamp');
  return candidates[0].toISOString();
}
const num=(value?:string)=>value?.trim()?Number(value):null;
export function parseCsv(text:string) {
  const {data,errors,meta}=Papa.parse<Record<string,string>>(text,{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim()});
  if (errors.length || !data.length || !columns.every(c=>meta.fields?.includes(c))) throw new Error('Invalid Hevy CSV');
  const rows=new Map<string,z.input<typeof workoutSchema>>();
  for (const row of data) {
    const start=timestamp(row.start_time), end=timestamp(row.end_time);
    if (!row.title.trim() || !row.exercise_title.trim() || !/^\d+$/.test(row.set_index)) throw new Error('Invalid workout row');
    const id=hash(JSON.stringify([row.title,start,end]));
    const w=rows.get(id) ?? {id,title:row.title,description:row.description,start_time:start,end_time:end,exercises:[]};
    const name=row.exercise_title.trim();
    const templateId='csv:'+hash(name.toLowerCase());
    let e=w.exercises.at(-1);
    const index=Number(row.set_index);
    if (!e || e.exercise_template_id!==templateId || index<=e.sets.at(-1)!.index) {
      e={index:w.exercises.length,title:name,exercise_template_id:templateId,notes:row.exercise_notes,sets:[]};
      w.exercises.push(e);
    }
    e.sets.push({index,type:row.set_type as 'normal',weight_kg:num(row.weight_kg),reps:num(row.reps),
      duration_seconds:num(row.duration_seconds),distance_meters:num(row.distance_km)==null?null:Number(row.distance_km)*1000,rpe:num(row.rpe)});
    rows.set(id,w);
  }
  return [...rows.values()].map(w=>normalize(workoutSchema.parse(w),'csv'));
}
