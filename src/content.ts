import { imageFiles, MAX_IMAGES, validateImages } from './clipboard';
import { attachImages, composerOpen, findComposer, isPublishButton, nativeImageCount } from './linkedin';
import type { Composer } from './linkedin';
import { Tray } from './tray';
import type { ImageEntry } from './tray';
import { makePreview } from './preview';

let nextId = 0;
let active: Stack | null = null;

class Stack {
  readonly tray: Tray;
  readonly entries: ImageEntry[] = [];
  private readonly lifecycle = new AbortController();
  private readonly observer: MutationObserver;
  private busy = false;
  private previews = Promise.resolve();

  constructor(readonly composer: Composer) {
    this.tray = new Tray({
      remove: (id) => {
        const index = this.entries.findIndex((entry) => entry.id === id);
        const [entry] = this.entries.splice(index, 1);
        if (entry) {
          URL.revokeObjectURL(entry.url);
          if (entry.preview) URL.revokeObjectURL(entry.preview);
        }
        if (this.entries.length === 0) this.destroy();
        else this.tray.render(this.entries);
      },
      clear: () => this.destroy(),
      attach: () => { void this.attach(); },
    });
    if (composer.editor) composer.editor.after(this.tray.host);
    else composer.root.append(this.tray.host);
    this.observer = new MutationObserver(() => {
      if (!this.busy && !composerOpen(composer)) this.destroy();
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.observer.observe(composer.root, { attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'style', 'class', 'open'] });
    window.addEventListener('pagehide', () => this.destroy(), { once: true, signal: this.lifecycle.signal });
    document.addEventListener('click', (event) => {
      if (!this.entries.length || !(event.target instanceof Element)) return;
      const button = event.target.closest('button');
      if (button && composer.root.contains(button) && isPublishButton(button)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.tray.render(this.entries, 'Add your images to the post, or clear the stack before posting.', this.busy);
        this.tray.host.scrollIntoView({ block: 'nearest' });
      }
    }, { capture: true, signal: this.lifecycle.signal });
  }

  push(files: File[]): void {
    if (this.busy) {
      this.tray.render(this.entries, 'Images are being added. Wait for LinkedIn’s preview, then paste again.', true);
      return;
    }
    const error = validateImages(files, MAX_IMAGES - this.entries.length - nativeImageCount(this.composer.root));
    if (error) { this.tray.render(this.entries, error); return; }
    for (const file of files) {
      const entry: ImageEntry = { id: ++nextId, file, url: URL.createObjectURL(file), preview: null };
      this.entries.push(entry);
      // One thumbnail decode at a time, preserving paste order under bursts.
      this.previews = this.previews.then(async () => {
        if (!this.entries.includes(entry)) return;
        const url = await makePreview(file, this.lifecycle.signal);
        if (!url) return;
        if (!this.entries.includes(entry) || this.lifecycle.signal.aborted) { URL.revokeObjectURL(url); return; }
        entry.preview = url;
        this.tray.updatePreview(entry);
      });
    }
    this.tray.render(this.entries);
  }

  private async attach(): Promise<void> {
    if (this.busy || !this.entries.length) return;
    const error = validateImages(this.entries.map((entry) => entry.file), MAX_IMAGES - nativeImageCount(this.composer.root));
    if (error) { this.tray.render(this.entries, error); return; }
    this.busy = true;
    this.tray.render(this.entries, 'Handing images to LinkedIn. Check its previews before posting.', true);
    try {
      await attachImages(this.composer, this.entries.map((entry) => entry.file), this.lifecycle.signal);
      this.destroy();
    } catch (error) {
      if (this.lifecycle.signal.aborted) return;
      this.busy = false;
      if (!composerOpen(this.composer)) { this.destroy(); return; }
      this.tray.render(this.entries, error instanceof Error ? error.message : 'Could not add images. Try again or save them below.');
    }
  }

  destroy(): void {
    this.lifecycle.abort();
    this.observer.disconnect();
    for (const entry of this.entries) {
      URL.revokeObjectURL(entry.url);
      if (entry.preview) URL.revokeObjectURL(entry.preview);
    }
    this.entries.length = 0;
    this.tray.destroy();
    if (active === this) active = null;
  }
}

// No clipboard polling, keyboard hooks, global DOM observer, or work at startup.
document.addEventListener('paste', (event: ClipboardEvent) => {
  const files = imageFiles(event.clipboardData);
  if (!files.length) return;
  const target = event.composedPath()[0] ?? event.target;
  const composer = target instanceof Element && active?.tray.host.contains(target)
    ? active.composer : findComposer(event.target);
  // A Shadow DOM control's event target is retargeted to the host.
  const resolved = composer ?? (event.target === active?.tray.host ? active.composer : null);
  if (!resolved) return;
  event.preventDefault();
  event.stopImmediatePropagation(); // LinkedIn must not also process this image.
  if (active && active.composer.root !== resolved.root) active.destroy();
  active ??= new Stack(resolved);
  active.push(files);
}, { capture: true });
