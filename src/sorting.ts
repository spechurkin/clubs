import type { Connection, Database } from '../shared/model';
import { getLocale } from '../shared/i18n';

const collators = {
  ru: new Intl.Collator('ru', { sensitivity: 'base', numeric: true }),
  en: new Intl.Collator('en', { sensitivity: 'base', numeric: true }),
};

export function sortByName<T extends { name: string }>(items: readonly T[]): T[] {
  const collator = collators[getLocale()];
  return [...items].sort((a, b) => collator.compare(a.name, b.name));
}

export function sortConnections(
  connections: readonly Connection[],
  data: Pick<Database, 'characters' | 'relationTypes'>,
): Connection[] {
  const collator = collators[getLocale()];
  const characters = new Map(data.characters.map((character) => [character.id, character.name]));
  const types = new Map(data.relationTypes.map((type) => [type.id, type.name]));
  return [...connections].sort(
    (a, b) =>
      collator.compare(types.get(a.typeId) || '', types.get(b.typeId) || '') ||
      collator.compare(characters.get(a.sourceId) || '', characters.get(b.sourceId) || '') ||
      collator.compare(characters.get(a.targetId) || '', characters.get(b.targetId) || ''),
  );
}
