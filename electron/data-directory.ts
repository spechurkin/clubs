import { tr } from '../shared/i18n';
import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';

export type DataDirectory = { directory: string; warning?: string };

export function prepareDataDirectory(appData: string, override?: string): DataDirectory {
  if (override) return { directory: path.resolve(override) };
  const root = path.resolve(appData);
  const directory = path.join(root, 'Clubs');
  const legacyDirectories = ['Circles', 'Krugi'].map((name) => path.join(root, name));
  // All paths are fixed siblings inside Electron's appData directory.
  if (existsSync(directory)) {
    const oldLibraries = legacyDirectories.filter((legacy) =>
      ['library.json', 'library.json.bak'].some((file) => existsSync(path.join(legacy, file))),
    );
    return {
      directory,
      get warning() {
        return oldLibraries.length
          ? tr('data.existingClubsProfile', oldLibraries.join(', '))
          : undefined;
      },
    };
  }
  const legacy = legacyDirectories.find((directory) => existsSync(directory));
  if (legacy) {
    try {
      // Rename the entire profile before Electron opens its cache or library files.
      renameSync(legacy, directory);
    } catch (error) {
      throw new Error(tr('errors.profileRename', legacy, directory, (error as Error).message));
    }
  }
  return legacy ? prepareDataDirectory(root) : { directory };
}
