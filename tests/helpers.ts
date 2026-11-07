import { test as base, chromium, expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const test = base.extend<{ page: Page }, { extensionContext: BrowserContext }>({
  extensionContext: [async ({}, use) => {
    const profile = await mkdtemp(join(tmpdir(), 'pastestack-tests-'));
    const extension = resolve('dist');
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
      permissions: ['clipboard-read', 'clipboard-write'],
      viewport: { width: 1100, height: 900 },
    });
    const html = await readFile('tests/fixtures/composer.html', 'utf8');
    await context.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: html }));
    try { await use(context); }
    finally { await context.close(); await rm(profile, { recursive: true, force: true }); }
  }, { scope: 'worker' }],
  page: async ({ extensionContext }, use) => {
    const page = await extensionContext.newPage();
    await page.goto('https://www.linkedin.com/feed/?mode=static');
    try { await use(page); } finally { await page.close(); }
  },
});
export { expect };

export interface PasteFile { name?: string; type?: string; size?: number; color?: string }
export async function paste(page: Page, files: PasteFile[] = [{}], target = '.ql-editor', text?: string): Promise<boolean> {
  return page.evaluate(async ({ files, target, text }) => {
    const data = new DataTransfer();
    for (const [index, options] of files.entries()) {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 200;
      const context = canvas.getContext('2d')!;
      context.fillStyle = options.color ?? '#0a66c2';
      context.fillRect(0, 0, 400, 200);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'));
      data.items.add(new File([options.size ? new Uint8Array(options.size) : blob], options.name ?? `image-${index + 1}.png`, {
        type: options.type ?? 'image/png',
      }));
    }
    if (text !== undefined) data.setData('text/plain', text);
    const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true });
    const element = document.querySelector(target)!;
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }, { files, target, text });
}

export async function uploads(page: Page): Promise<{ name: string; type: string; size: number }[][]> {
  return page.evaluate(() => (window as unknown as { uploads: { name: string; type: string; size: number }[][] }).uploads);
}
