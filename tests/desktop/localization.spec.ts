import { russianText } from '../russian-fixtures';
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import packageMetadata from '../../package.json' with { type: 'json' };

const root = process.cwd();
let app: ElectronApplication;
let page: Page;

async function launch(directory: string) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && key !== 'ELECTRON_RUN_AS_NODE',
    ),
  ) as Record<string, string>;
  env.CIRCLE_DATA_DIR = directory;
  app = await electron.launch({
    executablePath: process.env.CIRCLE_TEST_EXECUTABLE,
    args: process.env.CIRCLE_TEST_EXECUTABLE ? [] : [root],
    env,
  });
  page = await app.firstWindow();
}

test.afterEach(async () => {
  await app?.close();
});

test('English default, live language switching, native dialog text and shared library survive restarts', async () => {
  await mkdir(path.join(root, '.test-data'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.test-data', 'localization-'));
  await launch(directory);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('.save-status')).toHaveText('All changes saved');
  await expect(page).toHaveTitle('Clubs');
  expect(await page.locator('html').getAttribute('lang')).toBe('en');
  expect(await page.locator('body').innerText()).not.toMatch(/\p{Script=Cyrillic}/u);
  expect(
    await app.evaluate(({ app }) => ({ name: app.getName(), version: app.getVersion() })),
  ).toEqual({ name: 'Clubs', version: packageMetadata.version });

  await page.getByRole('button', { name: 'Explore an example', exact: true }).click();
  await expect(page.locator('.save-status')).toHaveText('All changes saved');
  await expect(page.getByTestId('diagram').locator('.diagram-node')).toHaveCount(6);
  await expect(page.locator('.circle-list-item')).toContainText('House by the Lake');
  await expect(
    page.getByRole('button', { name: 'Character: Nora West', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Hide relationship Fear', exact: true }).click();
  await expect(page.getByTestId('diagram').locator('.diagram-edge')).toHaveCount(5);
  await page.getByRole('button', { name: 'Show relationship Fear', exact: true }).click();
  await page.getByRole('button', { name: 'Characters', exact: true }).click();
  await page.getByRole('button', { name: 'Edit character Nora West', exact: true }).click();
  const form = page.getByRole('dialog');
  await expect(form.getByLabel('Character name')).toHaveValue('Nora West');
  await expect(form.getByLabel('Upload portrait', { exact: true })).toBeVisible();
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  const original = JSON.parse(await readFile(path.join(directory, 'library.json'), 'utf8'));

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Interface language', { exact: true })).toHaveValue('en');
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialog = async (...args: unknown[]) => {
      Object.assign(globalThis, { capturedSaveDialog: args.at(-1) });
      return { canceled: true, filePath: '' };
    };
  });
  await page.getByRole('button', { name: 'Save backup', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save backup', exact: true })).toBeEnabled();
  const englishDialog = await app.evaluate(
    () => (globalThis as typeof globalThis & { capturedSaveDialog: unknown }).capturedSaveDialog,
  );
  expect(englishDialog).toMatchObject({
    title: 'Library backup',
    defaultPath: 'Clubs — library.json',
  });
  await page.getByLabel('Interface language', { exact: true }).selectOption('ru');
  await expect(page.getByLabel(russianText('settings.language'), { exact: true })).toBeEnabled();
  await expect(page).toHaveTitle(russianText('app.name'));
  await expect(page.locator('.save-status')).toHaveText(russianText('save.saved'));
  expect(await app.evaluate(({ app }) => app.getName())).toBe(russianText('app.name'));
  expect(JSON.parse(await readFile(path.join(directory, 'library.json'), 'utf8'))).toEqual(
    original,
  );
  await page.getByRole('button', { name: russianText('backup.save'), exact: true }).click();
  await expect(
    page.getByRole('button', { name: russianText('backup.save'), exact: true }),
  ).toBeEnabled();
  expect(
    await app.evaluate(
      () => (globalThis as typeof globalThis & { capturedSaveDialog: unknown }).capturedSaveDialog,
    ),
  ).toMatchObject({
    title: russianText('backup.dialogTitle'),
    defaultPath: russianText('filenames.libraryBackup'),
  });

  await app.close();
  await launch(directory);
  await expect(page.locator('.save-status')).toHaveText(russianText('save.saved'));
  await expect(page).toHaveTitle(russianText('app.name'));
  await page.getByRole('button', { name: russianText('navigation.settings'), exact: true }).click();
  await expect(page.getByLabel(russianText('settings.language'), { exact: true })).toHaveValue(
    'ru',
  );
  await page.getByLabel(russianText('settings.language'), { exact: true }).selectOption('en');
  await expect(page.getByLabel('Interface language', { exact: true })).toBeEnabled();
  await expect(page).toHaveTitle('Clubs');
  await expect(page.locator('.save-status')).toHaveText('All changes saved');
  expect(JSON.parse(await readFile(path.join(directory, 'library.json'), 'utf8'))).toEqual(
    original,
  );
  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results', 'clubs-english-settings.png') });
  await page.getByRole('button', { name: 'Circles', exact: true }).click();
  await page.screenshot({ path: path.join(root, 'test-results', 'clubs-english-circle.png') });
  expect(errors).toEqual([]);

  await app.close();
  await launch(directory);
  await expect(page.locator('.save-status')).toHaveText('All changes saved');
  await expect(page).toHaveTitle('Clubs');
  await expect(page.getByTestId('diagram').locator('.diagram-node')).toHaveCount(6);
});
