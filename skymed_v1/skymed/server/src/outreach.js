const db = require('./db');
const {randomUUID, scryptSync, timingSafeEqual, randomBytes} = require('node:crypto');
const {spawn} = require('node:child_process');
const path = require('node:path');
const express = require('express');
const router = express.Router();
const uid = () => randomUUID();
const now = () => new Date().toISOString();
function fail(message, status=400) { const e=new Error(message); e.status=status; throw e; }
const one=(sql,...args)=>db.prepare(sql).get(...args);
const all=(sql,...args)=>db.prepare(sql).all(...args);
const run=(sql,...args)=>db.prepare(sql).run(...args);
db.exec(`
CREATE TABLE IF NOT EXISTS sm_users(id TEXT PRIMARY KEY, username TEXT UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL, facility TEXT, phone TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS sm_sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES sm_users(id),expires INTEGER);
CREATE TABLE IF NOT EXISTS sm_facilities(id TEXT PRIMARY KEY,name TEXT,latitude REAL,longitude REAL,airfield INTEGER);
CREATE TABLE IF NOT EXISTS sm_resources(id TEXT PRIMARY KEY,name TEXT,mode TEXT,speed REAL,available INTEGER,range_km REAL);
CREATE TABLE IF NOT EXISTS sm_teams(id TEXT PRIMARY KEY,name TEXT,specialties TEXT,available INTEGER);
CREATE TABLE IF NOT EXISTS sm_roads(origin TEXT,destination TEXT,distance REAL,speed REAL,eligible INTEGER,source TEXT,PRIMARY KEY(origin,destination));
CREATE TABLE IF NOT EXISTS sm_requests(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE,user_id TEXT REFERENCES sm_users(id),facility TEXT REFERENCES sm_facilities(id),specialty TEXT,preferred_date TEXT,visit_id TEXT,status TEXT,request_key TEXT,created TEXT,UNIQUE(user_id,request_key));
CREATE TABLE IF NOT EXISTS sm_visits(id TEXT PRIMARY KEY,facility TEXT REFERENCES sm_facilities(id),origin TEXT REFERENCES sm_facilities(id),specialty TEXT,start TEXT,end TEXT,resource TEXT REFERENCES sm_resources(id),team TEXT REFERENCES sm_teams(id),status TEXT,revision INTEGER,reason TEXT);
CREATE TABLE IF NOT EXISTS sm_notices(id TEXT PRIMARY KEY,user_id TEXT REFERENCES sm_users(id),visit_id TEXT,revision INTEGER,channel TEXT,message TEXT,status TEXT,attempts INTEGER DEFAULT 0,created TEXT,UNIQUE(user_id,visit_id,revision,channel));
CREATE TABLE IF NOT EXISTS sm_devices(user_id TEXT REFERENCES sm_users(id),token TEXT,PRIMARY KEY(user_id,token));
CREATE TABLE IF NOT EXISTS sm_audit(id TEXT PRIMARY KEY,actor TEXT,action TEXT,entity TEXT,details TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS sm_ussd(id TEXT PRIMARY KEY,phone TEXT,state TEXT,data TEXT,expires INTEGER,last_step TEXT,last_response TEXT);
`);
function password(value,salt=randomBytes(16).toString('hex')) { return salt+':'+scryptSync(value,salt,32).toString('hex'); }
function validPassword(value,stored) { const salt=stored.split(':')[0]; return timingSafeEqual(Buffer.from(password(value,salt)),Buffer.from(stored)); }
function audit(actor,action,entity,details) { run('INSERT INTO sm_audit VALUES(?,?,?,?,?,?)',uid(),actor,action,entity,JSON.stringify(details),now()); }
function seed() {
 if(one('SELECT id FROM sm_facilities LIMIT 1')) return;
 db.transaction(()=>{
 for(const x of [['lusaka','Lusaka base',-15.39,28.32,1],['101','Demo rural facility 101',-14.45,28.45,1],['102','Demo rural facility 102',-16.1,27.85,0]]) run('INSERT INTO sm_facilities VALUES(?,?,?,?,?)',...x);
 for(const x of [['air-1','Demo aircraft','air',240,1,600],['road-1','Demo 4x4','road',55,1,1000]]) run('INSERT INTO sm_resources VALUES(?,?,?,?,?,?)',...x);
 for(const x of [['team-1','Specialist team A','Cardiology,Paediatrics',1],['team-2','Specialist team B','Surgery,Obstetrics',1]]) run('INSERT INTO sm_teams VALUES(?,?,?,?)',...x);
 for(const x of [['lusaka','101',145,50,1,'Synthetic road edge; not surveyed'],['lusaka','102',120,45,1,'Synthetic road edge; not surveyed']]) run('INSERT INTO sm_roads VALUES(?,?,?,?,?,?)',...x);
 if(process.env.NODE_ENV!=='production') {
 for(const x of [['worker','health_worker','101','260977000001'],['dispatcher','dispatcher',null,'260977000002'],['flightops','flight_ops',null,'260977000003']]) run('INSERT INTO sm_users VALUES(?,?,?,?,?,?)',uid(),x[0],password('DemoPass123!'),x[1],x[2],x[3]);
 }
 })();
}
seed();
const specialties=['Cardiology','Paediatrics','Surgery','Obstetrics'];
function auth(req,res,next) {
 const token=(req.get('authorization')||'').replace(/^Bearer /,'');
 req.user=one('SELECT u.* FROM sm_sessions s JOIN sm_users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',token,Date.now());
 if(!req.user) return res.status(401).json({error:'Sign in required'}); next();
}
function planner(u) { if(!['dispatcher','flight_ops'].includes(u.role)) fail('Planner permission required',403); }
function accessible(u,facility) { if(u.role==='health_worker'&&u.facility!==facility) fail('Facility access denied',403); }
function dateOnly(d) { return typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!isNaN(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d; }
function listRequests(u) {
 return all(`SELECT r.*,v.start approved_date,v.status visit_status FROM sm_requests r LEFT JOIN sm_visits v ON v.id=r.visit_id ${u.role==='health_worker'?'WHERE r.facility=?':''} ORDER BY r.seq`,...(u.role==='health_worker'?[u.facility]:[])).map(r=>({...r,approved_date:['approved','changed'].includes(r.visit_status)?r.approved_date:null,queue_position:one("SELECT count(*) n FROM sm_requests WHERE facility=? AND specialty=? AND status='submitted' AND seq<=?",r.facility,r.specialty,r.seq).n || null}));
}
function createRequest(u,b) {
 accessible(u,b.facility);
 if(!one('SELECT id FROM sm_facilities WHERE id=?',String(b.facility||''))||!specialties.includes(b.specialty)||!dateOnly(b.preferred_date)||b.preferred_date<now().slice(0,10)) fail('Valid facility, specialist and current/future requested date required');
 if(typeof b.request_key!=='string'||b.request_key.length<8||b.request_key.length>120) fail('Request key required (8–120 characters)');
 return db.transaction(()=>{
 const old=one('SELECT * FROM sm_requests WHERE user_id=? AND request_key=?',u.id,b.request_key);
 if(old) { if(old.facility!==b.facility||old.specialty!==b.specialty||old.preferred_date!==b.preferred_date) fail('Request key reused with different content',409); return listRequests(u).find(r=>r.id===old.id); }
 const id=uid(); run("INSERT INTO sm_requests(id,user_id,facility,specialty,preferred_date,status,request_key,created) VALUES(?,?,?,?,?,'submitted',?,?)",id,u.id,b.facility,b.specialty,b.preferred_date,b.request_key,now());
 audit(u.id,'request.created',id,b); return listRequests(u).find(r=>r.id===id);
 })();
}
function haversine(a,b) { const rad=x=>x*Math.PI/180; const dl=rad(b.latitude-a.latitude),dn=rad(b.longitude-a.longitude); return 6371*2*Math.asin(Math.sqrt(Math.sin(dl/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dn/2)**2)); }
function compare(origin,destination) {
 if(typeof origin!=='string'||typeof destination!=='string')fail('Origin and destination are required');
 const a=one('SELECT * FROM sm_facilities WHERE id=?',origin),b=one('SELECT * FROM sm_facilities WHERE id=?',destination);
 if(!a||!b||origin===destination) fail('Choose different known origin and destination');
 const road=one('SELECT * FROM sm_roads WHERE (origin=? AND destination=?) OR (origin=? AND destination=?)',origin,destination,destination,origin);
 return all('SELECT * FROM sm_resources').map(r=>{
 const distance=r.mode==='air'?haversine(a,b):road?.distance;
 const eligible=!!r.available&&!!distance&&distance<=r.range_km&&(r.mode==='air'?!!(a.airfield&&b.airfield):!!road?.eligible);
 return {resource:r.id,name:r.name,mode:r.mode,eligible,distance_km:distance?Math.round(distance*10)/10:null,minutes:eligible?Math.ceil(distance/(r.mode==='air'?r.speed:Math.min(r.speed,road.speed))*60):null,reason:eligible?'Eligible in synthetic scenario':!r.available?'Resource unavailable':r.mode==='air'&&!(a.airfield&&b.airfield)?'No eligible airfield':!distance?'No verified road edge':'Route unavailable or exceeds range',source:r.mode==='air'?'Haversine geographic estimate; not an approved flight route':road?.source||'No route data'};
 });
}
function conflicts(b,exclude='') {
 const errors=[];
 if(['facility','origin','specialty','start','end','resource','team'].some(k=>typeof b[k]!=='string'||!b[k]))fail('Facility, origin, specialist, timestamps, resource and team are required');
 const route=compare(b.origin,b.facility).find(r=>r.resource===b.resource);
 const team=one('SELECT * FROM sm_teams WHERE id=?',String(b.team||''));
 if(!route?.eligible) errors.push('Transport leg is not eligible');
 if(!team?.available||!team.specialties.split(',').includes(b.specialty)) errors.push('Team unavailable or specialty mismatch');
 const start=Date.parse(b.start),end=Date.parse(b.end);
 if(!/T.*(Z|[+-]\d{2}:\d{2})$/.test(b.start)||!/T.*(Z|[+-]\d{2}:\d{2})$/.test(b.end)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||start<Date.now()) errors.push('Use a future start and later end');
 if(route?.eligible&&(end-start)/60000<route.minutes*2+60) errors.push('Reserve round-trip travel plus at least 60 minutes for outreach');
 if(Number.isFinite(start)&&Number.isFinite(end)) for(const v of all("SELECT * FROM sm_visits WHERE id<>? AND status<>'cancelled' AND (resource=? OR team=?)",exclude,b.resource||'',b.team||'')) if(start<Date.parse(v.end)&&end>Date.parse(v.start)) errors.push(`Overlap with visit ${v.id} (${v.resource===b.resource?'resource':'team'})`);
 return errors;
}
function notices(v) {
 for(const u of all("SELECT * FROM sm_users WHERE facility=? AND role='health_worker'",v.facility)) for(const channel of ['in_app','sms','push']) run('INSERT OR IGNORE INTO sm_notices(id,user_id,visit_id,revision,channel,message,status,created) VALUES(?,?,?,?,?,?,?,?)',uid(),u.id,v.id,v.revision,channel,`${v.specialty} outreach ${v.status}: ${v.start}. Revision ${v.revision}. ${v.reason||''}`,channel==='in_app'?'available':'queued',now());
}
function saveVisit(u,b,id) {
 planner(u);
 return db.transaction(()=>{
 const old=id?one('SELECT * FROM sm_visits WHERE id=?',id):null;
 if(id&&!old) fail('Visit not found',404);
 if(old&&b.expected_revision!==old.revision) fail('Schedule changed; refresh before saving',409);
 if(old?.status==='cancelled') fail('Cancelled visits cannot be edited',409);
 if(!['draft','approved','changed','cancelled'].includes(b.status)||!specialties.includes(b.specialty)) fail('Invalid schedule status or specialty');
 if(!old&&['changed','cancelled'].includes(b.status)) fail('Create a draft or approved visit first');
 if(old&&['approved','changed'].includes(old.status)&&!['changed','cancelled'].includes(b.status)) fail('Approved visits must be changed or cancelled');
 if(old&&['changed','cancelled'].includes(b.status)&&!String(b.reason||'').trim()) fail('A revision reason is required');
 const errors=b.status==='cancelled'?[]:conflicts(b,id);
 if(errors.length) fail(errors.join('; '),409);
 if(b.status==='cancelled') b={...old,status:'cancelled',reason:b.reason};
 const vid=id||uid(),revision=(old?.revision||0)+1;
 run(`INSERT INTO sm_visits VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET facility=excluded.facility,origin=excluded.origin,specialty=excluded.specialty,start=excluded.start,end=excluded.end,resource=excluded.resource,team=excluded.team,status=excluded.status,revision=excluded.revision,reason=excluded.reason`,vid,b.facility,b.origin,b.specialty,new Date(b.start).toISOString(),new Date(b.end).toISOString(),b.resource,b.team,b.status,revision,b.reason||'');
 if(old&&(old.facility!==b.facility||old.specialty!==b.specialty)) run("UPDATE sm_requests SET visit_id=NULL,status='submitted' WHERE visit_id=?",vid);
 if(['approved','changed'].includes(b.status)) run("UPDATE sm_requests SET visit_id=?,status='scheduled' WHERE facility=? AND specialty=? AND (visit_id=? OR (status='submitted' AND preferred_date<=?))",vid,b.facility,b.specialty,vid,new Date(b.start).toISOString().slice(0,10));
 if(b.status==='cancelled') run("UPDATE sm_requests SET status='submitted',visit_id=NULL WHERE visit_id=?",vid);
 const v=one('SELECT * FROM sm_visits WHERE id=?',vid);
 if(b.status!=='draft') { if(old&&old.facility!==v.facility) notices({...old,status:'cancelled',reason:'Visit moved to another facility',revision}); notices(v); }
 audit(u.id,'visit.'+b.status,vid,{before:old,after:v}); return v;
 })();
}
router.post('/login',(req,res,next)=>{try { const u=one('SELECT * FROM sm_users WHERE username=?',String(req.body.username||'')); if(!u||!validPassword(String(req.body.password||''),u.password)) fail('Invalid credentials',401); const token=randomBytes(32).toString('hex'); run('INSERT INTO sm_sessions VALUES(?,?,?)',token,u.id,Date.now()+8*3600000); res.json({token,user:{id:u.id,username:u.username,role:u.role,facility:u.facility}}); }catch(e){next(e);}});
router.use(auth);
router.post('/logout',(req,res)=>{run('DELETE FROM sm_devices WHERE user_id=?',req.user.id);run('DELETE FROM sm_sessions WHERE token=?',req.get('authorization').slice(7));res.json({ok:true});});
router.get('/catalog',(req,res)=>res.json({facilities:all('SELECT * FROM sm_facilities'),resources:all('SELECT * FROM sm_resources'),teams:all('SELECT * FROM sm_teams'),specialties}));
router.get('/requests',(req,res)=>res.json(listRequests(req.user)));
router.post('/requests',(req,res)=>res.status(201).json(createRequest(req.user,req.body)));
router.get('/routes',(req,res)=>res.json(compare(String(req.query.origin||''),String(req.query.destination||''))));
router.get('/visits',(req,res)=>res.json(req.user.role==='health_worker'?all("SELECT * FROM sm_visits WHERE facility=? AND status<>'draft'",req.user.facility):all('SELECT * FROM sm_visits ORDER BY start')));
router.post('/visits',(req,res)=>res.status(201).json(saveVisit(req.user,req.body)));
router.put('/visits/:id',(req,res)=>res.json(saveVisit(req.user,req.body,req.params.id)));
router.post('/conflicts',(req,res)=>{planner(req.user);res.json({conflicts:conflicts(req.body,req.body.id)});});
router.get('/notifications',(req,res)=>res.json(all('SELECT * FROM sm_notices WHERE user_id=? ORDER BY created DESC',req.user.id)));
router.post('/devices',(req,res)=>{const t=req.body.token;if(typeof t!=='string'||t.length<10||t.length>4096)fail('Invalid push token');db.transaction(()=>{run('DELETE FROM sm_devices WHERE token=?',t);run('INSERT INTO sm_devices VALUES(?,?)',req.user.id,t);})();res.json({registered:true});});
router.get('/audit',(req,res)=>{planner(req.user);res.json(all('SELECT * FROM sm_audit ORDER BY created DESC LIMIT 200'));});
router.post('/resources/:id',(req,res)=>{planner(req.user);if(typeof req.body.available!=='boolean')fail('available must be boolean');if(!one('SELECT * FROM sm_resources WHERE id=?',req.params.id))fail('Unknown resource',404);run('UPDATE sm_resources SET available=? WHERE id=?',Number(req.body.available),req.params.id);audit(req.user.id,'resource.availability',req.params.id,req.body);res.json({ok:true});});
let modelling=false;
router.post('/simulation',(req,res,next)=>{
 try {planner(req.user);if(modelling)fail('Simulation already running',409);
 const n=Number(req.body.samples||600),seed=Number(req.body.seed??42);
 if(!Number.isInteger(n)||n<200||n>5000||!Number.isInteger(seed)||seed<0||seed>2147483647)fail('Use 200–5000 samples and a nonnegative integer seed');
 modelling=true;const p=spawn(process.env.PYTHON||'python3',[path.join(__dirname,'../ml/simulate.py'),String(n),String(seed)]);
 let out='',finished=false;const timer=setTimeout(()=>p.kill(),60000);
 const done=()=>{clearTimeout(timer);modelling=false;};
 p.stdout.on('data',d=>out+=d);p.stderr.on('data',()=>{});
 p.on('error',e=>{finished=true;done();next(e);});p.on('close',code=>{done();if(finished)return;if(code!==0)return next(Object.assign(new Error('ML service unavailable; install Python requirements'),{status:503}));try{const result=JSON.parse(out);audit(req.user.id,'simulation.run',uid(),{samples:n,seed,best_model:result.best_model});res.json(result);}catch(e){next(e);}});
 }catch(e){next(e);}
});
router.use((err,req,res,next)=>{if(!err.status)require('./logger').error({err},'outreach failure');res.status(err.status||500).json({error:err.status?err.message:'Operation failed; check server logs'});});
module.exports={router,db,one,all,run,uid,now,specialties,createRequest,listRequests,compare,conflicts,saveVisit,password};
