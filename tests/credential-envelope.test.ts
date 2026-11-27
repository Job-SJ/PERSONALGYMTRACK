import {expect,it} from 'vitest';
import {credentialKeyring,openCredential,sealCredential} from '../lib/credential-envelope';

const first=Buffer.alloc(32,8).toString('base64url');
const second=Buffer.alloc(32,4).toString('base64url');
const scope={owner:'synthetic-user-one',provider:'hevy'} as const;

it('encrypts with fresh nonces and authenticates the owner, provider and payload',()=>{
  const keys=credentialKeyring(JSON.stringify({first}),'first');
  const credential='synthetic-provider-token';
  const stored=sealCredential(credential,scope,keys);
  expect(JSON.stringify(stored)).not.toContain(credential);
  expect(sealCredential(credential,scope,keys).nonce).not.toBe(stored.nonce);
  expect(openCredential(stored,scope,keys)).toBe(credential);
  expect(()=>openCredential(stored,{...scope,owner:'synthetic-user-two'},keys)).toThrow();
  expect(()=>openCredential(stored,{...scope,provider:'openrouter'},keys)).toThrow();
  const ciphertext=(stored.ciphertext[0]==='A'?'B':'A')+stored.ciphertext.slice(1);
  expect(()=>openCredential({...stored,ciphertext},scope,keys)).toThrow();
});

it('reads old versions while rotating and can retire old keys after re-encryption',()=>{
  const previous=credentialKeyring(JSON.stringify({first}),'first');
  const rotated=credentialKeyring(JSON.stringify({first,second}),'second');
  const current=credentialKeyring(JSON.stringify({second}),'second');
  const original=sealCredential('synthetic-provider-token',scope,previous);
  const reencrypted=sealCredential(openCredential(original,scope,rotated),scope,rotated);
  expect(reencrypted.version).toBe('second');
  expect(openCredential(reencrypted,scope,current)).toBe('synthetic-provider-token');
  expect(()=>openCredential(original,scope,current)).toThrow();
});
