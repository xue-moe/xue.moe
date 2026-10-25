const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const html = readFileSync(require('node:path').join(__dirname, '../tools/index.html'), 'utf8');

function timerHarness(saved) {
  let now = 100000;
  const store = new Map(saved ? [['xue-focus-timer-v1', saved]] : []);
  const elements = new Map();
  const element = () => ({ textContent: '', dataset: {}, classList: { toggle() {} }, addEventListener(name, fn) { this[name] = fn; } });
  const modes = ['25', '5', '15', 'custom'].map(mode => Object.assign(element(), { dataset: { minutes: mode } }));
  const state = {
    Date: { now: () => now }, Math, JSON, Number,
    localStorage: { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) },
    document: {
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      querySelectorAll: () => modes,
      querySelector: () => ({ dataset: { tab: 'timer' } }),
      addEventListener() {}, title: ''
    },
    currentLang: 'zh', i18n: { zh: { timerStart: 'start', timerPause: 'pause', timerTimeUp: 'done', timerFocusingTitle: s => s } },
    updateDocumentTitle() {}, setInterval: () => 1, clearInterval() {}, prompt: () => null,
    beeps: 0
  };
  vm.createContext(state);
  vm.runInContext(html.slice(html.indexOf('    let timerDuration ='), html.indexOf('    const clockMainTime')) + '\nplayBeep = () => { beeps++; };', state);
  return { state, store, modes, run: source => vm.runInContext(source, state), advance: ms => { now += ms; } };
}

test('timer uses elapsed wall time when callbacks are delayed and completes only once', () => {
  const h = timerHarness();
  h.run('startTimer()'); h.advance(90000); h.run('tickTimer()');
  assert.equal(h.run('timerRemaining'), 1410);
  h.advance(1500000); h.run('tickTimer(); tickTimer()');
  assert.equal(h.run('timerRemaining'), 0);
  assert.equal(h.run('timerRunning'), false);
  assert.equal(h.state.beeps, 1);
});

test('pause survives reload, resume creates a new deadline, reset cancels it', () => {
  const h = timerHarness(); h.run('startTimer()'); h.advance(60000); h.run('pauseTimer()');
  const restored = timerHarness(h.store.get('xue-focus-timer-v1')); restored.run('restoreTimer()');
  assert.equal(restored.run('timerRemaining'), 1440);
  assert.equal(restored.run('timerRunning'), false);
  restored.advance(300000); restored.run('startTimer()'); restored.advance(30000); restored.run('tickTimer()');
  assert.equal(restored.run('timerRemaining'), 1410);
  restored.run('resetTimer()');
  assert.equal(restored.run('timerRemaining'), 1500);
  assert.equal(restored.run('timerEndAt'), null);
});

test('reload restores running and expired deadlines; invalid storage is ignored', () => {
  const saved = (endAt) => JSON.stringify({ duration: 300, remaining: 300, endAt, mode: '5' });
  const running = timerHarness(saved(200000)); running.run('restoreTimer()');
  assert.equal(running.run('timerRemaining'), 100);
  assert.equal(running.run('timerRunning'), true);
  const expired = timerHarness(saved(50000)); expired.run('restoreTimer()');
  assert.equal(expired.run('timerRemaining'), 0);
  assert.equal(expired.state.beeps, 1);
  for (const value of ['broken', '{}', JSON.stringify({ duration: -1 })]) {
    const h = timerHarness(value); h.run('restoreTimer()');
    assert.equal(h.run('timerRemaining'), 1500);
  }
});

test('cancelling custom duration preserves the existing mode and running timer', () => {
  const h = timerHarness(); h.run('startTimer()'); h.modes[3].click();
  assert.equal(h.run('timerMode'), '25');
  assert.equal(h.run('timerRunning'), true);
});

test('all inline scripts parse', () => {
  for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!match[0].includes('application/ld+json')) new vm.Script(match[1]);
  }
});
