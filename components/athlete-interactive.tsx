'use client';

import dynamic from 'next/dynamic';

function loading(experience:string){
  return function ExperienceLoading(){
    return <div className="athlete-placeholder" data-experience={experience} aria-busy="true" role="status">Loading experience…</div>;
  };
}
export const LazyPassport=dynamic(()=>import('./strength-passport').then(module=>module.StrengthPassport),{loading:loading('passport')});
export const LazyFingerprint=dynamic(()=>import('./fingerprint-radar').then(module=>module.FingerprintRadar),{loading:loading('fingerprint')});
export const LazyMilestones=dynamic(()=>import('./replay-milestones').then(module=>module.ReplayMilestones),{loading:loading('replay')});
