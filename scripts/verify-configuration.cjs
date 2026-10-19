// Resolve the real Vite configuration in separate processes without exposing credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const code = `
  import {resolveConfig} from 'vite';
  const config = await resolveConfig({configFile:'vite.config.ts'}, 'serve');
  console.log(JSON.stringify({port:config.server.port, target:config.server.proxy['/api'],
    previewTarget:config.preview.proxy['/api'], strictPort:config.server.strictPort}));
`;
const cases = [
  {name:'default', port:15173, target:'http://127.0.0.1:18080'},
  {name:'environment override', port:17173, target:'http://127.0.0.1:19080'},
];
const results = [];
for (const fixture of cases) {
  const env = {...process.env};
  delete env.COMMERCE_WEB_PORT;
  delete env.COMMERCE_API_TARGET;
  if (fixture.name !== 'default') {
    env.COMMERCE_WEB_PORT = String(fixture.port);
    env.COMMERCE_API_TARGET = fixture.target;
  }
  const child = spawnSync(process.execPath, ['--input-type=module','-e',code],
    {cwd:path.join(root,'web'), env, encoding:'utf8'});
  assert.equal(child.status, 0, child.stderr);
  const actual = JSON.parse(child.stdout.trim());
  assert.equal(actual.port, fixture.port);
  assert.equal(actual.target, fixture.target);
  assert.equal(actual.previewTarget, fixture.target);
  assert.equal(actual.strictPort, true);
  results.push({name:fixture.name, ...actual});
}
const report = {passed:true, scope:'Actual Vite configuration resolution; no runtime config file changes', cases:results};
fs.writeFileSync(path.join(root,'evidence/step-02-configuration.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
