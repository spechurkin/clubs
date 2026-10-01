import type {Locale} from './i18n';
import {tr} from './i18n';
import {z} from 'zod';
import type {TransferImportResult, TransferPackage} from './transfer';
import {folderSubtree} from './folders';

export const COLORS = [
  '#80c7b7',
  '#f4ad7b',
  '#9b9be8',
  '#e98091',
  '#80afdc',
  '#dbbc72',
  '#aec789',
  '#ac92bb',
];
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9_-]+$/);
const name = z
  .string()
  .trim()
  .min(1, { error: () => tr('validation.nameRequired') })
  .max(80);
const color = z.string().regex(/^#[\da-fA-F]{6}$/, { error: () => tr('validation.invalidColor') });
const image = z
  .string()
  .max(7_000_000)
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/);
export const portraitSchema = z
  .object({
    source: image,
    zoom: z.number().min(1).max(4),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    flipX: z.boolean(),
    offsetX: z.number().finite(),
    offsetY: z.number().finite(),
  })
  .strict();
export const characterSchema = z
  .object({
    id,
    name,
    color,
    image: image.optional(),
    portrait: portraitSchema.optional(),
    notes: z.string().max(2000),
    folderId: id.nullable().default(null),
  })
  .strict();
export const characterFolderSchema = z
  .object({ id, name, parentId: id.nullable().default(null) })
  .strict();
export const relationTypeSchema = z.object({ id, name, color }).strict();
export const connectionSchema = z
  .object({
    id,
    sourceId: id,
    targetId: id,
    typeId: id,
    directed: z.boolean(),
    notes: z.string().max(2000),
  })
  .strict();
export const clubSchema = z
  .object({
    id,
    name,
    description: z.string().max(2000),
    characterIds: z.array(id).max(500),
    connections: z.array(connectionSchema).max(10000),
  })
  .strict();
const currentDatabaseSchema = z
  .object({
      version: z.literal(4),
    characters: z.array(characterSchema).max(5000),
    folders: z.array(characterFolderSchema).max(500),
    relationTypes: z.array(relationTypeSchema).max(200),
      clubs: z.array(clubSchema).max(500),
      activeClubId: id.nullable(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const unique = (values: string[]) => new Set(values).size === values.length;
    if (
      !unique(data.characters.map((c) => c.id)) ||
      !unique(data.folders.map((folder) => folder.id)) ||
      !unique(data.relationTypes.map((t) => t.id)) ||
        !unique(data.clubs.map((c) => c.id))
    )
      issue(tr('validation.duplicateIds'));
    const characters = new Set(data.characters.map((c) => c.id));
    const folders = new Set(data.folders.map((folder) => folder.id));
    if (
      data.characters.some(
        (character) => character.folderId !== null && !folders.has(character.folderId),
      )
    )
      issue(tr('validation.characterFolderMissing'));
    if (
      !unique(
        data.folders.map((folder) =>
          JSON.stringify([folder.parentId, folder.name.toLocaleLowerCase('ru')]),
        ),
      )
    )
      issue(tr('validation.duplicateFolderName'));
    const parents = new Map(data.folders.map((folder) => [folder.id, folder.parentId]));
    for (const folder of data.folders) {
      if (folder.parentId !== null && !folders.has(folder.parentId))
        issue(tr('validation.parentFolderMissing'));
      const visited = new Set([folder.id]);
      let parent = folder.parentId;
      while (parent !== null && parents.has(parent)) {
        if (visited.has(parent)) {
          issue(tr('validation.folderCycle'));
          break;
        }
        visited.add(parent);
        parent = parents.get(parent)!;
      }
    }
    const types = new Set(data.relationTypes.map((t) => t.id));
      if (data.activeClubId && !data.clubs.some((c) => c.id === data.activeClubId))
          issue(tr('validation.activeClubMissing'));
      for (const club of data.clubs) {
          const members = new Set(club.characterIds);
          if (!unique(club.characterIds) || club.characterIds.some((c) => !characters.has(c)))
              issue(tr('validation.clubMembersInvalid'));
          if (!unique(club.connections.map((c) => c.id))) issue(tr('validation.duplicateConnections'));
      const signatures = new Set<string>();
          for (const connection of club.connections) {
        if (
          !members.has(connection.sourceId) ||
          !members.has(connection.targetId) ||
          !types.has(connection.typeId) ||
          connection.sourceId === connection.targetId
        )
          issue(tr('validation.connectionInvalid'));
        const endpoints = connection.directed
          ? [connection.sourceId, connection.targetId]
          : [connection.sourceId, connection.targetId].sort();
        const signature = JSON.stringify([connection.typeId, connection.directed, ...endpoints]);
        if (signatures.has(signature)) issue(tr('validation.connectionExists'));
        signatures.add(signature);
      }
    }
  });

// Normalize previous library formats in every load/import path.
export const databaseSchema = z.preprocess((input) => {
  if (
      typeof input !== 'object' ||
      input === null ||
      !('version' in input) ||
      ![1, 2, 3].includes(input.version as number) ||
      (input.version === 1 && 'folders' in input)
  )
      return input;
    const previous = input as Record<string, unknown>;
    const migrated: Record<string, unknown> = {
        ...previous,
        version: 4,
        ...(previous.version === 1 ? {folders: []} : {}),
    };
    // Legacy field names are accepted only here; mixed formats remain invalid.
    if ('circles' in previous || 'activeCircleId' in previous) {
        if ('clubs' in previous || 'activeClubId' in previous) return input;
        const {circles, activeCircleId, ...rest} = migrated;
        return {...rest, clubs: circles, activeClubId: activeCircleId};
    }
    return migrated;
}, currentDatabaseSchema);

export type Character = z.infer<typeof characterSchema>;
export type Portrait = z.infer<typeof portraitSchema>;
export type CharacterFolder = z.infer<typeof characterFolderSchema>;
export type RelationType = z.infer<typeof relationTypeSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type Club = z.infer<typeof clubSchema>;
export type Database = z.infer<typeof databaseSchema>;
export type LoadResult = { data: Database; path: string; warning?: string };
export type ExportFormat = 'png' | 'svg';
export interface DesktopAPI {
  getLanguage(): Promise<Locale>;
  setLanguage(locale: Locale): Promise<void>;
  load(): Promise<LoadResult>;
  save(data: Database): Promise<void>;
  exportBackup(data: Database): Promise<boolean>;
  importBackup(): Promise<LoadResult | null>;
  exportTransfer(file: TransferPackage, name: string): Promise<boolean>;
  importTransfer(): Promise<TransferImportResult | null>;
  exportDiagram(name: string, format: ExportFormat, content: string): Promise<boolean>;
  showDataFolder(): Promise<void>;
}

export function emptyDatabase(): Database {
  return {
      version: 4,
    characters: [],
    folders: [],
    relationTypes: [],
      clubs: [],
      activeClubId: null,
  };
}

export function deleteCharacterFolder(data: Database, folderId: string): Database {
  const folder = data.folders.find((folder) => folder.id === folderId);
  if (!folder) return data;
  const removed = folderSubtree(data.folders, folderId);
  return {
    ...data,
    folders: data.folders.filter((folder) => !removed.has(folder.id)),
    characters: data.characters.map((character) =>
      character.folderId !== null && removed.has(character.folderId)
        ? { ...character, folderId: folder.parentId }
        : character,
    ),
  };
}

export function deleteCharacter(data: Database, characterId: string): Database {
  return {
    ...data,
    characters: data.characters.filter((c) => c.id !== characterId),
      clubs: data.clubs.map((c) => ({
      ...c,
      characterIds: c.characterIds.filter((id) => id !== characterId),
      connections: c.connections.filter(
        (edge) => edge.sourceId !== characterId && edge.targetId !== characterId,
      ),
    })),
  };
}

export function removeFromClub(club: Club, characterId: string): Club {
  return {
      ...club,
      characterIds: club.characterIds.filter((id) => id !== characterId),
      connections: club.connections.filter(
      (e) => e.sourceId !== characterId && e.targetId !== characterId,
    ),
  };
}

export function deleteRelationType(data: Database, typeId: string): Database {
  return {
    ...data,
    relationTypes: data.relationTypes.filter((t) => t.id !== typeId),
      clubs: data.clubs.map((c) => ({
      ...c,
      connections: c.connections.filter((e) => e.typeId !== typeId),
    })),
  };
}

export function hasDuplicateConnection(club: Club, edge: Connection): boolean {
    return club.connections.some(
    (e) =>
      e.id !== edge.id &&
      e.typeId === edge.typeId &&
      e.directed === edge.directed &&
      ((e.sourceId === edge.sourceId && e.targetId === edge.targetId) ||
        (!edge.directed && e.sourceId === edge.targetId && e.targetId === edge.sourceId)),
  );
}
