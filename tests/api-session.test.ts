import {beforeEach,expect,it,vi} from 'vitest';

const stubs=vi.hoisted(()=>{
  const getUser=vi.fn();
  const getAuthenticatorAssuranceLevel=vi.fn();
  const client={auth:{getUser,mfa:{getAuthenticatorAssuranceLevel}}};
  return {getUser,getAuthenticatorAssuranceLevel,client,createClient:vi.fn(()=>client),db:vi.fn(async()=>client)};
});
vi.mock('server-only',()=>({}));
vi.mock('@supabase/supabase-js',()=>({createClient:stubs.createClient}));
vi.mock('../lib/supabase',()=>({db:stubs.db,config:()=>({url:'https://example.invalid',key:'synthetic'})}));
import {apiSession,readJson} from '../lib/api-session';

const jwt='authenticated.synthetic.access-token';
beforeEach(()=>{
  vi.clearAllMocks();
  stubs.getUser.mockResolvedValue({data:{user:{id:'synthetic-user'}},error:null});
  stubs.getAuthenticatorAssuranceLevel.mockResolvedValue({data:{nextLevel:'aal2',currentLevel:'aal2'},error:null});
});

it('binds native queries to the verified bearer session and rejects enrolled AAL1 sessions',async()=>{
  const request=new Request('https://example.invalid/api/mobile',{headers:{Authorization:'Bearer '+jwt}});
  const result=await apiSession(request);
  expect(result.session?.user.id).toBe('synthetic-user');
  expect(stubs.createClient).toHaveBeenCalledWith('https://example.invalid','synthetic',expect.objectContaining({
    global:{headers:{Authorization:'Bearer '+jwt}},
  }));
  expect(stubs.getUser).toHaveBeenCalledWith(jwt);
  expect(stubs.getAuthenticatorAssuranceLevel).toHaveBeenCalledWith(jwt);
  stubs.getAuthenticatorAssuranceLevel.mockResolvedValue({data:{nextLevel:'aal2',currentLevel:'aal1'},error:null});
  expect((await apiSession(request)).response?.status).toBe(403);
  stubs.getUser.mockResolvedValue({data:{user:{id:'synthetic-user',factors:[{status:'verified'}]}},error:null});
  stubs.getAuthenticatorAssuranceLevel.mockResolvedValue({data:{nextLevel:'aal1',currentLevel:'aal1'},error:null});
  expect((await apiSession(request)).response?.status).toBe(403);
  stubs.getUser.mockResolvedValue({data:{user:null},error:new Error()});
  expect((await apiSession(request)).response?.status).toBe(401);
});

it('rejects cross-site browser writes and reads bounded JSON',async()=>{
  const url='https://example.invalid/api/coach';
  expect((await apiSession(new Request(url,{method:'POST',headers:{'sec-fetch-site':'cross-site'}}))).response?.status).toBe(403);
  expect(stubs.db).not.toHaveBeenCalled();
  expect((await apiSession(new Request(url,{method:'POST',headers:{'sec-fetch-site':'same-origin'}}))).session?.user.id).toBe('synthetic-user');
  const make=(body:string)=>new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body});
  expect(await readJson(make(JSON.stringify({body:'x'.repeat(500)})),128)).toBeNull();
  expect(await readJson(make('{"action":"status"}'),128)).toEqual({action:'status'});
});
