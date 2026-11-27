import {defineConfig,devices} from '@playwright/test';

const executablePath=process.env.PGT_BROWSER_PATH;
const external=process.env.PGT_PRIVATE_E2E_BASE_URL;
const port=Number(process.env.PGT_PRIVATE_E2E_PORT??3141);
const fixturePort=port-1;
const baseURL='http://127.0.0.1:'+port;
const env={
  NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:'+fixturePort,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_fixture',
  SUPABASE_SERVER_SECRET:'sb_secret_synthetic-fixture',
  INTEGRATION_KEYS:JSON.stringify({synthetic:Buffer.alloc(32,7).toString('base64url')}),
  INTEGRATION_ACTIVE_KEY:'synthetic',
  HEVY_API_KEY:'disabled',HEVY_OWNER_ID:'disabled',OPENROUTER_INSTANCE_KEY:'',PGT_PUBLIC_REGISTRATION:'false',
  PGT_NOTIFICATION_JOB_SECRET:'disabled',VAPID_PUBLIC_KEY:'disabled',VAPID_PRIVATE_KEY:'disabled',VAPID_SUBJECT:'disabled',
};
export default defineConfig({
  testDir:'./e2e-private',workers:1,
  use:{baseURL:external??baseURL,launchOptions:{executablePath}},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
  webServer:external?undefined:[
    {command:`"${process.execPath}" e2e-private/fixture.mjs`,url:'http://127.0.0.1:'+fixturePort+'/health',
      env:{PGT_FIXTURE_LISTEN:'1',PGT_FIXTURE_PORT:String(fixturePort)},timeout:20000},
    {command:`"${process.execPath}" node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port ${port}`,url:baseURL+'/api/health',env,timeout:120000},
  ],
});
