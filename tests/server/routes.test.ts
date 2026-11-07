import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { createApp } from '../../server/app';
import { createAuth } from '../../server/auth';
import { openPlaylist } from '../../server/playlist';
const config = { port:3000, dataDir:'/unused', adminPasswordHash:'hash', tvReadToken:'secret-tv', publicOrigin:'https://signage.test', allowLanHttp:false };
const dirs:string[]=[];
afterEach(async()=>{await Promise.all(dirs.splice(0).map(dir=>rm(dir,{recursive:true,force:true})));});
const png=await sharp({create:{width:2,height:2,channels:3,background:'red'}}).png().toBuffer();
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'routes-')); dirs.push(dir); const store=await openPlaylist(dir);
 const app=createApp({config,store,auth:createAuth(config,{verifyPassword:async()=>true})});
 const login=await app.request('/api/auth/login',{method:'POST',headers:{Origin:config.publicOrigin,'Content-Type':'application/json'},body:'{"password":"ok"}'});
 const headers={Cookie:login.headers.get('set-cookie')!.split(';')[0]!,Origin:config.publicOrigin,'X-CSRF-Token':(await login.json()).csrfToken};
 const upload=(files:Uint8Array[]= [png])=>{const body=new FormData();for(const bytes of files)body.append('images',new Blob([bytes as BlobPart],{type:'image/png'}),'x.png');return app.request('/api/images',{method:'POST',headers,body});};
 return {app,store,headers,upload};
}
const tv={Authorization:`Bearer ${config.tvReadToken}`,Origin:'null'};
test('protected reads, header-only TV access and read-only CORS',async()=>{
 const {app,headers}=await setup();
 for(const path of ['/api/playlist',`/api/playlist?token=${config.tvReadToken}`])expect((await app.request(path)).status).toBe(401);
 const read=await app.request('/api/playlist',{headers:tv});expect(read.status).toBe(200);expect(read.headers.get('cache-control')).toBe('no-store');expect(read.headers.get('access-control-allow-origin')).toBe('*');expect(read.headers.get('access-control-allow-credentials')).toBeNull();
 expect((await app.request('/api/playlist',{headers})).status).toBe(200);
 const preflight=await app.request('/api/playlist',{method:'OPTIONS',headers:{Origin:'null','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'Authorization'}});expect(preflight.status).toBe(204);expect(preflight.headers.get('access-control-allow-headers')).toContain('Authorization');
 const write=await app.request('/api/images',{method:'POST',headers:tv});expect(write.status).toBe(401);expect(write.headers.get('access-control-allow-origin')).toBeNull();
});
test('zero, one and five uploads, image bytes, reorder and delete',async()=>{
 const s=await setup();expect((await s.upload([])).status).toBe(422);
 const first=await s.upload();expect(first.status).toBe(201);const one=await first.json();
 const image=await s.app.request(one.images[0].path,{headers:tv});expect(image.status).toBe(200);expect(image.headers.get('content-type')).toBe('image/jpeg');expect(image.headers.get('cache-control')).toBe('no-store');
 const added=await s.upload([png,png,png,png]);expect(added.status).toBe(201);const five=await added.json();expect(five.images).toHaveLength(5);expect((await s.upload()).status).toBe(409);
 const ids=five.images.map((i:{id:string})=>i.id).reverse();const order=await s.app.request('/api/playlist/order',{method:'PUT',headers:{...s.headers,'Content-Type':'application/json'},body:JSON.stringify({ids})});expect(order.status).toBe(200);expect((await order.json()).images.map((i:{id:string})=>i.id)).toEqual(ids);
 expect((await s.app.request(`/api/images/${ids[0]}`,{method:'DELETE',headers:s.headers})).status).toBe(200);
 expect((await s.app.request(`/api/images/${ids[0]}`,{headers:tv})).status).toBe(404);
});
test('invalid batches are atomic, unknown ids safe, session origin and csrf required',async()=>{
 const s=await setup();expect((await s.upload([png,new TextEncoder().encode('spoofed MIME secret /tmp/path')])).status).toBe(422);expect((await s.store.read()).images).toHaveLength(0);
 for(const [headers,status] of [[{},401],[{...s.headers,Origin:'https://evil.test'},403],[{...s.headers,'X-CSRF-Token':'wrong'},403]] as const)expect((await s.app.request('/api/images',{method:'POST',headers})).status).toBe(status);
 for(const id of ['unknown','..%2Fsecret']){const r=await s.app.request(`/api/images/${id}`,{headers:tv});expect(r.status).toBe(404);expect(await r.text()).not.toContain('/tmp');}
});
test('file and streamed total limits are enforced',async()=>{
 const s=await setup();expect((await s.upload([new Uint8Array(10*1024*1024+1)])).status).toBe(413);
 let chunks=0;const stream=new ReadableStream<Uint8Array>({pull(c){chunks++;c.enqueue(new Uint8Array(1024*1024));if(chunks===60)c.close();}});
 const response=await s.app.request('/api/images',{method:'POST',headers:{...s.headers,'Content-Type':'multipart/form-data; boundary=x'},body:stream,duplex:'half'} as RequestInit);expect(response.status).toBe(413);expect(chunks).toBeLessThan(60);
});
test('simultaneous batches respect capacity',async()=>{const s=await setup();const results=await Promise.all([s.upload([png,png,png]),s.upload([png,png,png])]);expect(results.map(r=>r.status).sort()).toEqual([201,409]);expect((await s.store.read()).images).toHaveLength(3);});
test('five-file batch succeeds atomically and invalid order is unchanged',async()=>{
 const s=await setup();const res=await s.upload([png,png,png,png,png]);expect(res.status).toBe(201);const before=await s.store.read();
 const result=await s.app.request('/api/playlist/order',{method:'PUT',headers:{...s.headers,'Content-Type':'application/json'},body:JSON.stringify({ids:before.images.map(()=>before.images[0]!.id)})});expect(result.status).toBe(422);expect(await s.store.read()).toEqual(before);
 const preflight=await s.app.request('/api/images/unknown',{method:'OPTIONS',headers:{Origin:'https://evil.test','Access-Control-Request-Method':'DELETE'}});expect(preflight.status).toBe(403);expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
});
test('unexpected storage failures return a safe response',async()=>{
 const s=await setup();s.store.read=async()=>{throw new Error(`/private/data ${config.tvReadToken}`);};
 const r=await s.app.request('/api/playlist',{headers:tv});expect(r.status).toBe(500);expect(await r.json()).toEqual({error:{code:'HTTP_500',message:'Internal server error'}});
});

test('third buffered upload is rejected and failed bodies release admission',async()=>{
 const s=await setup();
 const controllers:ReadableStreamDefaultController<Uint8Array>[]=[];
 const pending=()=>s.app.request('/api/images',{method:'POST',headers:{...s.headers,'Content-Type':'multipart/form-data; boundary=x'},body:new ReadableStream<Uint8Array>({start(c){controllers.push(c);}}),duplex:'half'} as RequestInit);
 const first=pending(),second=pending();
 // Both requests enter body reads before the next event-loop turn.
 await new Promise(resolve=>setTimeout(resolve,0));
 expect((await s.upload()).status).toBe(429);
 for(const controller of controllers)controller.close();
 expect((await first).status).toBe(400);expect((await second).status).toBe(400);
 expect((await s.upload()).status).toBe(201);
});
