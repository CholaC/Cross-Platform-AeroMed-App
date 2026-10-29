// Outbox delivery is decoupled from schedule transactions. Never equate accepted with read.
const {all,one,run}=require('./outreach');
let busy=false;
async function deliver() {
 if(busy)return;busy=true;
 try {for(const n of all("SELECT * FROM sm_notices WHERE status IN ('queued','retry') AND attempts<5 ORDER BY created LIMIT 20")) {
 try {
 if(process.env.DELIVERY_MODE!=='live') {run("UPDATE sm_notices SET status='simulated',attempts=attempts+1 WHERE id=?",n.id);continue;}
 const user=one('SELECT * FROM sm_users WHERE id=?',n.user_id);
 if(n.channel==='sms') {
 if(!process.env.SMS_RELAY_URL)throw Error('SMS relay missing');
 const r=await fetch(process.env.SMS_RELAY_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(process.env.SMS_RELAY_TOKEN||''),'Idempotency-Key':n.id},body:JSON.stringify({to:user.phone,message:n.message,reference:n.id}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('SMS relay rejected');
 }else if(n.channel==='push') {
 const devices=all('SELECT token FROM sm_devices WHERE user_id=?',n.user_id);
 if(!devices.length||!process.env.FCM_PROJECT_ID||!process.env.FCM_ACCESS_TOKEN)throw Error('Push device or credentials missing');
 for(const d of devices) {const r=await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT_ID}/messages:send`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.FCM_ACCESS_TOKEN},body:JSON.stringify({message:{token:d.token,notification:{title:'SkyMed outreach update',body:n.message},data:{noticeId:n.id}}}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('FCM rejected');}
 }
 run("UPDATE sm_notices SET status='provider_accepted',attempts=attempts+1 WHERE id=?",n.id);
 }catch{run("UPDATE sm_notices SET status=CASE WHEN attempts>=4 THEN 'failed' ELSE 'retry' END,attempts=attempts+1 WHERE id=?",n.id);}
 }}finally{busy=false;}
}
module.exports={deliver};
