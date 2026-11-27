import type {MetadataRoute} from 'next';

export default function manifest():MetadataRoute.Manifest{
  return {
    name:'PERSONALGYMTRACK',
    short_name:'GymTrack',
    description:'Private training, nutrition and strength analytics.',
    start_url:'/app',
    scope:'/',
    display:'standalone',
    background_color:'#141518',
    theme_color:'#141518',
    icons:[192,512].map(size=>({src:`/app-icon-${size}.png`,sizes:`${size}x${size}`,type:'image/png'})),
  };
}
