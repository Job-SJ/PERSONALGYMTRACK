'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {Activity,CalendarDays,ChartNoAxesCombined,ChevronLeft,Dumbbell,Goal,LayoutGrid,List,Plug,Search,Settings,Target,Trophy,Weight,X} from 'lucide-react';

const groups=[
  ['Overview', [['','Dashboard',LayoutGrid],['calendar','Training calendar',CalendarDays]]],
  ['Training', [['workouts','Workout history',List],['exercises','Exercise library',Dumbbell],['records','Personal records',Trophy],['analytics','Training analytics',ChartNoAxesCombined],['muscles','Muscle analytics',Target]]],
  ['Performance', [['body','Body analytics',Weight],['goals','Goals',Goal],['wrapped','Training Wrapped',Activity]]],
  ['Workspace', [['integrations','Integrations',Plug],['settings','Settings',Settings]]],
] as const;
export function Shell({children,preview=false,theme='dark'}:{children:ReactNode;preview?:boolean;theme?:string}){
  const [collapsed,setCollapsed]=useState(false);
  const [query,setQuery]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  const searchInput=useRef<HTMLInputElement>(null);
  const path=usePathname();
  function search(){setQuery('');dialog.current?.showModal();searchInput.current?.focus();}
  useEffect(()=>{
    const key=(e:KeyboardEvent)=>{if ((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();search();}};
    window.addEventListener('keydown',key);
    return ()=>window.removeEventListener('keydown',key);
  },[]);
  const href=(key:string)=>preview ? (key?'/?tab='+key:'/') : '/app'+(key?'/'+key:'');
  const pages=groups.flatMap(([,items])=>[...items]);
  return <div className={'workspace '+(collapsed?'collapsed ':'')+'theme-'+theme}>
    <aside className="sidebar"><Link href={href('')} className="brand"><span className="brand-icon"><Activity size={21}/></span><span className="brand-name">PERSONAL<span>GYM</span>TRACK</span></Link>
    <nav aria-label="Main navigation">{groups.map(([title,items])=><div className="nav-group" key={title}><p>{title}</p>{items.map(([key,label,Icon])=><Link title={label} aria-current={path===href(key)?'page':undefined} key={key} href={href(key)}><Icon size={17}/><span>{label}</span></Link>)}</div>)}</nav>
    <button className="collapse quiet" onClick={()=>setCollapsed(v=>!v)} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'}><ChevronLeft size={16}/><span>Collapse sidebar</span></button></aside>
    <div className="main"><header className="topbar"><span><span className="signal"/> {preview?'Setup mode':'Private workspace'}</span><button onClick={search} className="search"><Search size={16}/> Search <kbd>Ctrl K</kbd></button></header>
    <main className="content">{children}</main></div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{[pages[0],pages[2],pages[6],pages[7]].map(([key,label,Icon])=><Link key={key} href={href(key)} aria-label={label}><Icon size={19}/>{label.split(' ')[0]}</Link>)}<button className="quiet" onClick={search}><Search size={19}/>Search</button></nav>
    <dialog ref={dialog} className="palette" aria-label="Find a page"><div className="palette-top"><Search size={17}/><input ref={searchInput} aria-label="Find a page" placeholder="Find a page…" value={query} onChange={e=>setQuery(e.target.value)}/><button className="quiet" aria-label="Close search" onClick={()=>dialog.current?.close()}><X size={20}/></button></div>
    <div className="palette-links">{pages.filter(([,label])=>label.toLowerCase().includes(query.toLowerCase())).map(([key,label,Icon])=><Link href={href(key)} key={key} onClick={()=>dialog.current?.close()}><Icon size={17}/>{label}</Link>)}</div></dialog>
  </div>;
}
