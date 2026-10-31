// Local payer authority, independent of evidence/output directories. A finite
// authorization is one-shot: unused allowance is never reissued automatically.
import { DatabaseSync } from 'node:sqlite';
import { mkdir, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const defaultAccountDirectory=()=>join(homedir(),'.quiet-hours-npc','pursuit-220');
export async function claimExperiment({accountDirectory=defaultAccountDirectory(),authorization,planSha256,runDirectory}){
 await mkdir(accountDirectory,{recursive:true,mode:0o700});
 const databasePath=join(resolve(accountDirectory),'account.sqlite'),db=new DatabaseSync(databasePath);await chmod(databasePath,0o600);
 db.exec(`CREATE TABLE IF NOT EXISTS experiment_runs (
  run_id TEXT PRIMARY KEY, payer TEXT NOT NULL, authorization_reference TEXT NOT NULL,
  plan_hash TEXT NOT NULL, output_directory TEXT NOT NULL, expires_at INTEGER NOT NULL,
  active INTEGER NOT NULL, state TEXT NOT NULL,
  UNIQUE(payer,authorization_reference));
  CREATE UNIQUE INDEX IF NOT EXISTS experiment_one_active_payer ON experiment_runs(payer) WHERE active=1;`);
 try{
  db.exec('BEGIN IMMEDIATE');
  // Expired settled grants cannot dispatch again. Unresolved grants remain a
  // payer stop even after expiry, until their original evidence is reconciled.
  db.prepare('DELETE FROM experiment_runs WHERE active=0 AND expires_at<=?').run(Date.now());
  if(db.prepare('SELECT run_id FROM experiment_runs WHERE run_id=? OR (payer=? AND authorization_reference=?)').get(authorization.runId,authorization.payer,authorization.reference))throw Error('authorization-already-claimed');
  if(db.prepare('SELECT run_id FROM experiment_runs WHERE payer=? AND active=1').get(authorization.payer))throw Error('payer-has-unresolved-run');
  if(db.prepare('SELECT COUNT(*) AS n FROM experiment_runs').get().n>=256)throw Error('account-claim-capacity');
  db.prepare('INSERT INTO experiment_runs VALUES (?,?,?,?,?,?,1,?)').run(authorization.runId,authorization.payer,authorization.reference,planSha256,resolve(runDirectory),authorization.expiresAt,'{}');
  db.exec('COMMIT');
 }catch(error){try{db.exec('ROLLBACK');}catch{}db.close();throw error;}
 const persist=state=>{const text=JSON.stringify(state);if(Buffer.byteLength(text)>256*1024)throw Error('account-state-capacity');const result=db.prepare('UPDATE experiment_runs SET state=? WHERE run_id=? AND output_directory=?').run(text,authorization.runId,resolve(runDirectory));if(result.changes!==1)throw Error('account-claim-mismatch');};
 return {databasePath,persist,finish(state,settledUsage=false){persist(state);if(!state.unresolvedDispatch&&(!state.pendingOperationId||settledUsage))db.prepare('UPDATE experiment_runs SET active=0 WHERE run_id=?').run(authorization.runId);},close(){db.close();}};
}
