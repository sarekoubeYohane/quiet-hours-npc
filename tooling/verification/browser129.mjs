import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
for(const kind of ['critical-success','success','mixed','failure','critical-failure','flow']){
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./browser129-case.mjs',import.meta.url)),kind],{stdio:'inherit',env:process.env});
 if(result.status!==0)throw Error(`Browser #129 ${kind} failed: ${result.status ?? result.signal}`);
}
