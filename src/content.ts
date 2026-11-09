import { imageFiles, MAX_IMAGES, validateImages } from './clipboard';
import { attachImages, composerOpen, currentComposer, findComposer, finishImagePost, isComposerDismissal, isPublishButton, nativeImageCount } from './linkedin';
import type { Composer } from './linkedin';
import { Tray } from './tray';
import type { ImageEntry } from './tray';
import { makePreview } from './preview';
import { observePreference, preferences, settingsReady } from './settings';

let nextId = 0;
let active: Stack | null = null;

class Stack {
  readonly tray: Tray;
  readonly entries: ImageEntry[] = [];
  busy = false;
  private paused = false;
  private following = false;
  private flight: ImageEntry[] = [];
  private nativeBeforeFlight = 0;
  private readonly lifecycle = new AbortController();
  private readonly observer: MutationObserver;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private previews = Promise.resolve();
  private readonly previewJobs = new WeakSet<ImageEntry>();

  constructor(public composer: Composer) {
    this.tray = new Tray({
      remove: (id) => {
        const index = this.entries.findIndex((entry) => entry.id === id);
        if (index < 0) return;
        const [entry] = this.entries.splice(index, 1);
        if (entry) this.release(entry);
        if (!this.entries.length) this.destroy(); else this.render();
      },
      clear: () => this.destroy(),
      attach: () => { void this.attach(); },
    });
    this.observer = new MutationObserver(() => {
      if (this.busy || composerOpen(this.composer)) return;
      const next = this.following && currentComposer();
      if (next) this.mount(next); else this.destroy();
    });
    this.mount(composer);
    window.addEventListener('pagehide', () => this.destroy(), { once: true, signal: this.lifecycle.signal });
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button');
      if (!button || button.closest('[data-pastestack]')) return;
      const related = this.composer.root.contains(button) || currentComposer()?.root.contains(button);
      if (related && isComposerDismissal(button)) { this.destroy(); return; }
      if (related && (this.entries.length || this.busy) && isPublishButton(button)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.render(this.busy ? 'Wait for your images to finish, or clear the stack before posting.' : 'Add your images to the post, or clear the stack before posting.');
        this.tray.host.scrollIntoView({ block: 'nearest' });
      }
    }, { capture: true, signal: this.lifecycle.signal });
  }

  mount(composer: Composer): void {
    this.composer = composer;
    if (composer.editor) composer.editor.after(this.tray.host);
    else composer.root.append(this.tray.host);
    this.observer.disconnect();
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.observer.observe(composer.root, { attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'style', 'class', 'open'] });
  }

  push(files: File[]): void {
    const existing = this.busy
      ? Math.max(nativeImageCount(this.composer.root), this.nativeBeforeFlight + this.flight.length)
      : nativeImageCount(this.composer.root);
    const error = validateImages(files, MAX_IMAGES - this.entries.length - existing);
    if (error) { this.render(error); return; }
    for (const file of files) this.entries.push({ id: ++nextId, file, url: URL.createObjectURL(file), preview: null });
    this.render();
    void settingsReady.then(() => this.settingsChanged());
  }

  settingsChanged(): void {
    if (this.lifecycle.signal.aborted) return;
    if (!this.busy) this.render();
    this.schedule();
  }

  schedule(): void {
    clearTimeout(this.timer);
    if (this.lifecycle.signal.aborted || !preferences.autoPaste || this.busy || this.paused || !this.entries.length) return;
    this.timer = setTimeout(() => { void this.attach(); }, 180);
  }

  private render(message = ''): void {
    this.tray.render(this.entries, message || (this.busy
      ? 'Adding images to LinkedIn. You can paste another image to queue it.'
      : preferences.autoPaste && !this.paused ? 'Adding your images automatically…' : ''), this.busy);
    if (preferences.autoPaste && !this.paused) return;
    for (const entry of this.entries) {
      if (this.previewJobs.has(entry)) continue;
      this.previewJobs.add(entry);
      this.previews = this.previews.then(async () => {
        if (!this.entries.includes(entry)) return;
        const url = await makePreview(entry.file, this.lifecycle.signal);
        if (!url) return;
        if (!this.entries.includes(entry) || this.lifecycle.signal.aborted) { URL.revokeObjectURL(url); return; }
        entry.preview = url;
        this.tray.updatePreview(entry);
      });
    }
  }

  private async attach(): Promise<void> {
    if (this.busy || !this.entries.length || this.lifecycle.signal.aborted) return;
    clearTimeout(this.timer);
    this.busy = true;
    await settingsReady;
    if (this.lifecycle.signal.aborted) return;
    const automatic = preferences.autoPaste;
    const batch = this.entries.splice(0);
    this.flight = batch;
    this.nativeBeforeFlight = nativeImageCount(this.composer.root);
    let handedOff = false;
    let failure = '';
    this.paused = false;
    this.following = true;
    this.render();
    try {
      const files = batch.map((entry) => entry.file);
      const error = validateImages(files, MAX_IMAGES - this.nativeBeforeFlight);
      if (error) throw new Error(error);
      await attachImages(this.composer, files, this.lifecycle.signal);
      handedOff = true;
      batch.forEach((entry) => this.release(entry));
      if (automatic) {
        const post = await finishImagePost(this.lifecycle.signal, this.nativeBeforeFlight + batch.length);
        this.mount(post);
        const editor = post.editor!;
        editor.focus({ preventScroll: true });
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      } else {
        const next = currentComposer();
        if (next) this.mount(next);
      }
    } catch (error) {
      if (this.lifecycle.signal.aborted) return;
      if (!handedOff) this.entries.unshift(...batch);
      this.paused = true;
      failure = error instanceof Error ? error.message : 'Could not add images. Try again or save them below.';
      const next = currentComposer();
      if (next) this.mount(next);
    } finally {
      this.flight = [];
      this.busy = false;
      if (!this.lifecycle.signal.aborted) {
        if (!this.entries.length && !this.paused) this.destroy();
        else { this.render(failure); this.schedule(); }
      }
    }
  }

  private release(entry: ImageEntry): void {
    URL.revokeObjectURL(entry.url);
    if (entry.preview) URL.revokeObjectURL(entry.preview);
  }

  destroy(): void {
    this.lifecycle.abort();
    clearTimeout(this.timer);
    this.observer.disconnect();
    [...this.entries, ...this.flight].forEach((entry) => this.release(entry));
    this.entries.length = 0;
    this.tray.destroy();
    if (active === this) active = null;
  }
}

observePreference(() => active?.settingsChanged());

document.addEventListener('paste', (event: ClipboardEvent) => {
  const files = imageFiles(event.clipboardData);
  if (!files.length) return;
  const inTray = event.target === active?.tray.host;
  const resolved = inTray ? active!.composer : findComposer(event.target);
  const transition = active?.busy && event.target === document.body && /^\/sharing\/compose\/?$/.test(location.pathname);
  if (!resolved && !transition) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (active && resolved && active.composer.root !== resolved.root && !active.busy) active.destroy();
  active ??= new Stack(resolved!);
  if (resolved && active.composer.root !== resolved.root) active.mount(resolved);
  active.push(files);
}, { capture: true });
