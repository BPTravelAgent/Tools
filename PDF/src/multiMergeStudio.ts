import * as pdfjsLib from 'pdfjs-dist';
import { ExportEngine } from './exportEngine';
import { PDFManager } from './pdfManager';
import { getAssetUrl } from './utils';
import type { AnnotationManager } from './annotationManager';
import type { TrueEditManager } from './trueEditManager';
import type { MergePagePlanItem, MergeSourceDoc, NormalizePagesOptions, PageFitMode } from './types';

export interface MultiMergeStudioCallbacks {
  getPDFManager: () => PDFManager;
  getAnnotationManager: () => AnnotationManager;
  getTrueEditManager: () => TrueEditManager;
  parsePageRange: (rangeStr: string, totalPages: number) => number[];
  formatBytes: (bytes: number) => string;
  showProcessing: (title: string, desc: string) => void;
  updateProcessing: (percent: number, statusText: string) => void;
  hideProcessing: () => void;
  onOpenMergedInEditor: (bytes: Uint8Array, fileName: string, openCompressAfter?: boolean) => Promise<void>;
  onDownloadSuccess: () => void;
}

interface QueuedMergeFile {
  id: string;
  name: string;
  bytes: Uint8Array;
  fileSize: number;
  pageCount: number;
  isCurrentDoc?: boolean;
  pageDims: Array<{ width: number; height: number }>;
  rangeStr: string;
  pdfProxy: any | null;
  thumbCache: Map<number, string>;
  color: string;
}

interface OrganizedPageSlot {
  slotId: string;
  sourceId: string;
  pageIndex: number;
  rotationDelta: number;
}

const SOURCE_BADGE_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2', '#ea580c'];

export class MultiMergeStudioModal {
  private callbacks: MultiMergeStudioCallbacks;
  private modalEl: HTMLElement | null = null;
  private files: QueuedMergeFile[] = [];
  private pagePlan: OrganizedPageSlot[] = [];
  private viewMode: 'files' | 'pages' = 'files';
  private isCustomPageOrder: boolean = false;
  private draggedFileIndex: number | null = null;
  private draggedSlotIndex: number | null = null;
  private renderToken: number = 0;
  private slotCounter: number = 0;

  constructor(callbacks: MultiMergeStudioCallbacks) {
    this.callbacks = callbacks;
  }

  public mount(parentEl: HTMLElement): void {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal-backdrop hidden" id="multiMergeModal">
        <div class="modal-card modal-card-xxl">
          <div class="modal-header-custom">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:22px;">📚</span>
              <div>
                <h2 class="modal-title" style="margin:0; font-size:18px;">Multi-PDF Merge &amp; Page Organizer Studio</h2>
                <div style="font-size:11.5px; color:#64748b; margin-top:2px;">Combine multiple PDFs &amp; images, reorder or interleave individual pages visually, rotate, and unify page sizes</div>
              </div>
            </div>
            <button type="button" class="modal-close-btn" id="btnCloseMultiMergeModal">&times;</button>
          </div>

          <div class="modal-body-custom">
            <!-- Top Bar: Add Files + View Switcher + Tools -->
            <div class="mm-topbar">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <input type="file" id="mmFileInput" accept="application/pdf,image/*" multiple style="display:none;" />
                <button type="button" class="btn btn-crimson" id="btnMmAddFiles" style="padding:7px 14px; font-size:13px;">
                  ➕ Add PDFs / Images
                </button>
                <button type="button" class="btn btn-outline hidden" id="btnMmIncludeCurrent" style="padding:7px 12px; font-size:12.5px;">
                  📄 + Include Current Open PDF
                </button>
              </div>

              <div class="mm-view-tabs" id="mmViewTabs">
                <button type="button" class="mm-view-tab active" data-mm-view="files">📁 Files Queue</button>
                <button type="button" class="mm-view-tab" data-mm-view="pages">🧩 Page Organizer Grid</button>
              </div>
            </div>

            <!-- Dropzone (always visible as compact drop bar when files exist, or large when empty) -->
            <div class="mm-dropzone" id="mmDropzone">
              <div style="font-size:28px; margin-bottom:6px;">📑</div>
              <div style="font-weight:700; font-size:14px; color:#1e293b;">Drop multiple PDF files or Images (JPG, PNG, WebP) here</div>
              <div style="font-size:12px; color:#64748b; margin-top:3px;">Select 2, 5, 10+ PDFs at once — drag to reorder files or arrange individual pages</div>
            </div>

            <!-- Files Queue View -->
            <div id="mmFilesView" class="hidden">
              <div class="mm-section-bar">
                <span id="mmFilesCountText" style="font-size:12.5px; font-weight:700; color:#334155;">0 Documents queued</span>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button type="button" class="mm-mini-btn" id="btnMmSortAZ" title="Sort files alphabetically">A–Z Sort</button>
                  <button type="button" class="mm-mini-btn" id="btnMmReverseFiles" title="Reverse file order">⇅ Reverse Order</button>
                  <button type="button" class="mm-mini-btn danger" id="btnMmClearAll" title="Remove all files">🗑 Clear All</button>
                </div>
              </div>
              <div class="mm-files-list" id="mmFilesList"></div>
            </div>

            <!-- Page Organizer Grid View -->
            <div id="mmPagesView" class="hidden">
              <div class="mm-section-bar">
                <span id="mmPagesCountText" style="font-size:12.5px; font-weight:700; color:#334155;">0 Pages selected</span>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                  <button type="button" class="mm-mini-btn" id="btnMmInterleave" title="Alternate pages across queued PDFs (Doc1 P1, Doc2 P1, Doc1 P2...)">⇄ Interleave Pages</button>
                  <button type="button" class="mm-mini-btn" id="btnMmReversePages" title="Reverse all pages">⇅ Reverse Pages</button>
                  <button type="button" class="mm-mini-btn" id="btnMmRotateAll90" title="Rotate all queued pages 90° right">↻ Rotate All 90°</button>
                  <button type="button" class="mm-mini-btn hidden" id="btnMmResetPlan" title="Rebuild page grid from Files Queue">↺ Sync from Files</button>
                </div>
              </div>
              <div class="mm-pages-grid" id="mmPagesGrid"></div>
            </div>

            <!-- Bottom Options Bar: Size Unification + Filename -->
            <div class="mm-options-footer" id="mmOptionsFooter">
              <div class="mm-mixed-alert hidden" id="mmMixedAlert">
                ⚠️ Queued PDFs have differing page sizes — you can unify them below!
              </div>
              <div class="mm-options-grid">
                <div>
                  <label class="norm-field-label" for="mmOutputName">Merged PDF Filename</label>
                  <input type="text" id="mmOutputName" class="norm-input" value="Merged_Document.pdf" />
                </div>
                <div>
                  <label class="norm-field-label" for="mmUnifyPreset">Page Size &amp; Layout</label>
                  <select id="mmUnifyPreset" class="norm-select">
                    <option value="none" selected>Keep Original Page Sizes</option>
                    <option value="match_first">Unify All to Match 1st Page</option>
                    <option value="a4_portrait">Unify All to A4 Portrait (595 × 842 pt)</option>
                    <option value="letter_portrait">Unify All to US Letter Portrait (612 × 792 pt)</option>
                    <option value="a4_landscape">Unify All to A4 Landscape (842 × 595 pt)</option>
                  </select>
                </div>
                <div id="mmUnifyFitCol" class="hidden">
                  <label class="norm-field-label" for="mmUnifyFit">Fit Method</label>
                  <select id="mmUnifyFit" class="norm-select">
                    <option value="contain" selected>Fit Inside (No Crop)</option>
                    <option value="cover">Fill Page (Crop Edges)</option>
                    <option value="stretch">Stretch Exact</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer-custom" style="justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span id="mmSummaryText" style="font-size:12px; font-weight:600; color:#475569;">Add PDFs to begin merging</span>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn-outline" id="btnMmCancel">Cancel</button>
              <button type="button" class="btn btn-outline" id="btnMmOpenEditor" disabled title="Merge and load directly into PDF Editor">
                🔄 Open in Editor
              </button>
              <button type="button" class="btn btn-outline" id="btnMmMergeCompress" disabled title="Merge and open Compression / Target Size Studio">
                ⚡ Merge &amp; Compress...
              </button>
              <button type="button" class="btn btn-crimson" id="btnMmDownload" disabled>
                📥 Merge &amp; Download
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    this.modalEl = wrapper.firstElementChild as HTMLElement;
    parentEl.appendChild(this.modalEl);
    this.setupListeners();
  }

  private setupListeners(): void {
    document.getElementById('btnCloseMultiMergeModal')?.addEventListener('click', () => this.close());
    document.getElementById('btnMmCancel')?.addEventListener('click', () => this.close());

    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    const fileInput = document.getElementById('mmFileInput') as HTMLInputElement | null;
    document.getElementById('btnMmAddFiles')?.addEventListener('click', () => {
      if (fileInput) {
        fileInput.value = '';
        fileInput.click();
      }
    });

    fileInput?.addEventListener('change', async (e) => {
      const picked = Array.from((e.target as HTMLInputElement).files || []);
      if (picked.length > 0) await this.addExternalFiles(picked);
    });

    const dropzone = document.getElementById('mmDropzone');
    dropzone?.addEventListener('click', () => {
      if (fileInput) {
        fileInput.value = '';
        fileInput.click();
      }
    });
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone?.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-over');
    });
    dropzone?.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
      const dropped = Array.from(e.dataTransfer?.files || []);
      if (dropped.length > 0) await this.addExternalFiles(dropped);
    });

    document.getElementById('btnMmIncludeCurrent')?.addEventListener('click', async () => {
      await this.includeCurrentOpenDocument();
    });

    // View tabs
    document.querySelectorAll('#mmViewTabs .mm-view-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const view = (tab.getAttribute('data-mm-view') || 'files') as 'files' | 'pages';
        this.switchView(view);
      });
    });

    // Files tools
    document.getElementById('btnMmSortAZ')?.addEventListener('click', () => {
      this.files.sort((a, b) => a.name.localeCompare(b.name));
      this.isCustomPageOrder = false;
      this.syncPlanFromFiles();
      this.render();
    });
    document.getElementById('btnMmReverseFiles')?.addEventListener('click', () => {
      this.files.reverse();
      this.isCustomPageOrder = false;
      this.syncPlanFromFiles();
      this.render();
    });
    document.getElementById('btnMmClearAll')?.addEventListener('click', () => {
      this.destroyProxies();
      this.files = [];
      this.pagePlan = [];
      this.isCustomPageOrder = false;
      this.render();
    });

    // Organizer tools
    document.getElementById('btnMmInterleave')?.addEventListener('click', () => {
      this.interleavePages();
    });
    document.getElementById('btnMmReversePages')?.addEventListener('click', () => {
      this.pagePlan.reverse();
      this.isCustomPageOrder = true;
      this.render();
    });
    document.getElementById('btnMmRotateAll90')?.addEventListener('click', () => {
      this.pagePlan.forEach((slot) => {
        slot.rotationDelta = (slot.rotationDelta + 90) % 360;
      });
      this.isCustomPageOrder = true;
      this.render();
    });
    document.getElementById('btnMmResetPlan')?.addEventListener('click', () => {
      this.isCustomPageOrder = false;
      this.syncPlanFromFiles();
      this.render();
    });

    // Unify dropdown
    const unifySel = document.getElementById('mmUnifyPreset') as HTMLSelectElement | null;
    unifySel?.addEventListener('change', () => {
      document.getElementById('mmUnifyFitCol')?.classList.toggle('hidden', unifySel.value === 'none');
    });

    // Actions
    document.getElementById('btnMmOpenEditor')?.addEventListener('click', () => this.executeMerge('editor'));
    document.getElementById('btnMmMergeCompress')?.addEventListener('click', () => this.executeMerge('compress'));
    document.getElementById('btnMmDownload')?.addEventListener('click', () => this.executeMerge('download'));
  }

  public async open(): Promise<void> {
    this.destroyProxies();
    this.files = [];
    this.pagePlan = [];
    this.isCustomPageOrder = false;
    this.viewMode = 'files';

    const unifySel = document.getElementById('mmUnifyPreset') as HTMLSelectElement | null;
    if (unifySel) unifySel.value = 'none';
    document.getElementById('mmUnifyFitCol')?.classList.add('hidden');

    const pdfManager = this.callbacks.getPDFManager();
    const outInput = document.getElementById('mmOutputName') as HTMLInputElement | null;

    if (pdfManager.getPageCount() > 0) {
      if (outInput) {
        const clean = pdfManager.getFileName().replace(/\.pdf$/i, '');
        outInput.value = `${clean}_merged.pdf`;
      }
      this.modalEl?.classList.remove('hidden');
      await this.includeCurrentOpenDocument();
    } else {
      if (outInput) outInput.value = 'Merged_Document.pdf';
      this.render();
      this.modalEl?.classList.remove('hidden');
    }
  }

  public close(): void {
    this.renderToken++;
    this.destroyProxies();
    this.files = [];
    this.pagePlan = [];
    this.modalEl?.classList.add('hidden');
  }

  private destroyProxies(): void {
    for (const f of this.files) {
      if (f.pdfProxy && typeof f.pdfProxy.destroy === 'function') {
        try {
          f.pdfProxy.destroy();
        } catch (_) {}
      }
    }
  }

  private async includeCurrentOpenDocument(): Promise<void> {
    const pdfManager = this.callbacks.getPDFManager();
    if (pdfManager.getPageCount() === 0) return;
    if (this.files.some((f) => f.isCurrentDoc)) return;

    this.callbacks.showProcessing('Preparing Current Document...', 'Capturing open pages & edits...');
    try {
      const bytes = await ExportEngine.exportPDF(
        pdfManager,
        this.callbacks.getAnnotationManager(),
        this.callbacks.getTrueEditManager()
      );
      await this.appendPDFBytes(bytes, pdfManager.getFileName(), true);
    } catch (err) {
      alert('Could not include open document: ' + (err as Error).message);
    } finally {
      this.callbacks.hideProcessing();
    }
  }

  private async addExternalFiles(fileList: File[]): Promise<void> {
    const validFiles = fileList.filter(
      (f) =>
        f.type === 'application/pdf' ||
        f.name.toLowerCase().endsWith('.pdf') ||
        f.type.startsWith('image/')
    );
    if (validFiles.length === 0) {
      alert('Please select PDF or Image files (JPG, PNG, WebP).');
      return;
    }

    this.callbacks.showProcessing('Loading Files...', `Reading ${validFiles.length} file(s)...`);
    try {
      for (let i = 0; i < validFiles.length; i++) {
        const f = validFiles[i];
        this.callbacks.updateProcessing(
          Math.round(((i + 1) / validFiles.length) * 90),
          `Loading "${f.name}" (${i + 1}/${validFiles.length})...`
        );

        const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          const buf = await f.arrayBuffer();
          await this.appendPDFBytes(new Uint8Array(buf), f.name, false);
        } else {
          const imgPdfBytes = await ExportEngine.createPDFFromImages([f]);
          await this.appendPDFBytes(imgPdfBytes, f.name.replace(/\.[^/.]+$/, '') + '.pdf', false);
        }
      }
    } catch (err) {
      alert('Failed to read one of the selected files: ' + (err as Error).message);
    } finally {
      this.callbacks.hideProcessing();
    }
  }

  private async appendPDFBytes(bytes: Uint8Array, name: string, isCurrentDoc: boolean): Promise<void> {
    const loadingTask = pdfjsLib.getDocument({
      data: bytes.slice(),
      cMapUrl: getAssetUrl('cmaps/'),
      cMapPacked: true,
      standardFontDataUrl: getAssetUrl('standard_fonts/'),
    });
    const proxy = await loadingTask.promise;
    const pageCount = proxy.numPages;
    const pageDims: Array<{ width: number; height: number }> = [];

    for (let p = 1; p <= pageCount; p++) {
      const pg = await proxy.getPage(p);
      const vp = pg.getViewport({ scale: 1.0 });
      pageDims.push({ width: vp.width, height: vp.height });
    }

    const id = `src-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const color = SOURCE_BADGE_COLORS[this.files.length % SOURCE_BADGE_COLORS.length];

    const entry: QueuedMergeFile = {
      id,
      name,
      bytes,
      fileSize: bytes.byteLength,
      pageCount,
      isCurrentDoc,
      pageDims,
      rangeStr: '',
      pdfProxy: proxy,
      thumbCache: new Map(),
      color,
    };

    this.files.push(entry);

    if (this.isCustomPageOrder) {
      for (let p = 0; p < pageCount; p++) {
        this.pagePlan.push({
          slotId: `slot-${++this.slotCounter}`,
          sourceId: id,
          pageIndex: p,
          rotationDelta: 0,
        });
      }
    } else {
      this.syncPlanFromFiles();
    }

    this.render();
  }

  private syncPlanFromFiles(): void {
    const nextPlan: OrganizedPageSlot[] = [];
    for (const f of this.files) {
      const indices = f.rangeStr.trim()
        ? this.callbacks.parsePageRange(f.rangeStr, f.pageCount)
        : Array.from({ length: f.pageCount }, (_, idx) => idx);
      for (const pIdx of indices) {
        nextPlan.push({
          slotId: `slot-${++this.slotCounter}`,
          sourceId: f.id,
          pageIndex: pIdx,
          rotationDelta: 0,
        });
      }
    }
    this.pagePlan = nextPlan;
  }

  private interleavePages(): void {
    if (this.files.length < 2) return;
    const perFileSlots: OrganizedPageSlot[][] = this.files.map((f) => {
      const indices = f.rangeStr.trim()
        ? this.callbacks.parsePageRange(f.rangeStr, f.pageCount)
        : Array.from({ length: f.pageCount }, (_, idx) => idx);
      return indices.map((pIdx) => ({
        slotId: `slot-${++this.slotCounter}`,
        sourceId: f.id,
        pageIndex: pIdx,
        rotationDelta: 0,
      }));
    });

    const maxLen = Math.max(...perFileSlots.map((arr) => arr.length), 0);
    const interleaved: OrganizedPageSlot[] = [];
    for (let i = 0; i < maxLen; i++) {
      for (const list of perFileSlots) {
        if (i < list.length) interleaved.push(list[i]);
      }
    }
    this.pagePlan = interleaved;
    this.isCustomPageOrder = true;
    this.render();
  }

  private switchView(view: 'files' | 'pages'): void {
    this.viewMode = view;
    document.querySelectorAll('#mmViewTabs .mm-view-tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-mm-view') === view);
    });
    this.render();
  }

  private async renderThumbnailInto(file: QueuedMergeFile, pageIndex: number, imgEl: HTMLImageElement, token: number): Promise<void> {
    if (file.thumbCache.has(pageIndex)) {
      imgEl.src = file.thumbCache.get(pageIndex)!;
      return;
    }
    if (!file.pdfProxy) return;
    try {
      const page = await file.pdfProxy.getPage(pageIndex + 1);
      if (token !== this.renderToken) return;
      const baseVp = page.getViewport({ scale: 1.0 });
      const scale = Math.min(0.45, 160 / Math.max(baseVp.width, baseVp.height, 1));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(vp.width));
      canvas.height = Math.max(1, Math.ceil(vp.height));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
      }
      if (token !== this.renderToken) return;
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      file.thumbCache.set(pageIndex, dataUrl);
      imgEl.src = dataUrl;
    } catch (_) {}
  }

  private render(): void {
    const token = ++this.renderToken;
    const hasFiles = this.files.length > 0;

    const dropzone = document.getElementById('mmDropzone');
    dropzone?.classList.toggle('compact', hasFiles);

    const filesView = document.getElementById('mmFilesView');
    const pagesView = document.getElementById('mmPagesView');
    filesView?.classList.toggle('hidden', !hasFiles || this.viewMode !== 'files');
    pagesView?.classList.toggle('hidden', !hasFiles || this.viewMode !== 'pages');

    const pdfManager = this.callbacks.getPDFManager();
    const btnInclude = document.getElementById('btnMmIncludeCurrent');
    if (btnInclude) {
      const showInclude = pdfManager.getPageCount() > 0 && !this.files.some((f) => f.isCurrentDoc);
      btnInclude.classList.toggle('hidden', !showInclude);
    }

    document.getElementById('btnMmResetPlan')?.classList.toggle('hidden', !this.isCustomPageOrder);

    const filesCountEl = document.getElementById('mmFilesCountText');
    if (filesCountEl) {
      filesCountEl.textContent = `${this.files.length} Document${this.files.length === 1 ? '' : 's'} in Queue${this.isCustomPageOrder ? ' (Custom Page Order Active)' : ''}`;
    }
    const pagesCountEl = document.getElementById('mmPagesCountText');
    if (pagesCountEl) {
      pagesCountEl.textContent = `${this.pagePlan.length} Page${this.pagePlan.length === 1 ? '' : 's'} Ready to Merge`;
    }

    // Check if queued pages have mixed sizes
    const fileMap = new Map(this.files.map((f) => [f.id, f]));
    let hasMixedSizes = false;
    if (this.pagePlan.length > 1) {
      const firstSlot = this.pagePlan[0];
      const firstFile = fileMap.get(firstSlot.sourceId);
      const firstDim = firstFile?.pageDims[firstSlot.pageIndex];
      if (firstDim) {
        const fw = firstSlot.rotationDelta % 180 !== 0 ? firstDim.height : firstDim.width;
        const fh = firstSlot.rotationDelta % 180 !== 0 ? firstDim.width : firstDim.height;
        for (let i = 1; i < this.pagePlan.length; i++) {
          const sl = this.pagePlan[i];
          const sf = fileMap.get(sl.sourceId);
          const sd = sf?.pageDims[sl.pageIndex];
          if (sd) {
            const sw = sl.rotationDelta % 180 !== 0 ? sd.height : sd.width;
            const sh = sl.rotationDelta % 180 !== 0 ? sd.width : sd.height;
            if (Math.abs(sw - fw) > 3 || Math.abs(sh - fh) > 3) {
              hasMixedSizes = true;
              break;
            }
          }
        }
      }
    }
    document.getElementById('mmMixedAlert')?.classList.toggle('hidden', !hasMixedSizes);

    const totalSizeBytes = this.files.reduce((acc, f) => acc + f.fileSize, 0);
    const summaryEl = document.getElementById('mmSummaryText');
    if (summaryEl) {
      summaryEl.textContent = hasFiles
        ? `Total: ${this.files.length} PDF(s) · ${this.pagePlan.length} selected page(s) · ~${this.callbacks.formatBytes(totalSizeBytes)}`
        : 'Add 1 or more PDFs or images to combine';
    }

    const canMerge = this.pagePlan.length > 0;
    ['btnMmOpenEditor', 'btnMmMergeCompress', 'btnMmDownload'].forEach((id) => {
      const b = document.getElementById(id) as HTMLButtonElement | null;
      if (b) b.disabled = !canMerge;
    });

    if (this.viewMode === 'files') {
      this.renderFilesList(token);
    } else {
      this.renderPagesGrid(token);
    }
  }

  private renderFilesList(token: number): void {
    const listEl = document.getElementById('mmFilesList');
    if (!listEl) return;
    listEl.innerHTML = '';

    this.files.forEach((file, idx) => {
      const card = document.createElement('div');
      card.className = 'mm-file-card';
      card.setAttribute('draggable', 'true');

      card.addEventListener('dragstart', (e) => {
        this.draggedFileIndex = idx;
        card.classList.add('dragging');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.draggedFileIndex === null || this.draggedFileIndex === idx) return;
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (this.draggedFileIndex === null || this.draggedFileIndex === idx) return;
        const [moved] = this.files.splice(this.draggedFileIndex, 1);
        this.files.splice(idx, 0, moved);
        this.isCustomPageOrder = false;
        this.syncPlanFromFiles();
        this.render();
      });
      card.addEventListener('dragend', () => {
        this.draggedFileIndex = null;
        document.querySelectorAll('.mm-file-card').forEach((c) => c.classList.remove('dragging', 'drag-over'));
      });

      const firstDim = file.pageDims[0] || { width: 595, height: 842 };
      const sizeLabel = PDFManager.identifyPaperSize(firstDim.width, firstDim.height);
      const selectedCount = file.rangeStr.trim()
        ? this.callbacks.parsePageRange(file.rangeStr, file.pageCount).length
        : file.pageCount;

      card.innerHTML = `
        <div class="mm-file-drag" title="Drag to reorder">⋮⋮</div>
        <div class="mm-file-thumb-wrap">
          <img class="mm-file-thumb-img" alt="Preview" />
          <span class="mm-file-color-badge" style="background:${file.color};">#${idx + 1}</span>
        </div>
        <div class="mm-file-info">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <strong class="mm-file-name" title="${file.name}">${file.name}</strong>
            ${file.isCurrentDoc ? '<span class="mm-open-badge">Current Doc</span>' : ''}
          </div>
          <div class="mm-file-meta">
            ${file.pageCount} page${file.pageCount === 1 ? '' : 's'} · ${this.callbacks.formatBytes(file.fileSize)} · ${sizeLabel}
          </div>
          <div class="mm-file-range-row">
            <label>Pages:</label>
            <input type="text" class="mm-range-input" value="${file.rangeStr}" placeholder="All (1-${file.pageCount}) or e.g. 1, 3-5" />
            <span class="mm-selected-count">${selectedCount} sel</span>
            <button type="button" class="mm-pick-pages-btn" title="Arrange / select individual pages in grid">🧩 Organize</button>
          </div>
        </div>
        <div class="mm-file-actions">
          <button type="button" class="mm-act-btn" data-act="up" title="Move Up" ${idx === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" class="mm-act-btn" data-act="down" title="Move Down" ${idx === this.files.length - 1 ? 'disabled' : ''}>▼</button>
          <button type="button" class="mm-act-btn" data-act="dup" title="Duplicate file in queue">📋</button>
          <button type="button" class="mm-act-btn danger" data-act="del" title="Remove file">✕</button>
        </div>
      `;

      const imgEl = card.querySelector('.mm-file-thumb-img') as HTMLImageElement;
      this.renderThumbnailInto(file, 0, imgEl, token);

      const rangeInput = card.querySelector('.mm-range-input') as HTMLInputElement;
      rangeInput.addEventListener('input', () => {
        file.rangeStr = rangeInput.value;
        this.isCustomPageOrder = false;
        this.syncPlanFromFiles();
        const countSpan = card.querySelector('.mm-selected-count');
        const cnt = file.rangeStr.trim()
          ? this.callbacks.parsePageRange(file.rangeStr, file.pageCount).length
          : file.pageCount;
        if (countSpan) countSpan.textContent = `${cnt} sel`;
        const summaryEl = document.getElementById('mmSummaryText');
        if (summaryEl) {
          const tot = this.files.reduce((a, x) => a + x.fileSize, 0);
          summaryEl.textContent = `Total: ${this.files.length} PDF(s) · ${this.pagePlan.length} selected page(s) · ~${this.callbacks.formatBytes(tot)}`;
        }
      });

      card.querySelector('.mm-pick-pages-btn')?.addEventListener('click', () => {
        this.switchView('pages');
      });

      card.querySelector('[data-act="up"]')?.addEventListener('click', () => {
        if (idx > 0) {
          const [m] = this.files.splice(idx, 1);
          this.files.splice(idx - 1, 0, m);
          this.isCustomPageOrder = false;
          this.syncPlanFromFiles();
          this.render();
        }
      });
      card.querySelector('[data-act="down"]')?.addEventListener('click', () => {
        if (idx < this.files.length - 1) {
          const [m] = this.files.splice(idx, 1);
          this.files.splice(idx + 1, 0, m);
          this.isCustomPageOrder = false;
          this.syncPlanFromFiles();
          this.render();
        }
      });
      card.querySelector('[data-act="dup"]')?.addEventListener('click', async () => {
        await this.appendPDFBytes(file.bytes.slice(), file.name, false);
      });
      card.querySelector('[data-act="del"]')?.addEventListener('click', () => {
        if (file.pdfProxy && typeof file.pdfProxy.destroy === 'function') {
          try { file.pdfProxy.destroy(); } catch (_) {}
        }
        this.files.splice(idx, 1);
        this.pagePlan = this.pagePlan.filter((s) => s.sourceId !== file.id);
        if (!this.isCustomPageOrder) this.syncPlanFromFiles();
        this.render();
      });

      listEl.appendChild(card);
    });
  }

  private renderPagesGrid(token: number): void {
    const gridEl = document.getElementById('mmPagesGrid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    const fileMap = new Map(this.files.map((f, fIdx) => [f.id, { file: f, fileIndex: fIdx }]));

    this.pagePlan.forEach((slot, sIdx) => {
      const ref = fileMap.get(slot.sourceId);
      if (!ref) return;
      const { file, fileIndex } = ref;

      const card = document.createElement('div');
      card.className = 'mm-page-card';
      card.setAttribute('draggable', 'true');

      card.addEventListener('dragstart', (e) => {
        this.draggedSlotIndex = sIdx;
        card.classList.add('dragging');
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.draggedSlotIndex === null || this.draggedSlotIndex === sIdx) return;
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (this.draggedSlotIndex === null || this.draggedSlotIndex === sIdx) return;
        const [moved] = this.pagePlan.splice(this.draggedSlotIndex, 1);
        this.pagePlan.splice(sIdx, 0, moved);
        this.isCustomPageOrder = true;
        this.render();
      });
      card.addEventListener('dragend', () => {
        this.draggedSlotIndex = null;
        document.querySelectorAll('.mm-page-card').forEach((c) => c.classList.remove('dragging', 'drag-over'));
      });

      const dim = file.pageDims[slot.pageIndex] || { width: 595, height: 842 };
      const w = slot.rotationDelta % 180 !== 0 ? dim.height : dim.width;
      const h = slot.rotationDelta % 180 !== 0 ? dim.width : dim.height;

      card.innerHTML = `
        <div class="mm-page-card-top">
          <span class="mm-page-num">#${sIdx + 1}</span>
          <span class="mm-page-src" style="background:${file.color};">F${fileIndex + 1}·P${slot.pageIndex + 1}</span>
        </div>
        <div class="mm-page-thumb-box">
          <img class="mm-page-thumb-img" style="transform: rotate(${slot.rotationDelta}deg);" alt="Page ${sIdx + 1}" />
        </div>
        <div class="mm-page-dim">${Math.round(w)}×${Math.round(h)} pt</div>
        <div class="mm-page-card-actions">
          <button type="button" data-p-act="rot-ccw" title="Rotate Left 90°">↺</button>
          <button type="button" data-p-act="rot-cw" title="Rotate Right 90°">↻</button>
          <button type="button" data-p-act="dup" title="Duplicate Page">📋</button>
          <button type="button" data-p-act="del" class="danger" title="Remove Page">✕</button>
        </div>
      `;

      const imgEl = card.querySelector('.mm-page-thumb-img') as HTMLImageElement;
      this.renderThumbnailInto(file, slot.pageIndex, imgEl, token);

      card.querySelector('[data-p-act="rot-ccw"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        slot.rotationDelta = (slot.rotationDelta - 90 + 360) % 360;
        this.isCustomPageOrder = true;
        this.render();
      });
      card.querySelector('[data-p-act="rot-cw"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        slot.rotationDelta = (slot.rotationDelta + 90) % 360;
        this.isCustomPageOrder = true;
        this.render();
      });
      card.querySelector('[data-p-act="dup"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pagePlan.splice(sIdx + 1, 0, {
          slotId: `slot-${++this.slotCounter}`,
          sourceId: slot.sourceId,
          pageIndex: slot.pageIndex,
          rotationDelta: slot.rotationDelta,
        });
        this.isCustomPageOrder = true;
        this.render();
      });
      card.querySelector('[data-p-act="del"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pagePlan.splice(sIdx, 1);
        this.isCustomPageOrder = true;
        this.render();
      });

      gridEl.appendChild(card);
    });
  }

  private buildUnifyOptions(): NormalizePagesOptions | undefined {
    const preset = (document.getElementById('mmUnifyPreset') as HTMLSelectElement | null)?.value || 'none';
    if (preset === 'none' || this.pagePlan.length === 0) return undefined;

    const fitMode = ((document.getElementById('mmUnifyFit') as HTMLSelectElement | null)?.value || 'contain') as PageFitMode;

    if (preset === 'match_first') {
      const firstSlot = this.pagePlan[0];
      const firstFile = this.files.find((f) => f.id === firstSlot.sourceId);
      const firstDim = firstFile?.pageDims[firstSlot.pageIndex] || { width: 595.28, height: 841.89 };
      const w = firstSlot.rotationDelta % 180 !== 0 ? firstDim.height : firstDim.width;
      const h = firstSlot.rotationDelta % 180 !== 0 ? firstDim.width : firstDim.height;
      return {
        targetWidth: w,
        targetHeight: h,
        orientationMode: w > h ? 'landscape' : 'portrait',
        fitMode,
        alignMode: 'center',
        marginPt: 0,
        scope: 'all',
      };
    }

    if (preset === 'letter_portrait') {
      return {
        targetWidth: 612,
        targetHeight: 792,
        orientationMode: 'portrait',
        fitMode,
        alignMode: 'center',
        marginPt: 0,
        scope: 'all',
      };
    }

    if (preset === 'a4_landscape') {
      return {
        targetWidth: 841.89,
        targetHeight: 595.28,
        orientationMode: 'landscape',
        fitMode,
        alignMode: 'center',
        marginPt: 0,
        scope: 'all',
      };
    }

    return {
      targetWidth: 595.28,
      targetHeight: 841.89,
      orientationMode: 'portrait',
      fitMode,
      alignMode: 'center',
      marginPt: 0,
      scope: 'all',
    };
  }

  private async executeMerge(action: 'editor' | 'compress' | 'download'): Promise<void> {
    if (this.pagePlan.length === 0) {
      alert('Please add at least one PDF with pages to merge.');
      return;
    }

    const outName = (document.getElementById('mmOutputName') as HTMLInputElement | null)?.value.trim() || 'Merged_Document.pdf';
    const sources: MergeSourceDoc[] = this.files.map((f) => ({
      id: f.id,
      name: f.name,
      bytes: f.bytes,
    }));
    const plan: MergePagePlanItem[] = this.pagePlan.map((s) => ({
      sourceId: s.sourceId,
      pageIndex: s.pageIndex,
      rotationDelta: s.rotationDelta,
    }));
    const unifyOptions = this.buildUnifyOptions();

    this.close();

    try {
      this.callbacks.showProcessing('Merging PDFs...', `Combining ${plan.length} page(s) from ${sources.length} document(s)...`);
      const mergedBytes = await ExportEngine.mergeDocumentsAdvanced(
        sources,
        plan,
        unifyOptions,
        (pct, stat) => this.callbacks.updateProcessing(pct, stat)
      );

      if (action === 'download') {
        this.callbacks.hideProcessing();
        ExportEngine.downloadBytes(mergedBytes, outName, true);
        this.callbacks.onDownloadSuccess();
      } else {
        await this.callbacks.onOpenMergedInEditor(mergedBytes, outName, action === 'compress');
        this.callbacks.onDownloadSuccess();
      }
    } catch (err) {
      this.callbacks.hideProcessing();
      console.error('Multi-merge failed:', err);
      alert('Failed to merge PDFs: ' + (err as Error).message);
    }
  }
}
