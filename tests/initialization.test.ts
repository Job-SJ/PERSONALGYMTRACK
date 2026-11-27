import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {expect,it} from 'vitest';

it('requires local interactive administrator access to initialize',()=>{
  const path=fileURLToPath(new URL('../scripts/initialize.mjs',import.meta.url));
  const run=spawnSync(process.execPath,[path],{input:'synthetic data',encoding:'utf8',timeout:5000});
  expect(run.status).toBe(1);
  expect(run.stderr).toContain('interactive local terminal');
  expect(run.stdout).toBe('');
});
