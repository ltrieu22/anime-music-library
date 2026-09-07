import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  findSearchMatchRanges,
  matchesSearchText,
  normalizeSearchText,
} from './searchText';

test('search normalization folds Latin accents, case, spacing, and decomposed marks', () => {
  assert.equal(normalizeSearchText('  FhÁna\tMusic  '), 'fhana music');
  assert.equal(normalizeSearchText('fha\u0301na'), 'fhana');
  assert.equal(matchesSearchText(['A café by fhána'], 'CAFE FHANA'), true);
  assert.equal(matchesSearchText(['A cafe by fhana'], 'café fhána'), true);
});

test('search normalization preserves Japanese voicing distinctions and canonical equivalence', () => {
  assert.equal(normalizeSearchText('が'), normalizeSearchText('か\u3099'));
  assert.notEqual(normalizeSearchText('が'), normalizeSearchText('か'));
  assert.equal(matchesSearchText(['がっこう'], 'か'), false);
  assert.equal(matchesSearchText(['か\u3099っこう'], 'が'), true);
});

test('local collection, note, and bilingual fields share term matching', () => {
  const fields = [
    'The Café Terrace and Its Goddesses',
    'Megami no Café Terrace',
    'fhána',
    'Étoile',
    'Loved this début performance',
  ];

  for (const query of ['cafe goddesses', 'MEGAMI CAFE', 'fhana etoile', 'debut performance']) {
    assert.equal(matchesSearchText(fields, query), true, query);
  }
  assert.equal(matchesSearchText(fields, 'fhana missing'), false);
});

test('highlight ranges map folded matches back to intact original text', () => {
  const precomposed = 'Music by fhána tonight';
  const precomposedRange = findSearchMatchRanges(precomposed, 'FHANA')[0];
  assert.equal(precomposed.slice(precomposedRange.start, precomposedRange.end), 'fhána');

  const decomposed = 'Music by fha\u0301na tonight';
  const decomposedRange = findSearchMatchRanges(decomposed, 'fhána')[0];
  assert.equal(decomposed.slice(decomposedRange.start, decomposedRange.end), 'fha\u0301na');

  const twoMatches = 'Café fhána';
  assert.deepEqual(
    findSearchMatchRanges(twoMatches, 'fhana cafe').map((range) => twoMatches.slice(range.start, range.end)),
    ['Café', 'fhána'],
  );
});
