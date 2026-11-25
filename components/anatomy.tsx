import Link from 'next/link';
import {muscles} from '../lib/analytics';
const front=[
  ['shoulders','M37 40Q27 42 24 60L34 67 44 46Z'],['chest','M44 46Q53 44 59 51L59 67Q46 70 36 62Z'],
  ['biceps','M34 66L24 61 19 86 29 91Z'],['forearms','M19 88L29 93 19 121 10 119Z'],
  ['core','M39 67Q49 72 59 69L59 110 42 106 37 87Z'],
  ['quadriceps','M42 109L59 114 56 139 52 157 41 155 35 131Z'],
  ['calves','M41 161L51 162 50 183 44 204 37 202 35 181Z'],
] as const;
const back=[
  ['shoulders','M37 40Q27 42 24 60L34 67 44 46Z'],['back','M46 44L59 38 59 106 42 103 36 67Z'],
  ['triceps','M33 66L24 61 19 87 29 91Z'],['forearms','M19 89L29 93 19 121 10 119Z'],
  ['glutes','M41 105L59 108 59 131Q45 140 36 127Z'],
  ['hamstrings','M36 130Q46 139 58 132L52 157 41 155Z'],
  ['calves','M41 161L51 162 52 178 44 204 37 202 35 181Z'],
] as const;
export function Anatomy({totals,preview=false,selected}:{totals:ReturnType<typeof import('../lib/analytics').muscleTotals>;preview?:boolean;selected?:string}){
  const max=Math.max(1,...Object.values(totals).map(t=>t.direct));
  return <div className="anatomy">{[front,back].map((paths,i)=><div key={i}><svg viewBox="0 0 120 228" aria-label={i?'Back muscle regions':'Front muscle regions'}>
    <path d="M49 24Q42 9 51 4Q60 -1 69 4Q78 9 71 24L68 36Q76 40 86 40Q96 43 99 63L106 87 113 121 117 133 111 139 103 129 98 117 91 91 84 70 81 86 82 101 87 122 85 140 80 161 85 178 83 193 79 206 84 214 83 222 69 222 67 214 67 204 67 178 64 160 60 136 56 160 53 178 53 204 53 214 51 222 37 222 36 214 41 206 37 193 35 178 40 161 35 140 33 122 38 101 39 86 36 70 29 91 22 117 17 129 9 139 3 133 7 121 14 87 21 63Q24 43 34 40Q44 40 52 36Z" className="silhouette"/>
    {paths.map(([key,d])=>{const count=totals[key]?.direct??0;const title=muscles[key]+': '+count+' direct sets';
      return <Link key={key} href={preview?'/?tab=muscles&muscle='+key:'/app/muscles/'+key} aria-label={title} className={'region '+(selected===key?'highlight':'')} style={{'--intensity':count?0.28+0.72*(count/max):0} as React.CSSProperties}><title>{title}</title><path d={d}/><path d={d} transform="translate(120 0) scale(-1 1)"/></Link>;
    })}</svg><span>{i?'Back':'Front'}</span></div>)}</div>;
}
