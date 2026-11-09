# Release verification

## Automated result — 9 November 2026, version 0.2.0

The local macOS run loads the built Manifest V3 extension into a fresh persistent
Chromium profile. All HTTP requests in this profile are fulfilled with controlled
HTML fixtures; no live account is accessed. The clipboard keyboard test uses the
test browser's clipboard. Fixtures model static inputs, delayed/lazy mounting,
and a separate image-editor dialog. Three new regressions cover the live site's
transient body-mounted file inputs, mounting order, and existing-album Edit → Add
flow. Fixtures complement the separate signed-in check below.

39 tests passed. Eight new cases exercise the default automatic flow, Next
readiness, returning focus without changing text, later and queued pastes,
popup persistence/live changes, cancellation, and timeout recovery without
duplicate uploads. The original manual flow remains covered with its setting off.

Strict TypeScript checking and the production bundle budget
passed. The final package command reruns the checks and validates ZIP contents.
`npm audit` reports dependency advisories at the time it is run; it is not a
guarantee about future vulnerabilities.

## Automatic-flow signed-in verification — 9 November 2026

Loaded version 0.2.0 in the user's Chrome 156 on macOS, with LinkedIn in English.
Used a separate `/sharing/compose/` tab, generated test PNGs from the local
clipboard helper, and real Cmd+V. The original LinkedIn tab was left untouched.

| Check | Observed result |
| --- | --- |
| Default preference | Toolbar popup opened with automatic paste enabled. |
| First paste | Uploaded and advanced Next automatically, returning keyboard focus to the post text. Neither Add nor Next was clicked manually. |
| Immediate typing | Typed “PasteStack automatic test draft — do not publish.” without refocusing the editor. |
| Second separate paste | Both distinct images appeared side by side in one native post; the sentence stayed intact. Again no manual Add or Next. |
| Preference persistence | Saved manual mode, then restored automatic mode; reopening the popup confirmed automatic paste was on. |
| Publishing | Post was never clicked. The clearly labeled test draft was left open. |

Browser control initially timed out but recovered for the core automatic test.
The later optional manual-mode paste check was inconclusive while Chrome's page
rendering/control became unreliable again. Manual-mode paste behavior and live
preference changes remain covered by the 39 automated tests; the prior manual
live check is recorded below. No authenticated screenshots are committed.

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
2. With automatic mode on, open Start a post. Write a sentence and paste two
   different screenshots with Cmd+V / Ctrl+V. Confirm both native images, intact
   text, and returned keyboard focus without clicking Add or Next. Repeat with
   another paste during a transition.
3. Turn automatic mode off. In a fresh draft, paste two images, remove one,
   paste a third, click Add images to post, and complete Next if shown. Confirm
   exactly two native images. Restore automatic mode after testing.
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
should occur only for manual/recovery previews; heap-held files/URLs should be released after Clear
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
