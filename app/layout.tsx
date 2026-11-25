import type {Metadata} from 'next';
import {connection} from 'next/server';
import './style.css';
export const metadata:Metadata={title:'PERSONALGYMTRACK',description:'Private strength and training analytics.'};
export default async function Layout({children}:{children:React.ReactNode}){
  await connection();
  return <html lang="en"><body>{children}</body></html>;
}
