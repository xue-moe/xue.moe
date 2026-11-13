const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = readFileSync(path.join(root, 'functions/[[path]].js'), 'utf8');
const app = readFileSync(path.join(root, 'ip/app.js'), 'utf8');
function router(fetchImpl = () => { throw new Error('Unexpected upstream request'); }) {
  const context = { Request, Response, Headers, URL, TextDecoder, AbortController, setTimeout, clearTimeout, console, fetch: fetchImpl };
  vm.createContext(context);
  vm.runInContext(source.replace('export async function onRequest', 'async function onRequest'), context);
  return context.onRequest;
}
function ctx(url, { ip, cf, method = 'GET', headers = {} } = {}) {
  const request = new Request(url, { method, headers: { ...(ip ? { 'CF-Connecting-IP': ip } : {}), ...headers } });
  if (cf) Object.defineProperty(request, 'cf', { value: cf });
  return { request, env: { ASSETS: { fetch: async req => new Response(new URL(req.url).pathname, { headers: { 'Content-Type': 'text/html' } }) } }, next: async () => new Response('next') };
}
test('IP API reports only this request metadata and never caches or trusts forwarded input', async () => {
  const run = router();
  const first = await run(ctx('https://ip.xue.moe/api/ip?ip=1.1.1.1', { ip: '203.0.113.4', cf: { country: 'AU', asn: 64500, colo: 'PER' } }));
  const data = await first.json();
  assert.equal(data.ip, '203.0.113.4'); assert.equal(data.colo, 'PER'); assert.equal(data.asn, 64500);
  assert.match(first.headers.get('Cache-Control'), /private, no-store/);
  const second = await run(ctx('https://ip.xue.moe/api/ip', { ip: '2001:db8::7' }));
  assert.equal((await second.json()).country, null);
  const missing = await run(ctx('https://ip.xue.moe/api/ip', { headers: { 'X-Forwarded-For': '1.1.1.1' } }));
  assert.equal(missing.status, 503);
  const post = await run(ctx('https://ip.xue.moe/api/ip', { method: 'POST' }));
  assert.equal(post.status, 405); assert.equal(post.headers.get('Allow'), 'GET');
});
test('IP subdomain maps page/assets, normalizes prefixes and scopes external CSP', async () => {
  const run = router();
  for (const [url, expected] of [['https://ip.xue.moe/', '/ip/'], ['https://ip.xue.moe/app.js', '/ip/app.js'], ['https://ip.xue.moe/style.css', '/ip/style.css']]) {
    const res = await run(ctx(url)); assert.equal(await res.text(), expected);
    assert.match(res.headers.get('Content-Security-Policy'), /https:\/\/v4\.yinghualuo\.cn/);
    assert.match(res.headers.get('Content-Security-Policy'), /https:\/\/api64.ipify.org/);
  }
  const redirect = await run(ctx('https://ip.xue.moe/ip/?theme=dark'));
  assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('Location'), 'https://ip.xue.moe/?theme=dark');
  assert.equal((await run(ctx('https://ip.xue.moe/missing.js'))).status, 404);
  const home = await run(ctx('https://xue.moe/'));
  assert.doesNotMatch(home.headers.get('Content-Security-Policy'), /v4\.yinghualuo\.cn/);
  const local = await run(ctx('https://xue.moe/ip/'));
  assert.match(local.headers.get('Content-Security-Policy'), /v4\.yinghualuo\.cn/);
  const sitemap = await run(ctx('https://ip.xue.moe/sitemap.xml'));
  assert.match(await sitemap.text(), /https:\/\/ip.xue.moe\//);
});
test('IP validation rejects malformed upstream data and handles both address families', () => {
  const context = { URL }; vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function isIP('), app.indexOf('const locationText')), context);
  for (const ip of ['1.1.1.1', '2001:db8::1', '::ffff:192.0.2.1']) assert.equal(context.isIP(ip), true, ip);
  for (const ip of ['999.1.1.1', '2001:::1', '<script>', '1.2.3', ':', null]) assert.equal(context.isIP(ip), false, String(ip));
  assert.equal(context.isIP('::1', 4), false); assert.equal(context.isIP('1.1.1.1', 6), false);
});
test('overview IP is clickable when available and disabled when unavailable', () => {
  const nodes = { '.address': { setAttribute() {} }, '.state': {}, location: { dataset: { field: 'location' } }, colo: { dataset: { field: 'colo' } } };
  const data = new Map([['edge', { ip: '203.0.113.1', location: 'Perth', colo: 'PER' }]]);
  const context = { values: data, document: { getElementById: () => ({}) }, $: selector => nodes[selector], $$: () => [nodes.location, nodes.colo] };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('function renderCard('), app.indexOf("for (const root of $$('.ip-card, .provider-card'))")), context);
  context.renderCard('edge');
  assert.equal(nodes['.address'].textContent, '203.0.113.1'); assert.equal(nodes['.address'].disabled, false);
  assert.equal(nodes.location.textContent, 'Perth'); assert.equal(nodes.colo.textContent, 'PER');
  data.set('edge', { error: '暂不可用' }); context.renderCard('edge');
  assert.equal(nodes['.address'].textContent, '暂不可用'); assert.equal(nodes['.address'].disabled, true);
});
test('IP page scripts parse and keep the homepage primary colors', () => {
  new vm.Script(app);
  const html = readFileSync(path.join(root, 'ip/index.html'), 'utf8');
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script);
  const css = readFileSync(path.join(root, 'ip/style.css'), 'utf8');
  const home = readFileSync(path.join(root, 'index.html'), 'utf8');
  const colors = text => [...text.matchAll(/--primary:\s*(#[0-9a-f]+)\s*;/gi)].map(match => match[1]);
  assert.deepEqual(colors(css), colors(home));
});

test('page assets resolve on both /ip and /ip/ as well as the subdomain root', async () => {
  const html = readFileSync(path.join(root, 'ip/index.html'), 'utf8');
  const assets = [...html.matchAll(/(?:href|src)="([^"]+\.(?:css|js))"/g)].map(match => match[1]);
  assert.equal(assets.length, 2);
  const run = router();
  for (const base of ['https://xue.moe/ip', 'https://xue.moe/ip/', 'https://ip.xue.moe/']) {
    for (const asset of assets) {
      const url = new URL(asset, base);
      assert.ok(url.pathname.startsWith('/ip/'), url.href);
      const res = await run(ctx(url.href));
      if (res.status === 301) {
        const mapped = await run(ctx(res.headers.get('Location')));
        assert.equal(await mapped.text(), url.pathname);
      } else {
        assert.equal(res.status, 200);
      }
    }
  }
});

test('latency colors change at each user-facing threshold', () => {
  const ctx = {}; vm.createContext(ctx);
  vm.runInContext(app.slice(app.indexOf('function latencyBand('), app.indexOf('async function probe(')), ctx);
  for (const [ms, band] of [[1, 'fast'], [99, 'fast'], [100, 'normal'], [299, 'normal'], [300, 'slow'], [999, 'slow'], [1000, 'high']]) assert.equal(ctx.latencyBand(ms), band);
});
test('tabs show one panel and expose selected state without scrolling', () => {
  const ids = ['local-ip', 'routing'];
  const tabs = ids.map(id => ({ dataset: { tab: id }, setAttribute(key, value) { this[key] = value; } }));
  const panels = ids.map(id => ({ id })); const title = {};
  const ctx = { activeTab: null, runTab() {}, tabs, tabNames: Object.fromEntries(ids.map(id => [id, id])), $$: () => panels, $: () => title };
  vm.createContext(ctx);
  vm.runInContext(app.slice(app.indexOf('function selectTab('), app.indexOf('\nfor (const tab of tabs)')), ctx);
  ctx.selectTab('routing', false);
  assert.deepEqual(panels.filter(p => !p.hidden).map(p => p.id), ['routing']);
  assert.equal(tabs[1]['aria-selected'], 'true'); assert.equal(tabs[1].tabIndex, 0);
  assert.equal(tabs[0]['aria-selected'], 'false'); assert.equal(tabs[0].tabIndex, -1);
  ctx.selectTab('unknown', false);
  assert.deepEqual(panels.filter(p => !p.hidden).map(p => p.id), ['local-ip']);
});

test('tab entry runs tests once, revisiting runs again, and repeated selection stays idle', () => {
  const ids = ['local-ip', 'routing']; const calls = [];
  const tabs = ids.map(id => ({ dataset: { tab: id }, setAttribute() {} }));
  const panels = ids.map(id => ({ id }));
  const ctx = { activeTab: null, tabs, tabNames: Object.fromEntries(ids.map(id => [id, id])), $$: () => panels, $: () => ({}), runTab: id => calls.push(id) };
  vm.createContext(ctx);
  vm.runInContext(app.slice(app.indexOf('function selectTab('), app.indexOf('\nfor (const tab of tabs)')), ctx);
  ctx.selectTab('local-ip', false); ctx.selectTab('routing', false); ctx.selectTab('routing', false); ctx.selectTab('local-ip', false);
  assert.deepEqual(calls, ['local-ip', 'routing', 'local-ip']);
});
test('automatic and manual tests share an in-flight lock and allow retry after completion', async () => {
  let calls = 0; let release;
  const ctx = { Promise, Date, tabRuns: new Map(), tabStatus: new Map(), showRunStatus() {}, tabRunners: { routing: () => { calls++; return new Promise(resolve => { release = resolve; }); } } };
  vm.createContext(ctx);
  vm.runInContext(app.slice(app.indexOf('function runTab('), app.indexOf("$('#split-start').addEventListener")), ctx);
  const first = ctx.runTab('routing'); const second = ctx.runTab('routing');
  assert.equal(first, second); await Promise.resolve(); assert.equal(calls, 1);
  release(); await first; assert.equal(ctx.tabRuns.size, 0);
  const third = ctx.runTab('routing'); await Promise.resolve(); assert.equal(calls, 2);
  release(); await third;
});

test('homepage IP cards use only this site connection and do not infer the other family', async () => {
  const results = new Map(); const metadata = { ip: '2001:db8::42', country: 'AU', organization: 'Example', asn: 64500 };
  const ctx = { request: async url => { assert.equal(url, '/api/ip'); return metadata; }, values: results, isIP: (ip, family) => family === 4 ? !ip.includes(':') : Boolean(ip), locationText: data => data.country, put: (id, data) => results.set(id, data) };
  vm.createContext(ctx);
  vm.runInContext(app.slice(app.indexOf('async function edge('), app.indexOf('const targets = [')), ctx);
  await ctx.edge(new AbortController().signal);
  assert.equal(results.get('ipv6').ip, metadata.ip);
  assert.equal(results.get('ipv4').ip, undefined);
  assert.equal(results.get('ipv4').error, '本次未使用');
  metadata.ip = '203.0.113.42';
  await ctx.edge(new AbortController().signal);
  assert.equal(results.get('ipv4').ip, metadata.ip);
  assert.equal(results.get('ipv6').ip, undefined);
  assert.equal(results.get('edge').ip, metadata.ip);
});
test('IP.cn bridge fetches only a bounded public ticket and never proxies visitor IP', async () => {
  const calls = []; const ticket = 'abcdef0123456789';
  const run = router(async url => { calls.push(url); return new Response(`<script>var _ticket = "${ticket}";</script>`); });
  const res = await run(ctx('https://ip.xue.moe/api/ipcn-session'));
  assert.equal((await res.json()).ticket, ticket); assert.deepEqual(calls, ['https://ip.cn/']);
  assert.match(res.headers.get('Cache-Control'), /no-store/);
  const bad = router(async () => new Response('missing ticket'));
  assert.equal((await bad(ctx('https://ip.xue.moe/api/ipcn-session'))).status, 502);
  const oversized = router(async () => new Response('x'.repeat(128 * 1024 + 1)));
  assert.equal((await oversized(ctx('https://ip.xue.moe/api/ipcn-session'))).status, 502);
  assert.equal((await run(ctx('https://ip.xue.moe/api/ipcn-session', { method: 'POST' }))).status, 405);
  assert.equal(calls.length, 1);
});

test('only the two retained tools and six selected lookup sources remain', () => {
  const html = readFileSync(path.join(root, 'ip/index.html'), 'utf8');
  assert.deepEqual([...html.matchAll(/data-tab="([^"]+)"/g)].map(m => m[1]), ['local-ip', 'routing']);
  assert.deepEqual([...html.matchAll(/id="provider-([^"]+)"/g)].map(m => m[1]), ['ipcn', 'ipip', 'yinghualuo', 'ipsb', 'cloudflare', 'ipify']);
  const context = {}; vm.createContext(context);
  const sources = app.slice(app.indexOf('const providerSources = ['), app.indexOf('async function queryProvider('));
  vm.runInContext(sources + ';globalThis.ids = providerSources.map(item => item.id);', context);
  assert.deepEqual(Array.from(context.ids), ['ipcn', 'ipip', 'yinghualuo', 'ipsb', 'cloudflare', 'ipify']);
  assert.doesNotMatch(app, /RTCPeerConnection|bash\.ws|stat\.ripe\.net|ipinfo\.io|ip138/);
});

test('curl root returns only the connection IP over HTTP and HTTPS for either family', async () => {
  const run = router();
  for (const scheme of ['http', 'https']) for (const ip of ['203.0.113.8', '2001:db8::8']) {
    const res = await run(ctx(`${scheme}://ip.xue.moe/`, { ip, headers: { 'User-Agent': 'curl/8.10.0', Accept: '*/*' } }));
    assert.equal(res.status, 200); assert.equal(await res.text(), `${ip}\n`);
    assert.match(res.headers.get('Content-Type'), /text\/plain/);
    assert.match(res.headers.get('Cache-Control'), /private, no-store/);
    assert.match(res.headers.get('Vary'), /Accept, User-Agent/);
  }
});
test('explicit plain text, HEAD, missing metadata, and curl method handling are bounded', async () => {
  const run = router();
  const plain = await run(ctx('https://ip.xue.moe/', { ip: '203.0.113.9', headers: { Accept: 'text/plain' } }));
  assert.equal(await plain.text(), '203.0.113.9\n');
  const head = await run(ctx('https://ip.xue.moe/', { ip: '203.0.113.9', method: 'HEAD', headers: { 'User-Agent': 'curl/8.10' } }));
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  const missing = await run(ctx('https://ip.xue.moe/?ip=1.1.1.1', { headers: { 'User-Agent': 'curl/8.10', 'X-Forwarded-For': '1.1.1.1' } }));
  assert.equal(missing.status, 503); assert.equal(await missing.text(), 'IP information unavailable\n');
  const post = await run(ctx('https://ip.xue.moe/', { method: 'POST', headers: { 'User-Agent': 'curl/8.10' } }));
  assert.equal(post.status, 405); assert.equal(post.headers.get('Allow'), 'GET, HEAD');
});
test('browser HTML and non-root requests keep their original routes', async () => {
  const run = router();
  const html = await run(ctx('https://ip.xue.moe/', { headers: { 'User-Agent': 'curl/8.10', Accept: 'text/html' } }));
  assert.equal(await html.text(), '/ip/'); assert.match(html.headers.get('Vary'), /Accept, User-Agent/);
  const redirect = await run(ctx('http://ip.xue.moe/', { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } }));
  assert.equal(redirect.status, 301);
  const asset = await run(ctx('https://ip.xue.moe/app.js', { headers: { 'User-Agent': 'curl/8.10' } }));
  assert.equal(await asset.text(), '/ip/app.js');
  const home = await run(ctx('https://xue.moe/', { headers: { 'User-Agent': 'curl/8.10' } }));
  assert.equal(await home.text(), 'next');
});

test('IP-page CSP permits Tencent and Taobao redirect hosts without widening the homepage', async () => {
  const run = router();
  const page = await run(ctx('https://ip.xue.moe/'));
  const csp = page.headers.get('Content-Security-Policy');
  for (const host of ['https://h5.news.qq.com', 'https://gw.alicdn.com']) assert.ok(csp.includes(host));
  const home = await run(ctx('https://xue.moe/'));
  assert.doesNotMatch(home.headers.get('Content-Security-Policy'), /h5\.news\.qq\.com|gw\.alicdn\.com/);
});
test('IP.cn retries the official alternative and accepts current ticket declaration forms', async () => {
  const calls = [];
  const run = router(async (url, options) => {
    calls.push(url);
    assert.match(options.headers['User-Agent'], /^xue-moe-ip\//);
    // Cloudflare workerd only supports follow/manual, unlike Node's fetch.
    assert.equal(options.redirect, 'manual');
    return calls.length === 1 ? new Response('Unavailable', { status: 503 }) : new Response('const _ticket = "abcdef0123456789";');
  });
  const res = await run(ctx('https://ip.xue.moe/api/ipcn-session'));
  assert.equal(res.status, 200); assert.equal((await res.json()).ticket, 'abcdef0123456789');
  assert.deepEqual(calls, ['https://ip.cn/', 'https://www.ip.cn/']);
});
test('Yinghualuo uses the browser JSON endpoint and preserves location and ISP', () => {
  const context = {}; vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('const providerSources = ['), app.indexOf('async function queryProvider(')) + ';globalThis.source = providerSources.find(item => item.id === "yinghualuo");', context);
  assert.equal(context.source.url, 'https://v4.yinghualuo.cn/bejson');
  const result = context.source.normalize({ ip: '203.0.113.8', location: '测试地区', isp: '测试运营商' });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ip: '203.0.113.8', location: '测试地区', isp: '测试运营商' });
});

test('six probe attempts show median of successes and report partial or total failure', async () => {
  for (const outcomes of [[10, 40, null, 1000, 60, 80], [null, null, null, null, null, null]]) {
    const result = {}, root = { dataset: {} };
    const history = { children: Array.from({ length: 6 }, () => ({ dataset: {} })), setAttribute() {} };
    let calls = 0, now = 0;
    const context = {
      $: selector => selector === '.probe-result' ? result : selector === '.probe-history' ? history : root,
      performance: { now: () => now },
      request: async () => {
        const value = outcomes[calls++];
        if (value === null) throw new Error('timeout');
        now += value; return {};
      },
      setTimeout: resolve => resolve()
    };
    vm.createContext(context);
    vm.runInContext(app.slice(app.indexOf('function latencyBand('), app.indexOf('async function runProbes(')), context);
    await context.probe(['Test', '国内', 'https://example.com/favicon.ico'], 0, new AbortController().signal);
    assert.equal(calls, 6);
    assert.equal(result.textContent, outcomes[0] === null ? '—' : '60 ms');
    assert.equal(root.dataset.state, outcomes[0] === null ? 'error' : 'ok');
    assert.deepEqual(history.children.map(item => item.dataset.latency), outcomes.map(ms => ms === null ? 'error' : context.latencyBand(ms)));
    assert.doesNotMatch(app, /probe-state/);
    assert.equal(context.medianLatency([1000, 10, 20, 30, 40, 50]), 35);
  }
});

test('probe queue limits concurrency to four and does not start after cancellation', async () => {
  let active = 0, peak = 0, calls = 0;
  const context = {
    targets: Array.from({ length: 8 }, (_, i) => [i]),
    $: selector => selector === '.probe-history' ? { children: [], setAttribute() {} } : ({ dataset: {} }),
    probe: async () => { calls++; active++; peak = Math.max(peak, active); await Promise.resolve(); active--; }
  };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('async function runProbes('), app.indexOf('function textValue(')), context);
  await context.runProbes(new AbortController().signal);
  assert.equal(calls, 8); assert.equal(peak, 4);
  const controller = new AbortController(); controller.abort();
  await context.runProbes(controller.signal);
  assert.equal(calls, 8);
});
