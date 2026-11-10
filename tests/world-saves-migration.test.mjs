import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';

test('upgrading existing isolated SQLite worlds preserves exact story, journal, version and lease bytes',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
    for(const file of (await readdir('drizzle')).filter(name=>name.endsWith('.sql')&&name<'0014_world_saves.sql').sort())db.exec(await readFile('drizzle/'+file,'utf8'));
    const state='{"turn":19,"minute":1510,"characters":[{"attributes":{"version":1,"values":{"strength":2}},"memories":[{"text":"已保存的舊故事"}]}],"events":[]}';
    const journal='{"floor":7,"results":{"old":{"status":200,"body":{"world":"saved-result"}}}}';
    db.prepare('INSERT INTO worlds(owner,state,operations,version,locked_until) VALUES(?,?,?,?,?)').run('github:legacy-account',state,journal,42,123456);
    const before=db.prepare('SELECT * FROM worlds').all();
    db.exec(await readFile('drizzle/0014_world_saves.sql','utf8'));
    assert.deepEqual(db.prepare('SELECT * FROM worlds').all(),before);
    const saves=db.prepare('SELECT owner,id,storage_owner,original_opening FROM world_saves').all();
    assert.deepEqual(saves.map(row=>({...row})),[{owner:'github:legacy-account',id:'legacy',storage_owner:'github:legacy-account',original_opening:null}]);
  }finally{db.close();}
});
