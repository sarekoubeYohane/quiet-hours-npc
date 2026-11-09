/* eslint-disable @typescript-eslint/no-require-imports -- Validate the auth runner hosting boundary against actual SQLite. */
const test=require('node:test'),assert=require('node:assert/strict'),{join}=require('node:path');
const fixture=require(join(process.env.QUIET_HOURS_AUTH_BUILD,'fixture.cjs'));
const reset=()=>{fixture.reset();fixture.migrate('CREATE TABLE fixture_atomic (id TEXT PRIMARY KEY,value TEXT NOT NULL)');};
test('auth D1 bound statements keep their own values and all reads the actual saved rows',async()=>{
 reset();const prepared=fixture.env.DB.prepare('INSERT INTO fixture_atomic(id,value) VALUES (?,?)');
 const first=prepared.bind('a','first'),second=prepared.bind('b','second');
 await first.run();await second.run();
 assert.deepEqual((await fixture.env.DB.prepare('SELECT id,value FROM fixture_atomic ORDER BY id').all()).results.map(row=>({...row})),[{id:'a',value:'first'},{id:'b',value:'second'}]);
});
test('auth D1 batch is atomic to a concurrent ordinary read and rolls all writes back on failure',async()=>{
 reset();const db=fixture.env.DB;await db.prepare('INSERT INTO fixture_atomic(id,value) VALUES (?,?)').bind('a','original').run();
 const failed=db.batch([db.prepare('UPDATE fixture_atomic SET value=? WHERE id=?').bind('partial','a'),db.prepare('INSERT INTO fixture_atomic(id,value) VALUES (?,?)').bind('a','duplicate')]);
 const read=db.prepare('SELECT value FROM fixture_atomic WHERE id=?').bind('a').first();
 await assert.rejects(failed,/UNIQUE/);assert.equal((await read).value,'original');
 await db.batch([db.prepare('UPDATE fixture_atomic SET value=? WHERE id=?').bind('committed','a'),db.prepare('INSERT INTO fixture_atomic(id,value) VALUES (?,?)').bind('b','second')]);
 assert.equal((await db.prepare('SELECT COUNT(*) AS total FROM fixture_atomic').first()).total,2);assert.equal((await db.prepare('SELECT value FROM fixture_atomic WHERE id=?').bind('a').first()).value,'committed');
});
