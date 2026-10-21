import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// Serverless Chromium uses a single process. Isolate browser lifetimes rather
// than closing contexts beneath the shared browser process between scenarios.
for(const kind of ['critical-success','success','mixed','failure','critical-failure','continue','interrupt']){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./browser127-case.mjs',import.meta.url)),kind],{stdio:'inherit',env:process.env});
 if(result.status!==0)throw Error(`Browser #127 ${kind} failed: ${result.status ?? result.signal}`);
}
