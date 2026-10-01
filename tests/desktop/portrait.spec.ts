import {russianText} from '../russian-fixtures';
import {_electron as electron, type ElectronApplication, expect, type Page, test,} from '@playwright/test';
import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {demoDatabase} from '../../src/demo';
import {type Character, databaseSchema} from '../../shared/model';
import {setLocale} from '../../shared/i18n';

setLocale('ru');

const root = process.cwd();
let app: ElectronApplication;
let page: Page;

async function launch(directory: string) {
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'preferences.json'), JSON.stringify({ language: 'ru' }));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key, value]) => value !== undefined && key !== 'ELECTRON_RUN_AS_NODE',
    ),
  ) as Record<string, string>;
    env.CLUB_DATA_DIR = directory;
  app = await electron.launch({
      executablePath: process.env.CLUB_TEST_EXECUTABLE,
      args: process.env.CLUB_TEST_EXECUTABLE ? [] : [root],
    env,
  });
  page = await app.firstWindow();
  await expect(page.locator('.save-status')).toHaveText(russianText('save.saved'));
}

async function sourceImage() {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 600;
    const context = canvas.getContext('2d')!;
    for (const [index, color] of ['#ef4444', '#22c55e', '#3b82f6'].entries()) {
      context.fillStyle = color;
      context.fillRect(index * 400, 0, 400, 600);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  });
}

async function centerPixel() {
  return page
    .locator('.portrait-crop-viewport canvas')
    .evaluate((canvas: HTMLCanvasElement) =>
      Array.from(canvas.getContext('2d')!.getImageData(256, 256, 1, 1).data),
    );
}

test.afterEach(async () => {
  await app?.close();
});

test('portrait editor: crop, rotate, flip, cancel, persist source, reopen and transfer', async () => {
  await mkdir(path.join(root, '.test-data'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.test-data', 'portrait-editor-'));
  const libraryFile = path.join(directory, 'library.json');
  const initial = demoDatabase();
  await writeFile(libraryFile, JSON.stringify(initial));
  await launch(directory);
  const errors: string[] = [];
  const watchErrors = () => page.on('pageerror', (error) => errors.push(error.message));
  watchErrors();
  await page
    .getByRole('button', { name: russianText('navigation.characters'), exact: true })
    .click();
  const openCharacter = async () => {
    await page
      .getByRole('button', {
        name: russianText('characters.editLabel', russianText('demo.nora.name')),
        exact: true,
      })
      .click();
  };
  await openCharacter();
  let dialog = page.getByRole('dialog');
  await dialog
    .getByLabel(russianText('forms.notesLabel'), { exact: false })
    .fill(russianText('samples.portraitNotes'));
  const source = Buffer.from(await sourceImage(), 'base64');
  const upload = async () =>
    dialog
      .getByLabel(russianText('portrait.upload'), { exact: true })
      .setInputFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: source });
  const apply = () =>
    dialog.getByRole('button', { name: russianText('portrait.apply'), exact: true });
  const zoom = () =>
    dialog.getByRole('slider', { name: russianText('portrait.zoomControlLabel'), exact: true });
  const save = async () => {
    await dialog
      .getByRole('button', { name: russianText('actions.saveChanges'), exact: true })
      .click();
    await expect(page.locator('.save-status')).toHaveText(russianText('save.saved'));
  };
  await upload();
  await expect(apply()).toBeEnabled();
  await expect.poll(async () => (await centerPixel())[1]).toBeGreaterThan(190);
  const frame = dialog.getByRole('img', { name: russianText('portrait.cropLabel'), exact: true });
  const box = (await frame.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 1.2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const cropped = await centerPixel();
  expect(cropped[0]).toBeGreaterThan(230);
  expect(cropped[1]).toBeLessThan(80);
  await dialog
    .getByRole('button', { name: russianText('portrait.rotateRight'), exact: true })
    .click();
  await dialog.getByRole('button', { name: russianText('portrait.flip'), exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: russianText('portrait.flip'), exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  // Rotating and reflecting preserve the selected subject.
  expect((await centerPixel())[0]).toBeGreaterThan(230);
  await zoom().fill('2');
  expect((await centerPixel())[0]).toBeGreaterThan(230);
  await frame.focus();
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowUp');
  await page.setViewportSize({ width: 1080, height: 720 });
  await expect(apply()).toBeInViewport({ ratio: 1 });
  const preview = await frame.evaluate((canvas: HTMLCanvasElement) =>
    canvas.toDataURL('image/png'),
  );
  await mkdir(path.join(root, 'test-results'), { recursive: true });
  await page.screenshot({ path: path.join(root, 'test-results', 'portrait-editor.png') });
  await apply().click();
  await expect(dialog.getByLabel(russianText('forms.notesLabel'), { exact: false })).toHaveValue(
    russianText('samples.portraitNotes'),
  );
  const croppedImage = await dialog.locator('.portrait-editor img').getAttribute('src');
  const difference = await page.evaluate(
    async ({ source, preview }) => {
      const load = (src: string) =>
        new Promise<HTMLImageElement>((resolve) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.src = src;
        });
      const [saved, original] = await Promise.all([load(source), load(preview)]);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const context = canvas.getContext('2d')!;
      const sample = (image: HTMLImageElement) => {
        context.drawImage(image, 0, 0);
        return Array.from(context.getImageData(256, 256, 1, 1).data);
      };
      const a = sample(saved),
        b = sample(original);
      return {
        width: saved.naturalWidth,
        height: saved.naturalHeight,
        delta: Math.max(...a.map((value, index) => Math.abs(value - b[index]))),
      };
    },
    { source: croppedImage!, preview },
  );
  expect(difference).toEqual({ width: 512, height: 512, delta: expect.any(Number) });
  expect(difference.delta).toBeLessThan(6);
  await save();
  const readCharacter = async () =>
    databaseSchema
      .parse(JSON.parse(await readFile(libraryFile, 'utf8')))
      .characters.find((character) => character.id === 'nora')!;
  const savedCharacter = await readCharacter();
  expect(savedCharacter.portrait).toMatchObject({ zoom: 2, rotation: 90, flipX: true });
  expect(savedCharacter.portrait!.offsetX).toBeCloseTo(0.05);
  expect(savedCharacter.portrait!.offsetY).toBeCloseTo(0.95);
  expect(savedCharacter.portrait!.source).not.toBe(savedCharacter.image);
  await openCharacter();
  await dialog.getByRole('button', { name: russianText('portrait.edit'), exact: true }).click();
  await expect(zoom()).toHaveValue('2');
  await dialog
    .getByRole('button', { name: russianText('portrait.reset').trim(), exact: true })
    .click();
  await expect(zoom()).toHaveValue('1');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: russianText('portrait.edit'), exact: true }),
  ).toBeFocused();
  expect(await dialog.locator('.portrait-editor img').getAttribute('src')).toBe(
    savedCharacter.image,
  );
  // Cancel replacing an image, and then cancel the whole character form.
  await upload();
  await expect(apply()).toBeEnabled();
  await dialog.getByRole('button', { name: russianText('actions.cancel'), exact: true }).click();
  expect(await dialog.locator('.portrait-editor img').getAttribute('src')).toBe(
    savedCharacter.image,
  );
  await dialog.getByRole('button', { name: russianText('portrait.edit'), exact: true }).click();
  await expect(apply()).toBeEnabled();
  await dialog
    .getByRole('button', { name: russianText('portrait.reset').trim(), exact: true })
    .click();
  await apply().click();
  await dialog.getByRole('button', { name: russianText('actions.cancel'), exact: true }).click();
  expect(await readCharacter()).toEqual(savedCharacter);
  await app.close();
  await launch(directory);
  watchErrors();
  dialog = page.getByRole('dialog');
  await page
    .getByRole('button', { name: russianText('navigation.characters'), exact: true })
    .click();
  await openCharacter();
  await dialog.getByRole('button', { name: russianText('portrait.edit'), exact: true }).click();
  await expect(zoom()).toHaveValue('2');
  await expect(
    dialog.getByRole('button', { name: russianText('portrait.flip'), exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await dialog
    .getByRole('button', { name: russianText('portrait.reset').trim(), exact: true })
    .click();
  await apply().click();
  await save();
  const resetCharacter = await readCharacter();
  expect(resetCharacter.portrait!.source).toBe(savedCharacter.portrait!.source);
  expect(resetCharacter.portrait).toMatchObject({
    zoom: 1,
    rotation: 0,
    flipX: false,
    offsetX: 0,
    offsetY: 0,
  });
  const transferPath = path.join(directory, 'character.json');
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, transferPath);
  await page
    .getByRole('article')
    .filter({ hasText: russianText('demo.nora.name') })
    .getByRole('button', {
      name: russianText('characters.exportLabel', russianText('demo.nora.name')),
      exact: true,
    })
    .click();
  await expect
    .poll(async () => JSON.parse(await readFile(transferPath, 'utf8')).data.characters[0].portrait)
    .toEqual(resetCharacter.portrait);
  // Removing the portrait also removes its editable source.
  await openCharacter();
  await dialog.getByRole('button', { name: russianText('portrait.remove'), exact: true }).click();
  await expect(
    dialog.getByText(russianText('characters.colorLabel'), { exact: true }),
  ).toBeVisible();
  await save();
  const removed: Character = await readCharacter();
  expect(removed.image).toBeUndefined();
  expect(removed.portrait).toBeUndefined();
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
  }, transferPath);
  await page.getByRole('button', { name: russianText('navigation.settings'), exact: true }).click();
  await page.getByRole('button', { name: russianText('transfer.import'), exact: true }).click();
  await expect(page.getByRole('status')).toContainText(russianText('samples.oneCharacterText'));
  const imported = databaseSchema
    .parse(JSON.parse(await readFile(libraryFile, 'utf8')))
    .characters.find(
      (character) => character.id !== 'nora' && character.name === russianText('demo.nora.name'),
    )!;
  expect(imported.portrait).toEqual(resetCharacter.portrait);
  expect(imported.image).toBe(resetCharacter.image);
  expect(errors).toEqual([]);
});

test('legacy portraits stay editable and failed uploads preserve them', async () => {
  await mkdir(path.join(root, '.test-data'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.test-data', 'legacy-portrait-'));
  const libraryFile = path.join(directory, 'library.json');
  const initial = demoDatabase();
  const legacyImage = `data:image/png;base64,${(await readFile(path.join(root, 'resources/icon.png'))).toString('base64')}`;
  initial.characters[0].image = legacyImage;
  await writeFile(libraryFile, JSON.stringify(initial));
  await launch(directory);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page
    .getByRole('button', { name: russianText('navigation.characters'), exact: true })
    .click();
  await page
    .getByRole('button', {
      name: russianText('characters.editLabel', russianText('demo.nora.name')),
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog');
  const upload = dialog.getByLabel(russianText('portrait.upload'), { exact: true });
  await upload.setInputFiles({
    name: 'bad.gif',
    mimeType: 'image/gif',
    buffer: Buffer.from('invalid image'),
  });
  await expect(dialog.getByRole('alert')).toHaveText(russianText('validation.imageType'));
  await upload.setInputFiles({
    name: 'bad.png',
    mimeType: 'image/png',
    buffer: Buffer.from('invalid image'),
  });
  await expect(dialog.getByRole('alert')).toHaveText(russianText('errors.imageRead'));
  expect(await dialog.locator('.portrait-editor img').getAttribute('src')).toBe(legacyImage);
  await dialog.getByRole('button', { name: russianText('portrait.edit'), exact: true }).click();
  await expect(
    dialog.getByRole('slider', { name: russianText('portrait.zoomControlLabel'), exact: true }),
  ).toHaveValue('1');
  await expect(
    dialog.getByRole('button', { name: russianText('portrait.apply'), exact: true }),
  ).toBeEnabled();
  await dialog
    .getByRole('button', { name: russianText('portrait.rotateLeft'), exact: true })
    .click();
  await dialog.getByRole('button', { name: russianText('portrait.apply'), exact: true }).click();
  await dialog
    .getByRole('button', { name: russianText('actions.saveChanges'), exact: true })
    .click();
  await expect(page.locator('.save-status')).toHaveText(russianText('save.saved'));
  const stored = databaseSchema.parse(JSON.parse(await readFile(libraryFile, 'utf8')))
    .characters[0];
  expect(stored.portrait).toMatchObject({ source: legacyImage, rotation: 270, zoom: 1 });
  expect(stored.image).toMatch(/^data:image\/webp;base64,/);
  expect(errors).toEqual([]);
});
