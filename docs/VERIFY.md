# Release verification

## Automated result — 8 November 2026

The local macOS run loads the built Manifest V3 extension into a fresh persistent
Chromium profile. All HTTP requests in this profile are fulfilled with controlled
HTML fixtures; no live account is accessed. The clipboard keyboard test uses the
test browser's clipboard. Fixtures model static inputs, delayed/lazy mounting,
and a separate image-editor dialog. Three new regressions cover the live site's
transient body-mounted file inputs, mounting order, and existing-album Edit → Add
flow. Fixtures complement the separate signed-in check below.

31 tests passed. Strict TypeScript checking and the production bundle budget
passed. The final package command reruns the checks and validates ZIP contents.
`npm audit` reports dependency advisories at the time it is run; it is not a
guarantee about future vulnerabilities.

## Signed-in LinkedIn result — 8 November 2026

Tested in the user's own Chrome 156 browser on macOS, with an English LinkedIn
account and the unpacked extension installed from `dist/`. Used the real system
clipboard and Cmd+V, with three distinct generated PNG images from
`npm run test:live`. No private images or existing draft text were used.

| Check | Observed result |
| --- | --- |
| Separate clipboard pastes | Tray changed from 1 / 20 to 2 / 20, preserving image 1. |
| Combined upload | Native LinkedIn editor showed 1 of 2; Next produced a two-image, side-by-side post preview. |
| Later paste | Pasted image 3 into the same post, clicked Add, and confirmed three native thumbnails and all three distinct images in the post layout. |
| Existing image preservation | Both earlier photos remained; no duplicate upload of the original batch. |
| Text paste | A plain-text test sentence appeared in the post editor beside the native attachments. |
| File-picker handling | After the fix, both first and later batch handoffs worked without opening an OS file picker. |
| Publishing | Post was never clicked; all verification stayed in an unpublished test draft. |

The first live pass exposed two fixture gaps: modern LinkedIn places its temporary
image input directly under body, outside the original composer, and attached
albums use Edit → Add instead of Media. The adapter now handles both without
background work, private APIs, or injecting into the page's main JavaScript world.

LinkedIn controls insertion order between batches. It can insert new photos after
the currently selected photo; native reorder controls remain available. No claim
is made that every later batch is placed at the very end automatically.

Actual-account verification is limited to the core workflow above. Windows,
other languages/layouts, the full 20-image live limit, and native publishing are
not live-verified. No authenticated screenshots are committed to the repository.

## Extended manual checklist — pending

Use this checklist for broader release coverage on current Chrome on both a Mac
and Windows machine, signed into a test post draft. Do not publish as part of
this checklist. The core Mac workflow above has already passed.

1. Load `dist/` using Developer mode → Load unpacked. Refresh LinkedIn.
2. Open Start a post. Write a sentence and paste two different screenshots with
   Cmd+V / Ctrl+V. Confirm the text stays intact and the tray shows both images.
3. Remove one image, paste a third, click Add images to post, and complete Next
   if shown. Confirm exactly two native images in the correct order.
4. Paste another image and add it. Verify earlier native attachments survive
   without duplication. Repeat with a manually selected native attachment first.
5. Repeat in the full-page `/sharing/compose/` composer and its image editor.
6. Check image pasting in comments/messages follows LinkedIn's own behavior.
   Paste plain text into the post while a stack is open; it must remain normal.
7. Verify a 20-image batch, oversized-image feedback, removal/clear, and Save.
8. Close the composer with a stack open, then reopen it. Old images must be gone.
9. Confirm the LinkedIn uploader displays native previews before any publishing
   action. Check uploading an image does not open an unexpected OS file picker.
10. Discard the test draft without posting. Record browser version, OS, language,
    and which composer layout was exercised.

## Performance spot check

Use Chrome DevTools Performance on a LinkedIn tab with PasteStack enabled, then
disabled. Record an idle interval, paste a typical screenshot, and clear it.
There should be no PasteStack polling/timer activity at idle. Thumbnail work
should occur only on paste; heap-held files/URLs should be released after Clear
and garbage collection. Record actual numbers before making CPU/RAM claims.

## Release commands

```sh
npm ci
npx playwright install chromium
npm run package
npm audit --audit-level=high
git diff --check
git status --short
```

Increment both `package.json` and `public/manifest.json` together for releases.
Build output and ZIPs are ignored by Git; source, lockfile, icons, tests, and docs
are committed. No Web Store upload or GitHub push is part of the local build.
