import {russianText} from '../russian-fixtures';
import {_electron as electron, type ElectronApplication, expect, type Page, test,} from '@playwright/test';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {demoDatabase} from '../../src/demo';
import {databaseSchema, emptyDatabase} from '../../shared/model';
import {transferSchema} from '../../shared/transfer';
import {folderEntries} from '../../shared/folders';
import {setLocale} from '../../shared/i18n';

setLocale('ru');

const root = process.cwd();
const dataDir = path.join(root, '.test-data', 'desktop');
const outputDir = path.join(root, 'test-results');
let app: ElectronApplication;
let page: Page;

async function launch(directory = dataDir) {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'preferences.json'), JSON.stringify({ language: 'ru' }));
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env))
    if (value && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
    env.CLUB_DATA_DIR = directory;
  app = await electron.launch({
      executablePath: process.env.CLUB_TEST_EXECUTABLE,
      args: process.env.CLUB_TEST_EXECUTABLE ? [] : [root],
    env,
  });
  page = await app.firstWindow();
  await expect(page.locator('.save-status')).toHaveText(russianText('save.saved'));
}
async function saved() {
  await expect(page.locator('.save-status')).toHaveText(russianText('save.saved'));
}
async function moveCharacter(name: string, folderPath?: string) {
  await page
    .getByRole('button', { name: russianText('characters.editLabel', name), exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel(russianText('characters.folderLabel'), { exact: true })
    .selectOption(folderPath ? { label: folderPath } : '');
  await dialog
    .getByRole('button', { name: russianText('actions.saveChanges'), exact: true })
    .click();
  await saved();
}
async function createCharacter(name: string, portrait = false) {
  await page.getByRole('button', { name: russianText('members.add'), exact: true }).click();
  await page.getByRole('button', { name: russianText('characters.createNew') }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(russianText('characters.nameLabel')).fill(name);
  await dialog
    .getByLabel(russianText('forms.notesLabel'), { exact: false })
    .fill(russianText('samples.characterStory', name));
  if (portrait) {
    await dialog.locator('input[type=file]').setInputFiles(path.join(root, 'resources/icon.png'));
    await dialog.getByRole('button', { name: russianText('portrait.apply'), exact: true }).click();
    await expect(dialog.locator('.portrait-editor img')).toBeVisible();
    await expect(
      dialog.getByText(russianText('characters.colorLabel'), { exact: true }),
    ).toHaveCount(0);
  } else await dialog.getByLabel(russianText('colors.custom')).fill('#d48f9c');
  await dialog.getByRole('button', { name: russianText('characters.create'), exact: true }).click();
  await saved();
}

test.afterEach(async () => {
  await app?.close();
});

test('nested folders: create, collapse, reparent, filter, export and import complete branches without losing relationships', async () => {
  const directory = path.join(root, '.test-data', 'nested-folders');
  const importedDirectory = path.join(root, '.test-data', 'nested-import');
  for (const target of [directory, importedDirectory]) {
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
  }
  await mkdir(outputDir, { recursive: true });
  const original = demoDatabase();
  const flat = {
    ...original,
    version: 2,
    folders: [{ id: 'world', name: russianText('samples.world') }],
  };
  await writeFile(path.join(directory, 'library.json'), JSON.stringify(flat));
  await launch(directory);
  const errors: string[] = [];
  const watchErrors = () => page.on('pageerror', (error) => errors.push(error.message));
  watchErrors();
  const selectFolder = async (folderPath: string) => {
    const escaped = folderPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await page
      .locator('.folder-list')
      .getByRole('button', { name: new RegExp(`^${escaped} ·`) })
      .click();
  };
  const createChild = async (parentPath: string, name: string) => {
    await page
      .getByRole('button', {
        name: russianText('folders.createSubfolderLabel', parentPath),
        exact: true,
      })
      .click();
    await expect(
      page
        .getByRole('dialog')
        .getByLabel(russianText('folders.parentLabel'))
        .locator('option:checked'),
    ).toHaveText(parentPath);
    await page.getByRole('dialog').getByLabel(russianText('folders.nameLabel')).fill(name);
    await page
      .getByRole('dialog')
      .getByRole('button', { name: russianText('folders.create'), exact: true })
      .click();
    await saved();
  };
  await page
    .getByRole('button', { name: russianText('navigation.characters'), exact: true })
    .click();
  await selectFolder(russianText('samples.world'));
  await page
    .getByRole('button', { name: russianText('folders.new'), exact: true })
    .first()
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByLabel(russianText('folders.parentLabel'))
      .locator('option:checked'),
  ).toHaveText(russianText('samples.world'));
  await page
    .getByRole('dialog')
    .getByLabel(russianText('folders.nameLabel'))
    .fill(russianText('demo.relationships.family'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('folders.create'), exact: true })
    .click();
  await createChild(russianText('samples.worldFamilyPath'), russianText('samples.mainCharacters'));
  await createChild(russianText('samples.worldFamilyPath'), russianText('samples.allies'));
  await page
    .getByRole('button', { name: russianText('folders.new'), exact: true })
    .first()
    .click();
  await page.getByRole('dialog').getByLabel(russianText('folders.parentLabel')).selectOption('');
  await page
    .getByRole('dialog')
    .getByLabel(russianText('folders.nameLabel'))
    .fill(russianText('samples.otherWorld'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('folders.create'), exact: true })
    .click();
  await createChild(russianText('samples.otherWorld'), russianText('demo.relationships.family'));
  // The same name is allowed in another branch but not beside an existing sibling.
  await page
    .getByRole('button', {
      name: russianText('folders.createSubfolderLabel', russianText('samples.otherWorld')),
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('folders.nameLabel'))
    .fill(russianText('samples.familyLowercase'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('folders.create'), exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    russianText('samples.folderAlreadyExistsText'),
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.cancel'), exact: true })
    .click();
  await page
    .locator('.folder-panel')
    .getByRole('button', { name: new RegExp('^' + russianText('characters.all'), '') })
    .click();
  await moveCharacter(russianText('demo.nora.name'), russianText('samples.worldFamilyMainPath'));
  await moveCharacter(russianText('demo.mira.name'), russianText('samples.worldFamilyAlliesPath'));
  await selectFolder(russianText('samples.worldFamilyMainPath'));
  await page.getByRole('button', { name: russianText('characters.new'), exact: true }).click();
  await expect(
    page
      .getByRole('dialog')
      .getByLabel(russianText('characters.folderLabel'), { exact: true })
      .locator('option:checked'),
  ).toHaveText(russianText('samples.worldFamilyMainPath'));
  await page
    .getByRole('dialog')
    .getByLabel(russianText('characters.nameLabel'))
    .fill(russianText('samples.victorWest'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('characters.create'), exact: true })
    .click();
  await selectFolder(russianText('samples.worldFamilyPath'));
  await expect(page.getByRole('article')).toHaveCount(3);
  await page
    .getByRole('button', {
      name: russianText(
        'folders.toggleLabel',
        russianText('actions.collapse'),
        russianText('samples.worldFamilyPath'),
      ),
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: russianText('folders.createSubfolderLabel', russianText('samples.worldFamilyMainPath')),
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.getByRole('article')).toHaveCount(3);
  await page
    .getByRole('button', {
      name: russianText(
        'folders.toggleLabel',
        russianText('actions.expand'),
        russianText('samples.worldFamilyPath'),
      ),
      exact: true,
    })
    .click();
  await expect(
    page.getByRole('button', {
      name: russianText('folders.createSubfolderLabel', russianText('samples.worldFamilyMainPath')),
      exact: true,
    }),
  ).toBeVisible();
  // Parent filters include descendants; switching branches keeps the participant selection.
  await page
      .locator('.club-list-item')
      .filter({hasText: russianText('demo.club.name')})
    .click();
  await page.getByRole('button', { name: russianText('members.add'), exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('members.folderLabel'))
    .selectOption({ label: russianText('samples.world') });
  await expect(page.getByRole('dialog').locator('.picker-row')).toHaveCount(3);
  await page
    .getByRole('dialog')
    .locator('.picker-row')
    .filter({ hasText: russianText('samples.victorWest') })
    .getByRole('checkbox')
    .check();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('members.folderLabel'))
    .selectOption({ label: russianText('samples.otherWorld') });
  await expect(page.getByRole('dialog').locator('.picker-row')).toHaveCount(0);
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: russianText('members.applySelection', '7'), exact: true }),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.cancel'), exact: true })
    .click();
  await page
    .getByRole('button', { name: russianText('navigation.characters'), exact: true })
    .click();
  await page
    .getByRole('button', {
      name: russianText('folders.renameLabel', russianText('samples.worldFamilyPath')),
      exact: true,
    })
    .click();
  const parents = page.getByRole('dialog').getByLabel(russianText('folders.parentLabel'));
  await expect(
    parents.locator('option').filter({ hasText: russianText('samples.worldFamilyMainPath') }),
  ).toHaveCount(0);
  await expect(
    parents.locator('option').filter({ hasText: russianText('samples.worldFamilyAlliesPath') }),
  ).toHaveCount(0);
  await parents.selectOption({ label: russianText('samples.otherWorld') });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.saveChanges'), exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    russianText('samples.folderAlreadyExistsText'),
  );
  await page
    .getByRole('dialog')
    .getByLabel(russianText('folders.nameLabel'))
    .fill(russianText('samples.westHouse'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.saveChanges'), exact: true })
    .click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await page
    .getByRole('button', {
      name: russianText('characters.editLabel', russianText('demo.nora.name')),
      exact: true,
    })
    .click();
  await expect(
    page
      .getByRole('dialog')
      .getByLabel(russianText('characters.folderLabel'), { exact: true })
      .locator('option:checked'),
  ).toHaveText(russianText('samples.otherWorldWestHouseMainPath'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.cancel'), exact: true })
    .click();
  await selectFolder(russianText('samples.otherWorld'));
  await expect(page.getByRole('article')).toHaveCount(3);
  if (await page.getByRole('status').count())
    await page.getByRole('status').getByRole('button').click();
  await page.screenshot({ path: path.join(outputDir, 'desktop-nested-folders.png') });
  await page
    .getByRole('article')
    .filter({ hasText: russianText('demo.nora.name') })
    .screenshot({ path: path.join(outputDir, 'desktop-character-card.png') });
  await selectFolder(russianText('samples.otherWorldWestHousePath'));
  const folderFile = path.join(outputDir, 'nested-characters.json');
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, folderFile);
  await page.getByRole('button', { name: russianText('transfer.export'), exact: true }).click();
  await page
    .getByRole('button', { name: new RegExp('^' + russianText('transfer.currentFolder'), '') })
    .click();
  await expect(page.getByRole('status')).toContainText(russianText('notifications.jsonSaved'));
  const folderPackage = transferSchema.parse(JSON.parse(await readFile(folderFile, 'utf8')));
  expect(folderPackage.data.characters).toHaveLength(3);
    expect(folderPackage.data.clubs).toEqual([]);
  expect(folderEntries(folderPackage.data.folders).map((entry) => entry.path)).toEqual([
    russianText('samples.otherWorld'),
    russianText('samples.otherWorldWestHousePath'),
    russianText('samples.otherWorldWestHouseMainPath'),
    russianText('samples.otherWorldWestHouseAlliesPath'),
  ]);
  await page.getByRole('status').getByRole('button').click();
  const storyFile = path.join(outputDir, 'nested-story.json');
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, storyFile);
  await page
      .locator('.club-list-item')
      .filter({hasText: russianText('demo.club.name')})
    .click();
  await page.getByRole('button', { name: russianText('actions.export'), exact: true }).click();
  await page
    .getByRole('button', { name: new RegExp('^' + russianText('transfer.story'), '') })
    .click();
  await expect(page.getByRole('status')).toContainText(russianText('notifications.jsonSaved'));
    expect(transferSchema.parse(JSON.parse(await readFile(storyFile, 'utf8'))).data.clubs).toEqual(
        original.clubs,
  );
  await saved();
  await app.close();
  await launch(directory);
  watchErrors();
  await page
    .getByRole('button', { name: russianText('navigation.characters'), exact: true })
    .click();
  await selectFolder(russianText('samples.otherWorldWestHousePath'));
  await expect(page.getByRole('article')).toHaveCount(3);
  // Deleting a leaf or branch moves its characters to the remaining parent.
  await selectFolder(russianText('samples.otherWorldWestHouseAlliesPath'));
  await page
    .getByRole('button', {
      name: russianText(
        'folders.deleteLabel',
        russianText('samples.otherWorldWestHouseAlliesPath'),
      ),
      exact: true,
    })
    .click();
  await expect(page.getByRole('dialog')).toContainText(russianText('samples.moveToWestHouseText'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.delete'), exact: true })
    .click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await page
    .getByRole('button', {
      name: russianText('folders.deleteLabel', russianText('samples.otherWorldWestHousePath')),
      exact: true,
    })
    .click();
  await expect(page.getByRole('dialog')).toContainText(russianText('samples.oneSubfolderText'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.delete'), exact: true })
    .click();
  await saved();
  const deleted = databaseSchema.parse(
    JSON.parse(await readFile(path.join(directory, 'library.json'), 'utf8')),
  );
  expect(deleted.characters).toHaveLength(7);
    expect(deleted.clubs).toEqual(original.clubs);
  const otherId = deleted.folders.find(
    (folder) => folder.name === russianText('samples.otherWorld'),
  )!.id;
  expect(
    deleted.characters
      .filter((character) =>
        [
          russianText('demo.nora.name'),
          russianText('demo.mira.name'),
          russianText('samples.victorWest'),
        ].includes(character.name),
      )
      .every((character) => character.folderId === otherId),
  ).toBe(true);
  expect(folderEntries(deleted.folders).map((entry) => entry.path)).toEqual([
    russianText('samples.world'),
    russianText('samples.otherWorld'),
    russianText('samples.otherWorldFamilyPath'),
  ]);
  await app.close();
  await launch(importedDirectory);
  watchErrors();
  await page.getByRole('button', { name: russianText('navigation.settings'), exact: true }).click();
  const importFile = async (file: string) => {
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
    }, file);
    await page.getByRole('button', { name: russianText('transfer.import'), exact: true }).click();
  };
  await importFile(folderFile);
  await expect(page.getByRole('status')).toContainText(russianText('samples.threeCharactersText'));
  let imported = databaseSchema.parse(
    JSON.parse(await readFile(path.join(importedDirectory, 'library.json'), 'utf8')),
  );
    expect(imported.clubs).toEqual([]);
  expect(folderEntries(imported.folders)).toEqual(folderEntries(folderPackage.data.folders));
  await page.getByRole('status').getByRole('button').click();
  await importFile(storyFile);
  await expect(page.getByRole('status')).toContainText(russianText('samples.oneStoryText'));
  imported = databaseSchema.parse(
    JSON.parse(await readFile(path.join(importedDirectory, 'library.json'), 'utf8')),
  );
  expect(imported.characters).toHaveLength(7);
    expect(imported.clubs).toEqual(original.clubs);
  expect(folderEntries(imported.folders)).toEqual(folderEntries(folderPackage.data.folders));
  await app.close();
  await launch(importedDirectory);
  watchErrors();
  await expect(page.getByTestId('diagram').locator('.diagram-node')).toHaveCount(6);
  await expect(page.getByTestId('diagram').locator('.diagram-edge')).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('JSON transfer: export stories, characters, folders and relations, add into a nonempty library and reopen', async () => {
  const sourceDir = path.join(root, '.test-data', 'transfer-source');
  const targetDir = path.join(root, '.test-data', 'transfer-target');
  for (const directory of [sourceDir, targetDir]) {
    await rm(directory, { recursive: true, force: true });
    await mkdir(directory, { recursive: true });
  }
  await mkdir(outputDir, { recursive: true });
  const source = demoDatabase();
  source.folders = [
    { id: 'family', name: russianText('samples.westFamily'), parentId: null },
    { id: 'empty-folder', name: russianText('samples.futureCharacters'), parentId: null },
  ];
  source.characters[0].folderId = source.characters[2].folderId = 'family';
  source.characters[0].image = `data:image/png;base64,${(await readFile(path.join(root, 'resources/icon.png'))).toString('base64')}`;
  source.characters.push({
    id: 'outsider',
    name: russianText('samples.unusedCharacter'),
    color: '#abcdef',
    notes: russianText('samples.standaloneCard'),
    folderId: null,
  });
  source.relationTypes.push({
    id: 'respect',
    name: russianText('samples.respect'),
    color: '#123456',
  });
    source.clubs.push({
    id: 'other',
        name: russianText('samples.anotherClub'),
    description: '',
    characterIds: ['elias', 'mira'],
    connections: [],
  });
    source.clubs.push({
    id: 'empty-story',
        name: russianText('samples.emptyClub'),
    description: '',
    characterIds: [],
    connections: [],
  });
  await writeFile(path.join(sourceDir, 'library.json'), JSON.stringify(source));
  await launch(sourceDir);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  async function exportTo(filename: string, click: () => Promise<unknown>) {
    const file = path.join(outputDir, filename);
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, file);
    await click();
    await expect(page.getByRole('status')).toContainText(russianText('notifications.jsonSaved'));
    const result = transferSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    // Remove the toast so the next export must complete before its assertion passes.
    await page.getByRole('status').getByRole('button').click();
    return result;
  }
  await page.getByRole('button', { name: russianText('actions.export'), exact: true }).click();
  await expect(
    page.getByRole('button', { name: new RegExp('^' + russianText('transfer.story'), '') }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(outputDir, 'desktop-json-export.png') });
  const story = await exportTo('one-story.json', () =>
    page.getByRole('button', { name: new RegExp('^' + russianText('transfer.story'), '') }).click(),
  );
  expect(story.kind).toBe('stories');
    expect(story.data.clubs).toEqual([source.clubs[0]]);
  expect(story.data.characters).toEqual(source.characters.slice(0, 6));
  expect(story.data.folders).toEqual([source.folders[0]]);
  expect(story.data.relationTypes).toEqual(source.relationTypes.slice(0, 4));
  await page
    .getByRole('button', { name: russianText('navigation.characters'), exact: true })
    .click();
  await page.getByRole('button', { name: russianText('transfer.export'), exact: true }).click();
  const characters = await exportTo('all-characters.json', () =>
    page
      .getByRole('button', { name: new RegExp('^' + russianText('transfer.allCharacters'), '') })
      .click(),
  );
  expect(characters.data.characters).toEqual(source.characters);
  expect(characters.data.folders).toEqual(source.folders);
    expect(characters.data.clubs).toEqual([]);
  expect(characters.data.relationTypes).toEqual([]);
  await page
    .locator('.folder-panel')
    .getByRole('button', { name: new RegExp('^' + russianText('samples.westFamily'), '') })
    .click();
  await page
    .getByLabel(russianText('characters.searchLabel'))
    .fill(russianText('samples.noraFirstName'));
  await page.getByRole('button', { name: russianText('transfer.export'), exact: true }).click();
  const folder = await exportTo('folder-characters.json', () =>
    page
      .getByRole('button', { name: new RegExp('^' + russianText('transfer.currentFolder'), '') })
      .click(),
  );
  expect(folder.data.characters.map((character) => character.id)).toEqual(['nora', 'mira']);
    expect(folder.data.clubs).toEqual([]);
  const individual = await exportTo('one-character.json', () =>
    page
      .locator('.card-bottom')
      .getByRole('button', {
        name: russianText('characters.exportLabel', russianText('demo.nora.name')),
        exact: true,
      })
      .click(),
  );
  expect(individual.data.characters).toEqual([source.characters[0]]);
  expect(individual.data.folders).toEqual([source.folders[0]]);
  await page
    .getByRole('button', { name: russianText('navigation.relationships'), exact: true })
    .click();
  const relations = await exportTo('relation-types.json', () =>
    page.getByRole('button', { name: russianText('transfer.export'), exact: true }).click(),
  );
  expect(relations.data).toEqual({ ...emptyDatabase(), relationTypes: source.relationTypes });
  await page.getByRole('button', { name: russianText('navigation.settings'), exact: true }).click();
  const stories = await exportTo('all-stories.json', () =>
    page.getByRole('button', { name: russianText('transfer.allStories'), exact: true }).click(),
  );
    expect(stories.data.clubs).toEqual(source.clubs);
  expect(stories.data.characters).toHaveLength(6);
  expect(errors).toEqual([]);
  await app.close();

  const local = {
    ...emptyDatabase(),
    characters: [
      {
        ...source.characters[0],
        name: russianText('samples.localNora'),
        notes: russianText('samples.keepUnchanged'),
      },
    ],
    folders: [{ id: 'family', name: russianText('samples.localFolder'), parentId: null }],
    relationTypes: [{ id: 'trust', name: russianText('samples.localTrust'), color: '#fedcba' }],
      clubs: [
      {
        id: 'lake',
        name: russianText('samples.localStory'),
        description: russianText('samples.keepUnchanged'),
        characterIds: ['nora'],
        connections: [],
      },
    ],
      activeClubId: 'lake',
  };
  await writeFile(path.join(targetDir, 'library.json'), JSON.stringify(local));
  await launch(targetDir);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: russianText('navigation.settings'), exact: true }).click();
  async function importFrom(filename: string, response = 1) {
    await app.evaluate(
      ({ dialog }, options) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [options.file] });
        dialog.showMessageBox = async () => ({
          response: options.response,
          checkboxChecked: false,
        });
      },
      { file: path.join(outputDir, filename), response },
    );
    await page.getByRole('button', { name: russianText('transfer.import'), exact: true }).click();
  }
  await importFrom('all-characters.json');
  await expect(page.getByRole('status')).toContainText(russianText('samples.sevenCharactersText'));
  let stored = databaseSchema.parse(
    JSON.parse(await readFile(path.join(targetDir, 'library.json'), 'utf8')),
  );
  expect(stored.characters).toHaveLength(8);
    expect(stored.clubs).toEqual(local.clubs);
  expect(stored.relationTypes).toEqual(local.relationTypes);
  expect(stored.characters[0]).toEqual(local.characters[0]);
  await page.getByRole('status').getByRole('button').click();
  await importFrom('all-stories.json');
  await expect(page.getByRole('status')).toContainText(russianText('samples.threeStoriesText'));
  stored = databaseSchema.parse(
    JSON.parse(await readFile(path.join(targetDir, 'library.json'), 'utf8')),
  );
  expect(stored.characters).toHaveLength(8);
    expect(stored.clubs).toHaveLength(4);
  expect(stored.characters[0]).toEqual(local.characters[0]);
  expect(stored.folders[0]).toEqual(local.folders[0]);
    expect(stored.clubs[0]).toEqual(local.clubs[0]);
    expect(stored.activeClubId).toBe('lake');
    const importedStory = stored.clubs.find((club) => club.name === russianText('demo.club.name'))!;
  const importedNora = stored.characters.find(
    (character) => character.name === russianText('demo.nora.name'),
  )!;
  expect(importedNora.id).not.toBe('nora');
  expect(importedNora.image).toBe(source.characters[0].image);
  expect(importedStory.characterIds).toContain(importedNora.id);
  expect(importedStory.connections).toHaveLength(7);
  expect(importedStory.connections.filter((edge) => edge.directed)).toHaveLength(3);
  await page.getByRole('status').getByRole('button').click();
  await importFrom('all-stories.json');
  await expect(page.getByRole('status')).toContainText(russianText('samples.zeroStoriesText'));
  expect(
    databaseSchema.parse(JSON.parse(await readFile(path.join(targetDir, 'library.json'), 'utf8'))),
  ).toEqual(stored);
  await page.getByRole('status').getByRole('button').click();
  // Reject a broken endpoint before writing and leave the local library intact.
  const broken = structuredClone(stories);
    broken.data.clubs[0].connections[0].targetId = 'missing-character';
  await writeFile(path.join(outputDir, 'broken-transfer.json'), JSON.stringify(broken));
  await importFrom('broken-transfer.json');
  await expect(page.getByRole('status')).toContainText(russianText('samples.invalidExportText'));
  expect(
    databaseSchema.parse(JSON.parse(await readFile(path.join(targetDir, 'library.json'), 'utf8'))),
  ).toEqual(stored);
  await page.getByRole('status').getByRole('button').click();
  // Canceling the confirmation must not add even a valid new relation type.
  await importFrom('relation-types.json', 0);
  await expect(
    page.getByRole('button', { name: russianText('transfer.import'), exact: true }),
  ).toBeEnabled();
  expect(
    databaseSchema.parse(JSON.parse(await readFile(path.join(targetDir, 'library.json'), 'utf8'))),
  ).toEqual(stored);
  await app.close();
  await launch(targetDir);
  await page
      .locator('.club-list-item')
      .filter({hasText: russianText('demo.club.name')})
    .click();
  await expect(page.getByTestId('diagram').locator('.diagram-node')).toHaveCount(6);
  await expect(page.getByTestId('diagram').locator('.diagram-edge')).toHaveCount(7);
  expect(errors).toEqual([]);
});

test('real desktop: create, reuse, edit, export, remove from club and reopen local library', async () => {
  await rm(dataDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await launch();
  const rendererErrors: string[] = [];
  page.on('pageerror', (error) => rendererErrors.push(error.message));
    await page.getByRole('button', {name: russianText('clubs.createFirst')}).click();
  await page
    .getByRole('dialog')
      .getByLabel(russianText('clubs.nameLabel'))
    .fill(russianText('samples.firstStory'));
  await page
    .getByRole('dialog')
    .getByLabel(russianText('forms.descriptionLabel'))
    .fill(russianText('samples.desktopDescription'));
  await page
    .getByRole('dialog')
      .getByRole('button', {name: russianText('clubs.create'), exact: true})
    .click();
  await createCharacter(russianText('samples.alice'));
  await createCharacter(russianText('samples.boris'), true);
  await expect(
    page.getByTestId('diagram').getByRole('button', {
      name: russianText('diagram.characterLabel', russianText('samples.alice')),
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: russianText('relationships.create'), exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('relationships.nameLabel'))
    .fill(russianText('demo.relationships.fear'));
  await page.getByRole('dialog').getByLabel(russianText('colors.custom')).fill('#b78041');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('relationships.create'), exact: true })
    .click();
  await page.getByRole('button', { name: russianText('connections.add'), exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('connections.sourceLabel'))
    .selectOption({ label: russianText('samples.alice') });
  await page
    .getByRole('dialog')
    .getByLabel(russianText('connections.targetLabel'))
    .selectOption({ label: russianText('samples.boris') });
  await page.getByRole('dialog').getByLabel(russianText('connections.directionLabel')).check();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('connections.notesLabel'))
    .fill(russianText('samples.connectionNotes'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('connections.add'), exact: true })
    .click();
  await saved();
  await expect(page.getByTestId('diagram').locator('marker')).toHaveCount(1);
  await expect(page.locator('.edge-detail')).toContainText(russianText('demo.relationships.fear'));
  await expect(page.locator('.edge-detail')).toContainText(russianText('samples.connectionNotes'));
    // Reuse the same local characters in a second club.
    await page.getByRole('button', {name: russianText('clubs.new'), exact: true}).click();
  await page
    .getByRole('dialog')
      .getByLabel(russianText('clubs.nameLabel'))
    .fill(russianText('samples.secondStory'));
  await page
    .getByRole('dialog')
      .getByRole('button', {name: russianText('clubs.create'), exact: true})
    .click();
  await page.getByRole('button', { name: russianText('characters.add'), exact: true }).click();
  await page
    .getByRole('dialog')
    .locator('.picker-row')
    .filter({ hasText: russianText('samples.alice') })
    .getByRole('checkbox')
    .check();
  await page
    .getByRole('dialog')
    .locator('.picker-row')
    .filter({ hasText: russianText('samples.boris') })
    .getByRole('checkbox')
    .check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('members.applySelection', '2') })
    .click();
  await page
    .getByRole('button', { name: russianText('navigation.characters'), exact: true })
    .click();
  const alice = page.getByRole('article').filter({ hasText: russianText('samples.alice') });
  await alice
    .getByRole('button', {
      name: russianText('characters.editLabel', russianText('samples.alice')),
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('characters.nameLabel'))
    .fill(russianText('samples.aliceWest'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.saveChanges') })
    .click();
  await page
      .locator('.club-list-item')
    .filter({ hasText: russianText('samples.firstStory') })
    .click();
  await expect(
    page.getByTestId('diagram').getByRole('button', {
      name: russianText('diagram.characterLabel', russianText('samples.aliceWest')),
      exact: true,
    }),
  ).toBeVisible();
  // Native save dialogs are stubbed; the real IPC and filesystem writes run.
  await app.evaluate(
    ({ dialog }, exportPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
    },
      path.join(outputDir, 'club.svg'),
  );
  await page.getByRole('button', { name: russianText('actions.export'), exact: false }).click();
  await page.getByRole('button', { name: russianText('export.svg'), exact: false }).click();
  await expect(page.getByRole('status')).toContainText(
    russianText('notifications.diagramSaved', 'SVG'),
  );
    const svg = await readFile(path.join(outputDir, 'club.svg'), 'utf8');
  expect(svg).toContain(russianText('samples.aliceWest'));
  expect(svg).toContain('data:image/webp;base64');
  expect(svg).not.toContain('<script');
  await app.evaluate(
    ({ dialog }, exportPath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportPath });
    },
      path.join(outputDir, 'club.png'),
  );
  await page.getByRole('button', { name: russianText('actions.export'), exact: false }).click();
  await page.getByRole('button', { name: russianText('export.png'), exact: false }).click();
  await expect(page.getByRole('status')).toContainText(
    russianText('notifications.diagramSaved', 'PNG'),
  );
    const png = await readFile(path.join(outputDir, 'club.png'));
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(1840);
  await page
    .getByTestId('diagram')
    .getByRole('button', {
      name: russianText('diagram.characterLabel', russianText('samples.boris')),
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: russianText('members.remove') }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.delete'), exact: true })
    .click();
  await saved();
  expect(rendererErrors).toEqual([]);
  await app.close();
  await launch();
  const library = JSON.parse(await readFile(path.join(dataDir, 'library.json'), 'utf8'));
  expect(library.characters).toHaveLength(2);
    expect(library.clubs).toHaveLength(2);
    expect(library.clubs[0].characterIds).toHaveLength(1);
    expect(library.clubs[0].connections).toHaveLength(0);
    expect(library.clubs[1].characterIds).toHaveLength(2);
  expect(library.characters[1].image).toMatch(/^data:image\/webp;base64,/);
  await page
      .locator('.club-list-item')
    .filter({ hasText: russianText('samples.secondStory') })
    .click();
  await expect(
    page.getByTestId('diagram').getByRole('button', {
      name: russianText('diagram.characterLabel', russianText('samples.aliceWest')),
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByTestId('diagram').getByRole('button', {
      name: russianText('diagram.characterLabel', russianText('samples.boris')),
      exact: true,
    }),
  ).toBeVisible();
});

test('alphabetical lists preserve saved club order and geometry while manual ring reordering still works', async () => {
  const directory = path.join(root, '.test-data', 'alphabetical');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const original = demoDatabase();
    original.clubs.push({
    id: 'alpha',
    name: russianText('samples.alpha'),
    description: '',
    characterIds: [],
    connections: [],
  });
  const libraryFile = path.join(directory, 'library.json');
  await writeFile(libraryFile, JSON.stringify(original));
  await launch(directory);
  const names = [
    russianText('demo.august.name'),
    russianText('demo.ida.name'),
    russianText('demo.mira.name'),
    russianText('demo.nora.name'),
    russianText('demo.theo.name'),
    russianText('demo.elias.name'),
  ];
  const types = [
    russianText('demo.relationships.trust'),
    russianText('demo.relationships.love'),
    russianText('demo.relationships.family'),
    russianText('demo.relationships.fear'),
  ];
  const geometry = () =>
    page
      .getByTestId('diagram')
      .locator('.diagram-node')
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          name: node.getAttribute('aria-label'),
          position: node.getAttribute('transform'),
        })),
      );
  const initialGeometry = await geometry();
  expect(initialGeometry.map((node) => node.name)).toEqual(
      original.clubs[0].characterIds.map((id) =>
      russianText(
        'diagram.characterLabel',
        original.characters.find((character) => character.id === id)!.name,
      ),
    ),
  );
    await expect(page.locator('.club-list-item strong')).toHaveText([
        russianText('demo.club.name'),
    russianText('samples.alpha'),
  ]);
  await expect(page.locator('.member-main strong')).toHaveText(names);
  await expect(page.locator('.legend-name span')).toHaveText(types);
  // Boundary controls follow actual ring positions, even in the alphabetical list.
  await expect(
    page.getByRole('button', {
      name: russianText('members.moveUpLabel', russianText('demo.nora.name')),
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: russianText('members.moveDownLabel', russianText('demo.august.name')),
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', {
      name: russianText('members.moveUpLabel', russianText('demo.august.name')),
      exact: true,
    }),
  ).toBeEnabled();
  await page.getByRole('button', { name: russianText('members.add'), exact: true }).click();
  await expect(page.getByRole('dialog').locator('.picker-row strong')).toHaveText(names);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('members.applySelection', '6'), exact: true })
    .click();
  await saved();
  expect(await geometry()).toEqual(initialGeometry);
  await page.getByRole('button', { name: russianText('connections.add'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByLabel(russianText('connections.sourceLabel')).locator('option'),
  ).toHaveText(names);
  await expect(
    dialog.getByLabel(russianText('connections.targetLabel')).locator('option'),
  ).toHaveText(names);
  await expect(dialog.getByLabel(russianText('relationships.label')).locator('option')).toHaveText(
    types,
  );
  await dialog.getByRole('button', { name: russianText('actions.cancel'), exact: true }).click();
  await page
    .getByRole('button', { name: new RegExp('^' + russianText('inspector.connections'), '') })
    .click();
  await expect(page.locator('.connection-row strong')).toHaveText([
    russianText('demo.relationships.trust'),
    russianText('demo.relationships.trust'),
    russianText('demo.relationships.love'),
    russianText('demo.relationships.family'),
    russianText('demo.relationships.family'),
    russianText('demo.relationships.fear'),
    russianText('demo.relationships.fear'),
  ]);
  await page
    .getByTestId('diagram')
    .getByRole('button', {
      name: russianText('diagram.characterLabel', russianText('demo.nora.name')),
      exact: true,
    })
    .click();
  await expect(page.locator('.connection-row strong')).toHaveText([
    russianText('demo.relationships.trust'),
    russianText('demo.relationships.love'),
    russianText('demo.relationships.family'),
    russianText('demo.relationships.family'),
  ]);
  await page.keyboard.press('Escape');
  await page
    .getByRole('button', { name: russianText('navigation.characters'), exact: true })
    .click();
  await expect(page.locator('.character-card h2')).toHaveText(names);
  await page
    .getByRole('button', { name: russianText('navigation.relationships'), exact: true })
    .click();
  await expect(page.locator('.type-card h2')).toHaveText(types);
  await page
      .locator('.club-list-item')
      .filter({hasText: russianText('demo.club.name')})
    .click();
  expect(await geometry()).toEqual(initialGeometry);
  await saved();
  expect(databaseSchema.parse(JSON.parse(await readFile(libraryFile, 'utf8')))).toEqual(original);
  // A manual move swaps neighbours in the stored ring, not in the sorted list.
  await page
    .getByRole('button', { name: new RegExp('^' + russianText('inspector.members'), '') })
    .click();
  await page
    .getByRole('button', {
      name: russianText('members.moveUpLabel', russianText('demo.august.name')),
      exact: true,
    })
    .click();
  await saved();
  const reordered = ['nora', 'elias', 'mira', 'theo', 'august', 'ida'];
  await expect
    .poll(async () => {
      const stored = databaseSchema.parse(JSON.parse(await readFile(libraryFile, 'utf8')));
        return stored.clubs[0].characterIds;
    })
    .toEqual(reordered);
  await expect(page.locator('.member-main strong')).toHaveText(names);
  await app.close();
  await launch(directory);
  expect((await geometry()).map((node) => node.name)).toEqual(
    reordered.map((id) =>
      russianText(
        'diagram.characterLabel',
        original.characters.find((character) => character.id === id)!.name,
      ),
    ),
  );
    await expect(page.locator('.club-list-item strong')).toHaveText([
        russianText('demo.club.name'),
    russianText('samples.alpha'),
  ]);
  await expect(page.locator('.member-main strong')).toHaveText(names);
});

test('inspector: each list keeps its own position after switching tabs and editing a connection', async () => {
  const directory = path.join(root, '.test-data', 'inspector-scroll');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const original = emptyDatabase();
  original.characters = Array.from({ length: 48 }, (_, index) => ({
    id: `character-${index}`,
    name: russianText('samples.numberedCharacter', String(index + 1).padStart(2, '0')),
    color: '#80c7b7',
    notes: '',
    folderId: null,
  }));
  original.relationTypes = demoDatabase().relationTypes;
    const club = {
    id: 'large',
        name: russianText('samples.largeClub'),
    description: '',
    characterIds: original.characters.map((character) => character.id).reverse(),
        connections: [] as (typeof original.clubs)[number]['connections'],
  };
    for (let source = 0; source < 48 && club.connections.length < 120; source++) {
        for (let target = source + 1; target < 48 && club.connections.length < 120; target++) {
            club.connections.push({
        id: `edge-${source}-${target}`,
        sourceId: `character-${source}`,
        targetId: `character-${target}`,
        typeId: 'trust',
        directed: false,
        notes: '',
      });
    }
  }
    original.clubs = [club];
    original.activeClubId = club.id;
  const libraryFile = path.join(directory, 'library.json');
  await writeFile(libraryFile, JSON.stringify(original));
  await launch(directory);
  const tabs = page.locator('.inspector-tabs');
  const content = page.locator('.inspector-content');
  const tabsY = (await tabs.boundingBox())!.y;
  await content.evaluate((element) => {
    element.scrollTop = 400;
  });
  const memberScroll = await content.evaluate((element) => element.scrollTop);
  expect(memberScroll).toBeGreaterThan(0);
  await page
    .getByRole('button', { name: new RegExp('^' + russianText('inspector.connections'), '') })
    .click();
  await content.evaluate((element) => {
    element.scrollTop = 700;
  });
  const scrollBefore = await content.evaluate((element) => element.scrollTop);
  expect(scrollBefore).toBeGreaterThan(0);
  await page.getByRole('button', { name: russianText('connections.add'), exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.cancel'), exact: true })
    .click();
  expect(await content.evaluate((element) => element.scrollTop)).toBe(scrollBefore);
  await page
    .getByRole('button', { name: new RegExp('^' + russianText('inspector.members'), '') })
    .click();
  await mkdir(outputDir, { recursive: true });
  await page
    .locator('.inspector')
    .screenshot({ path: path.join(outputDir, 'desktop-inspector-scroll.png') });
  expect(await content.evaluate((element) => element.scrollTop)).toBe(memberScroll);
  expect((await tabs.boundingBox())!.y).toBe(tabsY);
  expect(await page.locator('.inspector').evaluate((element) => element.scrollTop)).toBe(0);
  // Opening and saving a connection must also return to an undisturbed member list.
  await page.getByRole('button', { name: russianText('connections.add'), exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(russianText('connections.sourceLabel')).selectOption('character-46');
  await dialog.getByLabel(russianText('connections.targetLabel')).selectOption('character-47');
  await dialog
    .getByRole('combobox', { name: new RegExp('^' + russianText('relationships.label'), '') })
    .selectOption('family');
  await dialog.getByRole('button', { name: russianText('connections.add'), exact: true }).click();
  await saved();
  await page
    .getByRole('button', { name: russianText('actions.clearSelection'), exact: true })
    .click();
  expect(await content.evaluate((element) => element.scrollTop)).toBe(memberScroll);
  expect((await tabs.boundingBox())!.y).toBe(tabsY);
  await page
    .getByRole('button', { name: new RegExp('^' + russianText('inspector.connections'), '') })
    .click();
  expect(await content.evaluate((element) => element.scrollTop)).toBe(scrollBefore);
  await page
    .getByRole('button', { name: new RegExp('^' + russianText('inspector.members'), '') })
    .click();
  expect(await content.evaluate((element) => element.scrollTop)).toBe(memberScroll);
  const stored = databaseSchema.parse(JSON.parse(await readFile(libraryFile, 'utf8')));
    expect(stored.clubs[0].characterIds).toEqual(club.characterIds);
    expect(stored.clubs[0].connections).toHaveLength(121);
});

test('example diagram renders without network requests or errors', async () => {
  const directory = path.join(root, '.test-data', 'example');
  await rm(directory, { recursive: true, force: true });
  await launch(directory);
  const remoteRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) remoteRequests.push(request.url());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.getByRole('button', { name: russianText('demo.explore') }).click();
  await saved();
  await expect(page.getByTestId('diagram').locator('.diagram-node')).toHaveCount(6);
  await expect(page.getByTestId('diagram').locator('.diagram-edge')).toHaveCount(7);
    const viewport = page.locator('.diagram-viewport');
    const transform = page.locator('.diagram-transform');
    const center = page.getByRole('button', {name: russianText('diagram.center'), exact: true});
    await viewport.hover({position: {x: 100, y: 180}});
    await page.mouse.wheel(0, 120);
    await expect(transform).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -120)');
    await page.mouse.wheel(80, 0);
    await expect(transform).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -80, -120)');
    await page.keyboard.down('Shift');
    await page.mouse.wheel(0, 60);
    await page.keyboard.up('Shift');
    await expect(transform).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -140, -120)');
    await expect(page.locator('.zoom-controls > span')).toHaveText('100%');
    await center.click();
    await expect(transform).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

    await viewport.hover({position: {x: 100, y: 180}});
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await expect(page.locator('.zoom-controls > span')).toHaveText('127%');
    await page.mouse.wheel(0, -10000);
    await expect(page.locator('.zoom-controls > span')).toHaveText('250%');
    await expect(
        page.getByRole('button', {name: russianText('diagram.zoomIn'), exact: true}),
    ).toBeDisabled();
    await page.mouse.wheel(0, 10000);
    await expect(page.locator('.zoom-controls > span')).toHaveText('50%');
    await expect(
        page.getByRole('button', {name: russianText('diagram.zoomOut'), exact: true}),
    ).toBeDisabled();
    await page.keyboard.up('Control');
    expect(
        await app.evaluate(({BrowserWindow}) =>
            BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
        ),
    ).toBe(1);
    await center.click();
    await expect(transform).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

    await page.locator('.inspector').hover();
    await page.mouse.wheel(0, 120);
    await expect(transform).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await page.getByRole('button', {name: russianText('navigation.characters'), exact: true}).click();
    await page.locator('.rail-button').filter({hasText: russianText('navigation.clubs')}).click();
    await viewport.hover({position: {x: 100, y: 180}});
    await page.mouse.wheel(0, 60);
    await expect(transform).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, -60)');
    const viewportBounds = (await viewport.boundingBox())!;
    await page.mouse.move(viewportBounds.x + 100, viewportBounds.y + 180);
    await page.mouse.down();
    await page.mouse.move(viewportBounds.x + 170, viewportBounds.y + 220);
    await page.mouse.up();
    await expect(transform).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 70, -20)');
    await center.click();
    await expect(transform).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await page
    .getByRole('button', {
      name: russianText(
        'relationships.toggleVisibilityLabel',
        russianText('actions.hide'),
        russianText('demo.relationships.fear'),
      ),
      exact: true,
    })
    .click();
  await expect(page.getByTestId('diagram').locator('.diagram-edge')).toHaveCount(5);
  await page
    .getByRole('button', {
      name: russianText(
        'relationships.toggleVisibilityLabel',
        russianText('actions.show'),
        russianText('demo.relationships.fear'),
      ),
      exact: true,
    })
    .click();
  await page.getByRole('button', { name: russianText('diagram.labels'), exact: true }).click();
  await page.waitForTimeout(250);
  await mkdir(outputDir, { recursive: true });
  await page.screenshot({ path: path.join(outputDir, 'desktop-example.png') });
  expect(remoteRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('folders: migrate old data, move members, filter picker, persist and round-trip backup', async () => {
  const directory = path.join(root, '.test-data', 'folders');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const original = demoDatabase();
    const {folders: _folders, clubs, activeClubId, ...rest} = original;
  const legacy = {
    ...rest,
    version: 1,
      circles: clubs,
      activeCircleId: activeClubId,
    characters: original.characters.map(({ folderId: _folderId, ...character }) => character),
  };
  await writeFile(path.join(directory, 'library.json'), JSON.stringify(legacy));
  await launch(directory);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page
    .getByRole('button', { name: russianText('navigation.characters'), exact: true })
    .click();
  await expect(page.getByRole('article')).toHaveCount(6);
  await page
    .getByRole('button', { name: russianText('folders.createCharacterFolder'), exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('folders.nameLabel'))
    .fill(russianText('samples.westFamily'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('folders.create'), exact: true })
    .click();
  await saved();
  await expect(
    page.getByRole('heading', { name: russianText('folders.emptyHeading') }),
  ).toBeVisible();
  await page
    .locator('.folder-panel')
    .getByRole('button', { name: new RegExp('^' + russianText('characters.all'), '') })
    .click();
  await moveCharacter(russianText('demo.nora.name'), russianText('samples.westFamily'));
  await page
    .getByRole('article')
    .filter({ hasText: russianText('demo.mira.name') })
    .getByRole('button', {
      name: russianText('characters.editLabel', russianText('demo.mira.name')),
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('characters.folderLabel'), { exact: true })
    .selectOption({ label: russianText('samples.westFamily') });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.saveChanges') })
    .click();
  await page
    .locator('.folder-panel')
    .getByRole('button', { name: new RegExp('^' + russianText('samples.westFamily'), '') })
    .click();
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByRole('button', { name: russianText('characters.new'), exact: true }).click();
  const chosenFolder = page
    .getByRole('dialog')
    .getByLabel(russianText('characters.folderLabel'), { exact: true });
  await expect(chosenFolder.locator('option:checked')).toHaveText(
    russianText('samples.westFamily'),
  );
  await page
    .getByRole('dialog')
    .getByLabel(russianText('characters.nameLabel'))
    .fill(russianText('samples.victorWest'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('characters.create'), exact: true })
    .click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await page
    .getByRole('button', {
      name: russianText('folders.renameLabel', russianText('samples.westFamily')),
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('folders.nameLabel'))
    .fill(russianText('demo.relationships.family'));
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.saveChanges') })
    .click();
  await expect(page.locator('.folder-group-heading h2')).toHaveText(
    russianText('demo.relationships.family'),
  );
  await page
    .getByLabel(russianText('characters.searchLabel'))
    .fill(russianText('samples.victorFirstName'));
  await expect(page.getByRole('article')).toHaveCount(1);
  await page.getByLabel(russianText('characters.searchLabel')).fill('');
  await moveCharacter(russianText('samples.victorWest'));
  await expect(page.getByRole('article')).toHaveCount(2);
  await saved();
  await mkdir(outputDir, { recursive: true });
  await page.screenshot({ path: path.join(outputDir, 'desktop-folders.png') });
  // Folder filtering does not drop previously selected members from other folders.
  await page
      .locator('.club-list-item')
      .filter({hasText: russianText('demo.club.name')})
    .click();
  await page.getByRole('button', { name: russianText('members.add'), exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('members.folderLabel'))
    .selectOption({ label: russianText('demo.relationships.family') });
  await expect(page.getByRole('dialog').locator('.picker-row')).toHaveCount(2);
  await page
    .getByRole('dialog')
    .getByLabel(russianText('members.folderLabel'))
    .selectOption(':unfiled');
  await page
    .getByRole('dialog')
    .locator('.picker-row')
    .filter({ hasText: russianText('samples.victorWest') })
    .getByRole('checkbox')
    .check();
  await page
    .getByRole('dialog')
    .getByLabel(russianText('members.folderLabel'))
    .selectOption({ label: russianText('demo.relationships.family') });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('members.applySelection', '7') })
    .click();
  await saved();
  await app.close();
  await launch(directory);
  let stored = JSON.parse(await readFile(path.join(directory, 'library.json'), 'utf8'));
    expect(stored.version).toBe(4);
  expect(stored.folders).toHaveLength(1);
  expect(stored.folders[0].name).toBe(russianText('demo.relationships.family'));
  expect(
    stored.characters.filter(
      (character: { folderId: string | null }) => character.folderId === stored.folders[0].id,
    ),
  ).toHaveLength(2);
    expect(stored.clubs[0].characterIds).toHaveLength(7);
    expect(stored.clubs[0].connections).toEqual(original.clubs[0].connections);
  const backupFile = path.join(outputDir, 'folder-library.json');
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, backupFile);
  await page.getByRole('button', { name: russianText('navigation.settings'), exact: true }).click();
  await page.getByRole('button', { name: russianText('backup.save'), exact: true }).click();
  await expect(page.getByRole('status')).toContainText(russianText('notifications.backupSaved'));
  const backup = JSON.parse(await readFile(backupFile, 'utf8'));
  expect(backup.folders).toEqual(stored.folders);
  expect(backup.characters).toEqual(stored.characters);
  await page
    .getByRole('button', { name: russianText('navigation.characters'), exact: true })
    .click();
  await page
    .getByRole('button', {
      name: russianText('folders.deleteLabel', russianText('demo.relationships.family')),
      exact: true,
    })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: russianText('actions.delete'), exact: true })
    .click();
  await saved();
  stored = JSON.parse(await readFile(path.join(directory, 'library.json'), 'utf8'));
  expect(stored.folders).toHaveLength(0);
  expect(stored.characters).toHaveLength(7);
  expect(
    stored.characters.every(
      (character: { folderId: string | null }) => character.folderId === null,
    ),
  ).toBe(true);
    expect(stored.clubs).toEqual(backup.clubs);
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, backupFile);
  await page.getByRole('button', { name: russianText('navigation.settings'), exact: true }).click();
  await page.getByRole('button', { name: russianText('actions.import'), exact: true }).click();
  await expect(page.getByRole('status')).toContainText(
    russianText('notifications.libraryImported'),
  );
  stored = JSON.parse(await readFile(path.join(directory, 'library.json'), 'utf8'));
  expect(stored).toEqual(backup);
  expect(errors).toEqual([]);
});
