import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {z} from 'zod';

const version=z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/);
const base64url=z.string().regex(/^[a-zA-Z0-9_-]+$/);
const envelopeSchema=z.object({
  version,nonce:base64url.length(16),tag:base64url.length(22),ciphertext:base64url.max(1024),
});
type Scope={owner:string;provider:'hevy'|'openrouter'};
type Keyring={active:string;keys:Map<string,Buffer>};

export function credentialKeyring(json:string,active:string):Keyring {
  const values=z.record(version,base64url.length(43)).parse(JSON.parse(json));
  const keys=new Map(Object.entries(values).map(([id,value])=>[id,Buffer.from(value,'base64url')]));
  if(!keys.has(active)) throw new Error('Active credential key is unavailable.');
  return {active,keys};
}

function associatedData(scope:Scope,keyVersion:string) {
  return Buffer.from(JSON.stringify(['personalgymtrack/integration/v1',scope.owner,scope.provider,keyVersion]));
}

export function sealCredential(credential:string,scope:Scope,keyring:Keyring) {
  const key=keyring.keys.get(keyring.active);
  if(!key) throw new Error('Active credential key is unavailable.');
  const nonce=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key,nonce);
  cipher.setAAD(associatedData(scope,keyring.active));
  const ciphertext=Buffer.concat([cipher.update(credential,'utf8'),cipher.final()]);
  return {version:keyring.active,nonce:nonce.toString('base64url'),tag:cipher.getAuthTag().toString('base64url'),ciphertext:ciphertext.toString('base64url')};
}

export function openCredential(stored:unknown,scope:Scope,keyring:Keyring) {
  const envelope=envelopeSchema.parse(stored);
  const key=keyring.keys.get(envelope.version);
  if(!key) throw new Error('Credential key version is unavailable.');
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.nonce,'base64url'));
  decipher.setAAD(associatedData(scope,envelope.version));
  decipher.setAuthTag(Buffer.from(envelope.tag,'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64url')),decipher.final()]).toString('utf8');
}
