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

test('EG-only skill earns a missing group without adding difficulty', () => {
  const without = scoreRoutine('bars', allC);
  assert.equal(without.egTotal, 0.9);
  const r = scoreRoutine('bars', allC, { egSkills: [s('Giant', 'B', 4)] });
  assert.equal(r.difficulty, 4.0);
  assert.equal(r.egTotal, 1.2);
  assert.equal(r.extraRows[0].bonus, 0.3);
  assert.equal(r.startValue, 15.2);
});

test('EG-only skill in an already-earned group, or below B, earns nothing', () => {
  const r = scoreRoutine('bars', allC, { egSkills: [s('x', 'D', 1), s('y', 'A', 4)] });
  assert.equal(r.egTotal, 0.9);
  assert.deepEqual(r.extraRows.map((x) => x.bonus), [0, 0]);
});

test('EG-only skills are ignored unless all 8 counting slots are filled', () => {
  const r = scoreRoutine('bars', allC.slice(0, 7), { egSkills: [s('Giant', 'B', 4)] });
  assert.equal(r.extrasActive, false);
  assert.equal(r.extraRows[0].bonus, 0);
  assert.equal(r.egTotal, 0.9);
});

test('athlete EG-only skills flow through scoreAthlete', () => {
  const r = scoreAthlete({ routines: { bars: allC }, egSkills: { bars: [s('Giant', 'B', 4)] } });
  assert.equal(r.events.bars.egTotal, 1.2);
});

test('EG-only skills stay locked when counting skills already earn every group', () => {
  const r = scoreRoutine('bars', bars, { egSkills: [s('Giant', 'B', 4)] });
  assert.equal(r.egTotal, 1.2);
  assert.equal(r.extrasActive, false);
  assert.equal(r.extraRows[0].bonus, 0);
});

test('extraSlots is the number of groups still missing', () => {
  assert.equal(scoreRoutine('bars', allC).extraSlots, 1);
});
