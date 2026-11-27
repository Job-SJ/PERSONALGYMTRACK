import type {NextConfig} from 'next';
const config:NextConfig={
  output:process.env.PGT_STANDALONE==='1'?'standalone':undefined,
  poweredByHeader:false,
  devIndicators:false,
  experimental:{serverActions:{bodySizeLimit:'2mb'},cpus:2},
  async headers(){return [{source:'/:path*',headers:[
    {key:'X-Content-Type-Options',value:'nosniff'},
    {key:'Referrer-Policy',value:'no-referrer'},
    {key:'X-Frame-Options',value:'DENY'},
    {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
    {key:'Strict-Transport-Security',value:'max-age=31536000'},
  ]},{source:'/app/nutrition',headers:[
    {key:'Permissions-Policy',value:'camera=(self), microphone=(), geolocation=()'},
  ]},{source:'/sw.js',headers:[
    {key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},
  ]}];},
};
export default config;
