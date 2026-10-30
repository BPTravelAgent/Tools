import { ICONS } from './icons';
import { PDFManager } from './pdfManager';
import { AnnotationManager } from './annotationManager';
import { TrueEditManager } from './trueEditManager';
import { ExportEngine } from './exportEngine';
import { fontManager, createSearchableFontPicker } from './fontManager';
import { getAssetUrl } from './utils';
import confetti from 'canvas-confetti';
import type {
  EditorMode,
  ToolType,
  ShapeType,
  Annotation,
  TextAnnotation,
  ShapeAnnotation,
  ImageAnnotation,
  FreehandAnnotation,
  ExtractedTextItem,
  RichTextSpan,
  TrueEditTextChange,
} from './types';

// Helper to normalize any color string (hex, rgb) to lowercase hex
function normalizeColorToHex(col: string): string {
  if (!col) return '#000000';
  col = col.trim().toLowerCase();
  if (col.startsWith('#')) {
    if (col.length === 4) {
      return `#${col[1]}${col[1]}${col[2]}${col[2]}${col[3]}${col[3]}`;
    }
    return col;
  }
  const match = col.match(/\d+/g);
  if (match && match.length >= 3) {
    const r = parseInt(match[0], 10).toString(16).padStart(2, '0');
    const g = parseInt(match[1], 10).toString(16).padStart(2, '0');
    const b = parseInt(match[2], 10).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return '#000000';
}

// Parse rich contenteditable DOM tree into plain text and individual styled spans
function serializeRichContent(
  container: HTMLElement,
  defaultFont: string,
  defaultSize: number,
  defaultColor: string,
  defaultBold: boolean,
  defaultItalic: boolean
): { plainText: string; spans: RichTextSpan[] } {
  const spans: RichTextSpan[] = [];
  let plainText = '';

  function walk(node: Node, currentStyle: { fontFamily: string; fontSize: number; color: string; bold: boolean; italic: boolean }) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.length > 0) {
        plainText += text;
        spans.push({
          text,
          ...currentStyle,
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === 'br') {
        plainText += '\n';
        spans.push({
          text: '\n',
          ...currentStyle,
        });
        return;
      }

      const style = { ...currentStyle };
      if (tag === 'b' || tag === 'strong' || el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight, 10) >= 600) {
        style.bold = true;
      } else if (el.style.fontWeight === 'normal' || parseInt(el.style.fontWeight, 10) === 400) {
        style.bold = false;
      }

      if (tag === 'i' || tag === 'em' || el.style.fontStyle === 'italic') {
        style.italic = true;
      } else if (el.style.fontStyle === 'normal') {
        style.italic = false;
      }

      if (el.style.color) {
        style.color = normalizeColorToHex(el.style.color);
      }

      if (el.style.fontSize) {
        const parsed = parseInt(el.style.fontSize, 10);
        if (!isNaN(parsed) && parsed > 0) style.fontSize = parsed;
      }

      if (el.style.fontFamily) {
        style.fontFamily = el.style.fontFamily.replace(/['"]/g, '');
      }

      const isBlock = (tag === 'div' || tag === 'p') && el !== container;
      if (isBlock && plainText.length > 0 && !plainText.endsWith('\n')) {
        plainText += '\n';
        spans.push({ text: '\n', ...style });
      }

      for (let i = 0; i < el.childNodes.length; i++) {
        walk(el.childNodes[i], style);
      }
    }
  }

  const baseStyle = {
    fontFamily: defaultFont,
    fontSize: defaultSize,
    color: defaultColor,
    bold: defaultBold,
    italic: defaultItalic,
  };

  for (let i = 0; i < container.childNodes.length; i++) {
    walk(container.childNodes[i], baseStyle);
  }

  // Merge adjacent spans with identical formatting
  const merged: RichTextSpan[] = [];
  for (const s of spans) {
    if (s.text === '') continue;
    const last = merged[merged.length - 1];
    if (
      last &&
      last.text !== '\n' &&
      s.text !== '\n' &&
      last.color === s.color &&
      last.fontFamily === s.fontFamily &&
      last.fontSize === s.fontSize &&
      last.bold === s.bold &&
      last.italic === s.italic
    ) {
      last.text += s.text;
    } else {
      merged.push({ ...s });
    }
  }

  return { plainText, spans: merged };
}

export class PDFEditorUI {
  private pdfManager: PDFManager;
  private annotationManager: AnnotationManager;
  private trueEditManager: TrueEditManager;

  private currentMode: EditorMode = 'annotate';
  private currentTool: ToolType = 'select';
  private currentScale: number = 1.0;
  private activePageIndex: number = 0;
  private isDrawingFreehand: boolean = false;
  private currentFreehandPoints: { x: number; y: number }[] = [];

  // Cached DOM elements
  private root: HTMLElement;
  private previewPagesContainer!: HTMLElement;
  private layersContainer!: HTMLElement;
  private subMenuContainer!: HTMLElement;
  private uploaderContainer!: HTMLElement;
  private pagesWrapper!: HTMLElement;

  constructor(
    rootId: string,
    pdfManager: PDFManager,
    annotationManager: AnnotationManager,
    trueEditManager: TrueEditManager
  ) {
    const el = document.getElementById(rootId);
    if (!el) throw new Error(`Root element #${rootId} not found`);
    this.root = el;
    this.pdfManager = pdfManager;
    this.annotationManager = annotationManager;
    this.trueEditManager = trueEditManager;

    fontManager.init().catch((err) => console.warn('fontManager init error:', err));

    this.initLayout();
    this.setupEventListeners();
  }

  private initLayout() {
    this.root.innerHTML = `
      <div class="ilovepdf-app">
        <!-- Top Navigation Bar -->
        <header class="app-header">
          <div class="header-left">
            <a href="../../index.html" id="btnBackToPortal" class="btn btn-outline btn-portal" title="Back to Main Portal" style="text-decoration: none; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; font-size: 13px; font-weight: 600; color: #1e7829; border: 1.5px solid rgba(30, 120, 41, 0.25); background: #f4fcf6; border-radius: 6px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              Main Portal
            </a>
            <div class="brand">
              ${ICONS.logo}
            </div>
          </div>
          <div class="header-right">
            <button id="btnLoadSample" class="btn btn-outline" title="Try editing with preloaded sample PDF">
              Try Sample PDF
            </button>
            <button id="btnSavePDF" class="btn btn-primary btn-save" title="Save changes and download PDF">
              ${ICONS.download} Save changes
            </button>
          </div>
        </header>

        <!-- Main Workspace Area -->
        <div class="app-body">
          <!-- Left Thumbnails Sidebar -->
          <aside class="sidebar-thumbnails" id="sidebarThumbnails">
            <div class="thumbnails-header">
              <span>Pages</span>
              <button id="btnAddBlankPage" class="btn-icon" title="Add blank page">
                ${ICONS.plus}
              </button>
            </div>
            <div class="thumbnails-list" id="thumbnailsList"></div>
            <div class="thumbnails-toggle" id="thumbnailsToggle" title="Toggle page previews">
              ${ICONS.chevronLeft}
            </div>
          </aside>

          <!-- Center Workspace -->
          <main class="main-workarea" id="mainWorkarea">
            <!-- Top Toolbar Ribbon -->
            <div class="toolbar-ribbon" id="toolbarRibbon">
              <!-- Mode Switcher (Annotate vs TrueEdit Pro) -->
              <div class="mode-switcher-container">
                <div class="mode-toggle" id="modeToggle">
                  <button class="mode-btn active" data-mode="annotate" title="Standard Annotations mode">
                    ${ICONS.annotateMode} Annotate
                  </button>
                  <button class="mode-btn mode-pro" data-mode="trueedit" title="Edit existing text directly in the PDF">
                    ${ICONS.editMode} Edit ${ICONS.crown}
                  </button>
                </div>
              </div>

              <div class="toolbar-divider"></div>

              <!-- Main Tools -->
              <div class="tool-group" id="mainToolGroup">
                <button class="tool-btn" data-tool="hand" title="Pan / Hand tool">
                  ${ICONS.hand}
                </button>
                <button class="tool-btn active" data-tool="select" title="Select / Move elements">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 3 7 18 3-7 7-3z"/></svg>
                </button>
                <button class="tool-btn" data-tool="text" title="Add new text">
                  ${ICONS.text}
                </button>
                <button class="tool-btn" data-tool="img" id="btnUploadImage" title="Insert image or stamp">
                  ${ICONS.image}
                </button>
                <button class="tool-btn" data-tool="freehand" title="Freehand drawing / Signature">
                  ${ICONS.freehand}
                </button>
                <div class="dropdown-wrapper">
                  <button class="tool-btn" data-tool="shapes" id="btnShapesDropdown" title="Add shapes and symbols">
                    ${ICONS.shapes} ${ICONS.chevronDown}
                  </button>
                  <div class="shapes-menu" id="shapesMenu">
                    <div class="shape-option" data-shape="rectangle">Rectangle</div>
                    <div class="shape-option" data-shape="ellipse">Circle / Ellipse</div>
                    <div class="shape-option" data-shape="line">Line</div>
                    <div class="shape-option" data-shape="arrow">Arrow</div>
                    <div class="shape-divider"></div>
                    <div class="shape-option" data-shape="check">Checkmark (✓)</div>
                    <div class="shape-option" data-shape="cross">Cross (✕)</div>
                  </div>
                </div>
                <button class="tool-btn" data-tool="eraser" title="Eraser (Click any text, drawing, or element to erase)">
                  ${ICONS.eraser}
                </button>
                <button class="tool-btn" data-tool="whiteout" title="Whiteout / Redact section">
                  ${ICONS.whiteout}
                </button>
              </div>

              <div class="toolbar-divider"></div>

              <!-- Undo / Redo -->
              <div class="tool-group">
                <button class="tool-btn btn-history" id="btnUndo" title="Undo (Ctrl+Z)">
                  ${ICONS.undo}
                </button>
                <button class="tool-btn btn-history" id="btnRedo" title="Redo (Ctrl+Y)">
                  ${ICONS.redo}
                </button>
              </div>
            </div>

            <!-- Submenu Context Toolbar (Property Bar) -->
            <div class="submenu-ribbon" id="submenuRibbon">
              <div class="submenu-content" id="submenuContent">
                <!-- Dynamically populated based on active tool / selected element -->
              </div>
            </div>

            <!-- Scrollable Pages Viewport -->
            <div class="viewport-scroller" id="viewportScroller">
              <!-- Empty State / Uploader Screen -->
              <div class="uploader-screen" id="uploaderScreen">
                <div class="uploader-card">
                  <h1 class="uploader-title">PDF Editor</h1>
                  <p class="uploader-subtitle">
                    Edit PDF documents with professional tools. Add text, shapes, comments, draw signatures, or 
                    use <strong>TrueEdit™ Pro</strong> to modify existing text directly!
                  </p>
                  
                  <div class="uploader-dropzone" id="uploaderDropzone">
                    <input type="file" id="pdfFileInput" accept="application/pdf" style="display:none;" />
                    <button class="btn btn-crimson btn-large" id="btnSelectFile">
                      ${ICONS.upload} Select PDF file
                    </button>
                    <div class="drop-text">or drop PDF here</div>
                    <button class="btn btn-link" id="btnSampleInside">
                      Or click here to test with Sample Document
                    </button>
                  </div>
                </div>
              </div>

              <!-- Active Document Pages Container -->
              <div class="document-pages-wrapper hidden" id="documentPagesWrapper"></div>
            </div>

            <!-- Floating Viewbar / Zoom Controls -->
            <div class="floating-viewbar" id="floatingViewbar">
              <button class="viewbar-btn" id="btnPrevPage" title="Previous page">
                ${ICONS.chevronLeft}
              </button>
              <span class="viewbar-page-info" id="viewbarPageInfo">Page 1 of 1</span>
              <button class="viewbar-btn" id="btnNextPage" title="Next page">
                ${ICONS.chevronRight}
              </button>
              <div class="viewbar-sep"></div>
              <button class="viewbar-btn" id="btnZoomOut" title="Zoom out">
                ${ICONS.zoomOut}
              </button>
              <span class="viewbar-zoom-text" id="viewbarZoomText">100%</span>
              <button class="viewbar-btn" id="btnZoomIn" title="Zoom in">
                ${ICONS.zoomIn}
              </button>
              <button class="viewbar-btn" id="btnFitWidth" title="Fit to width">
                ${ICONS.fitWidth}
              </button>
              <button class="viewbar-btn" id="btnFitPage" title="Fit to page">
                ${ICONS.fitPage}
              </button>
            </div>
          </main>

          <!-- Right Sidebar (Layers / Elements & TrueEdit Diffs) -->
          <aside class="sidebar-layers" id="sidebarLayers">
            <div class="layers-header">
              <span id="layersPanelTitle">Elements</span>
              <button class="btn-text-danger" id="btnRemoveAllLayers">Remove all</button>
            </div>
            <div class="layers-list" id="layersList"></div>
            <div class="layers-empty-info" id="layersEmptyInfo">
              Use the toolbar to modify or add text, upload images, and annotate with ease.
            </div>
          </aside>
        </div>

        <!-- Hidden input for image uploads -->
        <input type="file" id="imageFileInput" accept="image/*" style="display:none;" />

        <!-- Processing Modal -->
        <div class="modal-backdrop hidden" id="processingModal">
          <div class="modal-card">
            <div class="modal-spinner"></div>
            <h2 class="modal-title" id="processingTitle">Editing PDF...</h2>
            <p class="modal-desc" id="processingDesc">
              Do not close your browser. Wait until your changes are compiled into the PDF.
            </p>
            <div class="progress-bar-container">
              <div class="progress-bar-fill" id="progressBarFill" style="width: 0%"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Cache elements
    this.previewPagesContainer = document.getElementById('thumbnailsList')!;
    this.layersContainer = document.getElementById('layersList')!;
    this.subMenuContainer = document.getElementById('submenuContent')!;
    this.uploaderContainer = document.getElementById('uploaderScreen')!;
    this.pagesWrapper = document.getElementById('documentPagesWrapper')!;

    // Register manager update callbacks
    this.annotationManager.setOnChange(() => {
      this.renderCurrentPageAnnotations();
      this.renderLayersSidebar();
      this.updateSubmenu();
    });

    this.trueEditManager.setOnChange(() => {
      this.renderTrueEditOverlays();
      this.renderLayersSidebar();
    });
  }

  private setupEventListeners() {
    // 1. File Uploading
    const fileInput = document.getElementById('pdfFileInput') as HTMLInputElement;
    const btnSelectFile = document.getElementById('btnSelectFile');
    btnSelectFile?.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await this.handleFile(file);
      }
    });

    // Drag and drop PDF
    const dropzone = document.getElementById('uploaderDropzone');
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
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type === 'application/pdf') {
        await this.handleFile(file);
      }
    });

    // Back to portal button
    const backBtn = document.getElementById('btnBackToPortal');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const isDist = window.location.pathname.includes('/dist/');
        window.location.href = isDist ? '../../index.html' : '../index.html';
      });
    }

    // Sample PDF buttons
    const loadSample = async () => {
      try {
        const resp = await fetch(getAssetUrl('sample.pdf'));
        const buffer = await resp.arrayBuffer();
        await this.loadPDFBuffer(buffer, 'Sample_Business_Report.pdf');
      } catch (err) {
        console.error('Error loading sample PDF:', err);
        alert('Could not load sample PDF.');
      }
    };
    document.getElementById('btnLoadSample')?.addEventListener('click', loadSample);
    document.getElementById('btnSampleInside')?.addEventListener('click', loadSample);

    // Image Uploading
    const imgInput = document.getElementById('imageFileInput') as HTMLInputElement;
    document.getElementById('btnUploadImage')?.addEventListener('click', () => {
      imgInput.value = ''; // Reset file input so re-selecting same file works
      imgInput.click();
    });
    imgInput.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = () => {
          const rawDataUrl = reader.result as string;
          const img = new Image();
          img.onload = () => {
            const natW = img.naturalWidth || img.width || 300;
            const natH = img.naturalHeight || img.height || 300;

            // Normalize image to high-fidelity RGBA PNG via offscreen canvas
            // to ensure 100% compatibility across all browsers and pdf-lib export
            let cleanPngUrl = rawDataUrl;
            try {
              const offscreen = document.createElement('canvas');
              offscreen.width = natW;
              offscreen.height = natH;
              const ctx = offscreen.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                cleanPngUrl = offscreen.toDataURL('image/png');
              }
            } catch (convErr) {
              console.warn('Canvas conversion fallback to raw data URL:', convErr);
            }

            // Target the currently visible page in the viewport
            const targetPage = this.getVisiblePageIndex();
            this.activePageIndex = targetPage;
            this.updateViewbar();

            // Center image horizontally on the currently active page
            const meta = this.pdfManager.getPageMeta(targetPage);
            const pageWidth = meta ? meta.width : 595;
            const defaultW = Math.min(260, Math.round(natW));
            const spawnX = Math.max(20, Math.round((pageWidth - defaultW) / 2));
            const spawnY = 80;

            this.annotationManager.addImage(
              targetPage,
              spawnX,
              spawnY,
              cleanPngUrl,
              natW,
              natH
            );
            this.setTool('select');
          };
          img.src = rawDataUrl;
        };
        reader.readAsDataURL(file);
      }
    });

    // 2. Mode Switching (Annotate vs TrueEdit Pro)
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode') as EditorMode;
        this.setMode(mode);
      });
    });

    // 3. Tool Selection
    const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
    toolBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-tool') as ToolType;
        if (tool === 'shapes') {
          // Toggle shapes dropdown
          const menu = document.getElementById('shapesMenu');
          menu?.classList.toggle('active');
          return;
        }
        this.setTool(tool);
      });
    });

    // Shapes dropdown selection
    const shapeOptions = document.querySelectorAll('.shape-option');
    shapeOptions.forEach((opt) => {
      opt.addEventListener('click', () => {
        const shape = opt.getAttribute('data-shape') as ShapeType;
        this.annotationManager.currentShapeType = shape;
        document.getElementById('shapesMenu')?.classList.remove('active');
        this.setTool('shapes');
        const targetPage = this.getVisiblePageIndex();
        this.activePageIndex = targetPage;
        this.updateViewbar();
        // Add shape to active visible page centered
        this.annotationManager.addShape(targetPage, 100, 150, shape);
        this.setTool('select');
      });
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.dropdown-wrapper')) {
        document.getElementById('shapesMenu')?.classList.remove('active');
      }
    });

    // Undo / Redo
    document.getElementById('btnUndo')?.addEventListener('click', () => {
      this.annotationManager.undo();
    });
    document.getElementById('btnRedo')?.addEventListener('click', () => {
      this.annotationManager.redo();
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
      // Ignore if user is typing in an input or contenteditable
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      const isEditable = document.activeElement?.getAttribute('contenteditable') === 'true';
      if (activeTag === 'input' || activeTag === 'textarea' || isEditable) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.annotationManager.redo();
        else this.annotationManager.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.annotationManager.redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const selId = this.annotationManager.getSelectedId();
        if (selId) {
          e.preventDefault();
          this.annotationManager.deleteAnnotation(selId);
          return;
        }

        const selectedPatch = document.querySelector('.trueedit-modified-patch.selected') as HTMLElement | null;
        if (selectedPatch) {
          e.preventDefault();
          const changeId = selectedPatch.getAttribute('data-id');
          if (changeId) {
            const item = this.pdfManager.getExtractedTexts(this.activePageIndex).find((t) => t.id === changeId);
            if (item) {
              this.trueEditManager.startOrUpdateEdit(item, '', 'DM Sans', item.fontSize, '#000000', true);
            } else {
              const change = this.trueEditManager.getChange(changeId);
              if (change) {
                change.deleted = true;
                change.newText = '';
                change.spans = [];
                this.trueEditManager.notify();
              }
            }
          }
          return;
        }
      }
    });

    // 4. Viewbar Controls
    document.getElementById('btnPrevPage')?.addEventListener('click', () => {
      if (this.activePageIndex > 0) {
        this.scrollToPage(this.activePageIndex - 1);
      }
    });
    document.getElementById('btnNextPage')?.addEventListener('click', () => {
      if (this.activePageIndex < this.pdfManager.getPageCount() - 1) {
        this.scrollToPage(this.activePageIndex + 1);
      }
    });

    document.getElementById('btnZoomIn')?.addEventListener('click', () => {
      this.setScale(Math.min(2.5, this.currentScale + 0.25));
    });
    document.getElementById('btnZoomOut')?.addEventListener('click', () => {
      this.setScale(Math.max(0.5, this.currentScale - 0.25));
    });
    document.getElementById('btnFitWidth')?.addEventListener('click', () => {
      this.fitToWidth();
    });
    document.getElementById('btnFitPage')?.addEventListener('click', () => {
      this.fitToPage();
    });

    // Sidebar Toggle
    document.getElementById('thumbnailsToggle')?.addEventListener('click', () => {
      const sidebar = document.getElementById('sidebarThumbnails');
      sidebar?.classList.toggle('collapsed');
      const icon = document.getElementById('thumbnailsToggle');
      if (icon) {
        icon.innerHTML = sidebar?.classList.contains('collapsed')
          ? ICONS.chevronRight
          : ICONS.chevronLeft;
      }
    });

    // Add Blank Page
    document.getElementById('btnAddBlankPage')?.addEventListener('click', () => {
      const newIdx = this.pdfManager.addBlankPage(this.activePageIndex);
      this.renderDocumentPages();
      this.renderThumbnails();
      this.scrollToPage(newIdx);
    });

    // Remove All Layers
    document.getElementById('btnRemoveAllLayers')?.addEventListener('click', () => {
      if (this.currentMode === 'annotate') {
        if (confirm('Are you sure you want to remove all annotations on this page?')) {
          this.annotationManager.clearAll(this.activePageIndex);
        }
      } else {
        if (confirm('Are you sure you want to revert all text edits on this page?')) {
          const changes = this.trueEditManager.getChangesForPage(this.activePageIndex);
          changes.forEach((c) => this.trueEditManager.revertChange(c.id));
        }
      }
    });

    // Save PDF
    document.getElementById('btnSavePDF')?.addEventListener('click', () => {
      this.handleExport();
    });

    // Viewport Scroll Tracker (keeps activePageIndex accurately in sync with user scrolling)
    const scroller = document.getElementById('viewportScroller');
    if (scroller) {
      let scrollTimer: any = null;
      scroller.addEventListener('scroll', () => {
        if (scrollTimer) clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => {
          const scrollerRect = scroller.getBoundingClientRect();
          const targetY = scrollerRect.top + scrollerRect.height * 0.4;
          const pageCount = this.pdfManager.getPageCount();
          for (let p = 0; p < pageCount; p++) {
            const pageEl = document.getElementById(`pageContainer-${p}`);
            if (pageEl) {
              const rect = pageEl.getBoundingClientRect();
              if (rect.top <= targetY && rect.bottom >= targetY) {
                if (this.activePageIndex !== p) {
                  this.activePageIndex = p;
                  this.updateViewbar();
                  this.renderLayersSidebar();
                  document.querySelectorAll('.thumb-item').forEach((item, idx) => {
                    item.classList.toggle('active', idx === p);
                  });
                }
                break;
              }
            }
          }
        }, 80);
      }, { passive: true });
    }
  }

  private getVisiblePageIndex(): number {
    const scroller = document.getElementById('viewportScroller');
    if (!scroller) return this.activePageIndex;
    const scrollerRect = scroller.getBoundingClientRect();
    const targetY = scrollerRect.top + scrollerRect.height * 0.4;
    const pageCount = this.pdfManager.getPageCount();
    for (let p = 0; p < pageCount; p++) {
      const pageEl = document.getElementById(`pageContainer-${p}`);
      if (pageEl) {
        const rect = pageEl.getBoundingClientRect();
        if (rect.top <= targetY && rect.bottom >= targetY) {
          return p;
        }
      }
    }
    return this.activePageIndex;
  }

  private async handleFile(file: File) {
    const buffer = await file.arrayBuffer();
    await this.loadPDFBuffer(buffer, file.name);
  }

  async loadPDFBuffer(buffer: ArrayBuffer, fileName: string) {
    try {
      this.showProcessingModal('Opening PDF...', 'Loading and parsing pages...');
      await this.pdfManager.loadPDF(buffer, fileName);
      this.hideProcessingModal();

      // Show document area, hide empty uploader
      this.uploaderContainer.classList.add('hidden');
      this.pagesWrapper.classList.remove('hidden');

      this.activePageIndex = 0;
      await this.renderDocumentPages();
      await this.renderThumbnails();
      this.updateViewbar();
      this.updateSubmenu();
      this.renderLayersSidebar();
    } catch (err) {
      this.hideProcessingModal();
      console.error('Failed to load PDF:', err);
      alert('Error loading PDF file: ' + (err as Error).message);
    }
  }

  private setMode(mode: EditorMode) {
    this.currentMode = mode;
    document.querySelectorAll('.mode-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });

    // In TrueEdit Pro mode, highlight text boxes for direct inline editing
    const body = document.querySelector('.ilovepdf-app');
    if (mode === 'trueedit') {
      body?.classList.add('mode-trueedit-active');
      this.setTool('select');
      document.getElementById('layersPanelTitle')!.textContent = 'TrueEdit™ Pro Edits';
    } else {
      body?.classList.remove('mode-trueedit-active');
      document.getElementById('layersPanelTitle')!.textContent = 'Elements';
    }

    this.renderTrueEditOverlays();
    this.renderLayersSidebar();
    this.updateSubmenu();
  }

  private setTool(tool: ToolType) {
    this.currentTool = tool;
    document.querySelectorAll('.tool-btn[data-tool]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tool') === tool);
    });

    const body = document.querySelector('.ilovepdf-app');
    body?.classList.toggle('tool-eraser-active', tool === 'eraser' || tool === 'whiteout');

    const scroller = document.getElementById('viewportScroller');
    if (scroller) {
      if (tool === 'hand') {
        scroller.classList.add('cursor-hand');
      } else if (tool === 'text') {
        scroller.classList.add('cursor-text');
      } else if (tool === 'freehand') {
        scroller.classList.add('cursor-crosshair');
      } else if (tool === 'eraser' || tool === 'whiteout') {
        scroller.classList.add('cursor-crosshair');
      } else {
        scroller.className = 'viewport-scroller';
      }
    }

    this.updateSubmenu();
  }

  private async renderDocumentPages() {
    this.pagesWrapper.innerHTML = '';
    const pagesMeta = this.pdfManager.getPagesMeta();

    for (let i = 0; i < pagesMeta.length; i++) {
      const pageContainer = document.createElement('div');
      pageContainer.className = 'pdf-page-container';
      pageContainer.id = `pageContainer-${i}`;
      pageContainer.setAttribute('data-page-index', i.toString());

      // Base Canvas
      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-canvas';
      canvas.id = `pdfCanvas-${i}`;

      // TrueEdit Layer (for Pro direct text editing)
      const trueEditLayer = document.createElement('div');
      trueEditLayer.className = 'trueedit-layer';
      trueEditLayer.id = `trueEditLayer-${i}`;

      // Annotation Layer (for user additions)
      const annLayer = document.createElement('div');
      annLayer.className = 'annotation-layer';
      annLayer.id = `annLayer-${i}`;

      // Freehand drawing overlay canvas
      const freehandCanvas = document.createElement('canvas');
      freehandCanvas.className = 'freehand-canvas';
      freehandCanvas.id = `freehandCanvas-${i}`;

      pageContainer.appendChild(canvas);
      pageContainer.appendChild(trueEditLayer);
      pageContainer.appendChild(annLayer);
      pageContainer.appendChild(freehandCanvas);
      this.pagesWrapper.appendChild(pageContainer);

      // Render PDF page to canvas
      await this.pdfManager.renderPageToCanvas(i, canvas, this.currentScale);

      // Pre-sample and cache exact text color for all extracted text items on this page
      const pageTextItems = this.pdfManager.getExtractedTexts(i);
      for (const tItem of pageTextItems) {
        if (!tItem.color) {
          tItem.color = this.sampleTextColorFromCanvas(canvas, tItem.x, tItem.y, tItem.width, tItem.height);
        }
      }

      // Match overlays dimensions to canvas size
      const cssWidth = canvas.style.width;
      const cssHeight = canvas.style.height;
      trueEditLayer.style.width = cssWidth;
      trueEditLayer.style.height = cssHeight;
      annLayer.style.width = cssWidth;
      annLayer.style.height = cssHeight;
      freehandCanvas.style.width = cssWidth;
      freehandCanvas.style.height = cssHeight;
      freehandCanvas.width = parseInt(cssWidth, 10);
      freehandCanvas.height = parseInt(cssHeight, 10);

      this.setupPageInteraction(i, pageContainer, freehandCanvas);
    }

    this.renderCurrentPageAnnotations();
    this.renderTrueEditOverlays();
  }

  private setupPageInteraction(pageIndex: number, pageContainer: HTMLElement, freehandCanvas: HTMLCanvasElement) {
    // 1. Click to add Text / Shape / Whiteout / Erase
    pageContainer.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;

      // Update active page index
      this.activePageIndex = pageIndex;
      this.updateViewbar();

      // Handle Eraser / Whiteout tool
      if (this.currentTool === 'eraser' || this.currentTool === 'whiteout') {
        // 1. If clicked an annotation item, erase it immediately!
        const annItem = target.closest('.annotation-item') as HTMLElement | null;
        if (annItem) {
          e.preventDefault();
          e.stopPropagation();
          const annId = annItem.getAttribute('data-id');
          if (annId) this.annotationManager.deleteAnnotation(annId);
          return;
        }

        // 2. If clicked an active TrueEdit modified text patch, erase it immediately!
        const modPatch = target.closest('.trueedit-modified-patch') as HTMLElement | null;
        if (modPatch) {
          e.preventDefault();
          e.stopPropagation();
          const changeId = modPatch.getAttribute('data-id');
          if (changeId) {
            const origItem = this.pdfManager.getExtractedTexts(pageIndex).find((t) => t.id === changeId);
            if (origItem) {
              this.trueEditManager.startOrUpdateEdit(origItem, '', 'DM Sans', origItem.fontSize, '#000000', true);
            } else {
              const curChange = this.trueEditManager.getChange(changeId);
              if (curChange) {
                curChange.deleted = true;
                curChange.newText = '';
                curChange.spans = [];
                this.trueEditManager.notify();
              }
            }
          }
          return;
        }

        // 3. If clicked an unmodified TrueEdit text hover box, erase it immediately!
        const hoverBox = target.closest('.trueedit-hover-box') as HTMLElement | null;
        if (hoverBox) {
          e.preventDefault();
          e.stopPropagation();
          const itemId = hoverBox.getAttribute('data-id');
          const item = this.pdfManager.getExtractedTexts(pageIndex).find((t) => t.id === itemId);
          if (item) {
            this.trueEditManager.startOrUpdateEdit(item, '', 'DM Sans', item.fontSize, '#000000', true);
          }
          return;
        }

        // 4. Click or drag on page canvas to whiteout an area
        const rect = pageContainer.getBoundingClientRect();
        const startX = (e.clientX - rect.left) / this.currentScale;
        const startY = (e.clientY - rect.top) / this.currentScale;

        const previewBox = document.createElement('div');
        previewBox.className = 'whiteout-drag-preview';
        previewBox.style.left = `${startX * this.currentScale}px`;
        previewBox.style.top = `${startY * this.currentScale}px`;
        previewBox.style.width = '0px';
        previewBox.style.height = '0px';
        pageContainer.appendChild(previewBox);

        let hasDragged = false;
        const onDragMove = (moveEv: MouseEvent) => {
          hasDragged = true;
          const curX = (moveEv.clientX - rect.left) / this.currentScale;
          const curY = (moveEv.clientY - rect.top) / this.currentScale;
          const left = Math.min(startX, curX);
          const top = Math.min(startY, curY);
          const width = Math.abs(curX - startX);
          const height = Math.abs(curY - startY);

          previewBox.style.left = `${left * this.currentScale}px`;
          previewBox.style.top = `${top * this.currentScale}px`;
          previewBox.style.width = `${width * this.currentScale}px`;
          previewBox.style.height = `${height * this.currentScale}px`;
        };

        const onDragUp = (upEv: MouseEvent) => {
          window.removeEventListener('mousemove', onDragMove);
          window.removeEventListener('mouseup', onDragUp);
          document.querySelectorAll('.whiteout-drag-preview').forEach((p) => p.remove());

          const endX = (upEv.clientX - rect.left) / this.currentScale;
          const endY = (upEv.clientY - rect.top) / this.currentScale;
          const finalLeft = Math.min(startX, endX);
          const finalTop = Math.min(startY, endY);
          const finalWidth = Math.abs(endX - startX);
          const finalHeight = Math.abs(endY - startY);

          const eraseW = (hasDragged && finalWidth > 8) ? finalWidth : 120;
          const eraseH = (hasDragged && finalHeight > 8) ? finalHeight : 26;
          const eraseX = (hasDragged && finalWidth > 8) ? finalLeft : startX;
          const eraseY = (hasDragged && finalHeight > 8) ? finalTop : startY;

          // 1. Mark all original text items inside this erased rectangle as deleted in TrueEdit
          const pageTexts = this.pdfManager.getExtractedTexts(pageIndex);
          for (const txt of pageTexts) {
            const overlapX = txt.x < eraseX + eraseW && txt.x + txt.width > eraseX;
            const overlapY = txt.y < eraseY + eraseH && txt.y + txt.height > eraseY;
            if (overlapX && overlapY) {
              this.trueEditManager.startOrUpdateEdit(txt, '', 'DM Sans', txt.fontSize, '#000000', true);
            }
          }

          // 2. If using eraser mode and an annotation was completely boxed inside the drag rectangle, erase it
          if (this.currentTool === 'eraser') {
            const pageAnns = this.annotationManager.getAnnotations(pageIndex);
            for (const a of pageAnns) {
              if (a.type === 'whiteout') continue;
              const fullyEnclosed =
                eraseX <= a.x &&
                eraseY <= a.y &&
                eraseX + eraseW >= a.x + a.width &&
                eraseY + eraseH >= a.y + a.height;
              if (fullyEnclosed) {
                this.annotationManager.deleteAnnotation(a.id);
              }
            }
          }

          // 3. Add clean solid whiteout covering the area
          this.annotationManager.addWhiteout(pageIndex, eraseX, eraseY, eraseW, eraseH);
          this.annotationManager.setSelectedId(null);
        };

        window.addEventListener('mousemove', onDragMove);
        window.addEventListener('mouseup', onDragUp);
        return;
      }

      // If clicking inside an existing annotation, handle, or trueedit box, skip creation
      if (
        target.closest('.annotation-item') ||
        target.closest('.transform-handle') ||
        target.closest('.trueedit-hover-box') ||
        target.closest('.trueedit-modified-patch') ||
        target.closest('.trueedit-inline-input')
      ) {
        return;
      }

      const rect = pageContainer.getBoundingClientRect();
      const clickX = (e.clientX - rect.left) / this.currentScale;
      const clickY = (e.clientY - rect.top) / this.currentScale;

      if (this.currentTool === 'text') {
        this.annotationManager.addText(pageIndex, clickX, clickY, 'Double click to edit');
        this.setTool('select');
      } else if (this.currentTool === 'select') {
        // Deselect if clicking on empty space
        this.annotationManager.setSelectedId(null);
      }
    });

    // 2. Freehand Drawing
    const ctx = freehandCanvas.getContext('2d');
    if (!ctx) return;

    freehandCanvas.addEventListener('mousedown', (e) => {
      if (this.currentTool !== 'freehand') return;
      this.isDrawingFreehand = true;
      this.currentFreehandPoints = [];

      const rect = freehandCanvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / this.currentScale;
      const y = (e.clientY - rect.top) / this.currentScale;
      this.currentFreehandPoints.push({ x, y });

      ctx.save();
      ctx.strokeStyle = this.annotationManager.currentBrushColor;
      ctx.lineWidth = this.annotationManager.currentBrushWidth * this.currentScale;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x * this.currentScale, y * this.currentScale);
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDrawingFreehand || this.currentTool !== 'freehand') return;
      const rect = freehandCanvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / this.currentScale;
      const y = (e.clientY - rect.top) / this.currentScale;
      this.currentFreehandPoints.push({ x, y });

      ctx.lineTo(x * this.currentScale, y * this.currentScale);
      ctx.stroke();
    });

    window.addEventListener('mouseup', () => {
      if (!this.isDrawingFreehand) return;
      this.isDrawingFreehand = false;
      ctx.clearRect(0, 0, freehandCanvas.width, freehandCanvas.height);
      ctx.restore();

      if (this.currentFreehandPoints.length > 2) {
        this.annotationManager.addFreehand(pageIndex, this.currentFreehandPoints);
      }
      this.currentFreehandPoints = [];
    });
  }

  private isItemOccluded(item: ExtractedTextItem, changes: TrueEditTextChange[], pageIdx: number): boolean {
    const itemCx = item.x + item.width / 2;
    const itemCy = item.y + item.height / 2;

    for (const change of changes) {
      if (change.deleted) continue;

      const rawLines = (change.newText || '').split('\n');
      const numLines = Math.max(1, rawLines.length);
      const lineHeight = change.fontSize * 1.25;
      const changeHeight = Math.max(change.height, change.fontSize * 1.08 + (numLines - 1) * lineHeight);
      const changeWidth = Math.max(change.width, 40);

      const inX = itemCx >= change.x - 3 && itemCx <= change.x + changeWidth + 8;
      const inY = itemCy >= change.y - 3 && itemCy <= change.y + changeHeight + 4;

      if (inX && inY) {
        return true;
      }
    }

    // Check if covered by any whiteout annotation
    const pageAnns = this.annotationManager.getAnnotations(pageIdx);
    for (const ann of pageAnns) {
      if (ann.type === 'whiteout') {
        const inX = itemCx >= ann.x - 2 && itemCx <= ann.x + ann.width + 2;
        const inY = itemCy >= ann.y - 2 && itemCy <= ann.y + ann.height + 2;
        if (inX && inY) {
          return true;
        }
      }
    }

    return false;
  }

  // Render TrueEdit Overlays (Pro direct text editing on existing PDF content!)
  private renderTrueEditOverlays() {
    const pagesMeta = this.pdfManager.getPagesMeta();

    for (let pageIdx = 0; pageIdx < pagesMeta.length; pageIdx++) {
      const container = document.getElementById(`trueEditLayer-${pageIdx}`);
      if (!container) continue;

      container.innerHTML = '';
      const textItems = this.pdfManager.getExtractedTexts(pageIdx);
      const changes = this.trueEditManager.getChangesForPage(pageIdx);

      // 1. Render deleted patches FIRST (silent background whiteout masks at original coordinates)
      for (const change of changes) {
        if (!change.deleted) continue;
        const mask = document.createElement('div');
        mask.className = 'trueedit-deleted-patch';
        mask.setAttribute('data-id', change.id);
        const origX = change.origX !== undefined ? change.origX : change.x;
        const origY = change.origY !== undefined ? change.origY : change.y;
        const origW = change.origWidth !== undefined ? change.origWidth : change.width;
        const origH = change.origHeight !== undefined ? change.origHeight : change.height;

        const padX = 3;
        const padY = 2;
        mask.style.position = 'absolute';
        mask.style.display = 'block';
        mask.style.backgroundColor = '#ffffff';
        mask.style.left = `${(origX - padX) * this.currentScale}px`;
        mask.style.top = `${(origY - padY) * this.currentScale}px`;
        mask.style.width = `${(origW + padX * 2) * this.currentScale}px`;
        mask.style.height = `${(origH + padY * 2) * this.currentScale}px`;
        mask.style.zIndex = '10';
        mask.style.pointerEvents = 'none';
        container.appendChild(mask);
      }

      // 2. Render active modified text patches (cover-ups and replacement text)
      for (const change of changes) {
        if (change.deleted) continue;

        // If the patch was moved, keep an under-mask at original position so original PDF text remains covered
        const wasMoved = change.origX !== undefined && change.origY !== undefined && (Math.abs(change.x - change.origX) > 1 || Math.abs(change.y - change.origY) > 1);
        if (wasMoved && change.origX !== undefined && change.origY !== undefined) {
          const origMask = document.createElement('div');
          origMask.className = 'trueedit-orig-mask';
          origMask.style.position = 'absolute';
          origMask.style.display = 'block';
          origMask.style.backgroundColor = '#ffffff';
          origMask.style.left = `${(change.origX - 2) * this.currentScale}px`;
          origMask.style.top = `${(change.origY - 2) * this.currentScale}px`;
          origMask.style.width = `${((change.origWidth || change.width) + 4) * this.currentScale}px`;
          origMask.style.height = `${((change.origHeight || change.height) + 4) * this.currentScale}px`;
          container.appendChild(origMask);
        }

        const patch = document.createElement('div');
        patch.className = 'trueedit-modified-patch';
        patch.setAttribute('data-id', change.id);
        patch.style.left = `${change.x * this.currentScale}px`;
        patch.style.top = `${change.y * this.currentScale}px`;
        patch.style.minWidth = `${change.width * this.currentScale}px`;
        patch.style.width = 'max-content';
        patch.style.textAlign = change.align || 'left';

        // Add Drag Handle: ⠿ Move
        if (this.currentMode === 'trueedit') {
          const dragHandle = document.createElement('div');
          dragHandle.className = 'trueedit-drag-handle';
          dragHandle.innerHTML = '<span style="font-size: 13px; line-height: 1;">⠿</span> Move';
          dragHandle.title = 'Click and drag to move text block anywhere on page';

          let startMouseX = 0;
          let startMouseY = 0;
          let startChangeX = change.x;
          let startChangeY = change.y;
          let hasMoved = false;

          dragHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            startMouseX = e.clientX;
            startMouseY = e.clientY;
            startChangeX = change.x;
            startChangeY = change.y;
            hasMoved = false;

            patch.classList.add('is-dragging');
            document.body.style.cursor = 'grabbing';

            const onMouseMove = (moveEv: MouseEvent) => {
              hasMoved = true;
              const deltaX = (moveEv.clientX - startMouseX) / this.currentScale;
              const deltaY = (moveEv.clientY - startMouseY) / this.currentScale;

              patch.style.left = `${(startChangeX + deltaX) * this.currentScale}px`;
              patch.style.top = `${(startChangeY + deltaY) * this.currentScale}px`;
            };

            const onMouseUp = (upEv: MouseEvent) => {
              document.removeEventListener('mousemove', onMouseMove);
              document.removeEventListener('mouseup', onMouseUp);
              patch.classList.remove('is-dragging');
              document.body.style.cursor = '';

              if (hasMoved) {
                const deltaX = (upEv.clientX - startMouseX) / this.currentScale;
                const deltaY = (upEv.clientY - startMouseY) / this.currentScale;

                const newX = Math.round((startChangeX + deltaX) * 10) / 10;
                const newY = Math.round((startChangeY + deltaY) * 10) / 10;

                let newPdfX = change.pdfX;
                let newPdfBaselineY = change.pdfBaselineY;

                if (change.origPdfX !== undefined && change.origX !== undefined) {
                  newPdfX = Math.round((change.origPdfX + (newX - change.origX)) * 10) / 10;
                } else if (newPdfX !== undefined) {
                  newPdfX = Math.round((newPdfX + deltaX) * 10) / 10;
                }

                if (change.origPdfBaselineY !== undefined && change.origY !== undefined) {
                  newPdfBaselineY = Math.round((change.origPdfBaselineY - (newY - change.origY)) * 10) / 10;
                } else if (newPdfBaselineY !== undefined) {
                  newPdfBaselineY = Math.round((newPdfBaselineY - deltaY) * 10) / 10;
                }

                this.trueEditManager.updatePosition(change.id, newX, newY, newPdfX, newPdfBaselineY);
              }
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
          });

          patch.appendChild(dragHandle);
        }

        const textContentContainer = document.createElement('div');
        textContentContainer.className = 'trueedit-patch-content';

        if (change.spans && change.spans.length > 0) {
          let currentLineDiv = document.createElement('div');
          currentLineDiv.style.lineHeight = `${change.fontSize * 1.25 * this.currentScale}px`;
          currentLineDiv.style.whiteSpace = 'pre';
          currentLineDiv.style.textAlign = change.align || 'left';

          for (const span of change.spans) {
            const parts = span.text.split('\n');
            for (let p = 0; p < parts.length; p++) {
              if (p > 0) {
                textContentContainer.appendChild(currentLineDiv);
                currentLineDiv = document.createElement('div');
                currentLineDiv.style.lineHeight = `${change.fontSize * 1.25 * this.currentScale}px`;
                currentLineDiv.style.whiteSpace = 'pre';
                currentLineDiv.style.textAlign = change.align || 'left';
              }
              if (parts[p].length > 0) {
                const spanEl = document.createElement('span');
                spanEl.innerText = parts[p];
                spanEl.style.fontSize = `${(span.fontSize || change.fontSize) * this.currentScale}px`;
                spanEl.style.fontFamily = span.fontFamily || change.fontFamily || 'DM Sans';
                spanEl.style.fontWeight = span.bold ? 'bold' : 'normal';
                spanEl.style.fontStyle = span.italic ? 'italic' : 'normal';
                spanEl.style.color = span.color || change.color || '#000000';
                currentLineDiv.appendChild(spanEl);
              }
            }
          }
          textContentContainer.appendChild(currentLineDiv);
        } else {
          const lines = (change.newText || '').split('\n');
          for (let l = 0; l < lines.length; l++) {
            const lineDiv = document.createElement('div');
            lineDiv.innerText = lines[l] || ' ';
            lineDiv.style.fontSize = `${change.fontSize * this.currentScale}px`;
            lineDiv.style.fontFamily = change.fontFamily || 'DM Sans';
            lineDiv.style.fontWeight = change.bold ? 'bold' : 'normal';
            lineDiv.style.fontStyle = change.italic ? 'italic' : 'normal';
            lineDiv.style.color = change.color || '#000000';
            lineDiv.style.lineHeight = `${change.height * this.currentScale}px`;
            lineDiv.style.whiteSpace = 'pre';
            lineDiv.style.textAlign = change.align || 'left';
            textContentContainer.appendChild(lineDiv);
          }
        }
        patch.appendChild(textContentContainer);

        patch.addEventListener('mousedown', (e) => {
          if (this.currentTool === 'eraser' || this.currentTool === 'whiteout') {
            e.preventDefault();
            e.stopPropagation();
            const origItem = textItems.find((t) => t.id === change.id);
            if (origItem) {
              this.trueEditManager.startOrUpdateEdit(origItem, '', 'DM Sans', origItem.fontSize, '#000000', true);
            } else {
              change.deleted = true;
              change.newText = '';
              change.spans = [];
              this.trueEditManager.notify();
            }
          }
        });

        // Click to select and re-edit
        patch.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (this.currentTool === 'eraser' || this.currentTool === 'whiteout') return;
          document.querySelectorAll('.trueedit-modified-patch').forEach((p) => p.classList.remove('selected'));
          patch.classList.add('selected');

          const origItem = textItems.find((t) => t.id === change.id);
          if (origItem) {
            this.openInlineTrueEdit(origItem, patch);
          } else {
            const syntheticItem: ExtractedTextItem = {
              id: change.id,
              pageIndex: change.pageIndex,
              text: change.originalText,
              x: change.x,
              y: change.y,
              width: change.width,
              height: change.height,
              fontSize: change.fontSize,
              fontName: change.fontFamily,
              color: change.color,
              bold: change.bold,
              pdfX: change.pdfX,
              pdfBaselineY: change.pdfBaselineY,
            };
            this.openInlineTrueEdit(syntheticItem, patch);
          }
        });

        container.appendChild(patch);
      }

      // 3. Render hover boxes for unmodified text items
      if (this.currentMode === 'trueedit') {
        for (const item of textItems) {
          // If already modified or deleted, don't duplicate a hover box over it
          if (changes.some((c) => c.id === item.id)) continue;

          // If empty text or zero dimensions, skip
          if (!item.text || item.text.trim().length === 0 || item.width < 3 || item.height < 3) continue;

          // Check if this item is covered/occluded by an active modified patch or whiteout
          if (this.isItemOccluded(item, changes, pageIdx)) continue;

          const box = document.createElement('div');
          box.className = 'trueedit-hover-box';
          box.setAttribute('data-id', item.id);
          box.title = `Click to edit: "${item.text}"`;
          box.style.left = `${item.x * this.currentScale}px`;
          box.style.top = `${item.y * this.currentScale}px`;
          box.style.width = `${Math.max(16, item.width * this.currentScale)}px`;
          box.style.height = `${item.height * this.currentScale}px`;

          box.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (this.currentTool === 'eraser' || this.currentTool === 'whiteout') {
              this.trueEditManager.startOrUpdateEdit(item, '', 'DM Sans', item.fontSize, '#000000', true);
              return;
            }
            this.openInlineTrueEdit(item, box);
          });
          box.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
          });

          container.appendChild(box);
        }
      }
    }
  }

  private sampleTextColorFromCanvas(
    canvas: HTMLCanvasElement,
    x: number,
    y: number,
    width: number,
    height: number
  ): string {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return '#000000';

      const cssW = parseFloat(canvas.style.width) || canvas.width;
      const cssH = parseFloat(canvas.style.height) || canvas.height;
      const scaleX = canvas.width / cssW;
      const scaleY = canvas.height / cssH;

      const padX = Math.round(2 * scaleX);
      const padY = Math.round(2 * scaleY);
      const startX = Math.max(0, Math.floor(x * this.currentScale * scaleX) - padX);
      const startY = Math.max(0, Math.floor(y * this.currentScale * scaleY) - padY);
      const boxW = Math.max(4, Math.min(canvas.width - startX, Math.floor(width * this.currentScale * scaleX) + padX * 2));
      const boxH = Math.max(4, Math.min(canvas.height - startY, Math.floor(height * this.currentScale * scaleY) + padY * 2));

      const imgData = ctx.getImageData(startX, startY, boxW, boxH);
      const data = imgData.data;

      // 1. Sample perimeter pixels to establish the true background color
      let sumBgR = 0, sumBgG = 0, sumBgB = 0, bgCount = 0;
      for (let px = 0; px < boxW; px++) {
        const topIdx = (0 * boxW + px) * 4;
        if (data[topIdx + 3] > 80) {
          sumBgR += data[topIdx];
          sumBgG += data[topIdx + 1];
          sumBgB += data[topIdx + 2];
          bgCount++;
        }
        const botIdx = ((boxH - 1) * boxW + px) * 4;
        if (data[botIdx + 3] > 80) {
          sumBgR += data[botIdx];
          sumBgG += data[botIdx + 1];
          sumBgB += data[botIdx + 2];
          bgCount++;
        }
      }
      for (let py = 1; py < boxH - 1; py++) {
        const leftIdx = (py * boxW + 0) * 4;
        if (data[leftIdx + 3] > 80) {
          sumBgR += data[leftIdx];
          sumBgG += data[leftIdx + 1];
          sumBgB += data[leftIdx + 2];
          bgCount++;
        }
        const rightIdx = (py * boxW + (boxW - 1)) * 4;
        if (data[rightIdx + 3] > 80) {
          sumBgR += data[rightIdx];
          sumBgG += data[rightIdx + 1];
          sumBgB += data[rightIdx + 2];
          bgCount++;
        }
      }

      const bgR = bgCount > 0 ? Math.round(sumBgR / bgCount) : 255;
      const bgG = bgCount > 0 ? Math.round(sumBgG / bgCount) : 255;
      const bgB = bgCount > 0 ? Math.round(sumBgB / bgCount) : 255;

      // 2. Measure max color distance from background across all pixels inside box
      let maxDist = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 80) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
        if (dist > maxDist) maxDist = dist;
      }

      // If no significant contrast from background, default to black (or white if dark bg)
      if (maxDist < 25) {
        const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;
        return bgLum < 128 ? '#ffffff' : '#000000';
      }

      // 3. Average the core text pixels (top 25% contrast from background to avoid anti-aliasing blur)
      const threshold = maxDist * 0.75;
      let sumTextR = 0, sumTextG = 0, sumTextB = 0, textCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 80) continue;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const dist = Math.hypot(r - bgR, g - bgG, b - bgB);
        if (dist >= threshold) {
          sumTextR += r;
          sumTextG += g;
          sumTextB += b;
          textCount++;
        }
      }

      if (textCount > 0) {
        const finalR = Math.round(sumTextR / textCount);
        const finalG = Math.round(sumTextG / textCount);
        const finalB = Math.round(sumTextB / textCount);

        // Snap near-black neutral text to clean #000000
        const isNeutral = Math.abs(finalR - finalG) <= 12 && Math.abs(finalG - finalB) <= 12 && Math.abs(finalR - finalB) <= 12;
        if (isNeutral && finalR < 48 && finalG < 48 && finalB < 48) return '#000000';
        // Snap near-white text to clean #ffffff
        if (finalR > 240 && finalG > 240 && finalB > 240) return '#ffffff';

        const hex = (v: number) => v.toString(16).padStart(2, '0');
        return `#${hex(finalR)}${hex(finalG)}${hex(finalB)}`;
      }
    } catch (_) {}
    return '#000000';
  }

  private openInlineTrueEdit(item: ExtractedTextItem, boxEl: HTMLElement) {
    // Remove any existing inline popovers or inputs
    document.querySelectorAll('.trueedit-popover').forEach((el) => el.remove());
    document.querySelectorAll('.trueedit-inline-input').forEach((el) => el.remove());

    const existingChange = this.trueEditManager.getChange(item.id);
    const initialText = existingChange ? existingChange.newText : item.text;

    // Detect original font style and weight
    let isBold = existingChange ? existingChange.bold : (item.bold ?? false);
    const fn = (item.fontName || '').toLowerCase();
    if (!isBold && /bold|black|heavy|w[7-9]|semibold|medium/i.test(fn)) {
      isBold = true;
    }
    let isItalic = existingChange ? existingChange.italic : /italic|oblique/i.test(fn);

    // Precise font family detection (check sans-serif first to prevent false match on "sans-serif")
    const isSans =
      fn.includes('sans') ||
      fn.includes('arial') ||
      fn.includes('helvetica') ||
      fn.includes('graphik') ||
      fn.includes('dm') ||
      fn.includes('roboto') ||
      fn.includes('inter') ||
      fn.includes('calibri') ||
      fn.includes('segoe') ||
      fn.includes('tahoma') ||
      fn.includes('verdana');

    const isSerif =
      !isSans &&
      (fn.includes('serif') ||
        fn.includes('times') ||
        fn.includes('roman') ||
        fn.includes('baskerville') ||
        fn.includes('georgia') ||
        fn.includes('minion') ||
        fn.includes('garamond') ||
        fn.includes('cambria'));

    const isMono = fn.includes('mono') || fn.includes('courier') || fn.includes('consolas') || fn.includes('menlo');

    let detectedFont = 'Arial';
    if (existingChange) {
      detectedFont = existingChange.fontFamily;
    } else if (isMono) {
      detectedFont = 'Courier';
    } else if (isSerif) {
      detectedFont = 'Libre Baskerville';
    } else if (isSans || fn.includes('arial') || fn.includes('helvetica') || fn.includes('sans')) {
      detectedFont = 'Arial';
    } else {
      detectedFont = 'Arial';
    }

    let currentFontSize = existingChange ? existingChange.fontSize : item.fontSize;
    let currentAlign: 'left' | 'center' | 'right' = existingChange?.align || 'left';

    // Sample exact color from canvas or extracted item
    const pageCanvas = document.getElementById(`pdfCanvas-${item.pageIndex}`) as HTMLCanvasElement | null;
    let detectedColor = existingChange ? existingChange.color : (item.color || '#000000');
    if (!existingChange) {
      if (item.color) {
        detectedColor = item.color;
      } else if (pageCanvas) {
        detectedColor = this.sampleTextColorFromCanvas(pageCanvas, item.x, item.y, item.width, item.height);
        item.color = detectedColor;
      }
    }

    // Create interactive popover
    const popover = document.createElement('div');
    popover.className = 'trueedit-popover';
    popover.style.position = 'absolute';
    popover.style.left = `${Math.max(4, parseInt(boxEl.style.left, 10) - 4)}px`;
    popover.style.top = `${Math.max(4, parseInt(boxEl.style.top, 10) - 96)}px`;
    popover.style.zIndex = '99999';

    // Drag bar for popover
    const popDragBar = document.createElement('div');
    popDragBar.className = 'trueedit-popover-drag-bar';
    popDragBar.innerHTML = '<span>⠿ Drag editor window</span>';
    let pStartX = 0, pStartY = 0, pInitLeft = 0, pInitTop = 0;
    popDragBar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pStartX = e.clientX;
      pStartY = e.clientY;
      pInitLeft = parseInt(popover.style.left, 10) || 0;
      pInitTop = parseInt(popover.style.top, 10) || 0;
      const onMove = (mv: MouseEvent) => {
        popover.style.left = `${pInitLeft + (mv.clientX - pStartX)}px`;
        popover.style.top = `${pInitTop + (mv.clientY - pStartY)}px`;
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    popover.appendChild(popDragBar);

    // Row 1: Contenteditable multiline rich input and primary actions
    const row1 = document.createElement('div');
    row1.className = 'trueedit-pop-row';

    const editorInput = document.createElement('div');
    editorInput.className = 'trueedit-rich-editor';
    editorInput.contentEditable = 'true';
    editorInput.spellcheck = false;
    const estimatedWidth = Math.max(260, parseInt(boxEl.style.width || '160', 10) + 40);
    editorInput.style.minWidth = `${estimatedWidth}px`;
    editorInput.style.fontFamily = detectedFont;
    editorInput.style.fontWeight = isBold ? 'bold' : 'normal';
    editorInput.style.fontStyle = isItalic ? 'italic' : 'normal';
    editorInput.style.color = detectedColor;
    editorInput.style.fontSize = `${currentFontSize}px`;
    editorInput.style.textAlign = currentAlign;

    // Populate editor with existing spans or text
    if (existingChange && existingChange.spans && existingChange.spans.length > 0) {
      editorInput.innerHTML = '';
      for (const sp of existingChange.spans) {
        const parts = sp.text.split('\n');
        for (let p = 0; p < parts.length; p++) {
          if (p > 0) editorInput.appendChild(document.createElement('br'));
          if (parts[p].length > 0) {
            const s = document.createElement('span');
            s.innerText = parts[p];
            if (sp.color) s.style.color = sp.color;
            if (sp.fontFamily) s.style.fontFamily = sp.fontFamily;
            if (sp.fontSize) s.style.fontSize = `${sp.fontSize}px`;
            if (sp.bold !== undefined) s.style.fontWeight = sp.bold ? 'bold' : 'normal';
            if (sp.italic !== undefined) s.style.fontStyle = sp.italic ? 'italic' : 'normal';
            editorInput.appendChild(s);
          }
        }
      }
    } else {
      editorInput.innerHTML = '';
      const parts = initialText.split('\n');
      for (let p = 0; p < parts.length; p++) {
        if (p > 0) editorInput.appendChild(document.createElement('br'));
        if (parts[p].length > 0) {
          const s = document.createElement('span');
          s.innerText = parts[p];
          s.style.color = detectedColor;
          s.style.fontFamily = detectedFont;
          s.style.fontSize = `${currentFontSize}px`;
          s.style.fontWeight = isBold ? 'bold' : 'normal';
          s.style.fontStyle = isItalic ? 'italic' : 'normal';
          editorInput.appendChild(s);
        }
      }
    }

    // Helper to get current formatting at a selection range
    const getRangeCurrentStyle = (range: Range) => {
      let node: Node | null = range.startContainer;
      let el: HTMLElement | null =
        node.nodeType === Node.ELEMENT_NODE
          ? (node as HTMLElement)
          : node.parentElement;

      let color = detectedColor;
      let fontFamily = detectedFont;
      let fontSize = currentFontSize;
      let bold = isBold;
      let italic = isItalic;

      while (el && el !== editorInput.parentElement) {
        if (el.style && el.style.color) {
          color = normalizeColorToHex(el.style.color);
        }
        if (el.style && el.style.fontFamily) {
          fontFamily = el.style.fontFamily.replace(/['"]/g, '');
        }
        if (el.style && el.style.fontSize) {
          const sz = parseInt(el.style.fontSize, 10);
          if (!isNaN(sz) && sz > 0) fontSize = sz;
        }
        if (el.style && (el.style.fontWeight === 'bold' || parseInt(el.style.fontWeight, 10) >= 600) || el.tagName === 'B' || el.tagName === 'STRONG') {
          bold = true;
        } else if (el.style && (el.style.fontWeight === 'normal' || parseInt(el.style.fontWeight, 10) === 400)) {
          bold = false;
        }
        if (el.style && el.style.fontStyle === 'italic' || el.tagName === 'I' || el.tagName === 'EM') {
          italic = true;
        } else if (el.style && el.style.fontStyle === 'normal') {
          italic = false;
        }
        if (el === editorInput) break;
        el = el.parentElement;
      }

      return { color, fontFamily, fontSize, bold, italic };
    };

    // Helper to update toolbar controls to reflect style of current selection or caret
    const updateToolbarIndicators = (st: { color: string; fontFamily: string; fontSize: number; bold: boolean; italic: boolean }) => {
      sizeVal.innerText = `${st.fontSize}px`;
      btnBold.classList.toggle('active', st.bold);
      btnItalic.classList.toggle('active', st.italic);
      (fontPickerEl as any)?.setCurrentFont?.(st.fontFamily);
      colorPicker.value = st.color.startsWith('#') && st.color.length === 7 ? st.color : '#000000';
      quickColors.querySelectorAll('.trueedit-dot-color').forEach((el) => {
        const btn = el as HTMLButtonElement;
        const btnHex = normalizeColorToHex(btn.style.backgroundColor);
        btn.classList.toggle('active', btnHex === st.color.toLowerCase());
      });
    };

    // Selection tracking for selective formatting
    let savedRange: Range | null = null;
    const saveCurrentRange = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (editorInput.contains(range.commonAncestorContainer)) {
          if (!range.collapsed) {
            savedRange = range.cloneRange();
          } else {
            savedRange = null;
          }
          updateToolbarIndicators(getRangeCurrentStyle(range));
        }
      }
    };

    editorInput.addEventListener('keyup', saveCurrentRange);
    editorInput.addEventListener('mouseup', saveCurrentRange);
    editorInput.addEventListener('input', saveCurrentRange);

    const onDocSelectionChange = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        if (editorInput.contains(range.commonAncestorContainer)) {
          if (!range.collapsed) {
            savedRange = range.cloneRange();
          } else {
            savedRange = null;
          }
          updateToolbarIndicators(getRangeCurrentStyle(range));
        }
      }
    };
    document.addEventListener('selectionchange', onDocSelectionChange);

    const applyStyleUpdate = (updates: { color?: string; fontFamily?: string; fontSize?: number; bold?: boolean; italic?: boolean }) => {
      saveCurrentRange();
      const sel = window.getSelection();
      let hasAppliedSelection = false;

      if (savedRange && !savedRange.collapsed && editorInput.contains(savedRange.commonAncestorContainer)) {
        sel?.removeAllRanges();
        sel?.addRange(savedRange);

        const curStyle = getRangeCurrentStyle(savedRange);
        const targetColor = updates.color ?? curStyle.color;
        const targetFont = updates.fontFamily ?? curStyle.fontFamily;
        const targetSize = updates.fontSize ?? curStyle.fontSize;
        const targetBold = updates.bold !== undefined ? updates.bold : curStyle.bold;
        const targetItalic = updates.italic !== undefined ? updates.italic : curStyle.italic;

        const fragment = savedRange.extractContents();

        // Strip matching inline styles from children so wrapper styles cascade cleanly
        const children = fragment.querySelectorAll('*');
        children.forEach((child) => {
          const ch = child as HTMLElement;
          if (updates.color) ch.style.color = '';
          if (updates.fontFamily) ch.style.fontFamily = '';
          if (updates.fontSize) ch.style.fontSize = '';
          if (updates.bold !== undefined) {
            ch.style.fontWeight = '';
            if (ch.tagName === 'B' || ch.tagName === 'STRONG') {
              if (!targetBold) ch.style.fontWeight = 'normal';
            }
          }
          if (updates.italic !== undefined) {
            ch.style.fontStyle = '';
            if (ch.tagName === 'I' || ch.tagName === 'EM') {
              if (!targetItalic) ch.style.fontStyle = 'normal';
            }
          }
        });

        const span = document.createElement('span');
        span.style.color = targetColor;
        span.style.fontFamily = targetFont;
        span.style.fontSize = `${targetSize}px`;
        span.style.fontWeight = targetBold ? 'bold' : 'normal';
        span.style.fontStyle = targetItalic ? 'italic' : 'normal';
        span.appendChild(fragment);

        savedRange.insertNode(span);

        // Keep the formatted span selected so user can chain multiple formatting actions
        const newR = document.createRange();
        newR.selectNodeContents(span);
        sel?.removeAllRanges();
        sel?.addRange(newR);
        savedRange = newR.cloneRange();
        hasAppliedSelection = true;

        updateToolbarIndicators({
          color: targetColor,
          fontFamily: targetFont,
          fontSize: targetSize,
          bold: targetBold,
          italic: targetItalic,
        });
      }

      if (!hasAppliedSelection) {
        if (updates.color) {
          detectedColor = updates.color;
          editorInput.style.color = updates.color;
          editorInput.querySelectorAll('span').forEach((s) => {
            s.style.color = updates.color!;
          });
        }
        if (updates.fontFamily) {
          detectedFont = updates.fontFamily;
          editorInput.style.fontFamily = updates.fontFamily;
          editorInput.querySelectorAll('span').forEach((s) => {
            s.style.fontFamily = updates.fontFamily!;
          });
        }
        if (updates.fontSize) {
          currentFontSize = updates.fontSize;
          editorInput.style.fontSize = `${updates.fontSize}px`;
          editorInput.querySelectorAll('span').forEach((s) => {
            s.style.fontSize = `${updates.fontSize}px`;
          });
        }
        if (updates.bold !== undefined) {
          isBold = updates.bold;
          editorInput.style.fontWeight = isBold ? 'bold' : 'normal';
          editorInput.querySelectorAll('span').forEach((s) => {
            s.style.fontWeight = isBold ? 'bold' : 'normal';
          });
        }
        if (updates.italic !== undefined) {
          isItalic = updates.italic;
          editorInput.style.fontStyle = isItalic ? 'italic' : 'normal';
          editorInput.querySelectorAll('span').forEach((s) => {
            s.style.fontStyle = isItalic ? 'italic' : 'normal';
          });
        }

        updateToolbarIndicators({
          color: detectedColor,
          fontFamily: detectedFont,
          fontSize: currentFontSize,
          bold: isBold,
          italic: isItalic,
        });
      }
    };

    const preventFocusLoss = (btn: HTMLElement) => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        saveCurrentRange();
      });
    };

    const btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'trueedit-pop-btn trueedit-btn-save';
    btnSave.innerText = '✓ Save';
    btnSave.title = 'Save text changes (Ctrl+Enter)';

    const btnDelete = document.createElement('button');
    btnDelete.type = 'button';
    btnDelete.className = 'trueedit-pop-btn trueedit-btn-delete';
    btnDelete.innerText = '🗑';
    btnDelete.title = 'Delete / Erase this text';

    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'trueedit-pop-btn trueedit-btn-cancel';
    btnCancel.innerText = '✕';
    btnCancel.title = 'Cancel (Esc)';

    row1.appendChild(editorInput);
    row1.appendChild(btnSave);
    row1.appendChild(btnDelete);
    row1.appendChild(btnCancel);

    // Row 2: Formatting controls (Font, Size, Alignment, Bold, Italic, Color)
    const row2 = document.createElement('div');
    row2.className = 'trueedit-pop-row';

    // Searchable Font Family Picker (with Search & Add Font options)
    const fontPickerEl = createSearchableFontPicker({
      currentFont: detectedFont,
      compact: true,
      dropdownPosition: 'top',
      onSelect: (selectedFont) => {
        saveCurrentRange();
        detectedFont = selectedFont;
        applyStyleUpdate({ fontFamily: detectedFont });
      },
    });
    fontPickerEl.querySelector('.font-picker-btn')?.addEventListener('mousedown', () => {
      saveCurrentRange();
    });

    // Font Size Controls (- / +)
    const sizeGroup = document.createElement('div');
    sizeGroup.className = 'trueedit-size-group';

    const btnSizeDec = document.createElement('button');
    btnSizeDec.type = 'button';
    btnSizeDec.className = 'trueedit-size-btn';
    btnSizeDec.innerText = '-';
    btnSizeDec.title = 'Decrease font size';
    preventFocusLoss(btnSizeDec);

    const sizeVal = document.createElement('span');
    sizeVal.className = 'trueedit-size-val';
    sizeVal.innerText = `${currentFontSize}px`;

    const btnSizeInc = document.createElement('button');
    btnSizeInc.type = 'button';
    btnSizeInc.className = 'trueedit-size-btn';
    btnSizeInc.innerText = '+';
    btnSizeInc.title = 'Increase font size';
    preventFocusLoss(btnSizeInc);

    btnSizeDec.addEventListener('click', (e) => {
      e.stopPropagation();
      let curSz = currentFontSize;
      if (savedRange && !savedRange.collapsed && editorInput.contains(savedRange.commonAncestorContainer)) {
        curSz = getRangeCurrentStyle(savedRange).fontSize;
      }
      if (curSz > 6) {
        applyStyleUpdate({ fontSize: curSz - 1 });
      }
    });

    btnSizeInc.addEventListener('click', (e) => {
      e.stopPropagation();
      let curSz = currentFontSize;
      if (savedRange && !savedRange.collapsed && editorInput.contains(savedRange.commonAncestorContainer)) {
        curSz = getRangeCurrentStyle(savedRange).fontSize;
      }
      if (curSz < 72) {
        applyStyleUpdate({ fontSize: curSz + 1 });
      }
    });

    sizeGroup.appendChild(btnSizeDec);
    sizeGroup.appendChild(sizeVal);
    sizeGroup.appendChild(btnSizeInc);

    // Alignment controls
    const alignGroup = document.createElement('div');
    alignGroup.className = 'trueedit-align-group';

    const btnAlignLeft = document.createElement('button');
    btnAlignLeft.type = 'button';
    btnAlignLeft.className = 'trueedit-btn-align' + (currentAlign === 'left' ? ' active' : '');
    btnAlignLeft.innerText = 'Left';
    btnAlignLeft.title = 'Align Left';
    preventFocusLoss(btnAlignLeft);
    btnAlignLeft.addEventListener('click', (e) => {
      e.stopPropagation();
      currentAlign = 'left';
      editorInput.style.textAlign = 'left';
      alignGroup.querySelectorAll('.trueedit-btn-align').forEach((b) => b.classList.remove('active'));
      btnAlignLeft.classList.add('active');
    });

    const btnAlignCenter = document.createElement('button');
    btnAlignCenter.type = 'button';
    btnAlignCenter.className = 'trueedit-btn-align' + (currentAlign === 'center' ? ' active' : '');
    btnAlignCenter.innerText = 'Center';
    btnAlignCenter.title = 'Align Center';
    preventFocusLoss(btnAlignCenter);
    btnAlignCenter.addEventListener('click', (e) => {
      e.stopPropagation();
      currentAlign = 'center';
      editorInput.style.textAlign = 'center';
      alignGroup.querySelectorAll('.trueedit-btn-align').forEach((b) => b.classList.remove('active'));
      btnAlignCenter.classList.add('active');
    });

    const btnAlignRight = document.createElement('button');
    btnAlignRight.type = 'button';
    btnAlignRight.className = 'trueedit-btn-align' + (currentAlign === 'right' ? ' active' : '');
    btnAlignRight.innerText = 'Right';
    btnAlignRight.title = 'Align Right';
    preventFocusLoss(btnAlignRight);
    btnAlignRight.addEventListener('click', (e) => {
      e.stopPropagation();
      currentAlign = 'right';
      editorInput.style.textAlign = 'right';
      alignGroup.querySelectorAll('.trueedit-btn-align').forEach((b) => b.classList.remove('active'));
      btnAlignRight.classList.add('active');
    });

    alignGroup.appendChild(btnAlignLeft);
    alignGroup.appendChild(btnAlignCenter);
    alignGroup.appendChild(btnAlignRight);

    // Bold button
    const btnBold = document.createElement('button');
    btnBold.type = 'button';
    btnBold.className = 'trueedit-pop-btn trueedit-btn-bold' + (isBold ? ' active' : '');
    btnBold.innerHTML = '<b>B</b>';
    btnBold.title = 'Toggle Bold (Selection or All)';
    preventFocusLoss(btnBold);
    btnBold.addEventListener('click', (e) => {
      e.stopPropagation();
      let b = isBold;
      if (savedRange && !savedRange.collapsed && editorInput.contains(savedRange.commonAncestorContainer)) {
        b = getRangeCurrentStyle(savedRange).bold;
      }
      applyStyleUpdate({ bold: !b });
    });

    // Italic button
    const btnItalic = document.createElement('button');
    btnItalic.type = 'button';
    btnItalic.className = 'trueedit-pop-btn trueedit-btn-italic' + (isItalic ? ' active' : '');
    btnItalic.innerHTML = '<i>I</i>';
    btnItalic.title = 'Toggle Italic (Selection or All)';
    preventFocusLoss(btnItalic);
    btnItalic.addEventListener('click', (e) => {
      e.stopPropagation();
      let it = isItalic;
      if (savedRange && !savedRange.collapsed && editorInput.contains(savedRange.commonAncestorContainer)) {
        it = getRangeCurrentStyle(savedRange).italic;
      }
      applyStyleUpdate({ italic: !it });
    });

    // Color controls
    const colorWrap = document.createElement('div');
    colorWrap.className = 'trueedit-color-picker-wrap';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'trueedit-color-picker';
    colorPicker.value = detectedColor.startsWith('#') && detectedColor.length === 7 ? detectedColor : '#000000';
    colorPicker.title = 'Custom text color';
    colorPicker.addEventListener('mousedown', () => {
      saveCurrentRange();
    });

    const quickColors = document.createElement('div');
    quickColors.className = 'trueedit-quick-colors';
    const presets = [
      { color: '#000000', title: 'Black' },
      { color: '#0055ff', title: 'Dark Blue' },
      { color: '#75767a', title: 'Gray' },
      { color: '#007aff', title: 'Blue' },
      { color: '#dc2626', title: 'Red' },
      { color: '#067e41', title: 'Green' },
    ];
    // If detected original color is not in presets, prepend it as "Original"
    const hasPreset = presets.some((p) => p.color.toLowerCase() === detectedColor.toLowerCase());
    if (!hasPreset && detectedColor.startsWith('#') && detectedColor.length === 7) {
      presets.unshift({ color: detectedColor, title: `Original (${detectedColor})` });
    }
    for (const p of presets) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'trueedit-dot-color' + (p.color.toLowerCase() === detectedColor.toLowerCase() ? ' active' : '');
      dot.style.backgroundColor = p.color;
      dot.title = p.title;
      preventFocusLoss(dot);
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        applyStyleUpdate({ color: p.color });
      });
      quickColors.appendChild(dot);
    }

    colorPicker.addEventListener('input', () => {
      detectedColor = colorPicker.value;
      applyStyleUpdate({ color: detectedColor });
    });

    colorWrap.appendChild(colorPicker);

    // Position nudge controls (Move text box)
    const nudgeGroup = document.createElement('div');
    nudgeGroup.className = 'trueedit-nudge-group';
    nudgeGroup.title = 'Move text position (Left, Right, Up, Down)';

    const btnNudgeLeft = document.createElement('button');
    btnNudgeLeft.type = 'button';
    btnNudgeLeft.className = 'trueedit-nudge-btn';
    btnNudgeLeft.innerText = '←';
    btnNudgeLeft.title = 'Move left (2px)';
    preventFocusLoss(btnNudgeLeft);

    const btnNudgeRight = document.createElement('button');
    btnNudgeRight.type = 'button';
    btnNudgeRight.className = 'trueedit-nudge-btn';
    btnNudgeRight.innerText = '→';
    btnNudgeRight.title = 'Move right (2px)';
    preventFocusLoss(btnNudgeRight);

    const btnNudgeUp = document.createElement('button');
    btnNudgeUp.type = 'button';
    btnNudgeUp.className = 'trueedit-nudge-btn';
    btnNudgeUp.innerText = '↑';
    btnNudgeUp.title = 'Move up (2px)';
    preventFocusLoss(btnNudgeUp);

    const btnNudgeDown = document.createElement('button');
    btnNudgeDown.type = 'button';
    btnNudgeDown.className = 'trueedit-nudge-btn';
    btnNudgeDown.innerText = '↓';
    btnNudgeDown.title = 'Move down (2px)';
    preventFocusLoss(btnNudgeDown);

    const applyNudge = (dx: number, dy: number) => {
      const curChange = this.trueEditManager.getChange(item.id);
      const curX = curChange ? curChange.x : item.x;
      const curY = curChange ? curChange.y : item.y;
      const newX = Math.round((curX + dx) * 10) / 10;
      const newY = Math.round((curY + dy) * 10) / 10;
      
      let newPdfX = curChange?.pdfX ?? item.pdfX;
      let newPdfBaselineY = curChange?.pdfBaselineY ?? item.pdfBaselineY;
      if (newPdfX !== undefined) newPdfX = Math.round((newPdfX + dx) * 10) / 10;
      if (newPdfBaselineY !== undefined) newPdfBaselineY = Math.round((newPdfBaselineY - dy) * 10) / 10;

      if (curChange) {
        this.trueEditManager.updatePosition(item.id, newX, newY, newPdfX, newPdfBaselineY);
      }
      boxEl.style.left = `${newX * this.currentScale}px`;
      boxEl.style.top = `${newY * this.currentScale}px`;
      popover.style.left = `${Math.max(4, parseInt(popover.style.left, 10) + dx * this.currentScale)}px`;
      popover.style.top = `${Math.max(4, parseInt(popover.style.top, 10) + dy * this.currentScale)}px`;
    };

    btnNudgeLeft.addEventListener('click', (e) => { e.stopPropagation(); applyNudge(-2, 0); });
    btnNudgeRight.addEventListener('click', (e) => { e.stopPropagation(); applyNudge(2, 0); });
    btnNudgeUp.addEventListener('click', (e) => { e.stopPropagation(); applyNudge(0, -2); });
    btnNudgeDown.addEventListener('click', (e) => { e.stopPropagation(); applyNudge(0, 2); });

    nudgeGroup.appendChild(btnNudgeLeft);
    nudgeGroup.appendChild(btnNudgeRight);
    nudgeGroup.appendChild(btnNudgeUp);
    nudgeGroup.appendChild(btnNudgeDown);

    row2.appendChild(fontPickerEl);
    row2.appendChild(sizeGroup);
    row2.appendChild(alignGroup);
    row2.appendChild(btnBold);
    row2.appendChild(btnItalic);
    row2.appendChild(colorWrap);
    row2.appendChild(quickColors);
    row2.appendChild(nudgeGroup);

    popover.appendChild(row1);
    popover.appendChild(row2);

    // Stop click events inside popover from bubbling
    popover.addEventListener('mousedown', (e) => e.stopPropagation());
    popover.addEventListener('click', (e) => e.stopPropagation());

    let isCommitted = false;
    let onOutsideClick: ((e: MouseEvent) => void) | null = null;

    const closePopover = () => {
      document.removeEventListener('selectionchange', onDocSelectionChange);
      if (onOutsideClick) {
        document.removeEventListener('mousedown', onOutsideClick);
        onOutsideClick = null;
      }
      popover.remove();
    };

    const finishEdit = () => {
      if (isCommitted) return;
      isCommitted = true;
      const { plainText, spans } = serializeRichContent(
        editorInput,
        detectedFont,
        currentFontSize,
        detectedColor,
        isBold,
        isItalic
      );
      const isDeleted = plainText.trim().length === 0;
      this.trueEditManager.startOrUpdateEdit(
        item,
        plainText,
        detectedFont,
        currentFontSize,
        detectedColor,
        isDeleted,
        isBold,
        spans,
        currentAlign,
        isItalic
      );
      closePopover();
    };

    btnSave.addEventListener('click', (e) => {
      e.stopPropagation();
      finishEdit();
    });

    btnDelete.addEventListener('click', (e) => {
      e.stopPropagation();
      isCommitted = true;
      this.trueEditManager.startOrUpdateEdit(
        item,
        '',
        detectedFont,
        currentFontSize,
        detectedColor,
        true,
        false,
        [],
        'left',
        false
      );
      closePopover();
    });

    btnCancel.addEventListener('click', (e) => {
      e.stopPropagation();
      isCommitted = true;
      closePopover();
    });

    editorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        finishEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        isCommitted = true;
        closePopover();
      }
    });

    // Close on outside click after small delay
    setTimeout(() => {
      onOutsideClick = (e: MouseEvent) => {
        if (!popover.contains(e.target as Node)) {
          finishEdit();
        }
      };
      document.addEventListener('mousedown', onOutsideClick);
    }, 150);

    boxEl.parentElement?.appendChild(popover);

    // Focus with small timeout to ensure DOM registration
    setTimeout(() => {
      editorInput.focus();
    }, 50);
  }

  // Render User Added Annotations (Text, Shapes, Drawings, Images)
  private renderCurrentPageAnnotations() {
    const pagesMeta = this.pdfManager.getPagesMeta();

    for (let pageIdx = 0; pageIdx < pagesMeta.length; pageIdx++) {
      const container = document.getElementById(`annLayer-${pageIdx}`);
      if (!container) continue;

      container.innerHTML = '';
      const list = this.annotationManager.getAnnotations(pageIdx);
      const selectedId = this.annotationManager.getSelectedId();

      for (const ann of list) {
        if (ann.hidden) continue;

        const el = document.createElement('div');
        el.className = `annotation-item annotation-${ann.type}`;
        el.setAttribute('data-id', ann.id);
        el.setAttribute('data-type', ann.type);
        if (ann.id === selectedId && ann.type !== 'whiteout') el.classList.add('selected');

        el.style.left = `${ann.x * this.currentScale}px`;
        el.style.top = `${ann.y * this.currentScale}px`;
        el.style.width = `${ann.width * this.currentScale}px`;
        el.style.height = `${ann.height * this.currentScale}px`;
        el.style.zIndex = ann.type === 'whiteout' ? '1' : Math.max(10, ann.zIndex || 10).toString();
        el.style.opacity = ann.opacity.toString();
        el.style.transform = `rotate(${ann.rotation}deg)`;

        // Render specific inner content
        if (ann.type === 'text') {
          const t = ann as TextAnnotation;
          const textSpan = document.createElement('div');
          textSpan.className = 'annotation-text-inner';
          textSpan.innerText = t.text;
          textSpan.style.fontSize = `${t.fontSize * this.currentScale}px`;
          textSpan.style.fontFamily = t.fontFamily;
          textSpan.style.color = t.color;
          textSpan.style.backgroundColor = t.backgroundColor;
          textSpan.style.fontWeight = t.bold ? 'bold' : 'normal';
          textSpan.style.fontStyle = t.italic ? 'italic' : 'normal';
          textSpan.style.textDecoration = t.underline ? 'underline' : 'none';
          textSpan.style.textAlign = t.align;
          el.appendChild(textSpan);

          // Double click text to edit inline
          el.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            this.editAnnotationTextInline(t, textSpan);
          });
        } else if (ann.type === 'shape') {
          const s = ann as ShapeAnnotation;
          el.innerHTML = this.renderShapeSVG(s);
        } else if (ann.type === 'image') {
          const imgAnn = ann as ImageAnnotation;
          const img = document.createElement('img');
          img.src = imgAnn.src;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'contain';
          img.draggable = false;
          el.appendChild(img);
        } else if (ann.type === 'whiteout') {
          el.style.backgroundColor = '#ffffff';
          el.style.border = 'none';
          el.style.outline = 'none';
          el.style.boxShadow = 'none';
        } else if (ann.type === 'freehand') {
          const f = ann as FreehandAnnotation;
          el.appendChild(this.renderFreehandSVG(f));
        }

        // Selection & Drag Handles
        if (ann.id === selectedId && ann.type !== 'whiteout') {
          this.attachTransformHandles(el, ann);
        }

        // Drag to move or erase
        el.addEventListener('mousedown', (e) => {
          if ((e.target as HTMLElement).classList.contains('transform-handle')) return;
          e.stopPropagation();
          if (this.currentTool === 'eraser' || this.currentTool === 'whiteout') {
            this.annotationManager.deleteAnnotation(ann.id);
            return;
          }
          this.annotationManager.setSelectedId(ann.id);
          this.startDraggingAnnotation(e, ann);
        });

        container.appendChild(el);
      }
    }
  }

  private renderShapeSVG(s: ShapeAnnotation): string {
    const stroke = s.strokeColor;
    const strokeWidth = s.strokeWidth * this.currentScale;
    const fill = s.fillColor && s.fillColor !== 'transparent' ? s.fillColor : 'none';

    if (s.shape === 'rectangle') {
      return `
        <svg width="100%" height="100%" style="overflow:visible;">
          <rect x="0" y="0" width="100%" height="100%" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
        </svg>
      `;
    } else if (s.shape === 'ellipse') {
      return `
        <svg width="100%" height="100%" style="overflow:visible;">
          <ellipse cx="50%" cy="50%" rx="48%" ry="48%" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />
        </svg>
      `;
    } else if (s.shape === 'line') {
      return `
        <svg width="100%" height="100%" style="overflow:visible;">
          <line x1="0" y1="50%" x2="100%" y2="50%" stroke="${stroke}" stroke-width="${strokeWidth}" />
        </svg>
      `;
    } else if (s.shape === 'arrow') {
      return `
        <svg width="100%" height="100%" style="overflow:visible;">
          <defs>
            <marker id="arr-${s.id}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="${stroke}" />
            </marker>
          </defs>
          <line x1="0" y1="50%" x2="92%" y2="50%" stroke="${stroke}" stroke-width="${strokeWidth}" marker-end="url(#arr-${s.id})" />
        </svg>
      `;
    } else if (s.shape === 'check') {
      return `
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${Math.max(3, strokeWidth)}">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      `;
    } else if (s.shape === 'cross') {
      return `
        <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${Math.max(3, strokeWidth)}">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      `;
    }
    return '';
  }

  private renderFreehandSVG(f: FreehandAnnotation): SVGElement {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.overflow = 'visible';

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    let d = '';
    for (let i = 0; i < f.points.length; i++) {
      const pt = f.points[i];
      const relX = (pt.x - f.x) * this.currentScale;
      const relY = (pt.y - f.y) * this.currentScale;
      d += i === 0 ? `M ${relX} ${relY}` : ` L ${relX} ${relY}`;
    }

    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', f.strokeColor);
    path.setAttribute('stroke-width', (f.strokeWidth * this.currentScale).toString());
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');

    svg.appendChild(path);
    return svg;
  }

  private attachTransformHandles(el: HTMLElement, ann: Annotation) {
    const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'rot'];
    for (const h of handles) {
      const handleEl = document.createElement('div');
      handleEl.className = `transform-handle handle-${h}`;
      handleEl.setAttribute('data-handle', h);

      handleEl.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        this.startTransformingAnnotation(e, ann, h);
      });

      el.appendChild(handleEl);
    }
  }

  private startDraggingAnnotation(e: MouseEvent, ann: Annotation) {
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startAnnX = ann.x;
    const startAnnY = ann.y;

    const onMouseMove = (moveEvt: MouseEvent) => {
      const dx = (moveEvt.clientX - startMouseX) / this.currentScale;
      const dy = (moveEvt.clientY - startMouseY) / this.currentScale;

      this.annotationManager.updateAnnotation(
        ann.id,
        {
          x: Math.round(startAnnX + dx),
          y: Math.round(startAnnY + dy),
        },
        false // don't push undo stack on every pixel
      );
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.annotationManager.updateAnnotation(ann.id, {}, true); // push history snapshot
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  private startTransformingAnnotation(e: MouseEvent, ann: Annotation, handle: string) {
    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startX = ann.x;
    const startY = ann.y;
    const startW = ann.width;
    const startH = ann.height;

    const onMouseMove = (moveEvt: MouseEvent) => {
      const dx = (moveEvt.clientX - startMouseX) / this.currentScale;
      const dy = (moveEvt.clientY - startMouseY) / this.currentScale;

      if (handle === 'rot') {
        const center = {
          x: (startX + startW / 2) * this.currentScale,
          y: (startY + startH / 2) * this.currentScale,
        };
        const angleRad = Math.atan2(moveEvt.clientY - center.y, moveEvt.clientX - center.x);
        let angleDeg = Math.round((angleRad * 180) / Math.PI) + 90;
        this.annotationManager.updateAnnotation(ann.id, { rotation: angleDeg }, false);
        return;
      }

      let newW = startW;
      let newH = startH;
      let newX = startX;
      let newY = startY;

      if (handle.includes('e')) newW = Math.max(20, startW + dx);
      if (handle.includes('s')) newH = Math.max(16, startH + dy);
      if (handle.includes('w')) {
        const diff = Math.min(dx, startW - 20);
        newX = startX + diff;
        newW = startW - diff;
      }
      if (handle.includes('n')) {
        const diff = Math.min(dy, startH - 16);
        newY = startY + diff;
        newH = startH - diff;
      }

      this.annotationManager.updateAnnotation(
        ann.id,
        {
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(newW),
          height: Math.round(newH),
        },
        false
      );
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.annotationManager.updateAnnotation(ann.id, {}, true);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  private editAnnotationTextInline(ann: TextAnnotation, textSpan: HTMLElement) {
    textSpan.contentEditable = 'true';
    textSpan.focus();
    textSpan.classList.add('inline-editing');

    // Select all text
    const range = document.createRange();
    range.selectNodeContents(textSpan);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);

    const onBlur = () => {
      textSpan.contentEditable = 'false';
      textSpan.classList.remove('inline-editing');
      const newText = textSpan.innerText.trim();
      if (newText) {
        this.annotationManager.updateAnnotation(ann.id, { text: newText });
      }
      textSpan.removeEventListener('blur', onBlur);
    };

    textSpan.addEventListener('blur', onBlur);
  }

  // Update Dynamic Submenu / Property Toolbar
  private updateSubmenu() {
    const sel = this.annotationManager.getSelectedAnnotation();
    const sub = this.subMenuContainer;
    sub.innerHTML = '';

    if (sel && sel.type === 'text') {
      const t = sel as TextAnnotation;
      sub.innerHTML = `
        <div class="prop-group" id="subFontPickerMount"></div>
        <div class="prop-group">
          <button class="prop-btn" id="btnFontDec">-</button>
          <span class="prop-val">${t.fontSize}px</span>
          <button class="prop-btn" id="btnFontInc">+</button>
        </div>
        <div class="prop-group">
          <button class="prop-btn ${t.bold ? 'active' : ''}" id="btnBold"><strong>B</strong></button>
          <button class="prop-btn ${t.italic ? 'active' : ''}" id="btnItalic"><em>I</em></button>
          <button class="prop-btn ${t.underline ? 'active' : ''}" id="btnUnderline"><u>U</u></button>
        </div>
        <div class="prop-group">
          <input type="color" id="pickerTextColor" value="${t.color}" title="Text color" />
          <input type="color" id="pickerTextBg" value="${t.backgroundColor === 'transparent' ? '#ffffff' : t.backgroundColor}" title="Highlight / Background color" />
        </div>
        <div class="prop-group">
          <button class="prop-btn" id="btnLayerUp" title="Bring to Front">${ICONS.layerUp}</button>
          <button class="prop-btn" id="btnLayerDown" title="Send to Back">${ICONS.layerDown}</button>
          <button class="prop-btn" id="btnDupElem" title="Duplicate">${ICONS.duplicate}</button>
          <button class="prop-btn btn-danger" id="btnDelElem" title="Delete">${ICONS.trash}</button>
        </div>
      `;

      // Mount Searchable Font Picker
      const fontMount = document.getElementById('subFontPickerMount');
      if (fontMount) {
        fontMount.appendChild(
          createSearchableFontPicker({
            currentFont: t.fontFamily || 'DM Sans',
            dropdownPosition: 'bottom',
            onSelect: (fontName) => {
              this.annotationManager.updateAnnotation(t.id, { fontFamily: fontName });
            },
          })
        );
      }

      // Handlers
      document.getElementById('btnLayerUp')?.addEventListener('click', () => {
        this.annotationManager.bringToFront(t.id);
      });
      document.getElementById('btnLayerDown')?.addEventListener('click', () => {
        this.annotationManager.sendToBack(t.id);
      });
      document.getElementById('btnFontInc')?.addEventListener('click', () => {
        this.annotationManager.updateAnnotation(t.id, { fontSize: t.fontSize + 2 });
      });
      document.getElementById('btnFontDec')?.addEventListener('click', () => {
        this.annotationManager.updateAnnotation(t.id, { fontSize: Math.max(8, t.fontSize - 2) });
      });
      document.getElementById('btnBold')?.addEventListener('click', () => {
        this.annotationManager.updateAnnotation(t.id, { bold: !t.bold });
      });
      document.getElementById('btnItalic')?.addEventListener('click', () => {
        this.annotationManager.updateAnnotation(t.id, { italic: !t.italic });
      });
      document.getElementById('btnUnderline')?.addEventListener('click', () => {
        this.annotationManager.updateAnnotation(t.id, { underline: !t.underline });
      });
      document.getElementById('pickerTextColor')?.addEventListener('input', (e) => {
        this.annotationManager.updateAnnotation(t.id, {
          color: (e.target as HTMLInputElement).value,
        });
      });
      document.getElementById('pickerTextBg')?.addEventListener('input', (e) => {
        this.annotationManager.updateAnnotation(t.id, {
          backgroundColor: (e.target as HTMLInputElement).value,
        });
      });
      document.getElementById('btnDupElem')?.addEventListener('click', () => {
        this.annotationManager.duplicateAnnotation(t.id);
      });
      document.getElementById('btnDelElem')?.addEventListener('click', () => {
        this.annotationManager.deleteAnnotation(t.id);
      });
    } else if (sel && sel.type === 'shape') {
      const s = sel as ShapeAnnotation;
      sub.innerHTML = `
        <div class="prop-group">
          <label>Stroke:</label>
          <input type="color" id="pickerShapeStroke" value="${s.strokeColor}" />
          <input type="range" id="rangeStrokeWidth" min="1" max="16" value="${s.strokeWidth}" />
        </div>
        <div class="prop-group">
          <label>Fill:</label>
          <input type="color" id="pickerShapeFill" value="${s.fillColor === 'transparent' ? '#ffffff' : s.fillColor}" />
          <button class="prop-btn ${s.fillColor === 'transparent' ? 'active' : ''}" id="btnTransparentFill">No Fill</button>
        </div>
        <div class="prop-group">
          <label>Opacity:</label>
          <input type="range" id="rangeOpacity" min="10" max="100" value="${Math.round(s.opacity * 100)}" />
        </div>
        <div class="prop-group">
          <button class="prop-btn" id="btnShapeLayerUp" title="Bring to Front">${ICONS.layerUp}</button>
          <button class="prop-btn" id="btnShapeLayerDown" title="Send to Back">${ICONS.layerDown}</button>
          <button class="prop-btn" id="btnDupElem">${ICONS.duplicate}</button>
          <button class="prop-btn btn-danger" id="btnDelElem">${ICONS.trash}</button>
        </div>
      `;

      document.getElementById('btnShapeLayerUp')?.addEventListener('click', () => {
        this.annotationManager.bringToFront(s.id);
      });
      document.getElementById('btnShapeLayerDown')?.addEventListener('click', () => {
        this.annotationManager.sendToBack(s.id);
      });

      document.getElementById('pickerShapeStroke')?.addEventListener('input', (e) => {
        this.annotationManager.updateAnnotation(s.id, {
          strokeColor: (e.target as HTMLInputElement).value,
        });
      });
      document.getElementById('rangeStrokeWidth')?.addEventListener('input', (e) => {
        this.annotationManager.updateAnnotation(s.id, {
          strokeWidth: parseInt((e.target as HTMLInputElement).value, 10),
        });
      });
      document.getElementById('pickerShapeFill')?.addEventListener('input', (e) => {
        this.annotationManager.updateAnnotation(s.id, {
          fillColor: (e.target as HTMLInputElement).value,
        });
      });
      document.getElementById('btnTransparentFill')?.addEventListener('click', () => {
        this.annotationManager.updateAnnotation(s.id, { fillColor: 'transparent' });
      });
      document.getElementById('rangeOpacity')?.addEventListener('input', (e) => {
        this.annotationManager.updateAnnotation(s.id, {
          opacity: parseInt((e.target as HTMLInputElement).value, 10) / 100,
        });
      });
      document.getElementById('btnDupElem')?.addEventListener('click', () => {
        this.annotationManager.duplicateAnnotation(s.id);
      });
      document.getElementById('btnDelElem')?.addEventListener('click', () => {
        this.annotationManager.deleteAnnotation(s.id);
      });
    } else if (sel && sel.type === 'image') {
      const img = sel as ImageAnnotation;
      sub.innerHTML = `
        <div class="prop-group">
          <label>Opacity:</label>
          <input type="range" id="rangeImgOpacity" min="10" max="100" value="${Math.round((img.opacity ?? 1) * 100)}" />
        </div>
        <div class="prop-group">
          <button class="prop-btn" id="btnImgLayerUp" title="Bring to Front (Over Masks)">${ICONS.layerUp}</button>
          <button class="prop-btn" id="btnImgLayerDown" title="Send Backward">${ICONS.layerDown}</button>
          <button class="prop-btn" id="btnDupElem" title="Duplicate Image">${ICONS.duplicate}</button>
          <button class="prop-btn btn-danger" id="btnDelElem" title="Delete Image">${ICONS.trash}</button>
        </div>
      `;
      document.getElementById('rangeImgOpacity')?.addEventListener('input', (e) => {
        this.annotationManager.updateAnnotation(img.id, {
          opacity: parseInt((e.target as HTMLInputElement).value, 10) / 100,
        });
      });
      document.getElementById('btnImgLayerUp')?.addEventListener('click', () => {
        this.annotationManager.bringToFront(img.id);
      });
      document.getElementById('btnImgLayerDown')?.addEventListener('click', () => {
        this.annotationManager.sendToBack(img.id);
      });
      document.getElementById('btnDupElem')?.addEventListener('click', () => {
        this.annotationManager.duplicateAnnotation(img.id);
      });
      document.getElementById('btnDelElem')?.addEventListener('click', () => {
        this.annotationManager.deleteAnnotation(img.id);
      });
    } else if (this.currentTool === 'text') {
      sub.innerHTML = `
        <div class="prop-group">
          <label style="font-size: 12px; font-weight: 500; color: #4b5563;">Font:</label>
          <div id="defaultFontPickerMount"></div>
        </div>
        <div class="prop-group">
          <label style="font-size: 12px; font-weight: 500; color: #4b5563;">Size:</label>
          <button class="prop-btn" id="btnDefFontDec">-</button>
          <span class="prop-val">${this.annotationManager.currentFontSize}px</span>
          <button class="prop-btn" id="btnDefFontInc">+</button>
        </div>
        <span class="submenu-hint" style="margin-left: 10px;">
          Click anywhere on the PDF page to place new text.
        </span>
      `;
      const mount = document.getElementById('defaultFontPickerMount');
      if (mount) {
        mount.appendChild(
          createSearchableFontPicker({
            currentFont: this.annotationManager.currentFontFamily,
            dropdownPosition: 'bottom',
            onSelect: (font) => {
              this.annotationManager.currentFontFamily = font;
            },
          })
        );
      }
      document.getElementById('btnDefFontDec')?.addEventListener('click', () => {
        this.annotationManager.currentFontSize = Math.max(8, this.annotationManager.currentFontSize - 2);
        this.updateSubmenu();
      });
      document.getElementById('btnDefFontInc')?.addEventListener('click', () => {
        this.annotationManager.currentFontSize = Math.min(72, this.annotationManager.currentFontSize + 2);
        this.updateSubmenu();
      });
    } else if (this.currentTool === 'freehand') {
      sub.innerHTML = `
        <div class="prop-group">
          <label>Pen Color:</label>
          <input type="color" id="pickerPenColor" value="${this.annotationManager.currentBrushColor}" />
        </div>
        <div class="prop-group">
          <label>Width:</label>
          <input type="range" id="rangePenWidth" min="1" max="16" value="${this.annotationManager.currentBrushWidth}" />
        </div>
      `;
      document.getElementById('pickerPenColor')?.addEventListener('input', (e) => {
        this.annotationManager.currentBrushColor = (e.target as HTMLInputElement).value;
      });
      document.getElementById('rangePenWidth')?.addEventListener('input', (e) => {
        this.annotationManager.currentBrushWidth = parseInt((e.target as HTMLInputElement).value, 10);
      });
    } else if (this.currentTool === 'eraser' || this.currentTool === 'whiteout') {
      sub.innerHTML = `
        <span class="submenu-hint" style="color: #dc2626; font-weight: 600;">
          🧹 Eraser Mode: Click any text, drawing, or shape to erase it directly. Or click & drag on the page to redact / whiteout an area.
        </span>
      `;
    } else {
      sub.innerHTML = `
        <span class="submenu-hint">
          ${this.currentMode === 'trueedit' ? 'TrueEdit™ Pro: Click on any existing text in the document to edit directly.' : 'Select a tool or click on any element to adjust its properties.'}
        </span>
      `;
    }
  }

  // Render Right Sidebar Layers / Elements
  private renderLayersSidebar() {
    const list = this.layersContainer;
    list.innerHTML = '';

    if (this.currentMode === 'trueedit') {
      const changes = this.trueEditManager.getChangesForPage(this.activePageIndex);
      const emptyInfo = document.getElementById('layersEmptyInfo');
      if (changes.length === 0) {
        if (emptyInfo) {
          emptyInfo.style.display = 'block';
          emptyInfo.innerText = 'No text changes on this page yet. Click any text on the page to edit it!';
        }
        return;
      }
      if (emptyInfo) emptyInfo.style.display = 'none';

      changes.forEach((change) => {
        const item = document.createElement('div');
        item.className = 'layer-item';
        const isDel = change.deleted || change.newText.trim().length === 0;
        const badgeText = isDel ? 'Deleted' : 'Text Edit';
        const badgeClass = isDel ? 'layer-badge layer-badge-deleted' : 'layer-badge';
        const displayLabel = isDel ? `Deleted: "${change.originalText}"` : change.newText.replace(/\n/g, ' ');

        item.innerHTML = `
          <div class="layer-info">
            <span class="${badgeClass}">${badgeText}</span>
            <span class="layer-name" title="${displayLabel}">${displayLabel}</span>
          </div>
          <div class="layer-actions">
            <button class="btn-icon btn-revert" title="${isDel ? 'Restore deleted text' : 'Revert to original text'}">${isDel ? 'Restore' : 'Revert'}</button>
          </div>
        `;
        item.querySelector('.btn-revert')?.addEventListener('click', () => {
          this.trueEditManager.revertChange(change.id);
        });
        list.appendChild(item);
      });
      return;
    }

    // Annotate mode: display layer list
    const annotations = this.annotationManager.getAnnotations(this.activePageIndex);
    const emptyInfo = document.getElementById('layersEmptyInfo');

    if (annotations.length === 0) {
      if (emptyInfo) {
        emptyInfo.style.display = 'block';
        emptyInfo.innerText = 'Use the toolbar to modify or add text, upload images, and annotate with ease.';
      }
      return;
    }
    if (emptyInfo) emptyInfo.style.display = 'none';

    // Show from top zIndex to bottom
    const sorted = annotations.slice().sort((a, b) => b.zIndex - a.zIndex);
    const selId = this.annotationManager.getSelectedId();

    sorted.forEach((ann) => {
      const item = document.createElement('div');
      item.className = `layer-item ${ann.id === selId ? 'active' : ''}`;

      let label = ann.type.toUpperCase();
      if (ann.type === 'text') {
        label = `Text: "${(ann as TextAnnotation).text.substring(0, 15)}..."`;
      } else if (ann.type === 'shape') {
        label = `Shape (${(ann as ShapeAnnotation).shape})`;
      } else if (ann.type === 'image') {
        label = `Image (${ann.width}x${ann.height})`;
      } else if (ann.type === 'whiteout') {
        label = `Whiteout`;
      }

      item.innerHTML = `
        <div class="layer-info">
          <span class="layer-icon">${ICONS.layers}</span>
          <span class="layer-name">${label}</span>
        </div>
        <div class="layer-actions">
          <button class="btn-layer-up" title="Bring Forward">${ICONS.layerUp}</button>
          <button class="btn-layer-down" title="Send Backward">${ICONS.layerDown}</button>
          <button class="btn-layer-del" title="Delete">${ICONS.trash}</button>
        </div>
      `;

      item.addEventListener('click', () => {
        this.annotationManager.setSelectedId(ann.id);
      });

      item.querySelector('.btn-layer-up')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.annotationManager.bringToFront(ann.id);
      });

      item.querySelector('.btn-layer-down')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.annotationManager.sendToBack(ann.id);
      });

      item.querySelector('.btn-layer-del')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.annotationManager.deleteAnnotation(ann.id);
      });

      list.appendChild(item);
    });
  }

  // Render Thumbnails in Left Sidebar
  private async renderThumbnails() {
    this.previewPagesContainer.innerHTML = '';
    const pagesMeta = this.pdfManager.getPagesMeta();

    for (let i = 0; i < pagesMeta.length; i++) {
      const thumbItem = document.createElement('div');
      thumbItem.className = `thumb-item ${i === this.activePageIndex ? 'active' : ''}`;
      thumbItem.id = `thumbItem-${i}`;

      const img = document.createElement('img');
      img.className = 'thumb-img';
      img.alt = `Page ${i + 1}`;

      const pageNumber = document.createElement('span');
      pageNumber.className = 'thumb-number';
      pageNumber.innerText = (i + 1).toString();

      // Page action buttons overlay (rotate CW, rotate CCW, delete)
      const actions = document.createElement('div');
      actions.className = 'thumb-actions';
      actions.innerHTML = `
        <button class="thumb-act-btn" data-act="rot-cw" title="Rotate clockwise 90°">${ICONS.rotateCw}</button>
        <button class="thumb-act-btn" data-act="del" title="Delete page">${ICONS.trash}</button>
      `;

      thumbItem.appendChild(img);
      thumbItem.appendChild(pageNumber);
      thumbItem.appendChild(actions);
      this.previewPagesContainer.appendChild(thumbItem);

      // Async load thumbnail
      this.pdfManager.generateThumbnail(i).then((dataUrl) => {
        img.src = dataUrl;
      });

      // Click to scroll to page
      thumbItem.addEventListener('click', () => {
        this.scrollToPage(i);
      });

      // Actions
      actions.querySelector('[data-act="rot-cw"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.pdfManager.rotatePage(i, 90);
        this.renderDocumentPages();
        this.renderThumbnails();
      });

      actions.querySelector('[data-act="del"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete page ${i + 1}?`)) {
          this.pdfManager.deletePage(i);
          this.activePageIndex = Math.max(0, this.activePageIndex - 1);
          this.renderDocumentPages();
          this.renderThumbnails();
          this.updateViewbar();
        }
      });
    }
  }

  private scrollToPage(pageIndex: number) {
    this.activePageIndex = pageIndex;
    const pageContainer = document.getElementById(`pageContainer-${pageIndex}`);
    if (pageContainer) {
      pageContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    this.updateViewbar();
    this.renderLayersSidebar();
    // Highlight thumbnail
    document.querySelectorAll('.thumb-item').forEach((item, idx) => {
      item.classList.toggle('active', idx === pageIndex);
    });
  }

  private updateViewbar() {
    const totalPages = this.pdfManager.getPageCount();
    const info = document.getElementById('viewbarPageInfo');
    if (info) {
      info.innerText = `Page ${this.activePageIndex + 1} of ${totalPages || 1}`;
    }
    const zoomText = document.getElementById('viewbarZoomText');
    if (zoomText) {
      zoomText.innerText = `${Math.round(this.currentScale * 100)}%`;
    }
  }

  private async setScale(newScale: number) {
    this.currentScale = Math.round(newScale * 100) / 100;
    await this.renderDocumentPages();
    this.updateViewbar();
  }

  private fitToWidth() {
    const scroller = document.getElementById('viewportScroller');
    const firstPage = this.pdfManager.getPageMeta(0);
    if (scroller && firstPage) {
      const availWidth = scroller.clientWidth - 80;
      const scale = availWidth / firstPage.width;
      this.setScale(scale);
    }
  }

  private fitToPage() {
    const scroller = document.getElementById('viewportScroller');
    const firstPage = this.pdfManager.getPageMeta(0);
    if (scroller && firstPage) {
      const availHeight = scroller.clientHeight - 80;
      const scale = availHeight / firstPage.height;
      this.setScale(scale);
    }
  }

  // Export PDF & Trigger Download
  private async handleExport() {
    if (this.pdfManager.getPageCount() === 0) {
      alert('Please open a PDF file first!');
      return;
    }

    try {
      this.showProcessingModal('Saving changes...', 'Compiling annotations and TrueEdit modifications...');

      const resultBytes = await ExportEngine.exportPDF(
        this.pdfManager,
        this.annotationManager,
        this.trueEditManager,
        (percent, statusText) => {
          this.updateProcessingProgress(percent, statusText);
        }
      );

      this.hideProcessingModal();

      // Download file
      ExportEngine.downloadBytes(resultBytes, this.pdfManager.getFileName());

      // Trigger Confetti!
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err) {
      this.hideProcessingModal();
      console.error('Export failed:', err);
      alert('Failed to save PDF: ' + (err as Error).message);
    }
  }

  private showProcessingModal(title: string, desc: string) {
    const modal = document.getElementById('processingModal');
    if (modal) {
      modal.classList.remove('hidden');
      document.getElementById('processingTitle')!.innerText = title;
      document.getElementById('processingDesc')!.innerText = desc;
      document.getElementById('progressBarFill')!.style.width = '10%';
    }
  }

  private updateProcessingProgress(percent: number, statusText: string) {
    const fill = document.getElementById('progressBarFill');
    const desc = document.getElementById('processingDesc');
    if (fill) fill.style.width = `${percent}%`;
    if (desc) desc.innerText = statusText;
  }

  private hideProcessingModal() {
    document.getElementById('processingModal')?.classList.add('hidden');
  }
}

