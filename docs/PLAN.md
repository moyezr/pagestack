# PasteStack implementation plan

## Automatic paste update — 9 November 2026

The default interaction changes to paste → native image upload → automatically
advance Next → focus the post text. A toolbar popup offers an **Automatically add
pasted images** checkbox, on by default. Turning it off restores the existing
tray / Add to post / manual Next review flow. Publishing always remains manual.

Use one local boolean in Chrome extension storage, not the page's localStorage.
This adds only the `storage` permission and a static popup; no service worker,
new host access, or runtime dependency. Read once on load and respond to storage
change events. [Chrome storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage)
and [popup documentation](https://developer.chrome.com/docs/extensions/develop/ui/add-popup)
were checked for this change.

Coalesce rapid pastes with a short, per-paste timer and serialize native upload
transitions. Keep new clipboard files queued during an in-progress transition;
never re-upload a batch after its FileList handoff. Auto-Next must target only a
recognized image editor with native previews and an enabled Next button, then
wait for the text composer to return. Bound observers/timeouts to active work,
preserve files on recoverable failures, and cancel on composer dismissal.

Verification: add browser coverage for default automatic behavior, persisted
manual mode, switching settings without a reload, delayed Next readiness,
repeated pastes during transitions, recovery without duplicate uploads, and
cancellation without clicking Post. Retest separate real Cmd+V pastes and typing
in the user's Chrome with a clearly labeled unpublished draft. Update packaging,
permissions documentation, and release version to 0.2.0.

## Outcome

A Chrome Manifest V3 extension for desktop LinkedIn. Open a post, paste an
image with Cmd+V (Mac) or Ctrl+V (Windows/Linux), and paste more images to append
to the same local stack. Review/remove images, then click **Add to post** once to
hand the whole batch to LinkedIn's native multi-image uploader. LinkedIn retains
control of editing, alt text, ordering, and publishing.

The explicit batch handoff is intentional: it avoids duplicate uploads and
replacement of earlier pasted images during LinkedIn's modal transitions. Images
are separate attachments, never flattened into a collage. Text-only pastes and
comments/messages keep their normal behavior.

## Technology and resource budget

- Manifest V3, isolated content script, restricted to `https://www.linkedin.com/*`.
- TypeScript with strict checking; esbuild for one minified IIFE bundle.
- Current stable package versions resolved from npm and pinned in the lockfile.
- Playwright tests in real Chromium, including loading the packaged extension.
- Zero production dependencies, background workers, polling, remote code,
  analytics, network requests, or persistent clipboard storage.
- One idle paste listener. Create UI/observers only while a stack is open, revoke
  object URLs and drop File references on removal, clear, or composer close.
- Content script size budget: 20 KiB. Never encode original images as base64.
- At most 20 images, at most 5 MB per image. Reject unsupported image formats
  with a readable message; do not silently resize/recompress clipboard images.

## Stages / commits

1. `chore: plan PasteStack and pin the extension toolchain`
2. `feat: stack clipboard images in LinkedIn's post composer`
3. `test: cover clipboard stacking and native upload handoff in Chromium`
4. `docs: document installation, privacy, and release verification`

Each implementation commit is independently reviewable. No remote is configured
or pushed until the user provides their GitHub repository.

## Integration boundary

LinkedIn has no public browser-composer integration API. Keep DOM selectors and
upload logic in a small adapter. Recognize post composers conservatively;
never intercept pastes in the feed, comments, messages, or arbitrary dialogs.
Pass real File objects through a DataTransfer/FileList and dispatch a normal
input change event. Never call LinkedIn's private HTTP APIs or click Post.

Use existing image inputs where available. If the Media/Add images button creates
the input lazily, observe only during a bounded handoff and suppress the native
file-picker click for that operation. On unsupported layouts, keep the stack and
offer downloads for manual upload. A DOM handoff is not proof of successful
server upload; the user must verify LinkedIn's native previews before posting.

## Verification

Automate browser coverage of repeated/rapid/multiple-item pastes, duplicate image
intent, text and mixed clipboard behavior, exclusions, format/size/count limits,
remove/clear and draft lifecycle cleanup, static and lazy file inputs, separate
image editor dialogs, existing native images, retry/fallback, and extension
origin isolation. Run typecheck, production build, package checks, and npm audit.

Keep live authenticated LinkedIn verification separate from fixture coverage.
Document any unverified layouts and provide a short manual Mac/Windows checklist.

## Research (7 November 2026)

- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): isolated scripts can use the shared DOM without a background worker.
- [Manifest content scripts](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts): static host matching and isolated execution.
- [ClipboardEvent.clipboardData](https://developer.mozilla.org/en-US/docs/Web/API/ClipboardEvent/clipboardData): obtain clipboard File objects from the user's paste event without clipboardRead permission.
- [DataTransfer](https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer) and [input.files](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/files): native file handoff.
- [LinkedIn photos](https://www.linkedin.com/help/linkedin/answer/a527229/share-photos-or-videos?lang=en): LinkedIn documents basic paste support, a 20-photo limit, a 5 MB upload limit, and native Add images. This extension focuses on accumulating repeated pastes.
- [Playwright extensions](https://playwright.dev/docs/chrome-extensions): use a persistent bundled Chromium context to exercise real MV3 injection.
- [esbuild](https://esbuild.github.io/) and [TypeScript](https://www.typescriptlang.org/docs/): small build toolchain, no frontend framework required.

Registry latest stable versions checked using `npm view <package> version`;
avoid prerelease tags. Recheck before releases rather than using unpinned `latest`.
