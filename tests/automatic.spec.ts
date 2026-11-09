import { test, expect, paste, uploads, openSettings } from './helpers';

test.use({ automatic: null }); // Missing preference must mean automatic, not manual.

test('default paste uploads, advances Next, preserves text, and returns keyboard focus', async ({ page }) => {
  await page.goto('https://www.linkedin.com/sharing/compose/?mode=auto');
  await paste(page, [{ name: 'one.png' }, { name: 'two.png' }]);
  await expect(page.locator('.ql-editor')).toBeFocused();
  await expect(page.locator('.native-images figure')).toHaveCount(2);
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
  expect((await uploads(page))[0]?.map((file) => file.name)).toEqual(['one.png', 'two.png']);
  expect(await page.evaluate(() => (window as unknown as { nextClicks: number }).nextClicks)).toBe(1);
  await page.keyboard.type(' More text.');
  await expect(page.locator('.ql-editor')).toHaveText('A few things I wanted to share. More text.');
  expect(await page.evaluate(() => (window as unknown as { published: number }).published)).toBe(0);
});

test('separate later pastes join the same post without replacing the earlier photos', async ({ page }) => {
  await page.goto('https://www.linkedin.com/sharing/compose/?mode=auto');
  await paste(page, [{ name: 'one.png' }]);
  await expect(page.locator('.ql-editor')).toBeFocused();
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
  await paste(page, [{ name: 'two.png' }]);
  await expect(page.locator('.native-images figure')).toHaveCount(2);
  await expect(page.locator('.ql-editor')).toBeFocused();
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
  expect((await uploads(page)).map((batch) => batch.map((file) => file.name))).toEqual([['one.png'], ['two.png']]);
});

test('pastes during a native editor transition queue until the first batch finishes', async ({ page }) => {
  await page.goto('https://www.linkedin.com/sharing/compose/?mode=auto-delayed');
  await paste(page, [{ name: 'first.png' }]);
  await expect(page.locator('[data-next]')).toBeDisabled();
  await paste(page, [{ name: 'during-upload.png' }], 'main');
  await expect(page.locator('.native-images figure')).toHaveCount(2);
  await expect(page.locator('.ql-editor')).toBeFocused();
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
  expect((await uploads(page)).map((batch) => batch.map((file) => file.name))).toEqual([['first.png'], ['during-upload.png']]);
  expect(await page.evaluate(() => (window as unknown as { nextClicks: number }).nextClicks)).toBe(2);
});

test('Next stays untouched until the recognized image editor is ready', async ({ page }) => {
  await page.goto('https://www.linkedin.com/sharing/compose/?mode=auto-delayed');
  await paste(page);
  await expect(page.locator('[data-next]')).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { nextClicks: number }).nextClicks)).toBe(0);
  await expect(page.locator('.ql-editor')).toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { nextClicks: number }).nextClicks)).toBe(1);
});

test('the popup defaults on, saves manual mode, and applies it to an already-open tab', async ({ page }) => {
  await page.goto('https://www.linkedin.com/sharing/compose/?mode=auto');
  const popup = await openSettings(page.context());
  await expect(popup.getByRole('checkbox')).toBeChecked();
  await popup.getByRole('checkbox').uncheck();
  await expect(popup.getByRole('status')).toHaveText('Saved. Manual review is on.');
  await popup.close();
  await paste(page);
  await expect(page.getByRole('button', { name: 'Add image to post', exact: true })).toBeEnabled();
  await page.waitForTimeout(300); // Beyond the 180ms automatic scheduling window.
  expect(await uploads(page)).toEqual([]);
  await page.getByRole('button', { name: 'Add image to post', exact: true }).click();
  await expect(page.locator('[data-next]')).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { nextClicks: number }).nextClicks)).toBe(0);
  const reopened = await openSettings(page.context());
  await expect(reopened.getByRole('checkbox')).not.toBeChecked();
  await reopened.close();
});

test('enabling automatic mode processes an existing manual stack without a reload', async ({ page }) => {
  const popup = await openSettings(page.context());
  await popup.getByRole('checkbox').uncheck();
  await expect(popup.getByRole('status')).toContainText('Saved.');
  await page.goto('https://www.linkedin.com/sharing/compose/?mode=auto');
  await paste(page);
  await expect(page.getByRole('button', { name: 'Add image to post', exact: true })).toBeVisible();
  await popup.getByRole('checkbox').check();
  await expect(popup.getByRole('status')).toContainText('Saved.');
  await popup.close();
  await expect(page.locator('.ql-editor')).toBeFocused();
  await expect(page.locator('.native-images figure')).toHaveCount(1);
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
});

test('closing a loading image editor cancels queued work without advancing Next', async ({ page }) => {
  await page.goto('https://www.linkedin.com/sharing/compose/?mode=auto-delayed');
  await paste(page);
  await expect(page.locator('[data-next]')).toBeDisabled();
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await page.waitForTimeout(550);
  expect(await page.evaluate(() => (window as unknown as { nextClicks: number }).nextClicks)).toBe(0);
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
  expect(await uploads(page)).toHaveLength(1);
});

test('an unavailable Next times out without re-uploading the handed-off images', async ({ page }) => {
  test.setTimeout(22_000);
  await page.goto('https://www.linkedin.com/sharing/compose/?mode=auto-stuck');
  await paste(page);
  await expect(page.locator('[data-next]')).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Finish Next manually', { timeout: 17_000 });
  expect(await uploads(page)).toHaveLength(1);
  expect(await page.evaluate(() => (window as unknown as { nextClicks: number }).nextClicks)).toBe(0);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
});
