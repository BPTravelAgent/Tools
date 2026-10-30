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
  // ── Primary DM Font Collection (Always Pinned at Top) ──
  { name: 'DM Sans', family: 'DM Sans', category: 'document' },
  { name: 'DM Mono', family: 'DM Mono', category: 'document' },
  { name: 'DM Serif Display', family: 'DM Serif Display', category: 'document' },

  // Document Fonts (Bundled TTF files)
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

  private isDMFont(name: string): boolean {
    const clean = (name || '').toLowerCase().trim();
    return clean.startsWith('dm ') || clean.startsWith('dm-') || clean === 'dm' || clean.startsWith('dmsans');
  }

  private sortWithDMPriority(list: FontEntry[]): FontEntry[] {
    return [...list].sort((a, b) => {
      const aDM = this.isDMFont(a.name);
      const bDM = this.isDMFont(b.name);
      if (aDM && !bDM) return -1;
      if (!aDM && bDM) return 1;
      return 0;
    });
  }

  getAllFonts(): FontEntry[] {
    const customList = Array.from(this.customFonts.values());
    const combined = [...DEFAULT_FONTS, ...customList];
    return this.sortWithDMPriority(combined);
  }

  searchFonts(query: string): FontEntry[] {
    const all = this.getAllFonts();
    const cleanQ = query.trim().toLowerCase();
    if (!cleanQ) return all;
    const filtered = all.filter(
      (f) => f.name.toLowerCase().includes(cleanQ) || f.family.toLowerCase().includes(cleanQ)
    );
    return this.sortWithDMPriority(filtered);
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

  const isDMFont = (fontName: string) => {
    const lower = (fontName || '').toLowerCase().trim();
    return lower.startsWith('dm ') || lower.startsWith('dm-') || lower === 'dm' || lower.startsWith('dmsans');
  };

  // Trigger Button
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `font-picker-btn ${options.buttonClass || ''} ${options.compact ? 'compact' : ''}`;
  btn.setAttribute('aria-haspopup', 'true');
  btn.setAttribute('aria-expanded', 'false');

  const updateBtnText = () => {
    const isDM = isDMFont(currentFont);
    btn.innerHTML = `
      <span class="font-picker-label" style="font-family: '${currentFont}', sans-serif;">
        ${isDM ? '<span class="font-btn-dm-tag">DM</span> ' : ''}${currentFont}
      </span>
      <span class="font-picker-chevron">${ICONS.chevronDown}</span>
    `;
    btn.title = `Font: ${currentFont} (Click to change or search)`;
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

  // Dropdown Menu Panel - Portal mounted directly to body to avoid clipping by modals, overflow, or fullscreen
  const menu = document.createElement('div');
  menu.className = 'font-picker-dropdown';
  menu.style.display = 'none';
  menu.style.position = 'fixed';
  document.body.appendChild(menu);

  // Header: Search Input & Add Font Button
  const header = document.createElement('div');
  header.className = 'font-picker-header';

  const searchBox = document.createElement('div');
  searchBox.className = 'font-picker-search-box';
  searchBox.innerHTML = `
    <span class="font-picker-search-icon">${ICONS.search}</span>
    <input type="text" class="font-picker-search-input" placeholder="Search fonts (DM, Sans, Serif...)" />
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

  const updatePosition = () => {
    if (!isOpen) return;
    const btnRect = btn.getBoundingClientRect();
    if (btnRect.width === 0 && btnRect.height === 0) {
      closeDropdown();
      return;
    }

    const dropdownWidth = Math.min(310, window.innerWidth - 20);
    const dropdownHeight = 340;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const spaceBelow = viewportHeight - btnRect.bottom;
    const spaceAbove = btnRect.top;

    let top = 0;
    let isTop = false;

    // Viewport-aware vertical position: if space below is too small, open upwards
    if (spaceBelow < 280 && spaceAbove > spaceBelow) {
      top = Math.max(10, btnRect.top - dropdownHeight - 6);
      isTop = true;
    } else {
      top = btnRect.bottom + 6;
      if (top + dropdownHeight > viewportHeight - 10) {
        top = Math.max(10, viewportHeight - dropdownHeight - 10);
      }
    }

    // Viewport-aware horizontal position: ensure no overflow off screen
    let left = btnRect.left;
    if (left + dropdownWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - dropdownWidth - 12);
    }
    if (left < 12) {
      left = 12;
    }

    menu.style.top = `${Math.round(top)}px`;
    menu.style.left = `${Math.round(left)}px`;
    menu.style.width = `${dropdownWidth}px`;
    menu.style.zIndex = '999999';

    if (isTop) {
      menu.classList.add('pos-top');
      menu.classList.remove('pos-bottom');
    } else {
      menu.classList.add('pos-bottom');
      menu.classList.remove('pos-top');
    }
  };

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

    // Always separate DM fonts so they appear prominently at the very top
    const dmFonts = fonts.filter((f) => isDMFont(f.name));
    const customFonts = fonts.filter((f) => f.isCustom && !isDMFont(f.name));
    const regularFonts = fonts.filter((f) => !f.isCustom && !isDMFont(f.name));

    const appendGroup = (title: string, groupFonts: FontEntry[], isDMGroup: boolean = false) => {
      if (groupFonts.length === 0) return;
      const grpHeader = document.createElement('div');
      grpHeader.className = `font-picker-group-title ${isDMGroup ? 'dm-group' : ''}`;
      grpHeader.innerHTML = isDMGroup 
        ? `<span>★ PRIMARY DM FONT COLLECTION</span>` 
        : `<span>${title}</span>`;
      listContainer.appendChild(grpHeader);

      for (const f of groupFonts) {
        const item = document.createElement('div');
        const isSelected = f.name.toLowerCase() === currentFont.toLowerCase() || f.family.toLowerCase() === currentFont.toLowerCase();
        item.className = `font-picker-item ${isSelected ? 'selected' : ''} ${isDMGroup ? 'dm-item' : ''}`;

        const leftWrap = document.createElement('div');
        leftWrap.className = 'font-picker-item-left';

        const nameRow = document.createElement('div');
        nameRow.className = 'font-picker-name-row';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'font-picker-item-name';
        nameSpan.innerText = f.name;
        nameRow.appendChild(nameSpan);

        if (isDMGroup) {
          const dmBadge = document.createElement('span');
          dmBadge.className = 'font-dm-badge';
          dmBadge.innerText = 'Primary';
          nameRow.appendChild(dmBadge);
        }

        const previewSpan = document.createElement('span');
        previewSpan.className = 'font-picker-item-preview';
        previewSpan.innerText = 'The quick brown fox jumps 123';
        previewSpan.style.fontFamily = `'${f.family}', sans-serif`;

        leftWrap.appendChild(nameRow);
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

    // 1. DM Family Always at the Top
    if (dmFonts.length > 0) {
      appendGroup('★ DM Font Collection', dmFonts, true);
    }
    // 2. Custom Uploaded Fonts
    if (customFonts.length > 0) {
      appendGroup('Custom Uploaded Fonts', customFonts);
    }
    // 3. Document & Standard Fonts
    if (regularFonts.length > 0) {
      appendGroup('Standard & System Fonts', regularFonts);
    }
  };

  const openDropdown = () => {
    isOpen = true;
    menu.style.display = 'flex';
    updatePosition();
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('active');
    searchQuery = '';
    searchInput.value = '';
    renderList();
    requestAnimationFrame(() => {
      updatePosition();
      searchInput.focus();
    });
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
    updatePosition();
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDropdown();
      btn.focus();
    }
  });

  // Close when clicking outside both container and menu
  const onDocClick = (e: MouseEvent) => {
    const target = e.target as Node;
    if (!container.contains(target) && !menu.contains(target)) {
      if (isOpen) closeDropdown();
    }
  };
  document.addEventListener('mousedown', onDocClick);

  // Sync position on scroll or resize
  const onWinScroll = (ev: Event) => {
    if (!isOpen) return;
    if (menu.contains(ev.target as Node)) return;
    updatePosition();
  };
  const onWinResize = () => {
    if (isOpen) updatePosition();
  };

  window.addEventListener('scroll', onWinScroll, true);
  window.addEventListener('resize', onWinResize);

  // Sync when fontManager changes
  fontManager.onChange(() => {
    if (isOpen) renderList();
  });

  // Clean up when container is removed from DOM
  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      menu.remove();
      window.removeEventListener('scroll', onWinScroll, true);
      window.removeEventListener('resize', onWinResize);
      document.removeEventListener('mousedown', onDocClick);
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  container.appendChild(btn);
  container.appendChild(fileInput);

  // Attach public updater
  (container as any).setCurrentFont = (newFont: string) => {
    currentFont = newFont;
    updateBtnText();
  };

  return container;
}
