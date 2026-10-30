// Centralized Font Manager with Custom Font Upload, Persistence (IndexedDB), and Live Search
import { ICONS } from './icons';

export interface FontEntry {
  name: string;
  family: string;
  category: 'document' | 'system' | 'custom';
  isCustom?: boolean;
  bytes?: Uint8Array;
}

const DEFAULT_FONTS: FontEntry[] = [
  // Document Fonts (Bundled TTF files)
  { name: 'DM Sans', family: 'DM Sans', category: 'document' },
  { name: 'Libre Baskerville', family: 'Libre Baskerville', category: 'document' },
  { name: 'Liberation Sans', family: 'Liberation Sans', category: 'document' },

  // System & Web Fonts
  { name: 'Arial', family: 'Arial', category: 'system' },
  { name: 'Helvetica', family: 'Helvetica', category: 'system' },
  { name: 'Times New Roman', family: 'Times New Roman', category: 'system' },
  { name: 'Courier New', family: 'Courier New', category: 'system' },
  { name: 'Georgia', family: 'Georgia', category: 'system' },
  { name: 'Verdana', family: 'Verdana', category: 'system' },
  { name: 'Trebuchet MS', family: 'Trebuchet MS', category: 'system' },
  { name: 'Tahoma', family: 'Tahoma', category: 'system' },
  { name: 'Impact', family: 'Impact', category: 'system' },
  { name: 'Comic Sans MS', family: 'Comic Sans MS', category: 'system' },
  { name: 'Palatino Linotype', family: 'Palatino Linotype', category: 'system' },
  { name: 'Garamond', family: 'Garamond', category: 'system' },
  { name: 'Lucida Console', family: 'Lucida Console', category: 'system' },
];

const DB_NAME = 'BPPDF_FontsDB';
const DB_VERSION = 1;
const STORE_NAME = 'custom_fonts';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported'));
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class FontManager {
  private static instance: FontManager | null = null;
  private customFonts: Map<string, FontEntry> = new Map();
  private listeners: Set<() => void> = new Set();
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): FontManager {
    if (!FontManager.instance) {
      FontManager.instance = new FontManager();
    }
    return FontManager.instance;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = async () => {
        const records = req.result as Array<{ name: string; family: string; bytes: Uint8Array }>;
        for (const rec of records) {
          const entry: FontEntry = {
            name: rec.name,
            family: rec.family,
            category: 'custom',
            isCustom: true,
            bytes: new Uint8Array(rec.bytes),
          };
          this.customFonts.set(rec.name.toLowerCase(), entry);
          await this.registerBrowserFont(entry.family, entry.bytes!);
        }
        this.notifyListeners();
      };
    } catch (e) {
      console.warn('Could not load custom fonts from IndexedDB:', e);
    }
  }

  private async registerBrowserFont(family: string, bytes: Uint8Array): Promise<void> {
    if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
    try {
      const fontFace = new FontFace(family, bytes as any);
      await fontFace.load();
      document.fonts.add(fontFace);
    } catch (err) {
      console.warn(`Browser FontFace registration failed for ${family}:`, err);
    }
  }

  async addCustomFont(file: File): Promise<FontEntry> {
    const rawBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(rawBuffer);

    // Clean font family name from file name (e.g. "MyFont-Bold.ttf" -> "MyFont-Bold")
    const baseName = file.name.replace(/\.(ttf|otf|woff|woff2)$/i, '').trim();
    const fontName = baseName || 'CustomFont';

    const entry: FontEntry = {
      name: fontName,
      family: fontName,
      category: 'custom',
      isCustom: true,
      bytes,
    };

    // 1. Register with browser for instant rendering
    await this.registerBrowserFont(fontName, bytes);

    // 2. Add to in-memory collection
    this.customFonts.set(fontName.toLowerCase(), entry);

    // 3. Persist to IndexedDB
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put({
        name: fontName,
        family: fontName,
        bytes,
        addedAt: Date.now(),
      });
    } catch (e) {
      console.warn('Failed to save font to IndexedDB:', e);
    }

    this.notifyListeners();
    return entry;
  }

  async removeCustomFont(fontName: string): Promise<void> {
    this.customFonts.delete(fontName.toLowerCase());

    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(fontName);
    } catch (e) {
      console.warn('Failed to delete font from IndexedDB:', e);
    }

    this.notifyListeners();
  }

  getAllFonts(): FontEntry[] {
    const customList = Array.from(this.customFonts.values());
    return [...customList, ...DEFAULT_FONTS];
  }

  searchFonts(query: string): FontEntry[] {
    const all = this.getAllFonts();
    const cleanQ = query.trim().toLowerCase();
    if (!cleanQ) return all;
    return all.filter(
      (f) => f.name.toLowerCase().includes(cleanQ) || f.family.toLowerCase().includes(cleanQ)
    );
  }

  getFont(fontFamily: string): FontEntry | undefined {
    const clean = (fontFamily || '').trim().toLowerCase();
    if (this.customFonts.has(clean)) {
      return this.customFonts.get(clean);
    }
    return DEFAULT_FONTS.find(
      (f) => f.name.toLowerCase() === clean || f.family.toLowerCase() === clean
    );
  }

  getCustomFontBytes(fontFamily: string): Uint8Array | undefined {
    const clean = (fontFamily || '').trim().toLowerCase();
    const custom = this.customFonts.get(clean);
    if (custom && custom.bytes) return custom.bytes;

    // Search by partial match if user font family has quotes or slight variation
    for (const [key, font] of this.customFonts.entries()) {
      if (clean.includes(key) || key.includes(clean)) {
        return font.bytes;
      }
    }
    return undefined;
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((fn) => fn());
  }
}

export const fontManager = FontManager.getInstance();

// Reusable Searchable Font Picker Component Factory
export interface FontPickerOptions {
  currentFont: string;
  onSelect: (fontName: string) => void;
  className?: string;
  buttonClass?: string;
  dropdownPosition?: 'top' | 'bottom';
  compact?: boolean;
}

export function createSearchableFontPicker(options: FontPickerOptions): HTMLElement {
  const container = document.createElement('div');
  container.className = `font-picker-container ${options.className || ''}`;

  let currentFont = options.currentFont || 'DM Sans';
  let isOpen = false;
  let searchQuery = '';

  // Trigger Button
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `font-picker-btn ${options.buttonClass || ''} ${options.compact ? 'compact' : ''}`;
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');

  const updateBtnText = () => {
    btn.innerHTML = `
      <span class="font-picker-label" style="font-family: '${currentFont}', sans-serif;">${currentFont}</span>
      <span class="font-picker-chevron">${ICONS.chevronDown}</span>
    `;
    btn.title = `Current Font: ${currentFont} (Click to change or search)`;
  };
  updateBtnText();

  // Hidden Font File Input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.ttf,.otf,.woff,.woff2';
  fileInput.style.display = 'none';

  fileInput.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      try {
        const added = await fontManager.addCustomFont(file);
        currentFont = added.name;
        updateBtnText();
        options.onSelect(added.name);
        closeDropdown();
      } catch (err) {
        console.error('Error adding custom font:', err);
        alert('Could not load font file. Please provide a valid .ttf or .otf font.');
      }
    }
  });

  // Dropdown Menu Panel
  const menu = document.createElement('div');
  menu.className = `font-picker-dropdown ${options.dropdownPosition === 'top' ? 'pos-top' : 'pos-bottom'}`;
  menu.style.display = 'none';

  // Header: Search Input & Add Font Button
  const header = document.createElement('div');
  header.className = 'font-picker-header';

  const searchBox = document.createElement('div');
  searchBox.className = 'font-picker-search-box';
  searchBox.innerHTML = `
    <span class="font-picker-search-icon">${ICONS.search}</span>
    <input type="text" class="font-picker-search-input" placeholder="Search fonts..." />
  `;

  const searchInput = searchBox.querySelector('.font-picker-search-input') as HTMLInputElement;

  const btnAdd = document.createElement('button');
  btnAdd.type = 'button';
  btnAdd.className = 'font-picker-add-btn';
  btnAdd.innerHTML = `${ICONS.plus} <span>Add Font</span>`;
  btnAdd.title = 'Upload a custom font file (.ttf, .otf, .woff)';
  btnAdd.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    fileInput.value = '';
    fileInput.click();
  });

  header.appendChild(searchBox);
  header.appendChild(btnAdd);

  // Scrollable list container
  const listContainer = document.createElement('div');
  listContainer.className = 'font-picker-list';

  menu.appendChild(header);
  menu.appendChild(listContainer);

  const renderList = () => {
    listContainer.innerHTML = '';
    const fonts = fontManager.searchFonts(searchQuery);

    if (fonts.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'font-picker-empty';
      empty.innerHTML = `
        <p>No fonts found for "${searchQuery}"</p>
        <button type="button" class="font-picker-upload-hint">${ICONS.upload} Upload this font (.ttf/.otf)</button>
      `;
      empty.querySelector('button')?.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });
      listContainer.appendChild(empty);
      return;
    }

    // Group: Custom Fonts vs System/Document
    const customFonts = fonts.filter((f) => f.isCustom);
    const regularFonts = fonts.filter((f) => !f.isCustom);

    const appendGroup = (title: string, groupFonts: FontEntry[]) => {
      if (groupFonts.length === 0) return;
      const grpHeader = document.createElement('div');
      grpHeader.className = 'font-picker-group-title';
      grpHeader.innerText = title;
      listContainer.appendChild(grpHeader);

      for (const f of groupFonts) {
        const item = document.createElement('div');
        const isSelected = f.name.toLowerCase() === currentFont.toLowerCase() || f.family.toLowerCase() === currentFont.toLowerCase();
        item.className = `font-picker-item ${isSelected ? 'selected' : ''}`;

        const leftWrap = document.createElement('div');
        leftWrap.className = 'font-picker-item-left';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'font-picker-item-name';
        nameSpan.innerText = f.name;

        const previewSpan = document.createElement('span');
        previewSpan.className = 'font-picker-item-preview';
        previewSpan.innerText = 'Aa Bb Gg 123';
        previewSpan.style.fontFamily = `'${f.family}', sans-serif`;

        leftWrap.appendChild(nameSpan);
        leftWrap.appendChild(previewSpan);

        item.appendChild(leftWrap);

        // Delete button for custom uploaded fonts
        if (f.isCustom) {
          const badge = document.createElement('span');
          badge.className = 'font-custom-badge';
          badge.innerText = 'Custom';
          item.appendChild(badge);

          const delBtn = document.createElement('button');
          delBtn.type = 'button';
          delBtn.className = 'font-del-btn';
          delBtn.title = 'Remove this custom font';
          delBtn.innerHTML = ICONS.trash;
          delBtn.addEventListener('click', async (delEv) => {
            delEv.stopPropagation();
            if (confirm(`Remove custom font "${f.name}"?`)) {
              await fontManager.removeCustomFont(f.name);
              if (currentFont.toLowerCase() === f.name.toLowerCase()) {
                currentFont = 'DM Sans';
                updateBtnText();
                options.onSelect(currentFont);
              }
              renderList();
            }
          });
          item.appendChild(delBtn);
        }

        if (isSelected) {
          const checkIcon = document.createElement('span');
          checkIcon.className = 'font-picker-check';
          checkIcon.innerHTML = ICONS.check;
          item.appendChild(checkIcon);
        }

        item.addEventListener('click', () => {
          currentFont = f.name;
          updateBtnText();
          options.onSelect(f.name);
          closeDropdown();
        });

        listContainer.appendChild(item);
      }
    };

    if (customFonts.length > 0) {
      appendGroup('Custom Uploaded Fonts', customFonts);
    }
    appendGroup('Document & Standard Fonts', regularFonts);
  };

  const openDropdown = () => {
    isOpen = true;
    menu.style.display = 'flex';
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('active');
    searchQuery = '';
    searchInput.value = '';
    renderList();
    setTimeout(() => searchInput.focus(), 30);
  };

  const closeDropdown = () => {
    isOpen = false;
    menu.style.display = 'none';
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('active');
  };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderList();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
      btn.focus();
    }
  });

  // Close when clicking outside
  const onDocClick = (e: MouseEvent) => {
    if (!container.contains(e.target as Node)) {
      if (isOpen) closeDropdown();
    }
  };
  document.addEventListener('click', onDocClick);

  // Sync when fontManager changes (e.g. font added in another picker)
  fontManager.onChange(() => {
    if (isOpen) renderList();
  });

  container.appendChild(btn);
  container.appendChild(fileInput);
  container.appendChild(menu);

  // Attach a public updater so external code can change currentFont smoothly
  (container as any).setCurrentFont = (newFont: string) => {
    currentFont = newFont;
    updateBtnText();
  };

  return container;
}
