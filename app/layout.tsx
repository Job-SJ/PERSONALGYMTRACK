import type {Metadata,Viewport} from 'next';
import {connection} from 'next/server';
import './style.css';
import {AppWorker} from '../components/app-worker';
export const metadata:Metadata={title:'PERSONALGYMTRACK',description:'Private strength and training analytics.',icons:{apple:'/app-icon-192.png',icon:'/app-icon-192.png'}};
export const viewport:Viewport={viewportFit:'cover',themeColor:'#141518'};
export default async function Layout({children}:{children:React.ReactNode}){
  await connection();
  return <html lang="en"><body>{children}<AppWorker/></body></html>;
}
