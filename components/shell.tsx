'use client';
import {useEffect,useRef,useState,type KeyboardEvent,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Activity,Bell,CalendarDays,ChartNoAxesCombined,ChevronDown,ChevronLeft,Dumbbell,Goal,LayoutGrid,List,MessageSquare,Plug,Search,Settings,Target,Trophy,Utensils,Weight,X} from 'lucide-react';

const overview=['','Dashboard',LayoutGrid] as const;
const training=[
  ['workouts','Workout history',List],
  ['calendar','Training calendar',CalendarDays],
  ['analytics','Training analytics',ChartNoAxesCombined],
  ['exercises','Exercise library',Dumbbell],
  ['records','Personal records',Trophy],
  ['wrapped','Training Wrapped',Activity],
] as const;
const primary=[
  ['muscles','Muscle analytics',Target],
  ['nutrition','Nutrition',Utensils],
  ['body','Body analytics',Weight],
  ['goals','Goals',Goal],
  ['settings','Settings',Settings],
] as const;
const integrations=['integrations','Integrations',Plug] as const;
const coach=['coach','Coach',MessageSquare] as const;
const notifications=['notifications','Notifications',Bell] as const;
const pages=[overview,...training,...primary,integrations,coach,notifications];
type Destination=typeof pages[number];

export function Shell({children,preview=false,theme='dark',previewTab=''}:{children:ReactNode;preview?:boolean;theme?:string;previewTab?:string}){
  const [collapsed,setCollapsed]=useState(false);
  const [openTraining,setOpenTraining]=useState<boolean>();
  const [query,setQuery]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  const searchInput=useRef<HTMLInputElement>(null);
  const results=useRef<HTMLDivElement>(null);
  const path=usePathname();
  const section=preview?previewTab:(path.split('/')[2]??'');
  const inTraining=training.some(([key])=>key===section);
  const trainingVisible=openTraining??inTraining;
  function search(){setQuery('');dialog.current?.showModal();searchInput.current?.focus();}
  useEffect(()=>{
    const key=(event:globalThis.KeyboardEvent)=>{
      if ((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();search();}
    };
    window.addEventListener('keydown',key);
    return ()=>window.removeEventListener('keydown',key);
  },[]);

  const href=(key:string)=>preview&&key!=='nutrition' ? (key?'/?tab='+key:'/') : '/app'+(key?'/'+key:'');
  function navigate(key:string,event:{preventDefault:()=>void}){
    setOpenTraining(undefined);
    // Camera permissions are established when the browser loads a document.
    if(key!=='nutrition'&&path!=='/app/nutrition') return;
    event.preventDefault();
    window.location.assign(href(key));
  }
  function resultKeys(event:KeyboardEvent<HTMLDialogElement>){
    const links=Array.from(results.current?.querySelectorAll('a')??[]);
    const focused=links.findIndex(link=>link===document.activeElement);
    if(event.key==='Enter'&&document.activeElement===searchInput.current&&links.length){
      event.preventDefault();
      links[0].click();
    }
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      const next=event.key==='ArrowDown'?focused+1:focused-1;
      if(next<0||next>=links.length) searchInput.current?.focus();
      else links[next].focus();
    }
  }
  function navLink([key,label,Icon]:Destination,shortLabel?:string){
    const current=key===section?'page':shortLabel==='Training'&&inTraining?'location':undefined;
    return <Link title={label} aria-label={label} aria-current={current} key={key} href={href(key)} onNavigate={event=>navigate(key,event)}><Icon size={17}/><span>{shortLabel??label}</span></Link>;
  }
  const destination=pages.find(([key])=>key===section);
  const detail=!preview&&path.split('/').length>3;
  const breadcrumbs=detail&&destination;
  const matches=pages.filter(([key,label])=>(!preview||!['coach','notifications'].includes(key))&&label.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className={'workspace '+(collapsed?'collapsed ':'')+'theme-'+theme}>
    <aside className="sidebar"><Link href={href('')} onNavigate={event=>navigate('',event)} className="brand" aria-label="PERSONALGYMTRACK dashboard"><span className="brand-icon"><Activity size={19}/></span><span className="brand-name">PERSONAL<span>GYM</span>TRACK</span></Link>
    <nav aria-label="Main navigation">
      {navLink(overview)}
      <button type="button" className="nav-disclosure" data-active={inTraining||undefined} aria-label="Training" aria-expanded={trainingVisible&&!collapsed} aria-controls="training-navigation" onClick={()=>{setOpenTraining(collapsed||!trainingVisible);setCollapsed(false);}}><Dumbbell size={17}/><span>Training</span><ChevronDown className="nav-chevron" size={14}/></button>
      <div id="training-navigation" className="nav-children" hidden={!trainingVisible||collapsed}>{training.map(item=>navLink(item))}</div>
      {primary.map(item=>navLink(item))}
      {!preview&&navLink(coach)}
    </nav>
    <button className="collapse quiet" onClick={()=>setCollapsed(value=>!value)} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'}><ChevronLeft size={16}/><span>Collapse sidebar</span></button></aside>
    <div className="main"><header className="topbar">
      {breadcrumbs?<nav aria-label="Breadcrumb"><Link href={href(destination[0])}>{destination[1]}</Link></nav>:<span>{preview?'Setup mode':(destination?.[1]??'Workspace')}</span>}
      <div className="inline">{!preview&&<><Link aria-label="Notifications" className="quiet topbar-icon" href="/app/notifications"><Bell size={17}/></Link>
        <Link aria-label="Settings" className="quiet workspace-settings" href="/app/settings"><Settings size={17}/></Link></>}
        <button onClick={search} className="search"><Search size={16}/> Search <kbd>Ctrl K</kbd></button></div>
    </header>
    <main className="content" key={preview?previewTab:path}>{children}</main></div>
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {preview?<>{navLink(overview,'Overview')}{navLink(training[0],'Training')}{navLink(primary[0],'Muscles')}{navLink(primary[1])}
        <button className="quiet" onClick={search}><Search size={17}/>Browse</button></>:
        <>{navLink(overview,'Today')}{navLink(primary[1])}{navLink(training[0],'Training')}{navLink(training[2],'Progress')}{navLink(coach)}</>}
    </nav>
    <dialog ref={dialog} className="palette" aria-label="Find a page" onKeyDown={resultKeys}><div className="palette-top"><Search size={17}/><input ref={searchInput} aria-label="Find a page" placeholder="Find a page…" value={query} onChange={event=>setQuery(event.target.value)}/><button className="quiet" aria-label="Close search" onClick={()=>dialog.current?.close()}><X size={20}/></button></div>
    <div className="palette-links" ref={results}>{matches.map(([key,label,Icon])=><Link href={href(key)} key={key} onClick={()=>dialog.current?.close()} onNavigate={event=>navigate(key,event)}><Icon size={17}/>{label}</Link>)}{!matches.length&&<p className="empty" role="status">No matching pages</p>}</div></dialog>
  </div>;
}
