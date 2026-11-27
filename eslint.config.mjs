import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
const config=[...next, ...ts, {ignores: ['.next/**','.npm-cache/**','next-env.d.ts','playwright-report/**','test-results/**',
  'mobile/.expo/**','mobile/dist/**','mobile/android/**','mobile/ios/**','mobile/node_modules/**']}];
export default config;
