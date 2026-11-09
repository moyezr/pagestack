const toggle = document.querySelector<HTMLInputElement>('#auto-paste')!;
const saveStatus = document.querySelector<HTMLElement>('#status')!;

chrome.storage.local.get('autoPaste').then((saved) => {
  toggle.checked = saved.autoPaste !== false;
  toggle.disabled = false;
  saveStatus.textContent = toggle.checked ? 'Automatic paste is on.' : 'Manual review is on.';
}, () => { saveStatus.textContent = 'Could not load your preference. Reopen this popup to retry.'; });

toggle.addEventListener('change', async () => {
  const requested = toggle.checked;
  toggle.disabled = true;
  try {
    await chrome.storage.local.set({ autoPaste: requested });
    saveStatus.textContent = requested ? 'Saved. Automatic paste is on.' : 'Saved. Manual review is on.';
  } catch {
    toggle.checked = !requested;
    saveStatus.textContent = 'Could not save. Try again.';
  } finally { toggle.disabled = false; }
});
