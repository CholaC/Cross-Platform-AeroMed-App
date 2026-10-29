const { DatabaseSync } = require('node:sqlite');
module.exports = class Database {
 constructor(path) { this.raw = new DatabaseSync(path); }
 exec(sql) { return this.raw.exec(sql); }
 prepare(sql) { return this.raw.prepare(sql); }
 pragma(sql) { return this.raw.exec('PRAGMA ' + sql); }
 close() { this.raw.close(); }
 transaction(fn) { return (...args) => { this.exec('BEGIN IMMEDIATE'); try { const out=fn(...args); this.exec('COMMIT'); return out; } catch(e) { this.exec('ROLLBACK'); throw e; } }; }
};
