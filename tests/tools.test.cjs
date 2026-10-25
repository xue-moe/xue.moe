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

function importHarness() {
  const state = { Date, Number, Set, JSON };
  vm.createContext(state);
  vm.runInContext(html.slice(html.indexOf('    function prepareTodoImport('), html.indexOf('    const importInput =')), state);
  return (existing, incoming) => state.prepareTodoImport(existing, incoming);
}

test('backup round trip preserves task fields and trash, repeated import adds nothing', () => {
  const prepare = importHarness();
  const tasks = [
    { id: 1, title: 'Active', note: 'Notes', completed: false, removed: false, createdAt: 100, deadline: '2026-10-25T13:00', hasDeadline: true, customOrder: 1 },
    { id: 2, title: 'Deleted', note: '', completed: true, removed: true, createdAt: 200, deadline: '', hasDeadline: false, customOrder: 2 }
  ];
  const imported = prepare([], JSON.parse(JSON.stringify(tasks)));
  assert.equal(JSON.stringify(imported.added), JSON.stringify(tasks));
  assert.equal(prepare(imported.added, tasks).added.length, 0);
  assert.equal(prepare(imported.added, tasks).skipped, 2);
  assert.equal(prepare([], [tasks[0], tasks[0]]).added.length, 1);
});

test('invalid backups fail before mutation and missing IDs remain unique', () => {
  const prepare = importHarness(); const existing = [{id: 1, title: 'Keep'}];
  for (const invalid of [null, {}, [null], [{title: 123}], [{title: 'x', note: {}}], [{title: 'x', deadline: 'invalid'}], [{id: '1', title: 'x'}]]) {
    assert.throws(() => prepare(existing, invalid));
    assert.deepEqual(existing, [{id: 1, title: 'Keep'}]);
  }
  const result = prepare([], [{title: 'First'}, {title: 'Second'}]);
  assert.equal(new Set(result.added.map(t => t.id)).size, 2);
});

function textHarness() {
  const state = { Intl, Array, String };
  vm.createContext(state);
  vm.runInContext(html.slice(html.indexOf('    const graphemeSegmenter ='), html.indexOf('    function detectTextContext(')), state);
  return state;
}

test('halfwidth conversion handles letters, numbers, spaces and punctuation without damaging other scripts', () => {
  const h = textHarness();
  assert.equal(h.toHalfwidth('ＡＢＣａｂｃ１２３　，。！？【】“”'), 'ABCabc123 ,.!?[]""');
  assert.equal(h.toHalfwidth('中文 カタカナ 😀 é ①'), '中文 カタカナ 😀 é ①');
});

test('text metrics agree with grapheme tiles and Unicode details include every code point', () => {
  const h = textHarness();
  assert.equal(h.textMetrics('👨‍👩‍👧‍👦').chars, 1);
  assert.equal(h.textMetrics('e\u0301').chars, 1);
  assert.equal(h.textMetrics('中文𠀀').chinese, 3);
  assert.equal(h.textMetrics('a\r\nb').lines, 2);
  assert.equal(h.textMetrics('a \t👨‍👩‍👧‍👦').nonSpace, 2);
  assert.equal(h.unicodeSequence('e\u0301'), 'U+0065 U+0301');
  assert.equal(h.unicodeSequence('\0'), 'U+0000');
  assert.equal(h.unicodeSequence('👨‍👩‍👧‍👦').split(' ').length, 7);
});

function pinyinHarness() {
  const scripts = []; const timers = new Map(); let nextId = 0;
  const state = {
    window: {}, Promise, Error,
    document: { createElement: () => ({ remove() { this.removed = true; } }), head: { appendChild: script => scripts.push(script) } },
    setTimeout(fn) { timers.set(++nextId, fn); return nextId; }, clearTimeout(id) { timers.delete(id); }
  };
  vm.createContext(state);
  vm.runInContext(html.slice(html.indexOf('    let pinyinProPromise ='), html.indexOf('    const themeToggleBtn')), state);
  return { state, scripts, timers };
}

test('dictionary loading shares a request, reports failure and allows retry', async () => {
  const h = pinyinHarness(); let errors = 0; let loaded = 0;
  const first = h.state.ensurePinyinPro(() => loaded++, () => errors++);
  const second = h.state.ensurePinyinPro(() => loaded++, () => errors++);
  assert.equal(h.scripts.length, 1);
  h.scripts[0].onerror(); await Promise.all([first, second]);
  assert.equal(errors, 2); assert.equal(loaded, 0); assert.equal(h.timers.size, 0);
  const retry = h.state.ensurePinyinPro(() => loaded++);
  assert.equal(h.scripts.length, 2);
  h.state.window.pinyinPro = {pinyin() {}};
  h.scripts[1].onload(); await retry;
  assert.equal(loaded, 1); assert.equal(h.timers.size, 0);
});

test('dictionary loading times out instead of polling forever', async () => {
  const h = pinyinHarness(); let errors = 0;
  const pending = h.state.ensurePinyinPro(() => assert.fail('must not load'), () => errors++);
  [...h.timers.values()][0](); await pending;
  assert.equal(errors, 1); assert.equal(h.scripts[0].removed, true);
});

test('editing task details preserves identity and state, supports clearing deadline and rejects blank titles', () => {
  const state = { Date, Number }; vm.createContext(state);
  vm.runInContext(html.slice(html.indexOf('    function withTodoDetails('), html.indexOf("    todoEditTitle.addEventListener('input'")), state);
  const original = { id: 12, title: 'Original', note: '', completed: true, customOrder: 5, createdAt: 123, deadline: '2026-10-25T12:00', hasDeadline: true };
  const edited = state.withTodoDetails(original, ' Updated ', 'Two\nlines', '');
  assert.equal(edited.title, 'Updated'); assert.equal(edited.note, 'Two\nlines');
  assert.equal(edited.hasDeadline, false); assert.equal(edited.deadline, '');
  assert.equal(edited.id, 12); assert.equal(edited.completed, true); assert.equal(edited.createdAt, 123);
  assert.equal(original.title, 'Original');
  assert.throws(() => state.withTodoDetails(original, ' ', '', ''));
  assert.throws(() => state.withTodoDetails(original, 'Valid', '', 'invalid'));
});
