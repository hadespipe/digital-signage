import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createAuth } from '../../server/auth';
import { createApp } from '../../server/app';
import type { Config } from '../../server/config';
const config: Config = { port: 3000, dataDir: '/tmp', adminPasswordHash: 'hash', tvReadToken: 'a'.repeat(40), publicOrigin: 'https://signage.test', allowLanHttp: false };
function setup(verifyPassword = async (password: string) => password === 'correct') {
  let time = 1000;
  const auth = createAuth(config, { now: () => time, verifyPassword });
  const app = createApp({ config, auth });
  app.get('/read', auth.read, c => c.text('ok'));
  app.post('/write', auth.write, c => c.text('ok'));
  app.post('/read', auth.read, c => c.text('unexpected'));
  const login = (password = 'correct', headers: Record<string,string> = {}) => app.request('/api/auth/login', { method: 'POST', headers: { Origin: config.publicOrigin, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({password}) });
  return {app, login, advance: (ms: number) => { time += ms; }};
}
async function credentials(s: ReturnType<typeof setup>) {
  const res = await s.login();
  expect(res.status).toBe(200);
  return { cookie: res.headers.get('set-cookie')!.split(';')[0]!, csrf: (await res.json()).csrfToken as string, res };
}
describe('admin authentication', () => {
  test('random session and csrf; secure cookie; session lookup', async () => {
    const s = setup(); const a = await credentials(s); const b = await credentials(s);
    expect(a.cookie).not.toBe(b.cookie); expect(a.csrf).not.toBe(b.csrf);
    expect(a.res.headers.get('set-cookie')).toContain('HttpOnly'); expect(a.res.headers.get('set-cookie')).toContain('SameSite=Strict'); expect(a.res.headers.get('set-cookie')).toContain('Secure');
    expect(await (await s.app.request('/api/auth/session', { headers: { Cookie:a.cookie }})).json()).toEqual({csrfToken:a.csrf});
    expect((await s.app.request('/api/auth/session')).status).toBe(401);
  });
  test('five failures throttle even spoofed forwarded addresses; reset after window', async () => {
    const s = setup();
    for(let i=0;i<5;i++) expect((await s.login('bad', {'X-Forwarded-For':`192.0.2.${i}`})).status).toBe(401);
    expect((await s.login()).status).toBe(429); s.advance(15*60*1000); expect((await s.login()).status).toBe(200);
  });
  test('login exact origin and safe verifier errors', async () => {
    const s = setup(); for(const origin of ['', 'https://evil.test', 'https://signage.test.evil']) expect((await s.login('correct', {Origin:origin, 'X-Forwarded-Host':'signage.test'})).status).toBe(403);
    expect((await setup(async () => {throw new Error('secret hash');}).login()).status).toBe(401);
  });
  test('authenticated writes require session, exact origin and csrf; logout revokes', async () => {
    const s=setup(); const a=await credentials(s);
    const headers={Cookie:a.cookie, Origin:config.publicOrigin, 'X-CSRF-Token':a.csrf};
    expect((await s.app.request('/write',{method:'POST',headers})).status).toBe(200);
    for(const change of [{Origin:'https://evil.test'}, {'X-CSRF-Token':'wrong'}, {Cookie:''}]) expect((await s.app.request('/write',{method:'POST',headers:{...headers,...change}})).status).not.toBe(200);
    expect((await s.app.request('/api/auth/logout',{method:'POST',headers})).status).toBe(204);
    expect((await s.app.request('/api/auth/session',{headers:{Cookie:a.cookie}})).status).toBe(401);
  });
  test('12 hour expiry and fresh server revoke sessions', async () => {
    const s=setup(); const a=await credentials(s); s.advance(12*60*60*1000);
    expect((await s.app.request('/read',{headers:{Cookie:a.cookie}})).status).toBe(401);
    expect((await setup().app.request('/read',{headers:{Cookie:a.cookie}})).status).toBe(401);
  });
  test('TV header only, read only, rotation rejects predecessor',async()=>{
    const s=setup(); const headers={Authorization:`Bearer ${config.tvReadToken}`};
    expect((await s.app.request('/read',{headers})).status).toBe(200);
    expect((await s.app.request('/read',{method:'POST',headers})).status).toBe(401);
    expect((await s.app.request('/write',{method:'POST',headers:{...headers,Origin:config.publicOrigin}})).status).toBe(401);
    expect((await s.app.request('/read',{headers:{Authorization:'Bearer wrong'}})).status).toBe(401);
    expect((await s.app.request(`/read?token=${config.tvReadToken}`)).status).toBe(401);
    const auth=createAuth({...config,tvReadToken:'b'.repeat(40)}); const app=new Hono(); app.get('/read',auth.read,c=>c.text('ok'));
    expect((await app.request('/read',{headers})).status).toBe(401);
  });
});

test('direct client identity separates throttles; concurrent guesses are reserved', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const auth = createAuth(config, { verifyPassword: async () => { await pending; return false; } });
  const app=createApp({config,auth});
  const req=()=>new Request('https://signage.test/api/auth/login',{method:'POST',headers:{Origin:config.publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({password:'bad'})});
  const guesses=Array.from({length:5},()=>app.fetch(req(),{clientAddress:'192.0.2.1'}));
  expect((await app.fetch(req(),{clientAddress:'192.0.2.1'})).status).toBe(429);
  const other=app.fetch(req(),{clientAddress:'192.0.2.2'});
  release(); expect((await other).status).toBe(401); await Promise.all(guesses);
});

test('Bun password verifier and explicit LAN HTTP cookie behavior', async () => {
  const hash=await Bun.password.hash('correct');
  const localConfig={...config,adminPasswordHash:hash,publicOrigin:'http://signage.test',allowLanHttp:true};
  const app=createApp({config:localConfig});
  const res=await app.request('/api/auth/login',{method:'POST',headers:{Origin:localConfig.publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({password:'correct'})});
  expect(res.status).toBe(200); expect(res.headers.get('set-cookie')).not.toContain('Secure');
});

test('session map evicts oldest session at bounded capacity', async () => {
  const s=setup(); const first=await credentials(s);
  for(let i=0;i<1024;i++) await s.login();
  expect((await s.app.request('/api/auth/session',{headers:{Cookie:first.cookie}})).status).toBe(401);
});

test('throttle map fails closed at capacity and expires', async () => {
  let time=0;
  const auth=createAuth(config,{now:()=>time,verifyPassword:async()=>false}); const app=createApp({config,auth});
  const req=()=>new Request('https://signage.test/api/auth/login',{method:'POST',headers:{Origin:config.publicOrigin,'Content-Type':'application/json'},body:'{"password":"bad"}'});
  for(let i=0;i<4096;i++) await app.fetch(req(),{clientAddress:`client-${i}`});
  expect((await app.fetch(req(),{clientAddress:'new-client'})).status).toBe(429);
  time=15*60*1000;
  expect((await app.fetch(req(),{clientAddress:'new-client'})).status).toBe(401);
});
