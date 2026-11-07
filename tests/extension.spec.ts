import { test, expect, paste, uploads } from './helpers';

test('actual MV3 injection stacks repeated pastes and sends one native file batch', async ({ page }) => {
  await paste(page, [{ name: 'first.png' }]);
  await paste(page, [{ name: 'second.png' }]);
  await expect(page.getByRole('region', { name: 'PasteStack image stack' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Pasted image' })).toHaveCount(2);
  await expect(page.locator('[data-pastestack]')).toHaveCount(1);
  expect(await uploads(page)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { nativePastes: number }).nativePastes)).toBe(0);
  await page.getByRole('button', { name: 'Add 2 images to post', exact: true }).click();
  expect((await uploads(page))[0]?.map((file) => file.name)).toEqual(['first.png', 'second.png']);
  await expect(page.locator('.native-images figure')).toHaveCount(2);
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
});

test('real OS clipboard image paste works with the platform keyboard shortcut', async ({ page }) => {
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 24; canvas.height = 24;
    canvas.getContext('2d')!.fillRect(0, 0, 24, 24);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
  });
  await page.locator('.ql-editor').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await expect(page.getByRole('button', { name: 'Add image to post', exact: true })).toBeVisible();
});

test('text-only paste keeps the native browser editing behavior', async ({ page }) => {
  expect(await paste(page, [], '.ql-editor', 'Plain text')).toBe(false);
  await page.evaluate(() => navigator.clipboard.writeText('Still normal text'));
  await page.locator('.ql-editor').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await expect(page.locator('.ql-editor')).toContainText('Still normal text');
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
});

test('multiple files in one paste and intentionally repeated images preserve order', async ({ page }) => {
  await paste(page, [{ name: 'a.png' }, { name: 'b.png' }]);
  await paste(page, [{ name: 'a.png' }]);
  await page.getByRole('button', { name: 'Add 3 images to post', exact: true }).click();
  expect((await uploads(page))[0]?.map((file) => file.name)).toEqual(['a.png', 'b.png', 'a.png']);
});

test('rapid paste events append synchronously without replacing previous files', async ({ page }) => {
  await page.evaluate(() => {
    for (let i = 0; i < 10; i++) {
      const data = new DataTransfer();
      data.items.add(new File(['image'], `rapid-${i}.png`, { type: 'image/png' }));
      document.querySelector('.ql-editor')!.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: data, bubbles: true, cancelable: true,
      }));
    }
  });
  await expect(page.getByRole('img', { name: 'Pasted image' })).toHaveCount(10);
  await page.getByRole('button', { name: 'Add 10 images to post', exact: true }).click();
  expect((await uploads(page))[0]?.map((file) => file.name)).toEqual(Array.from({ length: 10 }, (_, i) => `rapid-${i}.png`));
});

for (const mode of ['lazy', 'delayed', 'new-dialog']) {
  test(`native handoff supports ${mode} input mounting without opening a file picker`, async ({ page }) => {
    await page.goto(`https://www.linkedin.com/feed/?mode=${mode}`);
    let pickers = 0;
    page.on('filechooser', () => pickers++);
    await paste(page, [{ name: 'a.png' }, { name: 'b.png' }]);
    await page.getByRole('button', { name: 'Add 2 images to post', exact: true }).click();
    await expect(page.locator('.native-images figure')).toHaveCount(2);
    expect(await uploads(page)).toHaveLength(1);
    expect(pickers).toBe(0);
  });
}

test('later batches append to existing native images without re-uploading earlier files', async ({ page }) => {
  await page.goto('https://www.linkedin.com/feed/?mode=existing');
  await paste(page, [{ name: 'first-paste.png' }]);
  await page.getByRole('button', { name: 'Add image to post', exact: true }).click();
  await paste(page, [{ name: 'second-paste.png' }]);
  await page.getByRole('button', { name: 'Add image to post', exact: true }).click();
  expect((await uploads(page)).map((batch) => batch.map((file) => file.name))).toEqual([['first-paste.png'], ['second-paste.png']]);
  await expect(page.locator('.native-images figure')).toHaveCount(3);
});

test('removing an image updates the handoff and releases its object URL', async ({ page }) => {
  await paste(page, [{ name: 'remove.png' }, { name: 'keep.png' }]);
  const url = await page.getByRole('link', { name: 'Save image 1', exact: true }).getAttribute('href');
  expect(await page.evaluate(async (url) => (await fetch(url!)).ok, url)).toBe(true);
  await page.getByRole('button', { name: 'Remove image 1', exact: true }).click();
  expect(await page.evaluate(async (url) => fetch(url!).then(() => false, () => true), url)).toBe(true);
  await page.getByRole('button', { name: 'Add image to post', exact: true }).click();
  expect((await uploads(page))[0]?.map((file) => file.name)).toEqual(['keep.png']);
});

test('clear discards the stack and a new paste starts a fresh draft', async ({ page }) => {
  await paste(page);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
  await paste(page, [{ name: 'fresh.png' }]);
  await expect(page.getByRole('img', { name: 'Pasted image' })).toHaveCount(1);
});

test('closing the composer releases originals and thumbnails', async ({ page }) => {
  await paste(page);
  await expect(page.getByRole('img', { name: 'Pasted image 1', exact: true })).toHaveAttribute('src', /^blob:/);
  const urls = await page.locator('[data-pastestack]').evaluate((host) => [
    host.shadowRoot!.querySelector('a')!.href,
    host.shadowRoot!.querySelector('img')!.src,
  ]);
  await page.getByRole('button', { name: 'Close composer' }).click();
  await expect.poll(async () => page.evaluate(async (urls) => Promise.all(urls.map((url) =>
    fetch(url).then(() => false, () => true))), urls)).toEqual([true, true]);
});

test('thumbnails are downsampled while original file bytes are preserved', async ({ page }) => {
  await paste(page);
  await expect.poll(() => page.getByRole('img', { name: 'Pasted image 1', exact: true }).evaluate((image) =>
    (image as HTMLImageElement).naturalWidth)).toBe(160);
  const sourceSize = await page.getByRole('link', { name: 'Save image 1', exact: true }).evaluate(async (link) =>
    (await (await fetch((link as HTMLAnchorElement).href)).blob()).size);
  await page.getByRole('button', { name: 'Add image to post', exact: true }).click();
  expect((await uploads(page))[0]?.[0]?.size).toBe(sourceSize);
});

for (const target of ['.comments-comment-box [contenteditable]', '.msg-form [contenteditable]']) {
  test(`ignores ${target}`, async ({ page }) => {
    expect(await paste(page, [{}], target)).toBe(false);
    await expect(page.locator('[data-pastestack]')).toHaveCount(0);
  });
}

test('ignores arbitrary dialogs, text fields, and comment editors inside the composer', async ({ page }) => {
  await page.evaluate(() => {
    const unrelated = document.createElement('section');
    unrelated.setAttribute('role', 'dialog');
    unrelated.innerHTML = '<div id="unrelated" contenteditable="true" role="textbox" aria-label="Message"></div>';
    document.body.append(unrelated);
    const input = document.createElement('input');
    input.id = 'alt-text';
    document.querySelector('.share-creation-state')!.append(input);
  });
  expect(await paste(page, [{}], '#unrelated')).toBe(false);
  expect(await paste(page, [{}], '#alt-text')).toBe(false);
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
});

test('full-page composer works without a dialog', async ({ page }) => {
  await page.goto('https://www.linkedin.com/sharing/compose');
  await page.locator('[role=dialog]').evaluate((dialog) => dialog.removeAttribute('role'));
  expect(await paste(page)).toBe(true);
  await expect(page.getByRole('button', { name: 'Add image to post', exact: true })).toBeVisible();
});

test('an image editor can collect another batch after the first handoff', async ({ page }) => {
  await page.goto('https://www.linkedin.com/feed/?mode=new-dialog');
  await paste(page);
  await page.getByRole('button', { name: 'Add image to post', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Edit images' })).toBeVisible();
  expect(await paste(page, [{ name: 'next.png' }], '[aria-label="Edit images"]')).toBe(true);
  await page.getByRole('button', { name: 'Add image to post', exact: true }).click();
  expect(await uploads(page)).toHaveLength(2);
});

test('image-only capture takes priority over clipboard text and HTML fallback', async ({ page }) => {
  expect(await paste(page, [{}], '.ql-editor', 'copied image URL')).toBe(true);
  await expect(page.locator('.ql-editor')).not.toContainText('copied image URL');
  await expect(page.getByRole('img', { name: 'Pasted image' })).toHaveCount(1);
});

test('20-image limit rejects a whole overflowing paste and keeps existing images', async ({ page }) => {
  await paste(page, Array.from({ length: 20 }, () => ({})));
  await paste(page);
  await expect(page.getByRole('status')).toContainText('20 images');
  await expect(page.getByRole('img', { name: 'Pasted image' })).toHaveCount(20);
});

test('known native attachments count toward the image limit', async ({ page }) => {
  await page.goto('https://www.linkedin.com/feed/?mode=existing');
  await paste(page, Array.from({ length: 20 }, () => ({})));
  await expect(page.getByRole('status')).toContainText('20 images');
  await expect(page.getByRole('img', { name: 'Pasted image' })).toHaveCount(0);
});

for (const type of ['image/webp', 'image/svg+xml']) {
  test(`rejects unsupported ${type} without discarding a valid stack`, async ({ page }) => {
    await paste(page);
    await paste(page, [{ type }]);
    await expect(page.getByRole('status')).toContainText('PNG, JPEG, or GIF');
    await expect(page.getByRole('img', { name: 'Pasted image' })).toHaveCount(1);
  });
}

test('rejects an oversized image and retains the valid stack', async ({ page }) => {
  await paste(page);
  await paste(page, [{ size: 5_000_001 }]);
  await expect(page.getByRole('status')).toContainText('5 MB');
  await expect(page.getByRole('img', { name: 'Pasted image' })).toHaveCount(1);
});

test('does not publish a post while images are still only staged', async ({ page }) => {
  await paste(page);
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Add your images');
  expect(await page.evaluate(() => (window as unknown as { published: number }).published)).toBe(0);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'Post', exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { published: number }).published)).toBe(1);
});

test('bounded upload timeout retains the stack and permits retry or download', async ({ page }) => {
  await page.goto('https://www.linkedin.com/feed/?mode=broken');
  await paste(page, [{ name: 'keep-me.png' }]);
  await page.getByRole('button', { name: 'Add image to post', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your images are still here', { timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Add image to post', exact: true })).toBeEnabled();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Save image 1', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('pastestack-1.png');
  await page.evaluate(() => {
    document.querySelector('#media')!.insertAdjacentHTML('afterend', '<input type="file" accept="image/png" multiple>');
  });
  await page.getByRole('button', { name: 'Add image to post', exact: true }).click();
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
});

test('does not inject outside the exact LinkedIn host', async ({ page }) => {
  await page.goto('https://example.com/feed/');
  expect(await paste(page)).toBe(false);
  await expect(page.locator('[data-pastestack]')).toHaveCount(0);
});

test('allows image pasting while a tray control has focus', async ({ page }) => {
  await paste(page);
  await page.locator('[data-pastestack]').evaluate((host) => {
    const data = new DataTransfer();
    data.items.add(new File(['second'], 'second.png', { type: 'image/png' }));
    host.shadowRoot!.querySelector('button')!.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: data, bubbles: true, composed: true, cancelable: true,
    }));
  });
  await expect(page.getByRole('img', { name: 'Pasted image' })).toHaveCount(2);
});
