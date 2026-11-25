import {defineConfig,devices} from '@playwright/test';

const executablePath=process.env.PGT_BROWSER_PATH;
const mode=process.env.PGT_E2E_PRODUCTION==='1'?'start':'dev';
const external=process.env.PGT_E2E_BASE_URL;
export default defineConfig({
  testDir:'./e2e',workers:1,
  use:{baseURL:external??'http://127.0.0.1:3123',launchOptions:{executablePath}},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['Pixel 7']}}],
  webServer:external?undefined:{command:`"${process.execPath}" node_modules/next/dist/bin/next ${mode} --hostname 127.0.0.1 --port 3123`,url:'http://127.0.0.1:3123',timeout:120000,
    env:{NEXT_PUBLIC_SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:''}},
});
