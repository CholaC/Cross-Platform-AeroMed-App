require('dotenv').config();
function integer(name,fallback,min=1,max=1000000){const value=Number(process.env[name]||fallback);if(!Number.isInteger(value)||value<min||value>max)throw Error(`Invalid ${name}`);return value;}
const isProd=process.env.NODE_ENV==='production';
module.exports=Object.freeze({
 env:isProd?'production':'development',isProd,
 port:integer('PORT',3000,1,65535),
 dbPath:process.env.DB_PATH||'',
 logLevel:process.env.LOG_LEVEL||(isProd?'info':'debug'),
 trustProxy:process.env.TRUST_PROXY==='1',
 rateLimitWebhookPerMin:integer('RATE_LIMIT_WEBHOOK_PER_MIN',300),
 rateLimitApiPerMin:integer('RATE_LIMIT_API_PER_MIN',300)
});
