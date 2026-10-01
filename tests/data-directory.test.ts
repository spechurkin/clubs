import { russianText } from './russian-fixtures';
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prepareDataDirectory } from '../electron/data-directory';
import { Repository } from '../electron/repository';
import { demoDatabase } from '../src/demo';
import { setLocale } from '../shared/i18n';

setLocale('ru');

const directories: string[] = [];
async function profileRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'circles-profile-'));
  directories.push(root);
  return root;
}
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe('migrate the data profile to Clubs', () => {
  it('moves Circles first and preserves a separate Krugi library for import', async () => {
    const root = await profileRoot();
    for (const name of ['Circles', 'Krugi']) {
      await mkdir(path.join(root, name));
      await writeFile(path.join(root, name, 'library.json'), name);
    }
    await writeFile(path.join(root, 'Circles', 'preferences.json'), '{"language":"ru"}');
    const result = prepareDataDirectory(root);
    expect(result.directory).toBe(path.join(root, 'Clubs'));
    expect(existsSync(path.join(root, 'Circles'))).toBe(false);
    expect(await readFile(path.join(root, 'Clubs', 'library.json'), 'utf8')).toBe('Circles');
    expect(await readFile(path.join(root, 'Clubs', 'preferences.json'), 'utf8')).toBe(
      '{"language":"ru"}',
    );
    expect(await readFile(path.join(root, 'Krugi', 'library.json'), 'utf8')).toBe('Krugi');
    expect(result.warning).toContain(path.join(root, 'Krugi'));
    setLocale('en');
    expect(result.warning).toContain('kept separately');
    setLocale('ru');
  });
  it('moves the complete profile once, preserving the library, backup and cache bytes', async () => {
    const root = await profileRoot();
    const legacy = path.join(root, 'Krugi');
    await mkdir(path.join(legacy, 'Cache'), { recursive: true });
    const data = demoDatabase();
    data.folders = [
      { id: 'family', name: russianText('demo.relationships.family'), parentId: null },
    ];
    data.characters[0].folderId = 'family';
    const json = JSON.stringify(data, null, 2);
    await writeFile(path.join(legacy, 'library.json'), json);
    await writeFile(path.join(legacy, 'library.json.bak'), 'previous backup bytes');
    await writeFile(path.join(legacy, 'Cache', 'entry'), Buffer.from([0, 1, 128, 255]));
    const result = prepareDataDirectory(root);
    expect(result.directory).toBe(path.join(root, 'Clubs'));
    expect(existsSync(legacy)).toBe(false);
    expect(await readFile(path.join(result.directory, 'library.json'), 'utf8')).toBe(json);
    expect(await readFile(path.join(result.directory, 'library.json.bak'), 'utf8')).toBe(
      'previous backup bytes',
    );
    expect(await readFile(path.join(result.directory, 'Cache', 'entry'))).toEqual(
      Buffer.from([0, 1, 128, 255]),
    );
    expect((await new Repository(result.directory).load()).data).toEqual(data);
    expect(prepareDataDirectory(root)).toEqual({ directory: result.directory });
  });
  it('uses an existing Clubs profile without overwriting either library', async () => {
    const root = await profileRoot();
    for (const name of ['Krugi', 'Clubs']) {
      await mkdir(path.join(root, name));
      await writeFile(path.join(root, name, 'library.json'), name);
    }
    const result = prepareDataDirectory(root);
    expect(result.directory).toBe(path.join(root, 'Clubs'));
    expect(result.warning).toContain(russianText('samples.profilePreservedText'));
    expect(await readFile(path.join(root, 'Krugi', 'library.json'), 'utf8')).toBe('Krugi');
    expect(await readFile(path.join(root, 'Clubs', 'library.json'), 'utf8')).toBe('Clubs');
  });
  it('keeps a corrupt primary and valid backup so repository recovery still works after the move', async () => {
    const root = await profileRoot();
    await mkdir(path.join(root, 'Krugi'));
    await writeFile(path.join(root, 'Krugi', 'library.json'), 'broken json');
    await writeFile(path.join(root, 'Krugi', 'library.json.bak'), JSON.stringify(demoDatabase()));
    const result = prepareDataDirectory(root);
    const restored = await new Repository(result.directory).load();
    expect(restored.data).toEqual(demoDatabase());
    expect(restored.warning).toContain(russianText('samples.backupRecoveredText'));
    expect(await readFile(path.join(result.directory, 'library.json'), 'utf8')).toBe('broken json');
  });
  it('starts new profiles in Clubs and leaves legacy data alone for explicit directory overrides', async () => {
    const root = await profileRoot();
    expect(prepareDataDirectory(root)).toEqual({ directory: path.join(root, 'Clubs') });
    await mkdir(path.join(root, 'Krugi'));
    await writeFile(path.join(root, 'Krugi', 'library.json'), 'original');
    const custom = path.join(root, 'test-profile');
    expect(prepareDataDirectory(root, custom)).toEqual({ directory: custom });
    expect(existsSync(path.join(root, 'Clubs'))).toBe(false);
    expect(await readFile(path.join(root, 'Krugi', 'library.json'), 'utf8')).toBe('original');
  });
});
