import type { CharacterFolder } from './model';

export type FolderEntry = { folder: CharacterFolder; depth: number; path: string };

export function folderEntries(folders: CharacterFolder[]): FolderEntry[] {
  const children = new Map<string | null, CharacterFolder[]>();
  for (const folder of folders) {
    const siblings = children.get(folder.parentId) || [];
    siblings.push(folder);
    children.set(folder.parentId, siblings);
  }
  const result: FolderEntry[] = [];
  const visited = new Set<string>();
  const visit = (parentId: string | null, depth: number, names: string[]) => {
    for (const folder of children.get(parentId) || []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      const trail = [...names, folder.name];
      result.push({ folder, depth, path: trail.join(' / ') });
      visit(folder.id, depth + 1, trail);
    }
  };
  visit(null, 0, []);
  return result;
}

export function folderTrail(folders: CharacterFolder[], id: string): CharacterFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const result: CharacterFolder[] = [];
  const visited = new Set<string>();
  let current: string | null = id;
  while (current !== null && !visited.has(current)) {
    visited.add(current);
    const folder = byId.get(current);
    if (!folder) break;
    result.unshift(folder);
    current = folder.parentId;
  }
  return result;
}

export function folderPath(folders: CharacterFolder[], id: string): string {
  return folderTrail(folders, id)
    .map((folder) => folder.name)
    .join(' / ');
}

export function folderSubtree(folders: CharacterFolder[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const folder of folders) {
    if (folder.parentId === null) continue;
    const siblings = children.get(folder.parentId) || [];
    siblings.push(folder.id);
    children.set(folder.parentId, siblings);
  }
  const result = new Set<string>();
  const pending = [id];
  while (pending.length) {
    const current = pending.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    pending.push(...(children.get(current) || []));
  }
  return result;
}

export function withFolderAncestors(
  folders: CharacterFolder[],
  ids: Iterable<string | null>,
): Set<string> {
  const result = new Set<string>();
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  for (const id of ids) {
    let current = id;
    while (current !== null && !result.has(current)) {
      const folder = byId.get(current);
      if (!folder) break;
      result.add(current);
      current = folder.parentId;
    }
  }
  return result;
}
