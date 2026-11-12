const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const context = { Request, Response, URL };
vm.createContext(context);
vm.runInContext(readFileSync(require('node:path').join(__dirname, '../ip-http-worker.js'), 'utf8').replace('export default', 'globalThis.worker ='), context);
const run = (url, { method = 'GET', headers = {} } = {}) => context.worker.fetch(new Request(url, { method, headers: { 'User-Agent': 'curl/8.10.0', ...headers } }));
test('HTTP Worker answers bare curl for both address families without redirecting or fetching Pages', async () => {
  for (const ip of ['203.0.113.8', '2001:db8::8']) {
    const res = await run('http://ip.xue.moe/', { headers: { 'CF-Connecting-IP': ip } });
    assert.equal(res.status, 200); assert.equal(await res.text(), `${ip}\n`);
    assert.match(res.headers.get('Cache-Control'), /private, no-store/);
    assert.match(res.headers.get('Content-Type'), /text\/plain/);
  }
});
test('browser and other paths still redirect to HTTPS preserving the query', async () => {
  for (const [url, headers] of [['http://ip.xue.moe/?a=1', { Accept: 'text/html' }], ['http://ip.xue.moe/app.js?a=1', {}]]) {
    const res = await run(url, { headers });
    assert.equal(res.status, 301); assert.equal(res.headers.get('Location'), url.replace('http:', 'https:'));
  }
});
test('HEAD, missing edge metadata and unsupported methods are explicit', async () => {
  const head = await run('http://ip.xue.moe/', { method: 'HEAD', headers: { 'CF-Connecting-IP': '203.0.113.8' } });
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  const missing = await run('http://ip.xue.moe/?ip=1.1.1.1', { headers: { 'X-Forwarded-For': '1.1.1.1' } });
  assert.equal(missing.status, 503); assert.doesNotMatch(await missing.text(), /1\.1\.1\.1/);
  const post = await run('http://ip.xue.moe/', { method: 'POST' });
  assert.equal(post.status, 405); assert.equal(post.headers.get('Allow'), 'GET, HEAD');
});
