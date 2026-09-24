// Run with: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreRoutine, scoreVault, scoreAthlete } from '../js/scoring.js';

const s = (name, letter, eg) => ({ name, letter, eg });

// Example routines from the "SV Calculator" sheet.
const bars = [
  s('Peach salto', 'B', 6), s('Cast Pike Vault 1/2 (Sharpe)', 'C', 2), s('Cast Handstand', 'B', 2),
  s('Toe Catch', 'C', 1), s('Hop change', 'C', 2), s('Front giant', 'C', 5), s('Kip', 'A', 1), s('Butt Bounce', 'B', 8),
];
const beam = [
  s('Straddle planche', 'C', 1), s('Pike jump', 'B', 2), s('Free forward roll', 'B', 6), s('Body wave', 'B', 4),
  s('Dive cartwheel', 'B', 7), s('Full turn', 'B', 3), s('Press lower straddle planche', 'C', 5), s('Gainer Pike', 'C', 9),
];
const floor = [
  s('Front tuck step out', 'A', 6), s('Round off', 'A', 5), s('Back tuck', 'A', 8), s('Handstand 3/2', 'B', 3),
  s('Switch side', 'C', 1), s('Straddle full', 'C', 1), s('Wolf full', 'C', 1), s('Full turn leg elevated', 'B', 2),
];

test('bars matches spreadsheet (14.2)', () => {
  const r = scoreRoutine('bars', bars);
  assert.equal(r.difficulty, 3.0);
  assert.equal(r.egTotal, 1.2);
  assert.equal(r.startValue, 14.2);
});

test('beam matches spreadsheet (14.2)', () => {
  assert.equal(scoreRoutine('beam', beam).startValue, 14.2);
});

test('floor: A skills do not earn EG bonus', () => {
  const r = scoreRoutine('floor', floor);
  assert.equal(r.difficulty, 2.4);
  assert.deepEqual(r.earnedGroups.sort(), ['I', 'II']);
  assert.equal(r.startValue, 13.0);
});

test('vault: Tsuk Tuck is 14.8', () => {
  assert.equal(scoreVault('Tsuk Tuck').startValue, 14.8);
});

test('short routine loses 1.0 per missing skill', () => {
  const r = scoreRoutine('bars', bars.slice(0, 4));
  assert.equal(r.shortBy, 2);
  assert.equal(r.startValue, 10.5); // 10 + 1.6 difficulty + 0.9 EG - 2.0
});

test('only one bonus per condensed group, credited to the first skill', () => {
  const r = scoreRoutine('bars', [s('a', 'C', 1), s('b', 'D', 8)]);
  assert.equal(r.rows[0].bonus, 0.3);
  assert.equal(r.rows[1].bonus, 0);
  assert.equal(r.egTotal, 0.3);
});

test('blank rows are ignored; empty routine scores 0', () => {
  assert.equal(scoreRoutine('beam', [s('', '', '')]).startValue, 0);
});

test('all-around adds all four events', () => {
  const aa = scoreAthlete({ vault: 'Tsuk Tuck', routines: { bars, beam, floor } }).allAround;
  assert.equal(aa, 56.2);
});

test('event bonus adds +0.3 when performed', () => {
  assert.equal(scoreRoutine('bars', bars, { eventBonus: true }).startValue, 14.5);
  const aa = scoreAthlete({
    vault: 'Tsuk Tuck',
    routines: { bars, beam, floor },
    eventBonus: { bars: true, beam: false, floor: true },
  }).allAround;
  assert.equal(aa, 56.8);
});

test('event bonus alone does not score an empty routine', () => {
  assert.equal(scoreRoutine('floor', [], { eventBonus: true }).startValue, 0);
});

// Eight C skills covering groups I, II and III only.
const allC = [
  s('a', 'C', 1), s('b', 'C', 2), s('c', 'C', 3), s('d', 'C', 6),
  s('e', 'C', 7), s('f', 'C', 8), s('g', 'C', 2), s('h', 'C', 3),
];

test('only the 8 highest-value skills count; ties go to the earlier skill', () => {
  const r = scoreRoutine('bars', [s('kip', 'A', 1), ...allC, s('late B', 'B', 2)]);
  assert.equal(r.rows.length, 8);
  assert.equal(r.difficulty, 4.0);
  assert.equal(r.items[0].status, 'noncounting'); // the A is pushed out
  assert.equal(r.items[9].status, 'noncounting'); // B loses to the Cs
  assert.deepEqual(r.rows.map((x) => x.name), allC.map((x) => x.name)); // routine order kept
});

test('a non-counting skill earns a missing element group without adding difficulty', () => {
  assert.equal(scoreRoutine('bars', allC).egTotal, 0.9);
  const r = scoreRoutine('bars', [...allC, s('Giant', 'B', 4)]);
  assert.equal(r.difficulty, 4.0);
  assert.equal(r.egTotal, 1.2);
  assert.deepEqual(r.extraRows.map((x) => x.name), ['Giant']);
  assert.equal(r.startValue, 15.2);
});

test('non-counting skills in an already-earned group, or below B, earn nothing', () => {
  const r = scoreRoutine('bars', [...allC, s('x', 'C', 1), s('y', 'A', 4)]);
  assert.equal(r.egTotal, 0.9);
  assert.equal(r.extraRows.length, 0);
});

test('a skill only counts once, ignoring case, spaces and punctuation', () => {
  const r = scoreRoutine('bars', [s('Clear hip', 'B', 3), s('Clearhip', 'B', 3), s('clear-HIP ', 'B', 3), s('Kip', 'A', 1)]);
  assert.deepEqual(r.items.map((x) => x.status), ['counting', 'repeat', 'repeat', 'counting']);
  assert.equal(r.items[1].repeatOf, 0);
  assert.equal(r.difficulty, 0.4);
  assert.equal(r.shortBy, 4); // repeats don't count toward the 6-skill minimum
});

test('a repeat never counts, even when it would be among the top 8', () => {
  const r = scoreRoutine('beam', [...allC.slice(0, 7), s('a', 'E', 1)]);
  assert.equal(r.items[7].status, 'repeat');
  assert.equal(r.rows.length, 7);
});
