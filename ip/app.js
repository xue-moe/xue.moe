'use strict';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const values = new Map();
const runControllers = new Map();
let toastTimer;
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 2400);
}
function savePreference(name, value) {
  try { localStorage.setItem(name, value); } catch (_) {}
  const shared = location.hostname === 'xue.moe' || location.hostname.endsWith('.xue.moe');
  try { document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax${shared ? '; domain=.xue.moe' : ''}`; } catch (_) {}
}
$('#theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  savePreference('xue-theme', next);
});
function renderCard(id) {
  const root = document.getElementById(id);
  const data = values.get(id);
  if (!root || !data) return;
  $('.address', root).textContent = data.ip || data.error || '未获取';
  $('.state', root).textContent = data.status || '';
  for (const field of $$('[data-field]', root)) {
    const name = field.dataset.field;
    field.textContent = data[name] || '—';
    field.title = data[name] || '';
    field.closest('.meta-item')?.toggleAttribute('hidden', !data[name]);
  }
  const address = $('.address', root);
  address.disabled = !data.ip;
  root.dataset.hasIp = String(Boolean(data.ip));
  const metadata = $('.provider-meta', root);
  if (metadata) metadata.hidden = !data.ip;
  for (const field of $$('[data-field]', root)) if (!field.closest('.meta-item')) field.hidden = false;
  address.setAttribute('aria-label', data.ip ? `复制 IP ${data.ip}` : '未获取 IP');
}
for (const root of $$('.ip-card, .provider-card')) {
  $('.address', root).addEventListener('click', async () => {
    const ip = values.get(root.id)?.ip;
    if (!ip) return;
    try { await navigator.clipboard.writeText(ip); toast('IP 已复制'); }
    catch (_) { toast('复制失败'); }
  });
}
async function request(url, { signal, timeout = 7000, ...options } = {}, parse = 'json') {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, timeout);
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', ...options, signal: controller.signal });
    if (res.type !== 'opaque' && !res.ok) throw new Error(`HTTP ${res.status}`);
    if (parse === 'response') return res;
    return await res[parse]();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
function isIP(ip, version) {
  if (typeof ip !== 'string' || ip.length > 45) return false;
  const v4 = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every(n => Number(n) <= 255);
  let v6 = false;
  if (ip.includes(':') && /^[\da-f:.]+$/i.test(ip)) {
    try { v6 = new URL(`https://[${ip}]/`).hostname.startsWith('['); } catch (_) {}
  }
  return version === 4 ? v4 : version === 6 ? v6 : v4 || v6;
}
const locationText = data => [data.country, data.region, data.city].filter(Boolean).join(' · ');
function put(id, data, signal) {
  if (signal?.aborted) return;
  values.set(id, data);
  renderCard(id);
}
async function edge(signal) {
  try {
    const data = await request('/api/ip', { signal });
    if (!isIP(data.ip)) throw new Error('无效 IP');
    if (signal.aborted) return;
    values.set('edge', data);
    const version = isIP(data.ip, 4) ? 4 : 6;
    for (const family of [4, 6]) {
      put(`ipv${family}`, family === version ? {
        ip: data.ip, location: locationText(data), isp: data.organization,
        asn: data.asn ? `AS${data.asn}` : '', status: ''
      } : { error: '本次未使用', status: '' }, signal);
    }
    return data.ip;
  } catch (_) {
    if (signal.aborted) return;
    values.delete('edge');
    for (const family of [4, 6]) put(`ipv${family}`, { error: '暂不可用', status: '' }, signal);
  }
}
const targets = [
  ['小红书', '国内', 'https://www.xiaohongshu.com/favicon.ico'],
  ['B站', '国内', 'https://www.bilibili.com/favicon.ico'],
  ['腾讯', '国内', 'https://www.qq.com/favicon.ico'],
  ['淘宝', '国内', 'https://www.taobao.com/favicon.ico'],
  ['GitHub', '海外', 'https://github.com/favicon.ico'],
  ['Google', '海外', 'https://www.google.com/favicon.ico'],
  ['Microsoft', '海外', 'https://www.microsoft.com/favicon.ico'],
  ['YouTube', '海外', 'https://www.youtube.com/favicon.ico']
];
function createProbe([name, region], index) {
  const root = document.createElement('article');
  root.className = 'card probe'; root.id = `probe-${index}`;
  const heading = document.createElement('div'); heading.className = 'probe-heading';
  const title = document.createElement('span'); title.className = 'probe-name'; title.textContent = name;
  const tag = document.createElement('span'); tag.className = 'probe-region'; tag.textContent = region;
  tag.dataset.region = region === '国内' ? 'domestic' : 'global';
  heading.append(title, tag); root.appendChild(heading);
  for (const [className, value] of [['probe-result', '—']]) {
    const el = document.createElement('p'); el.className = className; el.textContent = value; root.appendChild(el);
  }
  const history = document.createElement('div'); history.className = 'probe-history';
  history.setAttribute('role', 'img'); history.setAttribute('aria-label', '待测');
  for (let i = 0; i < 6; i++) {
    const segment = document.createElement('span'); segment.dataset.state = 'waiting';
    segment.title = `第 ${i + 1} 次：待测`; history.appendChild(segment);
  }
  root.appendChild(history);
  $('#probes').appendChild(root);
}
targets.forEach(createProbe);
function latencyBand(ms) {
  return ms < 100 ? 'fast' : ms < 300 ? 'normal' : ms < 1000 ? 'slow' : 'high';
}
function medianLatency(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return Math.max(1, Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2));
}
async function probe([, , url], index, signal) {
  const root = $(`#probe-${index}`);
  const samples = [];
  const history = $('.probe-history', root);
  const segments = [...history.children];
  for (const segment of segments) segment.title = '等待结果';
  history.setAttribute('aria-label', '测试中...');
  let completed = 0;
  const wait = delay => new Promise(resolve => {
    let timer;
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    signal.addEventListener('abort', finish, { once: true });
    timer = setTimeout(finish, delay);
    if (signal.aborted) finish();
  });
  async function attempt(number) {
    if (signal.aborted) return;
    const start = performance.now();
    let elapsed;
    try {
      const res = await request(`${url}?_=${Date.now()}-${index}-${number}`, { signal, method: 'HEAD', mode: 'no-cors', timeout: 6000 }, 'response');
      elapsed = performance.now() - start;
      if (res.body) await res.body.cancel();
    } catch (_) { elapsed = undefined; }
    if (signal.aborted) return;
    // Slots follow arrival order, independent of the request's starting position.
    const segment = segments[completed++];
    if (elapsed !== undefined) {
      samples.push(elapsed);
      segment.dataset.state = 'ok'; segment.dataset.latency = latencyBand(elapsed);
      segment.title = `${Math.max(1, Math.round(elapsed))} ms`;
    } else {
      segment.dataset.state = 'error'; segment.dataset.latency = 'error';
      segment.title = '超时或受限';
    }
    history.setAttribute('aria-label', segments.map(item => item.title).join('；'));
    if (samples.length) {
      const ms = medianLatency(samples);
      root.dataset.latency = latencyBand(ms);
      $('.probe-result', root).textContent = `${ms} ms`;
    }
  }
  const started = performance.now();
  const attempts = [attempt(0)];
  for (let number = 1; number < 6; number++) {
    attempts.push(wait(Math.max(0, started + number * 500 - performance.now())).then(() => attempt(number)));
  }
  await Promise.all(attempts);
  if (signal.aborted) return;
  root.dataset.state = samples.length ? 'ok' : 'error';
  $('.probe-result', root).title = samples.length ? 'HTTP 响应耗时' : '超时或请求受限';
  if (!samples.length) {
    root.dataset.latency = 'error';
    $('.probe-result', root).textContent = '—';
  }
}
async function runProbes(signal) {
  updateProgress('probes', targets.length);
  for (let i = 0; i < targets.length; i++) {
    const root = $(`#probe-${i}`);
    root.dataset.state = 'pending'; delete root.dataset.latency;
    $('.probe-result', root).textContent = '…';
    $('.probe-result', root).removeAttribute('title');
    const history = $('.probe-history', root);
    history.setAttribute('aria-label', '待测');
    [...history.children].forEach((segment, index) => {
      segment.dataset.state = 'waiting'; delete segment.dataset.latency;
      segment.title = `第 ${index + 1} 次：待测`;
    });
  }
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, targets.length) }, async () => {
    while (!signal.aborted && next < targets.length) {
      const index = next++;
      await probe(targets[index], index, signal);
      if (!signal.aborted) updateProgress('probes');
    }
  }));
}
function textValue(text) {
  const el = document.createElement('span'); el.textContent = String(text || '—'); return el;
}
function row(label, detail, isSensitive = false) {
  const el = document.createElement('div'); el.className = 'result-row';
  const name = document.createElement('span'); name.className = 'result-label'; name.textContent = label; el.appendChild(name);
  const value = isSensitive ? textValue(detail) : document.createElement('span');
  if (!isSensitive) value.textContent = detail || '—';
  el.appendChild(value); return el;
}
function parseTrace(text) {
  return Object.fromEntries(text.trim().split('\n').filter(line => line.includes('=')).map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
}
const providerSources = [
  { id: 'ipcn', name: 'IP.cn 查询网', group: '国内', load: async signal => {
    const { ticket } = await request('/api/ipcn-session', { signal, timeout: 10500 });
    if (!/^[a-f0-9]{16,128}$/i.test(ticket)) throw new Error('无效查询会话');
    const payload = await request(`https://my.ip.cn/json/?ticket=${encodeURIComponent(ticket)}`, { signal });
    if (!payload.status || !payload.data) throw new Error('查询源暂不可用');
    const data = payload.data;
    return { ip: data.ip, location: [data.country, data.province, data.city, data.district].filter(Boolean).join(' · '), isp: data.isp };
  } },
  { id: 'ipip', name: 'IPIP', group: '国内', url: 'https://myip.ipip.net/json', normalize: data => ({ ip: data.data?.ip, location: data.data?.location?.slice(0, 3).filter(Boolean).join(' · '), isp: data.data?.location?.[3] }) },
  { id: 'yinghualuo', name: '樱花落', group: '国内', url: 'https://v4.yinghualuo.cn/bejson', normalize: data => ({ ip: data.ip, location: data.location, isp: data.isp }) },
  { id: 'ipsb', name: 'IP.SB', group: '境外', url: 'https://api.ip.sb/geoip', normalize: data => ({ ip: data.ip, location: locationText(data), isp: data.isp || data.organization, asn: data.asn }) },
  { id: 'cloudflare', name: 'Cloudflare', group: '境外', url: 'https://www.cloudflare.com/cdn-cgi/trace', parse: 'text', normalize: text => {
    const data = parseTrace(text); return { ip: data.ip, location: [data.loc, data.colo].filter(Boolean).join(' · ') };
  } },
  { id: 'ipify', name: 'ipify', group: '境外', url: 'https://api64.ipify.org?format=json', normalize: data => ({ ip: data.ip }) }
];
function formatASN(value) {
  const number = String(value || '').replace(/^AS/i, '');
  return /^\d+$/.test(number) ? `AS${number}` : '';
}
function canonicalIP(ip) {
  return isIP(ip, 4) ? ip : new URL(`https://[${ip}]/`).hostname.slice(1, -1);
}
async function queryProvider(source, signal) {
  const data = source.load ? await source.load(signal) : source.normalize(await request(source.url, { signal }, source.parse || 'json'));
  if (!isIP(data.ip)) throw new Error('查询源没有返回有效 IP');
  return { ...data, asn: formatASN(data.asn) };
}
function createProviderEnricher(signal) {
  const cache = new Map();
  let queue = Promise.resolve();
  return async data => {
    if (data.location && data.isp && data.asn) return data;
    const key = canonicalIP(data.ip);
    if (!cache.has(key)) {
      const lookup = queue.then(async () => {
        if (signal.aborted) return {};
        const geo = await request(`https://api.ip.sb/geoip/${key}`, { signal, timeout: 4000 });
        if (!isIP(geo.ip) || canonicalIP(geo.ip) !== key) throw new Error('GeoIP address mismatch');
        return { location: locationText(geo), isp: geo.isp || geo.organization || geo.asn_organization, asn: formatASN(geo.asn) };
      }).catch(() => ({}));
      cache.set(key, lookup);
      queue = lookup.then(() => new Promise(resolve => setTimeout(resolve, 250)));
    }
    const geo = await cache.get(key);
    return { ...data, location: data.location || geo.location, isp: data.isp || geo.isp, asn: data.asn || geo.asn };
  };
}
async function providers(signal) {
  updateProgress('providers', providerSources.length);
  const enrich = createProviderEnricher(signal);
  for (const source of providerSources) put(`provider-${source.id}`, { error: '测试中...', status: '' }, signal);
  await Promise.allSettled(providerSources.map(async source => {
    try {
      const data = await queryProvider(source, signal);
      put(`provider-${source.id}`, { ...data, status: '' }, signal);
      const detailed = await enrich(data);
      put(`provider-${source.id}`, { ...detailed, status: '' }, signal);
    } catch (error) { put(`provider-${source.id}`, { error: requestFailure(error), status: '' }, signal); }
    finally { if (!signal.aborted) updateProgress('providers'); }
  }));
}
async function runOverview(signal) {
  for (const id of ['ipv4', 'ipv6']) put(id, { error: '测试中...', status: '' }, signal);
  await Promise.allSettled([edge(signal), providers(signal), runProbes(signal)]);
}
$('#refresh').addEventListener('click', () => runTab(activeTab));
const tabNames = { 'local-ip': '我的 IP', routing: '网站分流' };
const tabs = $$('[role="tab"]');
let activeTab = null;
function selectTab(id, updateURL = true) {
  if (!Object.hasOwn(tabNames, id)) id = 'local-ip';
  for (const tab of tabs) {
    const active = tab.dataset.tab === id;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of $$('[data-panel]')) panel.hidden = panel.id !== id;
  $('#view-title').textContent = tabNames[id];
  const changed = activeTab !== id;
  activeTab = id;
  if (updateURL) history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
  if (changed) runTab(id);
  else showRunStatus(id);
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab.dataset.tab));
  tab.addEventListener('keydown', event => {
    let index = tabs.indexOf(tab);
    if (['ArrowDown', 'ArrowRight'].includes(event.key)) index = (index + 1) % tabs.length;
    else if (['ArrowUp', 'ArrowLeft'].includes(event.key)) index = (index + tabs.length - 1) % tabs.length;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[index].dataset.tab); tabs[index].focus();
  });
}
window.addEventListener('hashchange', () => selectTab(location.hash.slice(1), false));

const splitTargets = [
  ['www.qualcomm.cn', '国内网站'],
  ['www.cloudflare.com', '海外网络'],
  ['www.visa.com', '海外金融'],
  ['medium.com', '海外媒体'],
  ['cdnjs.cloudflare.com', '静态资源'],
  ['registry.npmjs.org', '开源仓库'],
  ['nodejs.org', '开发工具'],
  ['gitlab.com', '开发协作'],
  ['chatgpt.com', 'AI 服务'],
  ['claude.ai', 'AI 服务'],
  ['www.perplexity.ai', 'AI 搜索']
];
function splitRow(host, category, ip, country, status) {
  const tr = document.createElement('tr');
  for (const [index, text] of [host, category, ip || '—', country || '—', status].entries()) {
    const td = document.createElement('td');
    if (ip && (index === 2 || index === 3)) td.appendChild(textValue(text));
    else td.textContent = text;
    tr.appendChild(td);
  }
  return tr;
}
splitTargets.forEach(([host, category]) => $('#split-results').appendChild(splitRow(host, category, null, null, '待测')));
async function runSplit(signal) {
  updateProgress('routing', splitTargets.length);
  const baseline = await edge(signal);
  if (signal.aborted) return;
  const root = $('#split-results'); root.replaceChildren();
  const rows = splitTargets.map(([host, category]) => {
    const tr = splitRow(host, category, null, null, '测试中...'); root.appendChild(tr); return tr;
  });
  await Promise.allSettled(splitTargets.map(async ([host, category], index) => {
    try {
      const trace = parseTrace(await request(`https://${host}/cdn-cgi/trace`, { signal, timeout: 7000 }, 'text'));
      if (!isIP(trace.ip)) throw new Error('目标没有返回出口 IP');
      if (signal.aborted) return;
      const status = compareExit(trace.ip, baseline);
      rows[index].replaceWith(splitRow(host, category, trace.ip, trace.loc, status));
    } catch (error) {
      if (signal.aborted) return;
      rows[index].replaceWith(splitRow(host, category, null, null, requestFailure(error)));
    } finally { if (!signal.aborted) updateProgress('routing'); }
  }));
}

const tabRuns = new Map();
const tabStatus = new Map();
const tabRunners = { 'local-ip': runOverview, routing: runSplit };
const taskProgress = new Map();
function compareExit(ip, baseline) {
  return baseline ? ip === baseline ? '出口一致' : '出口不同' : '未对比';
}
function requestFailure(error) {
  return error.name === 'AbortError' ? '超时' : '请求失败';
}
function updateProgress(id, total) {
  const state = total ? { done: 0, total } : taskProgress.get(id);
  if (!state) return;
  if (!total) state.done++;
  taskProgress.set(id, state);
  const status = $(`#${id}-status`);
  if (status) status.textContent = `${state.done}/${state.total}`;
}
function showRunStatus(id) {
  if (id !== activeTab) return;
  const busy = tabRuns.has(id);
  $('.workspace-heading').dataset.busy = String(busy);
  $('#run-status').textContent = busy ? '测试中...' : tabStatus.get(id) || '就绪';
  $('#refresh').disabled = busy;
  $('#refresh').setAttribute('aria-label', '重测');
  $('#refresh').title = '重测';
  const btnText = $('#refresh .btn-text');
  if (btnText) btnText.textContent = busy ? '测试中...' : '重测';
}
function runTab(id) {
  if (!tabRunners[id]) return Promise.resolve();
  if (tabRuns.has(id)) return tabRuns.get(id);
  const controller = new AbortController(); runControllers.set(id, controller);
  const region = id === 'routing' ? $('#split-results') : $('#local-ip');
  region.setAttribute('aria-busy', 'true');
  const task = Promise.resolve().then(() => tabRunners[id](controller.signal)).then(() => {
    tabStatus.set(id, controller.signal.aborted ? '已停止' : `完成 · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`);
  }).catch(() => {
    tabStatus.set(id, '测试失败');
  }).finally(() => {
    tabRuns.delete(id); runControllers.delete(id);
    region.setAttribute('aria-busy', 'false');
    showRunStatus(id);
  });
  tabRuns.set(id, task); showRunStatus(id);
  return task;
}
window.addEventListener('pagehide', () => { for (const controller of runControllers.values()) controller.abort(); });
selectTab(location.hash.slice(1), false);
