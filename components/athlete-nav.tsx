import Link from 'next/link';

export const athleteViews=['replay','passport','fingerprint'] as const;
export type AthleteExperience=typeof athleteViews[number];
export const athleteExperience=(value?:string)=>athleteViews.find(view=>view===value);
export const athleteHref=(view?:AthleteExperience,preview=false)=>{
  const base=preview?'/?tab=analytics':'/app/analytics';
  return view?base+(preview?'&':'?')+'view='+view:base;
};
const labels={replay:'Performance Replay',passport:'Strength Passport',fingerprint:'Training Fingerprint'};

export function AthleteNav({active,preview=false}:{active?:AthleteExperience;preview?:boolean}){
  return <nav className="athlete-nav" aria-label="Training experiences">
    <Link href={athleteHref(undefined,preview)} aria-current={!active?'page':undefined} prefetch={false}>Analytics</Link>
    {athleteViews.map(view=><Link key={view} href={athleteHref(view,preview)} aria-current={active===view?'page':undefined}
      prefetch={false}>{labels[view]}</Link>)}
  </nav>;
}
