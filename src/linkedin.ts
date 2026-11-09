// LinkedIn's DOM is not a public API. Keep all site-specific knowledge here.
const DIALOG = '[role="dialog"], dialog, .share-box-modal';
const EDITOR = '[contenteditable="true"][role="textbox"], .ql-editor[contenteditable="true"], [contenteditable="true"][data-placeholder]';
const EXCLUDED = '.comments-comment-box, .comments-comment-texteditor, .msg-form, [data-pastestack]';
const ADD_LABELS = /^(add(?: more)? (?:images?|photos?)|add media)$/i;
const MEDIA_LABELS = /^(media|add (?:a )?(?:photo|image)|add (?:photos|images|media)|upload (?:photos|images)|upload from computer|create a photo post)$/i;
const COMPOSE_PATH = /^\/sharing\/compose\/?$/;
const MEDIA_REGION = '[role="region"][aria-label^="Add media."]';

export interface Composer {
  root: HTMLElement;
  editor: HTMLElement | null;
}

function visible(element: HTMLElement): boolean {
  return element.isConnected && element.checkVisibility({ checkVisibilityCSS: true });
}

function label(element: Element): string {
  return (element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent || '').trim();
}

export function isPublishButton(element: Element): boolean {
  if (/^next$/i.test(label(element))) return false;
  return element.matches('.share-actions__primary-action') || /^(post|publish)$/i.test(label(element));
}

function postEditor(root: HTMLElement): HTMLElement | null {
  return Array.from(root.querySelectorAll<HTMLElement>(EDITOR)).find((editor) =>
    !editor.closest(EXCLUDED) && !/comment|message|reply/i.test(
      `${editor.getAttribute('aria-label') ?? ''} ${editor.getAttribute('data-placeholder') ?? ''}`,
    ) && visible(editor),
  ) ?? null;
}

function isPostRoot(root: HTMLElement): boolean {
  return !!postEditor(root) && (
    root.matches('.share-box-modal') || !!root.querySelector('.share-creation-state') ||
    Array.from(root.querySelectorAll('button')).some(isPublishButton)
  );
}

export function imageInput(root: ParentNode): HTMLInputElement | null {
  return Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"]')).find((input) =>
    input.isConnected && !input.disabled && input.multiple && /image\//i.test(input.accept) &&
    !input.parentElement?.closest('[hidden], [aria-hidden="true"]'),
  ) ?? null;
}

function isMediaRoot(root: HTMLElement): boolean {
  const actions = Array.from(root.querySelectorAll('button, label'));
  return !!root.querySelector('.image-sharing-detour-container') || (
    !!imageInput(root) && (actions.some((button) => ADD_LABELS.test(label(button))) ||
      (actions.some((button) => /^add$/i.test(label(button))) && actions.some((button) => /^next$/i.test(label(button)))))
  );
}

function fullPageMediaRoot(): HTMLElement | null {
  if (!COMPOSE_PATH.test(location.pathname)) return null;
  const region = document.querySelector<HTMLElement>(MEDIA_REGION);
  if (region && visible(region)) return region.closest<HTMLElement>('main, [role="main"]') ?? region.parentElement;
  // Once photos exist, the drop zone becomes an album editor: Editor heading,
  // Add control, and Next. Its generated CSS classes are intentionally ignored.
  const heading = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, [role="heading"]'))
    .find((element) => element.textContent?.trim() === 'Editor' && visible(element));
  for (let root = heading?.parentElement; root && root !== document.body; root = root.parentElement) {
    const buttons = Array.from(root.querySelectorAll('button'));
    if (buttons.some((button) => label(button) === 'Add') && buttons.some((button) => label(button) === 'Next')) return root;
  }
  return null;
}

function mediaRoots(): HTMLElement[] {
  const fullPage = fullPageMediaRoot();
  return [...(fullPage ? [fullPage] : []), ...Array.from(document.querySelectorAll<HTMLElement>(DIALOG))
    .filter((root) => visible(root) && isMediaRoot(root))];
}

export function currentComposer(): Composer | null {
  const media = mediaRoots()[0];
  if (media) return { root: media, editor: null };
  const editor = postEditor(document.body);
  return editor ? findComposer(editor) : null;
}

export function isComposerDismissal(element: Element): boolean {
  return /^(dismiss|close(?: dialog| editor| composer)?|back|discard)$/i.test(label(element));
}

export function findComposer(target: EventTarget | null): Composer | null {
  if (!(target instanceof Element) || target.closest(EXCLUDED)) return null;
  const dialog = target.closest<HTMLElement>(DIALOG);
  if (dialog && visible(dialog)) {
    const field = target.closest('input, textarea, [contenteditable="true"]');
    if (isPostRoot(dialog)) {
      const editor = postEditor(dialog);
      if (field && field !== editor) return null;
      return { root: dialog, editor };
    }
    if (!field && isMediaRoot(dialog)) return { root: dialog, editor: null };
    return null;
  }
  // LinkedIn also has a full-page composer. Never treat the feed as a composer.
  if (COMPOSE_PATH.test(location.pathname)) {
    const root = target.closest<HTMLElement>('main, [role="main"]') ?? document.body;
    const editor = postEditor(root);
    if (editor && (editor.contains(target) || target === editor)) return { root, editor };
    const media = fullPageMediaRoot();
    if (media && !target.closest('input, textarea, [contenteditable="true"]') &&
      (media.contains(target) || target === document.body)) return { root: media, editor: null };
  }
  return null;
}

export function composerOpen(composer: Composer): boolean {
  return visible(composer.root) && (!composer.editor || visible(composer.editor));
}

export function nativeImageCount(root: HTMLElement): number {
  const thumbnails = root.querySelectorAll('[role="button"][aria-roledescription="sortable"]').length;
  if (thumbnails) return thumbnails;
  // Use remove controls, not <img>: avatars and editor thumbnails double-count.
  return Array.from(root.querySelectorAll('button')).filter((button) =>
    /^(remove|delete) (image|photo)(?:\s.*)?$/i.test(label(button)),
  ).length;
}

/** Advance only a recognized photo editor, then wait for a writable composer.
 * No Post/Publish action is ever selected or clicked. */
export async function finishImagePost(signal: AbortSignal, minimumImages: number): Promise<Composer> {
  signal.throwIfAborted();
  return new Promise<Composer>((resolve, reject) => {
    let advanced = false;
    let settled = false;
    const observer = new MutationObserver(check);
    const timeout = setTimeout(() => finish(undefined, new Error('Images were sent to LinkedIn. Finish Next manually to continue.')), 15_000);
    const cancel = () => finish(undefined, signal.reason);
    function finish(composer?: Composer, error?: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      observer.disconnect();
      signal.removeEventListener('abort', cancel);
      if (composer) resolve(composer); else reject(error);
    }
    function check() {
      if (settled) return;
      if (signal.aborted) { cancel(); return; }
      const media = mediaRoots()[0];
      if (media) {
        const previews = nativeImageCount(media) > 0 || !!media.querySelector('img[alt*="preview" i], .image-sharing-detour-container img');
        const next = Array.from(media.querySelectorAll<HTMLButtonElement>('button'))
          .find((button) => label(button) === 'Next' && !button.disabled && button.getAttribute('aria-disabled') !== 'true' && visible(button));
        if (!advanced && previews && next && !media.querySelector('[role="progressbar"], progress, [aria-busy="true"]')) {
          advanced = true;
          next.click();
          queueMicrotask(check);
        }
        return;
      }
      const composer = currentComposer();
      if (composer?.editor && (advanced || nativeImageCount(composer.root) >= minimumImages) &&
        !composer.root.querySelector('[role="progressbar"], progress, [aria-busy="true"]')) finish(composer);
    }
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'aria-busy', 'hidden', 'aria-hidden'] });
    signal.addEventListener('abort', cancel, { once: true });
    check();
  });
}

function mediaAction(root: HTMLElement): HTMLElement | null {
  const actions = Array.from(root.querySelectorAll<HTMLElement>('button, label[for], [role="button"]'))
    .filter((button) => !button.closest('[data-pastestack]') && visible(button) &&
      !button.matches(':disabled, [aria-disabled="true"]'));
  return actions.find((button) => ADD_LABELS.test(label(button))) ??
    (isMediaRoot(root) || fullPageMediaRoot() === root ? actions.find((button) => /^add$/i.test(label(button))) : null) ??
    actions.find((button) => MEDIA_LABELS.test(label(button))) ??
    actions.find((button) => label(button) === 'Edit' &&
      button.parentElement?.querySelector('button[aria-label="Close"]')) ??
    root.querySelector<HTMLElement>('button.share-promoted-detour-button[aria-label*="photo" i]');
}

function transfer(input: HTMLInputElement, files: readonly File[]): void {
  const data = new DataTransfer();
  for (const file of files) data.items.add(file);
  // Send only this batch. LinkedIn's Add images flow preserves previous uploads.
  // Reusing input.files would upload earlier images again.
  input.files = data.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Resolves after DOM handoff, not after LinkedIn's network upload completes. */
export async function attachImages(composer: Composer, files: readonly File[], signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!composerOpen(composer)) throw new Error('The post composer has closed.');
  const existing = imageInput(composer.root);
  if (existing) {
    transfer(existing, files);
    return;
  }
  const action = mediaAction(composer.root);
  if (!action) throw new Error('Open LinkedIn’s Media or Add images screen, then try again. You can also save the images below.');

  // Some versions mount an input only when Media is clicked. Observe only for
  // this operation, and never intercept another uploader's file input.
  await new Promise<void>((resolve, reject) => {
    const previousDialogs = new Set(document.querySelectorAll(DIALOG));
    const previousInputs = new Set(document.querySelectorAll('input[type="file"]'));
    let settled = false;
    let activating = false;
    const attemptedActions = new Set<HTMLElement>();
    let timeout: ReturnType<typeof setTimeout>;
    const operation = new AbortController();
    const finish = (input?: HTMLInputElement, error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      observer.disconnect();
      operation.abort();
      signal.removeEventListener('abort', cancel);
      try {
        if (!input) throw error ?? new Error('Open LinkedIn’s Media or Add images screen, then try again. Your images are still here.');
        transfer(input, files);
        resolve();
      } catch (cause) { reject(cause); }
    };
    const cancel = () => finish(undefined, signal.reason);
    const candidate = () => {
      const local = imageInput(composer.root);
      if (local) return local;
      for (const dialog of document.querySelectorAll<HTMLElement>(DIALOG)) {
        if (!previousDialogs.has(dialog) && visible(dialog) && isMediaRoot(dialog)) {
          const input = imageInput(dialog);
          if (input) return input;
        }
      }
      // LinkedIn's current React composer appends a transient file input directly
      // to <body>, outside the composer root, before invoking input.click(). Only
      // consider new inputs during this user-requested Media handoff.
      if (fullPageMediaRoot() || (activating && COMPOSE_PATH.test(location.pathname))) {
        const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('body > input[type="file"]'))
          .filter((input) => !previousInputs.has(input) && input.multiple && !input.disabled && /image\//i.test(input.accept));
        if (inputs.length === 1) return inputs[0]!;
      }
      return null;
    };
    const activate = (button: HTMLElement) => {
      attemptedActions.add(button);
      activating = true;
      try { button.click(); } finally { activating = false; }
    };
    const check = () => {
      const input = candidate();
      if (input) { finish(input); return; }
      // Editing an existing album takes two native steps: Edit, then Add.
      const media = fullPageMediaRoot();
      const add = media && mediaAction(media);
      if (add && !attemptedActions.has(add) && /^(add|upload from computer)$/i.test(label(add))) {
        try {
          activate(add);
          const created = candidate();
          if (created) finish(created);
        } catch (error) { finish(undefined, error); }
      }
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    signal.addEventListener('abort', cancel, { once: true });
    document.addEventListener('click', (event) => {
      const input = event.target;
      if (input instanceof HTMLInputElement && input.type === 'file' && input === candidate()) {
        event.preventDefault(); // Avoid opening the OS picker for this handoff.
        queueMicrotask(() => finish(input));
      }
    }, { capture: true, signal: operation.signal });
    timeout = setTimeout(() => finish(), 3000);
    try { activate(action); check(); }
    catch (error) { finish(undefined, error); }
  });
}
