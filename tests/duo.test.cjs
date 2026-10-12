const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const html = readFileSync(require('node:path').join(__dirname, '../duo/index.html'), 'utf8');

function harness() {
  const cells = Array.from({ length: 9 }, () => ({
    value: '', dataset: { source: '' },
    style: {}, classList: { add() {}, remove() {} }
  }));
  let targetValue = '';
  const targetSumEl = { style: {}, classList: { add() {}, remove() {} }, get value() { return targetValue; }, set value(v) { targetValue = String(v); } };
  const state = { cells, targetSumEl, candidateValuesEl: { value: '' },
    currentLang: 'zh', internalUpdate: false, targetWasAuto: false, deductionStep: 0,
    allSolutions: [], lastFixed: [], lastCandidates: [], rendered: 0,
    i18n: { zh: new Proxy({}, { get: (_, key) => (...args) => `${key}:${args.join(',')}` }) },
    setStatus(message, type) { state.status = { message, type }; }
  };
  vm.createContext(state);
  const lines = html.slice(html.indexOf('    const lines = ['), html.indexOf('    for (let i = 0; i < 9; i++)'));
  const functions = html.slice(html.indexOf('    function readManualValues()'), html.indexOf('    function applyLanguage(lang)'));
  vm.runInContext(`${lines}\n${functions}\nrenderResults = () => { rendered++; };`, state);
  state.input = (fixed) => {
    cells.forEach((cell, i) => {
      cell.value = fixed[i] === null ? '' : String(fixed[i]);
      cell.dataset.source = fixed[i] === null ? '' : 'manual';
    });
  };
  return state;
}
const grid = [8, 1, 6, 3, 5, 7, 4, 9, 2];
const fixedFor = (positions, source = grid) => source.map((v, i) => positions.includes(i + 1) ? v : null);

test('all requested combinations infer both fields; complete results obey uniqueness', () => {
  for (const positions of [[1, 9], [2, 8], [3, 7], [4, 6], [1, 2, 4], [1, 2, 6]]) {
    const h = harness();
    h.input(fixedFor(positions));
    h.autoDetectTarget();
    assert.equal(Number(h.targetSumEl.value), 15);
    assert.equal(Number(h.cells[4].value), 5);
    assert.equal(h.cells[4].dataset.source, 'solved');
    const solutions = h.enumerateSolutions(15, h.readManualValues(), [], true);
    assert.ok(solutions.some(s => s.join(',') === grid.join(',')));
    const sets = new Set(solutions.map(s => [...s].sort((a, b) => a - b).join(',')));
    h.tryAutoSolve();
    assert.equal(h.rendered, sets.size === 1 ? 1 : 0);
  }
});

test('multiple number sets leave only the inferred center visible', () => {
  const h = harness();
  h.input([26, null, null, null, null, null, null, null, 14]);
  h.autoDetectTarget(); h.tryAutoSolve();
  assert.equal(h.targetSumEl.value, '60');
  assert.equal(Number(h.cells[4].value), 20);
  assert.equal(h.rendered, 0);
  for (const i of [1, 2, 3, 5, 6, 7]) assert.equal(h.cells[i].value, '');
  h.input([30, null, null, null, null, null, null, null, 14]);
  h.autoDetectTarget();
  assert.equal(h.targetSumEl.value, '66');
  assert.equal(Number(h.cells[4].value), 22);
});

test('center plus one known cell fills its opposite while multiple number sets remain', () => {
  for (const [known, opposite, value] of [[0, 8, 26], [1, 7, 12], [2, 6, 24], [3, 5, 16]]) {
    const h = harness();
    const fixed = Array(9).fill(null); fixed[4] = 20; fixed[known] = value;
    h.input(fixed); h.autoDetectTarget(); h.tryAutoSolve();
    assert.equal(h.targetSumEl.value, '60');
    assert.equal(Number(h.cells[opposite].value), 40 - value);
    assert.equal(h.cells[opposite].dataset.source, 'solved');
    assert.equal(h.rendered, 0);
    assert.match(h.status.message, /okPartialSolution/);
    for (let i = 0; i < 9; i++) {
      if (![known, 4, opposite].includes(i)) assert.equal(h.cells[i].value, '');
    }
    assert.ok(h.cells[opposite].style.animationDelay);
    h.input(Array(9).fill(null)); h.autoDetectTarget();
    assert.equal(h.targetSumEl.value, '');
    assert.equal(h.cells[opposite].value, '');
  }
});

test('rotations, reflections and scaled/translated magic squares infer consistent sums', () => {
  const h = harness();
  for (const [e, p, q] of [[5, 4, 2], [5, -4, 2], [5, 2, 4], [20, -8, -4]]) {
    const source = h.buildGrid(e, p, q);
    for (let a = 1; a <= 7; a++) for (let b = a + 1; b <= 8; b++) for (let c = b + 1; c <= 9; c++) {
      const sums = h.inferTargetSums(fixedFor([a, b, c], source));
      assert.ok(sums.every(s => s === 3 * e), `positions ${a}${b}${c}`);
    }
  }
});

test('insufficient clues clear an earlier inferred target; solved center is never a clue', () => {
  const h = harness();
  h.input(fixedFor([1, 9])); h.autoDetectTarget();
  h.cells[8].value = ''; h.cells[8].dataset.source = '';
  h.autoDetectTarget();
  assert.equal(h.targetSumEl.value, '');
  assert.equal(h.targetWasAuto, false);
  assert.equal(h.inferTargetSums(fixedFor([1, 2])).length, 0);
});

test('conflicts, fractional/nonpositive centers and manual target mismatch are rejected', () => {
  const h = harness();
  h.input(fixedFor([1, 9])); h.autoDetectTarget();
  h.input([8, 1, null, null, null, null, null, 11, 2]);
  assert.equal(h.autoDetectTarget(), false);
  assert.equal(h.targetSumEl.value, '');
  assert.equal(h.status.type, 'error');
  for (const source of [[8, null, null, null, null, null, null, null, 3], [1, 2, null, null, null, 10, null, null, null]]) {
    h.input(source);
    assert.equal(h.autoDetectTarget(), false);
    assert.equal(h.status.type, 'error');
  }
  h.input(fixedFor([1, 2, 6]));
  h.targetSumEl.value = '18'; h.targetWasAuto = false;
  assert.equal(h.autoDetectTarget(), false);
  assert.equal(h.targetSumEl.value, '18');
  assert.match(h.status.message, /errTargetMismatch/);
});

test('every inline script parses', () => {
  for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (script.trim().startsWith('{')) JSON.parse(script);
    else new vm.Script(script);
  }
});
