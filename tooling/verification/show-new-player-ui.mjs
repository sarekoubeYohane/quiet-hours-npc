import assert from 'node:assert/strict';
import http from 'node:http';
import { startApp } from './real-route-runtime.mjs';

const app = await startApp({
  modelResponder(request) {
    const task = JSON.parse(request.messages.at(-1).content).task;
    assert.equal(task, 'character-card-assessment-v1');
    return { bonuses: [] };
  },
});
const login = http.createServer((req, res) => {
  if (req.url !== '/start') {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(303, {
    'Set-Cookie': 'qh_local_owner=ui-journey; Path=/; HttpOnly; SameSite=Lax',
    Location: app.url,
  }).end();
});
await new Promise(resolve => login.listen(0, '127.0.0.1', resolve));
console.log('LOCAL_UI_ENTRY=http://127.0.0.1:' + login.address().port + '/start');
console.log('LOCAL_UI_APP=' + app.url);
process.on('SIGINT', async () => {
  await new Promise(resolve => login.close(resolve));
  await app.close();
  process.exit(0);
});
