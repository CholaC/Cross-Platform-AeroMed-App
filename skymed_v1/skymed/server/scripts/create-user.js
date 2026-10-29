// Password comes from stdin; it is never a command-line argument.
const fs=require('node:fs');
const {run,uid,password,db}=require('../src/outreach');
const [username,role,facility,phone]=process.argv.slice(2);
const secret=fs.readFileSync(0,'utf8').trim();
if(!username||!['health_worker','dispatcher','flight_ops'].includes(role)||!/^\d{9,15}$/.test(phone||'')||secret.length<12||(role==='health_worker'&&!facility))throw Error('Usage: node scripts/create-user.js username role facility-or-dash phone < password-file; password minimum 12 characters');
run('INSERT INTO sm_users VALUES(?,?,?,?,?,?)',uid(),username,password(secret),role,facility==='-'?null:facility,phone);
console.log('User created');db.close();
