import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import metro from 'expo/metro-config';

const directory=dirname(fileURLToPath(import.meta.url));
const config=metro.getDefaultConfig(directory);
config.watchFolders=[...(config.watchFolders??[]),resolve(directory,'../lib')];
config.resolver.nodeModulesPaths=[...(config.resolver.nodeModulesPaths??[]),resolve(directory,'node_modules')];
const resolveRequest=config.resolver.resolveRequest;
const reactEntry=resolve(directory,'node_modules/react/index.js');
config.resolver.resolveRequest=(context,moduleName,platform)=>{
  // Shared hooks and the Expo renderer must use the same React instance.
  if(moduleName==='react') return context.resolveRequest(context,reactEntry,platform);
  return (resolveRequest??context.resolveRequest)(context,moduleName,platform);
};

export default config;
