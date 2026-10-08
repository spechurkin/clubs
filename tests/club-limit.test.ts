import { afterEach, expect, it } from 'vitest';
import { databaseSchema, emptyDatabase } from '../shared/model';
import { setLocale, tr } from '../shared/i18n';
import { createCharactersTransfer, createStoriesTransfer, mergeTransfer } from '../shared/transfer';
import { russianText } from './russian-fixtures';

function library(count: number) {
  return {
    ...emptyDatabase(),
    clubs: Array.from({ length: count }, (_, index) => ({
      id: `club-${index}`,
      name: `Club ${index}`,
      description: '',
      characterIds: [],
      connections: [],
    })),
  };
}

afterEach(() => setLocale('en'));

it('accepts 100 clubs and rejects 101 with a localized limit message', () => {
  expect(databaseSchema.safeParse(library(100)).success).toBe(true);
  for (const locale of ['en', 'ru'] as const) {
    setLocale(locale);
    const parsed = databaseSchema.safeParse(library(101));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0].path).toEqual(['clubs']);
      expect(parsed.error.issues[0].message).toBe(
        locale === 'en'
          ? 'The library can contain no more than 100 clubs'
          : russianText('validation.clubLimit', 100),
      );
    }
  }
});

it('imports the 100th club and rejects overflow without changing the existing library', () => {
  const incoming = library(1);
  incoming.clubs[0] = { ...incoming.clubs[0], id: 'incoming', name: 'Incoming' };
  const file = createStoriesTransfer(incoming);
  expect(mergeTransfer(library(99), file).data.clubs).toHaveLength(100);
  const current = library(100);
  const original = structuredClone(current);
  expect(() => mergeTransfer(current, file)).toThrow(tr('validation.clubLimit', 100));
  expect(current).toEqual(original);
});

it('allows repeated imports and character imports at the club limit', () => {
  const current = library(100);
  const result = mergeTransfer(current, createStoriesTransfer(current));
  expect(result.data.clubs).toEqual(current.clubs);
  expect(result.summary.clubs).toBe(0);
  expect(result.summary.reused).toBe(100);
  const incoming = emptyDatabase();
  incoming.characters.push({ id: 'new', name: 'New', color: '#abcdef', notes: '', folderId: null });
  expect(mergeTransfer(current, createCharactersTransfer(incoming)).data.characters).toHaveLength(
    1,
  );
});
