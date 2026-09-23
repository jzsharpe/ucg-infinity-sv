// UCG WAG Open Scoring start value rules, mirrored from the
// "SV Calculator" spreadsheet and the WAG Open SV Worksheet, plus the
// UCG event-specific bonus.
import { VAULTS } from './vaults.js';

export const EXECUTION = 10;
export const MAX_SKILLS = 8;
export const MIN_SKILLS = 6;
export const EG_BONUS = 0.3;
export const EG_BONUS_MIN_VALUE = 0.3; // B or higher
export const EVENT_BONUS = 0.3;

export const LETTER_VALUES = { A: 0.1, B: 0.3, C: 0.5, D: 0.7, E: 0.9 };
export const LETTERS = Object.keys(LETTER_VALUES);

export const EVENTS = ['bars', 'beam', 'floor'];

// Element groups and how they are condensed into groups I–IV for each apparatus.
export const APPARATUS = {
  bars: {
    label: 'Uneven Bars',
    short: 'Bars',
    eventBonus: 'Minimum of 2 bar changes',
    groups: {
      1: 'Mounts',
      2: 'Casts/Counterswings',
      3: 'Underswings/Clear Hips',
      4: 'Giant Swings Backward',
      5: 'Giant Swings/Circles Fwd.',
      6: 'Stalder Circles',
      7: 'Circle Swings/Hechts',
      8: 'Dismounts',
    },
    condensed: { I: [1, 8], II: [2], III: [3, 6, 7], IV: [4, 5] },
  },
  beam: {
    label: 'Balance Beam',
    short: 'Beam',
    eventBonus: 'Acro series with 2 connected flight elements on beam',
    groups: {
      1: 'Mounts',
      2: 'Leaps/Jumps/Hops',
      3: 'Turns',
      4: 'Waves',
      5: 'Holds/Stands',
      6: 'Rolls',
      7: 'Walkovers/Cartwheels etc.',
      8: 'Saltos',
      9: 'Dismounts',
    },
    condensed: { I: [1, 9], II: [2, 3], III: [4, 5, 6], IV: [7, 8] },
  },
  floor: {
    label: 'Floor Exercise',
    short: 'Floor',
    eventBonus: 'Acro pass with min. of 2 connected saltos (direct or indirect)',
    groups: {
      1: 'Leaps/Jumps/Hops',
      2: 'Turns',
      3: 'Handstands',
      4: 'Rolls',
      5: 'Walkovers/Cartwheels etc.',
      6: 'Saltos Forward',
      7: 'Saltos Sideward/Arabians',
      8: 'Saltos Backward',
    },
    condensed: { I: [1, 2], II: [3, 4, 5], III: [6, 7], IV: [8] },
  },
};

// Avoid floating point noise (0.1 + 0.2 etc.).
export const round1 = (n) => Math.round(n * 10) / 10;

export function letterValue(letter) {
  return LETTER_VALUES[String(letter || '').toUpperCase()] ?? 0;
}

export function condensedGroupOf(event, eg) {
  const { condensed } = APPARATUS[event];
  const n = Number(eg);
  return Object.keys(condensed).find((k) => condensed[k].includes(n)) ?? null;
}

const isFilled = (s) => s && (String(s.name || '').trim() || s.letter);

/**
 * Score a bars/beam/floor routine.
 * skills: [{ name, letter, eg }]
 * eventBonus: true if the apparatus-specific bonus requirement was performed.
 * Returns per-skill rows (in routine order) and totals.
 */
export function scoreRoutine(event, skills = [], { eventBonus = false } = {}) {
  const filled = skills.filter(isFilled).slice(0, MAX_SKILLS);

  const rows = filled.map((s) => ({
    name: String(s.name || '').trim(),
    letter: s.letter || '',
    value: letterValue(s.letter),
    eg: s.eg ? Number(s.eg) : null,
    condensed: s.eg ? condensedGroupOf(event, s.eg) : null,
    bonus: 0,
  }));

  // One +0.3 per condensed group, credited to the first qualifying skill.
  const earned = new Set();
  for (const r of rows) {
    if (r.condensed && r.value >= EG_BONUS_MIN_VALUE && !earned.has(r.condensed)) {
      earned.add(r.condensed);
      r.bonus = EG_BONUS;
    }
  }

  const difficulty = round1(rows.reduce((t, r) => t + r.value, 0));
  const egTotal = round1(earned.size * EG_BONUS);
  const eventBonusTotal = eventBonus ? EVENT_BONUS : 0;
  const shortBy = Math.max(0, MIN_SKILLS - rows.length);
  const startValue = rows.length
    ? round1(EXECUTION + difficulty + egTotal + eventBonusTotal - shortBy)
    : 0;

  return {
    rows,
    difficulty,
    egTotal,
    eventBonus: eventBonusTotal,
    earnedGroups: [...earned],
    shortBy,
    startValue,
  };
}

export function findVault(name) {
  return VAULTS.find((v) => v.name === name) ?? null;
}

export function scoreVault(name) {
  const v = findVault(name);
  return v ? { ...v, startValue: round1(v.dv + EXECUTION) } : null;
}

export function scoreAthlete(athlete) {
  const vault = scoreVault(athlete.vault);
  const events = Object.fromEntries(
    EVENTS.map((e) => [
      e,
      scoreRoutine(e, athlete.routines?.[e] || [], { eventBonus: !!athlete.eventBonus?.[e] }),
    ])
  );
  const allAround = round1(
    (vault?.startValue || 0) + EVENTS.reduce((t, e) => t + events[e].startValue, 0)
  );
  return { vault, events, allAround };
}

export const fmt = (n) => Number(n || 0).toFixed(1);
