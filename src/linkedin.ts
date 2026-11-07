// LinkedIn's DOM is not a public API. Keep all site-specific knowledge here.
const DIALOG = '[role="dialog"], dialog, .share-box-modal';
const EDITOR = '[contenteditable="true"][role="textbox"], .ql-editor[contenteditable="true"], [contenteditable="true"][data-placeholder]';
const EXCLUDED = '.comments-comment-box, .comments-comment-texteditor, .msg-form, [data-pastestack]';
const ADD_LABELS = /^(add(?: more)? (?:images?|photos?)|add media)$/i;
const MEDIA_LABELS = /^(media|add (?:a )?(?:photo|image)|add (?:photos|images|media)|upload (?:photos|images)|upload from computer|create a photo post)$/i;

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
  if (/^\/sharing\/compose\/?$/.test(location.pathname)) {
    const root = target.closest<HTMLElement>('main, [role="main"]') ?? document.body;
    const editor = postEditor(root);
    if (editor && (editor.contains(target) || target === editor)) return { root, editor };
  }
  return null;
}

export function composerOpen(composer: Composer): boolean {
  return visible(composer.root) && (!composer.editor || visible(composer.editor));
}

export function nativeImageCount(root: HTMLElement): number {
  // Use remove controls, not <img>: avatars and editor thumbnails double-count.
  return Array.from(root.querySelectorAll('button')).filter((button) =>
    /^(remove|delete) (image|photo)(?:\s.*)?$/i.test(label(button)),
  ).length;
}

function mediaAction(root: HTMLElement): HTMLElement | null {
  const actions = Array.from(root.querySelectorAll<HTMLElement>('button, label[for], [role="button"]'))
    .filter((button) => !button.closest('[data-pastestack]') && visible(button) &&
      !button.matches(':disabled, [aria-disabled="true"]'));
  return actions.find((button) => ADD_LABELS.test(label(button))) ??
    (isMediaRoot(root) ? actions.find((button) => /^add$/i.test(label(button))) : null) ??
    actions.find((button) => MEDIA_LABELS.test(label(button))) ??
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
    let settled = false;
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
      return null;
    };
    const check = () => {
      const input = candidate();
      if (input) finish(input);
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
    try { action.click(); check(); } catch (error) { finish(undefined, error); }
  });
}
