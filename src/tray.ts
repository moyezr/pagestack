import styles from './tray.css';

export interface ImageEntry {
  id: number;
  file: File;
  url: string;
  preview: string | null;
}

interface Actions {
  remove(id: number): void;
  clear(): void;
  attach(): void;
}

export class Tray {
  readonly host = document.createElement('div');
  private readonly root = this.host.attachShadow({ mode: 'open' });
  private readonly list = document.createElement('ol');
  private readonly count = document.createElement('span');
  private readonly status = document.createElement('p');
  private readonly add = document.createElement('button');
  private readonly clear = document.createElement('button');

  constructor(private readonly actions: Actions) {
    this.host.dataset.pastestack = '';
    const style = document.createElement('style');
    style.textContent = styles;
    const section = document.createElement('section');
    section.setAttribute('aria-label', 'PasteStack image stack');
    const header = document.createElement('header');
    const name = document.createElement('strong');
    name.textContent = 'PasteStack';
    header.append(name, this.count);
    this.list.setAttribute('aria-label', 'Pasted images');
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.setAttribute('aria-atomic', 'true');
    this.add.type = this.clear.type = 'button';
    this.add.className = 'primary';
    this.add.addEventListener('click', () => actions.attach());
    this.clear.textContent = 'Clear';
    this.clear.addEventListener('click', () => actions.clear());
    const footer = document.createElement('footer');
    footer.append(this.clear, this.add);
    section.append(header, this.list, this.status, footer);
    this.root.append(style, section);
  }

  render(entries: readonly ImageEntry[], message = '', busy = false): void {
    this.count.textContent = `${entries.length} / 20`;
    this.add.textContent = busy ? 'Adding…' : `Add ${entries.length === 1 ? 'image' : `${entries.length} images`} to post`;
    this.add.disabled = busy || entries.length === 0;
    this.clear.disabled = busy;
    this.status.textContent = message || 'Paste another image to add it. Add the stack before posting.';
    this.status.className = message ? 'notice' : '';
    const focused = this.root.activeElement?.getAttribute('data-remove');
    this.list.replaceChildren(...entries.map((entry, index) => {
      const item = document.createElement('li');
      item.dataset.image = String(entry.id);
      const image = document.createElement('img');
      if (entry.preview) image.src = entry.preview;
      image.alt = `Pasted image ${index + 1}`;
      image.decoding = 'async';
      image.width = 160;
      image.height = 100;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove';
      remove.textContent = '×';
      remove.disabled = busy;
      remove.dataset.remove = String(entry.id);
      remove.setAttribute('aria-label', `Remove image ${index + 1}`);
      remove.addEventListener('click', () => this.actions.remove(entry.id));
      const save = document.createElement('a');
      save.href = entry.url;
      save.download = `pastestack-${index + 1}.${entry.file.type === 'image/jpeg' ? 'jpg' : entry.file.type.split('/')[1]}`;
      save.textContent = 'Save';
      save.setAttribute('aria-label', `Save image ${index + 1}`);
      item.append(image, remove, save);
      return item;
    }));
    if (focused) {
      const next = this.root.querySelector<HTMLButtonElement>(`[data-remove="${focused}"]`) ?? this.root.querySelector<HTMLButtonElement>('[data-remove]');
      (next ?? this.add).focus();
    }
  }

  updatePreview(entry: ImageEntry): void {
    const image = this.list.querySelector<HTMLImageElement>(`[data-image="${entry.id}"] img`);
    if (image && entry.preview) image.src = entry.preview;
  }

  destroy(): void { this.host.remove(); }
}
