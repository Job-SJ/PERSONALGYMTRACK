import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import metro from 'expo/metro-config';

const directory=dirname(fileURLToPath(import.meta.url));
const config=metro.getDefaultConfig(directory);
config.watchFolders=[...(config.watchFolders??[]),resolve(directory,'../lib')];
config.resolver.nodeModulesPaths=[...(config.resolver.nodeModulesPaths??[]),resolve(directory,'node_modules')];

export default config;
