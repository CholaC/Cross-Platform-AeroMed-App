const {one,run,createRequest,listRequests,specialties}=require('../outreach');
const menu='SkyMed outreach\n1 Request specialist\n2 Queue and approved date\n3 Approved visits\n0 Exit';
function handle(id,phone,input,step) {
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)||!/^\d{9,15}$/.test(phone)) return {end:true,text:'Invalid session or registered phone'};
 const u=one("SELECT * FROM sm_users WHERE phone=? AND role='health_worker'",phone);
 if(!u) return {end:true,text:'Phone not registered to a health professional. Contact administrator.'};
 let s=one('SELECT * FROM sm_ussd WHERE id=?',id);
 if(s&&s.phone!==phone)return {end:true,text:'Session belongs to another caller'};
 if(s&&s.expires<Date.now()) {run('DELETE FROM sm_ussd WHERE id=?',id);return {end:true,text:'Session expired. Dial again. No new submission confirmed.'};}
 if(s&&step&&s.last_step===step)return JSON.parse(s.last_response);
 if(s?.state==='END')return JSON.parse(s.last_response);
 s=s||{state:'MAIN',data:'{}'};const data=JSON.parse(s.data);let text=menu,end=false;
 input=String(input||'').trim();
 if(input==='0'){text='Session ended';end=true;}
 else if(s.state==='MAIN') {
 if(input==='1') {s.state='SPECIALTY';text=specialties.map((x,i)=>`${i+1} ${x}`).join('\n');}
 else if(input==='2') {text=listRequests(u).slice(-3).map(r=>`${r.specialty}: queue ${r.status==='submitted'?r.queue_position:'scheduled'}, requested ${r.preferred_date}, approved ${r.approved_date||'pending'}`).join('\n')||'No requests';end=true;}
 else if(input==='3') {const vs=require('../outreach').all("SELECT * FROM sm_visits WHERE facility=? AND status IN ('approved','changed') ORDER BY start",u.facility);text=vs.slice(0,3).map(v=>`${v.specialty}: ${v.start}`).join('\n')||'No approved visits';end=true;}
 }else if(s.state==='SPECIALTY') {
 if(!specialties[Number(input)-1])text='Invalid specialist. Enter 1–4';
 else {data.specialty=specialties[Number(input)-1];s.state='DATE';text='Requested visit date? YYYY-MM-DD. Subject to approval.';}
 }else if(s.state==='DATE') {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input)||isNaN(Date.parse(input))||new Date(input).toISOString().slice(0,10)!==input||input<new Date().toISOString().slice(0,10))text='Enter a valid current/future date YYYY-MM-DD';
 else {data.date=input;s.state='CONFIRM';text=`${data.specialty}, ${input}\n1 Submit\n0 Cancel`;}
 }else if(s.state==='CONFIRM') {
 if(input==='1') {try {const r=createRequest(u,{facility:u.facility,specialty:data.specialty,preferred_date:data.date,request_key:'ussd-'+id});text=`Submitted ${r.id.slice(0,8)}. Queue ${r.queue_position}. Requested ${r.preferred_date}. Approved date pending.`;end=true;}catch(e){text=e.message;end=true;}}
 else text='1 Submit or 0 Cancel';
 }
 const out={end,text};run('INSERT INTO sm_ussd VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,data=excluded.data,expires=excluded.expires,last_step=excluded.last_step,last_response=excluded.last_response',id,phone,end?'END':s.state,JSON.stringify(data),Date.now()+300000,step||'',JSON.stringify(out));return out;
}
module.exports={handle};
