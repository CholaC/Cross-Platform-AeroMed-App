const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'skymed-test-'));
process.env.DB_PATH=path.join(dir,'test.db');process.env.LOG_LEVEL='silent';
const domain=require('../src/outreach');
const {handle}=require('../src/ussd/outreach');
const app=require('../src/app');let server,base,worker,dispatcher;
const future=new Date(Date.now()+14*86400000).toISOString().slice(0,10);
async function call(p,token,body,method='POST') {const r=await fetch(base+'/api/v1'+p,{method:body===undefined?'GET':method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+(token||'')},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
before(async()=>{server=app.listen(0);await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
worker=(await call('/login','',{username:'worker',password:'DemoPass123!'})).data.token;
dispatcher=(await call('/login','',{username:'dispatcher',password:'DemoPass123!'})).data.token;});
after(()=>{server.close();domain.db.close();fs.rmSync(dir,{recursive:true,force:true});});
test('authentication and worker authorisation',async()=>{
 assert.equal((await call('/requests')).status,401);
 assert.equal((await call('/simulation',worker,{samples:200})).status,403);
 assert.equal((await call('/requests',worker,{facility:'102',specialty:'Cardiology',preferred_date:future,request_key:'outside-facility'})).status,403);
});
test('idempotent requests, conflicting retry and stable queue ordering',async()=>{
 const b={facility:'101',specialty:'Cardiology',preferred_date:future,request_key:'request-test-one'};
 const a=await call('/requests',worker,b),retry=await call('/requests',worker,b);
 assert.equal(a.status,201);assert.equal(a.data.id,retry.data.id);assert.equal(a.data.queue_position,1);
 assert.equal((await call('/requests',worker,{...b,specialty:'Surgery'})).status,409);
 const second=await call('/requests',worker,{...b,request_key:'request-test-two'});assert.equal(second.data.queue_position,2);
 assert.equal(a.data.approved_date,null);
});
test('USSD authorised phone, confirmation, retry and expiration',()=>{
 assert.match(handle('s0','260000000000','').text,/not registered/);
 const phone='260977000001';
 assert.match(handle('ussdtest',phone,'','0').text,/Request specialist/);
 handle('ussdtest',phone,'1','1');handle('ussdtest',phone,'1','2');
 assert.match(handle('ussdtest',phone,'2027-02-30','3').text,/valid/);
 handle('ussdtest',phone,future,'4');const a=handle('ussdtest',phone,'1','5');assert.equal(a.end,true);assert.match(a.text,/Queue 3/);
 assert.deepEqual(handle('ussdtest',phone,'1','5'),a);
 handle('expired',phone,'','0');domain.run('UPDATE sm_ussd SET expires=0 WHERE id=?','expired');assert.match(handle('expired',phone,'1','1').text,/expired/);
 assert.match(handle('ussdtest','260977000002','1','5').text,/not registered|another caller/);
});
test('route eligibility and known-distance sanity',async()=>{
 const legs=(await call('/routes?origin=lusaka&destination=101',worker)).data;
 assert.equal(legs.length,2);assert.equal(legs[1].distance_km,145);assert.equal(legs[1].minutes,174);assert.ok(legs[0].distance_km>100&&legs[0].distance_km<110);
 const blocked=(await call('/routes?origin=lusaka&destination=102',worker)).data;
 assert.equal(blocked.find(x=>x.mode==='air').eligible,false);
 assert.equal((await call('/routes?origin=no&destination=101',worker)).status,400);
});
test('approval, assignment conflicts, optimistic revision, changes and cancellation notices',async()=>{
 const b={facility:'101',origin:'lusaka',specialty:'Cardiology',start:future+'T08:00:00Z',end:future+'T16:00:00Z',resource:'air-1',team:'team-1',status:'approved'};
 assert.equal((await call('/visits',worker,b)).status,403);
 const r=await call('/visits',dispatcher,b);assert.equal(r.status,201,JSON.stringify(r));
 const v=r.data;assert.equal((await call('/visits',dispatcher,b)).status,409);
 assert.equal((await call('/visits',dispatcher,{...b,resource:'road-1',team:'team-2'})).status,409);
 let rs=(await call('/requests',worker)).data;assert.equal(rs[0].approved_date,future+'T08:00:00.000Z');
 assert.equal((await call('/notifications',worker)).data.length,3);
 assert.equal((await call('/visits/'+v.id,dispatcher,{...b,status:'changed',expected_revision:0,reason:'Delay'},'PUT')).status,409);
 assert.equal((await call('/visits/'+v.id,dispatcher,{...b,status:'changed',expected_revision:1},'PUT')).status,400);
 const changed=await call('/visits/'+v.id,dispatcher,{...b,status:'changed',expected_revision:1,reason:'New start',start:future+'T09:00:00Z',end:future+'T17:00:00Z'},'PUT');assert.equal(changed.status,200);assert.equal(changed.data.revision,2);
 const cancelled=await call('/visits/'+v.id,dispatcher,{...changed.data,status:'cancelled',expected_revision:2,reason:'Weather'},'PUT');assert.equal(cancelled.status,200);
 rs=(await call('/requests',worker)).data;assert.equal(rs[0].status,'submitted');assert.equal(rs[0].approved_date,null);
 const ns=(await call('/notifications',worker)).data;assert.equal(ns.length,9);assert.ok(ns.some(n=>n.message.includes('cancelled')));
 await require('../src/notifications').deliver();assert.ok((await call('/notifications',worker)).data.some(n=>n.status==='simulated'));
});
test('unavailable resources and too-short travel windows blocked',async()=>{
 const b={facility:'101',origin:'lusaka',specialty:'Cardiology',start:future+'T08:00:00Z',end:future+'T08:30:00Z',resource:'road-1',team:'team-1',status:'draft'};
 assert.equal((await call('/visits',dispatcher,b)).status,409);
 await call('/resources/road-1',dispatcher,{available:false});
 assert.equal((await call('/visits',dispatcher,{...b,end:future+'T20:00:00Z'})).status,409);
});
test('synthetic ML comparison returns holdout metrics and six ranked factors',async()=>{
 const r=await call('/simulation',dispatcher,{samples:200,seed:42});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.data.synthetic,true);assert.equal(r.data.factors.length,6);assert.ok(Number.isFinite(r.data.test.mae));assert.ok(r.data.models.mean_baseline);assert.match(r.data.split,/validation/);
});
test('web assets and gateway callback use the revised outreach contract',async()=>{
 const home=await fetch(base+'/');assert.equal(home.status,200);assert.match(await home.text(),/Outreach coordination/);
 const simulator=await fetch(base+'/simulator.html');assert.match(await simulator.text(),/2575/);
 const response=await fetch(base+'/api/ussd/ontech',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({SESSION_ID:'HTTP_TEST',MSISDN:'260977000001',REQUEST_TYPE:1,STEP_ID:'start',MESSAGE:''})});
 assert.equal(response.status,200);const d=await response.json();assert.equal(d.ussd_response.REQUEST_TYPE,'2');assert.match(d.ussd_response.USSD_BODY,/Request specialist/);
});
