export const preferences = { autoPaste: true };
let changed = false;
let notify = () => {};
export function observePreference(callback: () => void): void { notify = callback; }

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.autoPaste) {
    changed = true;
    preferences.autoPaste = changes.autoPaste.newValue !== false;
    notify();
  }
});

// One small read, with no polling or background worker. A settings failure falls
// back to manual review rather than unexpectedly advancing an image editor.
export const settingsReady = chrome.storage.local.get('autoPaste').then((saved) => {
  if (!changed) preferences.autoPaste = saved.autoPaste !== false;
}, () => { if (!changed) preferences.autoPaste = false; });
