// Explicit offline preregistration. Never invoked by the runner or by pnpm test.
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createRuntime } from './pursuit-runtime-228.mjs';
import { digest } from './pursuit-runner-228.mjs';
const directory = await mkdtemp(join(tmpdir(), 'pursuit-export-'));
const runtime = await createRuntime({ databasePath:join(directory,'offline.sqlite') });
try {
  const require=createRequire(import.meta.url), fixture=require('../../tests/fixtures/demand-integration-loop.cjs');
  const service=fixture.initialWorld(runtime.load('world').seedWorld);
  service.contextId='pursuit-220-service-v1'; service.pursuitContext='pursuit-220-service-v1';
  const creative=runtime.load('world').seedWorld();
  creative.contextId='pursuit-220-creative-v1'; creative.pursuitContext='pursuit-220-creative-v1';
  creative.characters=creative.characters.filter(c=>['vera','owner'].includes(c.id));
  creative.characters.find(c=>c.id==='owner').control.mode='taken-over';
  creative.adjudication={provider:'openai',model:'gpt-6-luna'};
  const planPath='tooling/experiments/pursuits-220.json',plan=JSON.parse(await readFile(planPath,'utf8'));
  for(const [name,world] of Object.entries({service,creative})) {
    if(world.characters.some(c=>c.intents.some(n=>n.kind!=='direction'))) throw Error('Preregistration cannot preplant tasks');
    const file='tooling/experiments/pursuits-220.'+name+'.scene.json',bytes=JSON.stringify(world);
    await writeFile(file,bytes);plan.scenes[name]={file,sha256:digest(bytes)};
  }
  await writeFile(planPath,JSON.stringify(plan,null,2)+'\n');
  console.log(JSON.stringify({sceneHashes:plan.scenes,realProviderCalls:0}));
} finally { await runtime.close(); await rm(directory,{recursive:true,force:true}); }
