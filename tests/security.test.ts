import {afterEach,expect,it,vi} from 'vitest';
import {authCookieOptions} from '../lib/connection-env';
import {searchFoods} from '../app/nutrition-actions';

vi.mock('../lib/supabase',()=>({session:vi.fn().mockResolvedValue({})}));
vi.mock('server-only',()=>({}));

afterEach(()=>vi.unstubAllGlobals());

it('marks production auth cookies secure and keeps both modes HTTP-only and SameSite Lax',()=>{
  expect(authCookieOptions(true)).toEqual({secure:true,httpOnly:true,sameSite:'lax'});
  expect(authCookieOptions(false)).toEqual({secure:false,httpOnly:true,sameSite:'lax'});
});

it('rejects Open Food Facts redirects and returns a generic connection error',async()=>{
  const transport=vi.fn().mockRejectedValue(new TypeError('Synthetic network error'));
  vi.stubGlobal('fetch',transport);
  expect(await searchFoods('barcode','12345678')).toEqual({
    error:'Open Food Facts could not be reached. You can still log a custom food.',
  });
  expect(transport).toHaveBeenCalledOnce();
  expect(transport).toHaveBeenCalledWith(expect.objectContaining({hostname:'world.openfoodfacts.org'}),
    expect.objectContaining({redirect:'error',signal:expect.any(AbortSignal)}));
});
