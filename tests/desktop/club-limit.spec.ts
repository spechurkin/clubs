import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { emptyDatabase } from '../../shared/model';

test('creation and duplication stop at 100 clubs, editing works, deletion frees a slot', async () => {
  const root = process.cwd();
  await mkdir(path.join(root, '.test-data'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.test-data', 'club-limit-'));
  const data = emptyDatabase();
  data.clubs = Array.from({ length: 99 }, (_, index) => ({
    id: `club-${index}`,
    name: `Club ${index}`,
    description: '',
    characterIds: [],
    connections: [],
  }));
  data.activeClubId = data.clubs[0].id;
  const file = path.join(directory, 'library.json');
  await writeFile(file, JSON.stringify(data));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && key !== 'ELECTRON_RUN_AS_NODE',
    ),
  ) as Record<string, string>;
  env.CLUB_DATA_DIR = directory;
  const app = await electron.launch({ args: [root], env });
  try {
    const page = await app.firstWindow();
    const saved = () => expect(page.locator('.save-status')).toHaveText('All changes saved');
    const newClub = page.getByRole('button', { name: 'New club', exact: true });
    const actions = page.getByRole('button', { name: 'Club actions', exact: true });
    await saved();
    await newClub.click();
    await page.getByRole('dialog').getByLabel('Club name').fill('Last club');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Create club', exact: true })
      .click();
    await saved();
    await expect(page.locator('.club-list-item')).toHaveCount(100);
    await expect(newClub).toBeDisabled();
    await expect(newClub).toHaveAttribute(
      'title',
      'The library can contain no more than 100 clubs',
    );
    await actions.click();
    await expect(page.getByRole('button', { name: 'Duplicate', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Edit club', exact: true }).click();
    await page.getByRole('dialog').getByLabel('Club name').fill('Renamed club');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Save changes', exact: true })
      .click();
    await saved();
    expect(JSON.parse(await readFile(file, 'utf8')).clubs).toHaveLength(100);
    await actions.click();
    await page.getByRole('button', { name: 'Delete club', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await saved();
    await expect(newClub).toBeEnabled();
    await actions.click();
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    await saved();
    await expect(page.locator('.club-list-item')).toHaveCount(100);
    await expect(newClub).toBeDisabled();
    expect(JSON.parse(await readFile(file, 'utf8')).clubs).toHaveLength(100);
  } finally {
    await app.close();
  }
});
