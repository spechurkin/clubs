import { tr } from './i18n';
import { z } from 'zod';
import { databaseSchema, emptyDatabase, type Database, type LoadResult } from './model';
import { folderEntries, folderSubtree, withFolderAncestors } from './folders';

export const transferSchema = z
  .object({
    format: z.literal('krugi-transfer'),
    version: z.literal(1),
    kind: z.enum(['stories', 'characters', 'relations']),
    data: databaseSchema,
  })
  .strict()
  .superRefine((file, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (file.kind === 'characters' && (file.data.circles.length || file.data.relationTypes.length))
      issue(tr('validation.characterTransferContent'));
    if (
      file.kind === 'relations' &&
      (file.data.characters.length || file.data.folders.length || file.data.circles.length)
    )
      issue(tr('validation.relationshipTransferContent'));
  });

export type TransferPackage = z.infer<typeof transferSchema>;
export type ImportSummary = {
  characters: number;
  folders: number;
  relationTypes: number;
  circles: number;
  reused: number;
};
export type TransferImportResult = LoadResult & { summary: ImportSummary };

function selected<T extends { id: string }>(items: T[], ids?: string[]): T[] {
  if (!ids) return items;
  const wanted = new Set(ids);
  if ([...wanted].some((id) => !items.some((item) => item.id === id)))
    throw new Error(tr('errors.exportObjectMissing'));
  return items.filter((item) => wanted.has(item.id));
}

export function createStoriesTransfer(input: Database, circleIds?: string[]): TransferPackage {
  const source = databaseSchema.parse(input);
  const circles = selected(source.circles, circleIds);
  const characterIds = new Set(circles.flatMap((circle) => circle.characterIds));
  const characters = source.characters.filter((character) => characterIds.has(character.id));
  const folderIds = withFolderAncestors(
    source.folders,
    characters.map((character) => character.folderId),
  );
  const typeIds = new Set(
    circles.flatMap((circle) => circle.connections.map((edge) => edge.typeId)),
  );
  return transferSchema.parse({
    format: 'krugi-transfer',
    version: 1,
    kind: 'stories',
    data: {
      version: 3,
      circles,
      characters,
      folders: source.folders.filter((folder) => folderIds.has(folder.id)),
      relationTypes: source.relationTypes.filter((type) => typeIds.has(type.id)),
      activeCircleId: circles.some((circle) => circle.id === source.activeCircleId)
        ? source.activeCircleId
        : circles[0]?.id || null,
    },
  });
}

export function createCharactersTransfer(
  input: Database,
  scope: { characterIds?: string[]; folderId?: string | null } = {},
): TransferPackage {
  const source = databaseSchema.parse(input);
  if (scope.folderId && !source.folders.some((folder) => folder.id === scope.folderId))
    throw new Error(tr('errors.exportFolderMissing'));
  const subtree = scope.folderId
    ? folderSubtree(source.folders, scope.folderId)
    : new Set<string>();
  const characters = selected(source.characters, scope.characterIds).filter(
    (character) =>
      scope.folderId === undefined ||
      (scope.folderId === null
        ? character.folderId === null
        : character.folderId !== null && subtree.has(character.folderId)),
  );
  const folderIds = withFolderAncestors(source.folders, [
    ...subtree,
    ...characters.map((character) => character.folderId),
  ]);
  return transferSchema.parse({
    format: 'krugi-transfer',
    version: 1,
    kind: 'characters',
    data: {
      ...emptyDatabase(),
      characters,
      folders:
        scope.characterIds === undefined && scope.folderId === undefined
          ? source.folders
          : source.folders.filter((folder) => folderIds.has(folder.id)),
    },
  });
}

export function createRelationsTransfer(input: Database): TransferPackage {
  const source = databaseSchema.parse(input);
  return transferSchema.parse({
    format: 'krugi-transfer',
    version: 1,
    kind: 'relations',
    data: { ...emptyDatabase(), relationTypes: source.relationTypes },
  });
}

// Compare content in a stable field order, independent of JSON property order.
const characterKey = (c: Database['characters'][number]) =>
  JSON.stringify([
    c.name,
    c.color,
    c.image || null,
    c.notes,
    c.folderId,
    c.portrait
      ? [
          c.portrait.source,
          c.portrait.zoom,
          c.portrait.rotation,
          c.portrait.flipX,
          c.portrait.offsetX,
          c.portrait.offsetY,
        ]
      : null,
  ]);
const relationKey = (t: Database['relationTypes'][number]) => JSON.stringify([t.name, t.color]);
const circleKey = (c: Database['circles'][number]) =>
  JSON.stringify([
    c.name,
    c.description,
    c.characterIds,
    c.connections.map((e) => [e.sourceId, e.targetId, e.typeId, e.directed, e.notes]),
  ]);

export function mergeTransfer(
  input: Database,
  file: unknown,
): { data: Database; summary: ImportSummary } {
  const data = databaseSchema.parse(input);
  const parsed = transferSchema.safeParse(file);
  if (!parsed.success) {
    const reason = parsed.error.issues.find((issue) => issue.code === 'custom')?.message;
    throw new Error(tr('errors.transferFileInvalid', reason || tr('transfer.invalidFileHint')));
  }
  const incoming = parsed.data.data;
  const summary: ImportSummary = {
    characters: 0,
    folders: 0,
    relationTypes: 0,
    circles: 0,
    reused: 0,
  };
  const folderMap = new Map<string, string>();
  for (const { folder } of folderEntries(incoming.folders)) {
    const parentId = folder.parentId === null ? null : folderMap.get(folder.parentId)!;
    const existing = data.folders.find(
      (item) =>
        item.parentId === parentId &&
        item.name.toLocaleLowerCase('ru') === folder.name.toLocaleLowerCase('ru'),
    );
    if (existing) {
      folderMap.set(folder.id, existing.id);
      summary.reused++;
    } else {
      const id = availableId(folder.id, data.folders);
      data.folders.push({ ...folder, id, parentId });
      folderMap.set(folder.id, id);
      summary.folders++;
    }
  }

  function mergeItems<T extends { id: string }>(
    current: T[],
    imported: T[],
    key: (item: T) => string,
    count: 'characters' | 'relationTypes' | 'circles',
  ) {
    const map = new Map<string, string>();
    const claimed = new Set<string>();
    const byId = new Map(current.map((item) => [item.id, item]));
    const keys = new Map(current.map((item) => [item.id, key(item)]));
    const byContent = new Map<string, T[]>();
    for (const item of current) {
      const content = keys.get(item.id)!;
      const bucket = byContent.get(content) || [];
      bucket.push(item);
      byContent.set(content, bucket);
    }
    for (const item of imported) {
      const content = key(item);
      const sameId =
        !claimed.has(item.id) && keys.get(item.id) === content ? byId.get(item.id) : undefined;
      const existing =
        sameId || byContent.get(content)?.find((existing) => !claimed.has(existing.id));
      let id = existing?.id || item.id;
      if (!existing) while (byId.has(id)) id = crypto.randomUUID();
      if (existing) summary.reused++;
      else {
        const added = { ...item, id };
        current.push(added);
        byId.set(id, added);
        keys.set(id, content);
        const bucket = byContent.get(content) || [];
        bucket.push(added);
        byContent.set(content, bucket);
        summary[count]++;
      }
      // Distinct imported identities must not collapse into one participant/type/story.
      claimed.add(id);
      map.set(item.id, id);
    }
    return map;
  }

  const characterMap = mergeItems(
    data.characters,
    incoming.characters.map((character) => ({
      ...character,
      folderId: character.folderId === null ? null : folderMap.get(character.folderId)!,
    })),
    characterKey,
    'characters',
  );
  const typeMap = mergeItems(
    data.relationTypes,
    incoming.relationTypes,
    relationKey,
    'relationTypes',
  );
  const circleMap = mergeItems(
    data.circles,
    incoming.circles.map((circle) => ({
      ...circle,
      characterIds: circle.characterIds.map((id) => characterMap.get(id)!),
      connections: circle.connections.map((edge) => ({
        ...edge,
        sourceId: characterMap.get(edge.sourceId)!,
        targetId: characterMap.get(edge.targetId)!,
        typeId: typeMap.get(edge.typeId)!,
      })),
    })),
    circleKey,
    'circles',
  );
  if (!data.activeCircleId)
    data.activeCircleId =
      (incoming.activeCircleId && circleMap.get(incoming.activeCircleId)) ||
      data.circles[0]?.id ||
      null;
  const merged = databaseSchema.safeParse(data);
  if (!merged.success) throw new Error(tr('errors.mergedLibraryInvalid'));
  return { data: merged.data, summary };
}

function availableId(id: string, items: { id: string }[]): string {
  const used = new Set(items.map((item) => item.id));
  let result = id;
  while (used.has(result)) result = crypto.randomUUID();
  return result;
}

export function describeImport(summary: ImportSummary): string {
  return tr(
    'transfer.importSummary',
    summary.circles,
    summary.characters,
    summary.folders,
    summary.relationTypes,
    summary.reused,
  );
}
