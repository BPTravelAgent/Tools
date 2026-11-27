import { ExportEngine } from './exportEngine';
import { PDFManager } from './pdfManager';
import type { AnnotationManager } from './annotationManager';
import type { TrueEditManager } from './trueEditManager';
import type {
  NormalizePagesOptions,
  NormalizeScope,
  PageAlignMode,
  PageFitMode,
  PageOrientationMode,
  PageSizePresetId,
  PageSizeSummary,
} from './types';

export interface PageSizeModalCallbacks {
  getPDFManager: () => PDFManager;
  getAnnotationManager: () => AnnotationManager;
  getTrueEditManager: () => TrueEditManager;
  getActivePageIndex: () => number;
  parsePageRange: (rangeStr: string, totalPages: number) => number[];
  showProcessing: (title: string, desc: string) => void;
  updateProcessing: (percent: number, statusText: string) => void;
  hideProcessing: () => void;
  onNormalized: (
    newBytes: Uint8Array,
    preNormalizeBytes: Uint8Array,
    resizedCount: number,
    targetLabel: string,
    restorePageIndex: number
  ) => Promise<void>;
}

const PRESET_SIZES_PT: Record<string, { name: string; width: number; height: number }> = {
  a4: { name: 'A4', width: 595.28, height: 841.89 },
  letter: { name: 'US Letter', width: 612, height: 792 },
  legal: { name: 'US Legal', width: 612, height: 1008 },
  a3: { name: 'A3', width: 841.89, height: 1190.55 },
  a5: { name: 'A5', width: 419.53, height: 595.28 },
  b5: { name: 'B5', width: 498.9, height: 708.66 },
};

const PT_PER_INCH = 72;
const PT_PER_MM = 72 / 25.4;

type UnitType = 'mm' | 'in' | 'pt';

export class PageSizeNormalizerModal {
  private callbacks: PageSizeModalCallbacks;
  private modalEl: HTMLElement | null = null;
  private summary: PageSizeSummary | null = null;
  private previewPageIndex: number = 0;
  private currentUnit: UnitType = 'mm';
  private orientationMode: PageOrientationMode = 'portrait';
  private fitMode: PageFitMode = 'contain';
  private baseWidthPt: number = 595.28;
  private baseHeightPt: number = 841.89;

  constructor(callbacks: PageSizeModalCallbacks) {
    this.callbacks = callbacks;
  }

  public mount(parentEl: HTMLElement): void {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="modal-backdrop hidden" id="normalizeSizeModal">
        <div class="modal-card modal-card-xl">
          <div class="modal-header-custom">
            <div style="display:flex; align-items:center; gap:9px;">
              <span style="font-size:20px;">📐</span>
              <div>
                <h2 class="modal-title" style="margin:0; font-size:18px;">Unify &amp; Resize Page Size / Layout</h2>
                <div style="font-size:11.5px; color:#64748b; margin-top:2px;">Make all pages match the same uniform paper size and orientation without losing vector quality</div>
              </div>
            </div>
            <button type="button" class="modal-close-btn" id="btnCloseNormModal">&times;</button>
          </div>

          <div class="modal-body-custom">
            <div class="norm-analysis-banner" id="normAnalysisBanner">
              <div>
                <div class="norm-analysis-title" id="normAnalysisTitle">Analyzing document pages...</div>
                <div class="norm-analysis-sub" id="normAnalysisSub"></div>
              </div>
              <div id="normAnalysisChips" style="display:flex; flex-wrap:wrap; gap:5px;"></div>
            </div>

            <div class="norm-grid-layout">
              <!-- Left Column: Configuration -->
              <div class="norm-config-col">
                <div>
                  <label class="norm-field-label" for="normSizePreset">Target Page Size</label>
                  <select id="normSizePreset" class="norm-select">
                    <option value="a4">A4 (210 × 297 mm · 595 × 842 pt) — Recommended</option>
                    <option value="letter">US Letter (8.5 × 11 in · 612 × 792 pt)</option>
                    <option value="legal">US Legal (8.5 × 14 in · 612 × 1008 pt)</option>
                    <option value="a3">A3 (297 × 420 mm · 842 × 1191 pt)</option>
                    <option value="a5">A5 (148 × 210 mm · 420 × 595 pt)</option>
                    <option value="b5">B5 (176 × 250 mm · 499 × 709 pt)</option>
                    <option value="match_common" id="optMatchCommon">Match Most Common Page Size</option>
                    <option value="match_first" id="optMatchFirst">Match Page 1 Size</option>
                    <option value="match_current" id="optMatchCurrent">Match Current Page Size</option>
                    <option value="match_largest" id="optMatchLargest">Match Largest Page Size</option>
                    <option value="match_smallest" id="optMatchSmallest">Match Smallest Page Size</option>
                    <option value="custom">Custom Dimensions...</option>
                  </select>
                </div>

                <div class="norm-dims-row">
                  <div>
                    <span class="norm-dim-sublabel">Width</span>
                    <input type="number" step="0.1" min="1" id="normWidthInput" class="norm-input" value="210" />
                  </div>
                  <div>
                    <span class="norm-dim-sublabel">Height</span>
                    <input type="number" step="0.1" min="1" id="normHeightInput" class="norm-input" value="297" />
                  </div>
                  <div>
                    <span class="norm-dim-sublabel">Unit</span>
                    <select id="normUnitSelect" class="norm-select">
                      <option value="mm" selected>mm</option>
                      <option value="in">in</option>
                      <option value="pt">pt</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label class="norm-field-label">Page Orientation / Layout</label>
                  <div class="norm-seg-group" id="normOrientGroup">
                    <button type="button" class="norm-seg-btn active" data-orient="portrait">📄 Portrait</button>
                    <button type="button" class="norm-seg-btn" data-orient="landscape">🖼️ Landscape</button>
                    <button type="button" class="norm-seg-btn" data-orient="keep">🔄 Keep Per-Page</button>
                  </div>
                </div>

                <div>
                  <label class="norm-field-label">How Content Fits Target Page</label>
                  <div class="norm-fit-grid" id="normFitGroup">
                    <button type="button" class="norm-fit-card active" data-fit="contain">
                      <div class="norm-fit-title">Fit Inside (Contain)</div>
                      <div class="norm-fit-desc">Scales proportionally to keep 100% content visible. No crop or stretch.</div>
                    </button>
                    <button type="button" class="norm-fit-card" data-fit="cover">
                      <div class="norm-fit-title">Fill Page (Cover)</div>
                      <div class="norm-fit-desc">Fills whole page edge-to-edge; trims excess edges if aspect differs.</div>
                    </button>
                    <button type="button" class="norm-fit-card" data-fit="stretch">
                      <div class="norm-fit-title">Stretch to Exact</div>
                      <div class="norm-fit-desc">Stretches width &amp; height independently to fill exact dimensions.</div>
                    </button>
                    <button type="button" class="norm-fit-card" data-fit="center">
                      <div class="norm-fit-title">No Scale (100%)</div>
                      <div class="norm-fit-desc">Keeps original element scale; resizes page canvas around content.</div>
                    </button>
                  </div>
                </div>

                <div class="norm-two-col">
                  <div>
                    <label class="norm-field-label" for="normMarginSelect">Safe Margin</label>
                    <select id="normMarginSelect" class="norm-select">
                      <option value="0" selected>None (0 mm — Exact)</option>
                      <option value="14.173">Narrow (5 mm)</option>
                      <option value="28.346">Standard (10 mm)</option>
                      <option value="42.52">Wide (15 mm)</option>
                    </select>
                  </div>
                  <div>
                    <label class="norm-field-label" for="normAlignSelect">Content Position</label>
                    <select id="normAlignSelect" class="norm-select">
                      <option value="center" selected>Center</option>
                      <option value="top-center">Top Center</option>
                      <option value="top-left">Top Left</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label class="norm-field-label">Pages to Apply</label>
                  <div class="norm-scope-list">
                    <label class="radio-card">
                      <input type="radio" name="normScope" value="all" checked />
                      <span id="normScopeAllLabel">All Pages (1 to 1)</span>
                    </label>
                    <label class="radio-card">
                      <input type="radio" name="normScope" value="mismatched" />
                      <span id="normScopeMismatchLabel">Only Mismatched Pages</span>
                    </label>
                    <label class="radio-card">
                      <input type="radio" name="normScope" value="current" />
                      <span id="normScopeCurrentLabel">Current Page Only (Page 1)</span>
                    </label>
                    <label class="radio-card">
                      <input type="radio" name="normScope" value="custom" />
                      <span>Custom Range:</span>
                    </label>
                    <input type="text" id="normCustomRange" class="custom-range-input" placeholder="e.g. 1, 3 or 2-5" disabled />
                  </div>
                </div>
              </div>

              <!-- Right Column: Live Visual Preview & Page List -->
              <div class="norm-preview-col">
                <div class="norm-preview-card">
                  <div class="norm-preview-header">
                    <span style="font-size:12px; font-weight:700; color:#0f172a;">Live Layout Preview</span>
                    <div class="norm-preview-nav">
                      <button type="button" class="norm-nav-btn" id="normPrevPreviewPage" title="Previous page">‹</button>
                      <span id="normPreviewPageTitle">Page 1 of 1</span>
                      <button type="button" class="norm-nav-btn" id="normNextPreviewPage" title="Next page">›</button>
                    </div>
                  </div>
                  <div class="norm-stage">
                    <div class="norm-stage-side">
                      <div class="norm-page-box before-box" id="normPreviewBeforeBox">
                        <span style="font-size:10px; font-weight:700; color:#1e40af;">Original</span>
                      </div>
                      <div class="norm-stage-caption" id="normBeforeCaption">0 × 0 pt</div>
                    </div>
                    <div style="font-size:18px; font-weight:800; color:#64748b;">➔</div>
                    <div class="norm-stage-side">
                      <div class="norm-page-box after-box" id="normPreviewAfterBox">
                        <div class="norm-margin-guide hidden" id="normMarginGuide"></div>
                        <div class="norm-content-fill" id="normContentFill">Content</div>
                      </div>
                      <div class="norm-stage-caption" id="normAfterCaption">595 × 842 pt</div>
                    </div>
                  </div>
                  <div class="norm-preview-metrics" id="normPreviewMetrics">Scale 1.00×</div>
                </div>

                <div>
                  <label class="norm-field-label" style="margin-bottom:6px;">Page-by-Page Breakdown (Click to Preview)</label>
                  <div class="norm-pages-list" id="normPageList"></div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer-custom" style="justify-content:space-between; align-items:center;">
            <span id="normFooterSummary" style="font-size:12px; font-weight:600; color:#475569;"></span>
            <div style="display:flex; gap:10px;">
              <button type="button" class="btn btn-outline" id="btnCancelNormalize">Cancel</button>
              <button type="button" class="btn btn-crimson" id="btnConfirmNormalize">📐 Apply Unified Page Size</button>
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
    document.getElementById('btnCloseNormModal')?.addEventListener('click', () => this.close());
    document.getElementById('btnCancelNormalize')?.addEventListener('click', () => this.close());

    this.modalEl?.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.close();
    });

    const presetSelect = document.getElementById('normSizePreset') as HTMLSelectElement | null;
    presetSelect?.addEventListener('change', () => {
      this.applyPresetSelection(presetSelect.value as PageSizePresetId);
      this.updatePreview();
    });

    const widthInput = document.getElementById('normWidthInput') as HTMLInputElement | null;
    const heightInput = document.getElementById('normHeightInput') as HTMLInputElement | null;
    const onDimEdited = () => {
      if (!widthInput || !heightInput) return;
      const wVal = parseFloat(widthInput.value);
      const hVal = parseFloat(heightInput.value);
      if (!isNaN(wVal) && wVal > 0) this.baseWidthPt = this.toPoints(wVal, this.currentUnit);
      if (!isNaN(hVal) && hVal > 0) this.baseHeightPt = this.toPoints(hVal, this.currentUnit);
      if (this.orientationMode !== 'keep' && Math.abs(this.baseWidthPt - this.baseHeightPt) > 1) {
        this.orientationMode = this.baseWidthPt > this.baseHeightPt ? 'landscape' : 'portrait';
        document.querySelectorAll('#normOrientGroup .norm-seg-btn').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-orient') === this.orientationMode);
        });
      }
      if (presetSelect) presetSelect.value = 'custom';
      this.updatePreview();
    };
    widthInput?.addEventListener('input', onDimEdited);
    heightInput?.addEventListener('input', onDimEdited);

    const unitSelect = document.getElementById('normUnitSelect') as HTMLSelectElement | null;
    unitSelect?.addEventListener('change', () => {
      this.currentUnit = (unitSelect.value || 'mm') as UnitType;
      this.syncDimensionInputs();
    });

    document.querySelectorAll('#normOrientGroup .norm-seg-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#normOrientGroup .norm-seg-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.orientationMode = (btn.getAttribute('data-orient') || 'portrait') as PageOrientationMode;
        this.syncDimensionInputs();
        this.updatePreview();
      });
    });

    document.querySelectorAll('#normFitGroup .norm-fit-card').forEach((card) => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#normFitGroup .norm-fit-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        this.fitMode = (card.getAttribute('data-fit') || 'contain') as PageFitMode;
        this.updatePreview();
      });
    });

    document.getElementById('normMarginSelect')?.addEventListener('change', () => this.updatePreview());
    document.getElementById('normAlignSelect')?.addEventListener('change', () => this.updatePreview());

    document.querySelectorAll('input[name="normScope"]').forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const val = (e.target as HTMLInputElement).value;
        const customInput = document.getElementById('normCustomRange') as HTMLInputElement | null;
        if (customInput) {
          customInput.disabled = val !== 'custom';
          if (val === 'custom') customInput.focus();
        }
        this.updatePreview();
      });
    });

    document.getElementById('normCustomRange')?.addEventListener('input', () => this.updatePreview());

    document.getElementById('normPrevPreviewPage')?.addEventListener('click', () => {
      if (!this.summary) return;
      if (this.previewPageIndex > 0) {
        this.previewPageIndex--;
        this.updatePreview();
      }
    });

    document.getElementById('normNextPreviewPage')?.addEventListener('click', () => {
      if (!this.summary) return;
      if (this.previewPageIndex < this.summary.totalPages - 1) {
        this.previewPageIndex++;
        this.updatePreview();
      }
    });

    document.getElementById('btnConfirmNormalize')?.addEventListener('click', () => {
      this.executeNormalize();
    });
  }

  public open(): void {
    const pdfManager = this.callbacks.getPDFManager();
    const totalPages = pdfManager.getPageCount();
    if (totalPages === 0) {
      alert('Please open a PDF document first.');
      return;
    }

    this.summary = pdfManager.analyzePageSizes();
    const activeIdx = Math.max(0, Math.min(this.callbacks.getActivePageIndex(), totalPages - 1));
    const s = this.summary;

    // Pick first mismatched page for preview if any, otherwise active page
    const firstMismatch = s.pageDetails.find(
      (d) =>
        Math.abs(d.width - s.mostCommonSize.width) > 2.5 ||
        Math.abs(d.height - s.mostCommonSize.height) > 2.5
    );
    this.previewPageIndex = firstMismatch ? firstMismatch.pageIndex : activeIdx;

    // Update dynamic preset labels
    const p1 = s.pageDetails[0];
    const pCur = s.pageDetails[activeIdx] || p1;

    const setOptText = (id: string, text: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };
    setOptText('optMatchCommon', `Match Most Common (${Math.round(s.mostCommonSize.width)} × ${Math.round(s.mostCommonSize.height)} pt · ${s.mostCommonSize.label})`);
    setOptText('optMatchFirst', `Match Page 1 (${Math.round(p1.width)} × ${Math.round(p1.height)} pt · ${p1.label})`);
    setOptText('optMatchCurrent', `Match Current Page ${activeIdx + 1} (${Math.round(pCur.width)} × ${Math.round(pCur.height)} pt)`);
    setOptText('optMatchLargest', `Match Largest Page (${Math.round(s.largestSize.width)} × ${Math.round(s.largestSize.height)} pt)`);
    setOptText('optMatchSmallest', `Match Smallest Page (${Math.round(s.smallestSize.width)} × ${Math.round(s.smallestSize.height)} pt)`);

    setOptText('normScopeAllLabel', `All Pages (1 to ${totalPages})`);
    setOptText('normScopeCurrentLabel', `Current Page Only (Page ${activeIdx + 1})`);

    // Choose smartest initial target preset
    const presetSelect = document.getElementById('normSizePreset') as HTMLSelectElement | null;
    let initialPreset: PageSizePresetId = 'a4';

    if (s.mostCommonSize.count >= 2 || totalPages === 1) {
      const matchedStd = this.findMatchingStandardPreset(s.mostCommonSize.width, s.mostCommonSize.height);
      if (matchedStd) {
        initialPreset = matchedStd;
      } else {
        initialPreset = 'match_common';
      }
    }

    // Choose smartest orientation default based on majority of pages
    const portraitCount = s.pageDetails.filter((d) => d.height >= d.width).length;
    const landscapeCount = s.pageDetails.length - portraitCount;
    this.orientationMode = landscapeCount > portraitCount ? 'landscape' : 'portrait';

    document.querySelectorAll('#normOrientGroup .norm-seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-orient') === this.orientationMode);
    });

    // Reset fit/margin/align/scope
    this.fitMode = 'contain';
    document.querySelectorAll('#normFitGroup .norm-fit-card').forEach((card) => {
      card.classList.toggle('active', card.getAttribute('data-fit') === 'contain');
    });
    const marginEl = document.getElementById('normMarginSelect') as HTMLSelectElement | null;
    if (marginEl) marginEl.value = '0';
    const alignEl = document.getElementById('normAlignSelect') as HTMLSelectElement | null;
    if (alignEl) alignEl.value = 'center';

    const allScope = document.querySelector('input[name="normScope"][value="all"]') as HTMLInputElement | null;
    if (allScope) allScope.checked = true;
    const customRangeEl = document.getElementById('normCustomRange') as HTMLInputElement | null;
    if (customRangeEl) customRangeEl.disabled = true;

    if (presetSelect) {
      presetSelect.value = initialPreset;
      this.applyPresetSelection(initialPreset);
    }

    this.renderAnalysisBanner();
    this.updatePreview();
    this.modalEl?.classList.remove('hidden');
  }

  public close(): void {
    this.modalEl?.classList.add('hidden');
  }

  private findMatchingStandardPreset(w: number, h: number): PageSizePresetId | null {
    const tol = 5.5;
    for (const [id, spec] of Object.entries(PRESET_SIZES_PT)) {
      if (
        (Math.abs(w - spec.width) <= tol && Math.abs(h - spec.height) <= tol) ||
        (Math.abs(w - spec.height) <= tol && Math.abs(h - spec.width) <= tol)
      ) {
        return id as PageSizePresetId;
      }
    }
    return null;
  }

  private applyPresetSelection(preset: PageSizePresetId): void {
    if (!this.summary) return;
    const activeIdx = Math.max(0, Math.min(this.callbacks.getActivePageIndex(), this.summary.totalPages - 1));

    if (preset in PRESET_SIZES_PT) {
      const spec = PRESET_SIZES_PT[preset];
      this.baseWidthPt = spec.width;
      this.baseHeightPt = spec.height;
    } else if (preset === 'match_common') {
      this.baseWidthPt = this.summary.mostCommonSize.width;
      this.baseHeightPt = this.summary.mostCommonSize.height;
    } else if (preset === 'match_first') {
      const p1 = this.summary.pageDetails[0];
      this.baseWidthPt = p1.width;
      this.baseHeightPt = p1.height;
    } else if (preset === 'match_current') {
      const pCur = this.summary.pageDetails[activeIdx] || this.summary.pageDetails[0];
      this.baseWidthPt = pCur.width;
      this.baseHeightPt = pCur.height;
    } else if (preset === 'match_largest') {
      this.baseWidthPt = this.summary.largestSize.width;
      this.baseHeightPt = this.summary.largestSize.height;
    } else if (preset === 'match_smallest') {
      this.baseWidthPt = this.summary.smallestSize.width;
      this.baseHeightPt = this.summary.smallestSize.height;
    }

    if (preset.startsWith('match_') && this.orientationMode !== 'keep' && Math.abs(this.baseWidthPt - this.baseHeightPt) > 1) {
      this.orientationMode = this.baseWidthPt > this.baseHeightPt ? 'landscape' : 'portrait';
      document.querySelectorAll('#normOrientGroup .norm-seg-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-orient') === this.orientationMode);
      });
    }

    this.syncDimensionInputs();
  }

  private toPoints(val: number, unit: UnitType): number {
    if (unit === 'mm') return val * PT_PER_MM;
    if (unit === 'in') return val * PT_PER_INCH;
    return val;
  }

  private fromPoints(pt: number, unit: UnitType): number {
    if (unit === 'mm') return Math.round((pt / PT_PER_MM) * 10) / 10;
    if (unit === 'in') return Math.round((pt / PT_PER_INCH) * 100) / 100;
    return Math.round(pt * 10) / 10;
  }

  private syncDimensionInputs(): void {
    const widthInput = document.getElementById('normWidthInput') as HTMLInputElement | null;
    const heightInput = document.getElementById('normHeightInput') as HTMLInputElement | null;
    if (!widthInput || !heightInput) return;

    let displayW = this.baseWidthPt;
    let displayH = this.baseHeightPt;
    if (this.orientationMode === 'portrait') {
      displayW = Math.min(this.baseWidthPt, this.baseHeightPt);
      displayH = Math.max(this.baseWidthPt, this.baseHeightPt);
    } else if (this.orientationMode === 'landscape') {
      displayW = Math.max(this.baseWidthPt, this.baseHeightPt);
      displayH = Math.min(this.baseWidthPt, this.baseHeightPt);
    }

    widthInput.value = this.fromPoints(displayW, this.currentUnit).toString();
    heightInput.value = this.fromPoints(displayH, this.currentUnit).toString();
  }

  private renderAnalysisBanner(): void {
    if (!this.summary) return;
    const s = this.summary;
    const banner = document.getElementById('normAnalysisBanner');
    const titleEl = document.getElementById('normAnalysisTitle');
    const subEl = document.getElementById('normAnalysisSub');
    const chipsEl = document.getElementById('normAnalysisChips');
    if (!banner || !titleEl || !subEl || !chipsEl) return;

    banner.classList.remove('mixed', 'uniform');
    if (s.hasMixedSizes || s.hasMixedOrientations) {
      banner.classList.add('mixed');
      titleEl.textContent = `⚠️ Detected ${s.uniqueSizeCount} different page size${s.uniqueSizeCount > 1 ? 's' : ''} across ${s.totalPages} pages`;
      subEl.textContent = `Smallest: ${Math.round(s.smallestSize.width)}×${Math.round(s.smallestSize.height)} pt (${s.smallestSize.label}) · Largest: ${Math.round(s.largestSize.width)}×${Math.round(s.largestSize.height)} pt (${s.largestSize.label})`;
    } else {
      banner.classList.add('uniform');
      const p1 = s.pageDetails[0];
      titleEl.textContent = `✅ All ${s.totalPages} page${s.totalPages > 1 ? 's' : ''} currently share ${Math.round(p1.width)} × ${Math.round(p1.height)} pt (${p1.label})`;
      subEl.textContent = 'You can still convert the whole document to another uniform size or add print margins.';
    }

    // Group distinct sizes into compact chips
    const groups = new Map<string, { label: string; count: number }>();
    for (const d of s.pageDetails) {
      const key = `${Math.round(d.width)}×${Math.round(d.height)}`;
      const existing = groups.get(key);
      if (existing) existing.count++;
      else groups.set(key, { label: `${key} pt`, count: 1 });
    }
    chipsEl.innerHTML = Array.from(groups.values())
      .slice(0, 4)
      .map(
        (g) =>
          `<span style="font-size:11px; font-weight:700; padding:3px 8px; border-radius:999px; background:#ffffff; border:1px solid #cbd5e1; color:#334155;">${g.label} (${g.count}p)</span>`
      )
      .join('');
  }

  private buildCurrentOptions(): NormalizePagesOptions {
    const marginEl = document.getElementById('normMarginSelect') as HTMLSelectElement | null;
    const alignEl = document.getElementById('normAlignSelect') as HTMLSelectElement | null;
    const scopeRadio = document.querySelector('input[name="normScope"]:checked') as HTMLInputElement | null;
    const scope = (scopeRadio?.value || 'all') as NormalizeScope;

    const totalPages = this.summary?.totalPages || 1;
    let pageIndices: number[] | undefined;
    if (scope === 'current') {
      const activeIdx = Math.max(0, Math.min(this.callbacks.getActivePageIndex(), totalPages - 1));
      pageIndices = [activeIdx];
    } else if (scope === 'custom') {
      const rangeStr = (document.getElementById('normCustomRange') as HTMLInputElement | null)?.value.trim() || '';
      pageIndices = this.callbacks.parsePageRange(rangeStr, totalPages);
    }

    return {
      targetWidth: Math.max(36, this.baseWidthPt),
      targetHeight: Math.max(36, this.baseHeightPt),
      orientationMode: this.orientationMode,
      fitMode: this.fitMode,
      alignMode: (alignEl?.value || 'center') as PageAlignMode,
      marginPt: parseFloat(marginEl?.value || '0') || 0,
      scope,
      pageIndices,
      tolerancePt: 2.0,
    };
  }

  private updatePreview(): void {
    if (!this.summary) return;
    const s = this.summary;
    const options = this.buildCurrentOptions();
    const selectedSet = options.pageIndices ? new Set(options.pageIndices) : null;

    let willResizeCount = 0;
    let alreadyMatchCount = 0;
    let mismatchCount = 0;

    const listEl = document.getElementById('normPageList');
    if (listEl) listEl.innerHTML = '';

    for (const detail of s.pageDetails) {
      const layout = ExportEngine.computeNormalizedPageLayout(detail.width, detail.height, options);
      if (!layout.isAlreadyMatching) mismatchCount++;

      let willChange = true;
      let statusLabel = `Resize`;
      let statusClass = 'resize';

      if (options.scope === 'mismatched') {
        if (layout.isAlreadyMatching) {
          willChange = false;
          statusLabel = 'Already Matches';
          statusClass = 'match';
          alreadyMatchCount++;
        }
      } else if (options.scope === 'current' || options.scope === 'custom') {
        if (!selectedSet || !selectedSet.has(detail.pageIndex)) {
          willChange = false;
          statusLabel = 'Skipped';
          statusClass = 'skip';
        }
      }

      if (willChange) {
        if (layout.isAlreadyMatching && options.marginPt === 0 && detail.rotation === 0 && !detail.isCropped) {
          statusLabel = 'Matches';
          statusClass = 'match';
          alreadyMatchCount++;
        } else {
          willResizeCount++;
          const avgScale = ((layout.scaleX + layout.scaleY) / 2).toFixed(2);
          statusLabel = `${avgScale}×`;
          statusClass = 'resize';
        }
      }

      if (listEl) {
        const row = document.createElement('div');
        row.className = `norm-page-row ${detail.pageIndex === this.previewPageIndex ? 'active' : ''}`;
        row.innerHTML = `
          <span style="font-weight:700; color:#0f172a;">Page ${detail.pageIndex + 1}</span>
          <span style="color:#475569; flex:1; text-align:center;">
            ${Math.round(detail.width)}×${Math.round(detail.height)} ➔ ${Math.round(layout.dstW)}×${Math.round(layout.dstH)} pt
          </span>
          <span class="norm-row-status ${statusClass}">${statusLabel}</span>
        `;
        row.addEventListener('click', () => {
          this.previewPageIndex = detail.pageIndex;
          this.updatePreview();
        });
        listEl.appendChild(row);
      }
    }

    const mismatchLabel = document.getElementById('normScopeMismatchLabel');
    if (mismatchLabel) {
      mismatchLabel.textContent = `Only Mismatched Pages (${mismatchCount} ${mismatchCount === 1 ? 'page' : 'pages'})`;
    }

    // Update Preview Stage for previewPageIndex
    const pDetail = s.pageDetails[this.previewPageIndex] || s.pageDetails[0];
    const pLayout = ExportEngine.computeNormalizedPageLayout(pDetail.width, pDetail.height, options);

    const titleEl = document.getElementById('normPreviewPageTitle');
    if (titleEl) titleEl.textContent = `Page ${pDetail.pageIndex + 1} of ${s.totalPages}`;

    const prevBtn = document.getElementById('normPrevPreviewPage') as HTMLButtonElement | null;
    const nextBtn = document.getElementById('normNextPreviewPage') as HTMLButtonElement | null;
    if (prevBtn) prevBtn.disabled = pDetail.pageIndex <= 0;
    if (nextBtn) nextBtn.disabled = pDetail.pageIndex >= s.totalPages - 1;

    const maxPreviewPx = 112;
    const maxDimPt = Math.max(pDetail.width, pDetail.height, pLayout.dstW, pLayout.dstH, 1);
    const pxPerPt = maxPreviewPx / maxDimPt;

    const beforeBox = document.getElementById('normPreviewBeforeBox');
    const afterBox = document.getElementById('normPreviewAfterBox');
    const contentFill = document.getElementById('normContentFill');
    const marginGuide = document.getElementById('normMarginGuide');

    if (beforeBox) {
      beforeBox.style.width = `${Math.max(16, Math.round(pDetail.width * pxPerPt))}px`;
      beforeBox.style.height = `${Math.max(16, Math.round(pDetail.height * pxPerPt))}px`;
    }

    const afterW = Math.max(16, pLayout.dstW * pxPerPt);
    const afterH = Math.max(16, pLayout.dstH * pxPerPt);

    if (afterBox) {
      afterBox.style.width = `${Math.round(afterW)}px`;
      afterBox.style.height = `${Math.round(afterH)}px`;
    }

    if (marginGuide) {
      if (pLayout.safeMargin > 0) {
        const mPx = pLayout.safeMargin * pxPerPt;
        marginGuide.classList.remove('hidden');
        marginGuide.style.left = `${mPx}px`;
        marginGuide.style.top = `${mPx}px`;
        marginGuide.style.width = `${Math.max(2, afterW - mPx * 2)}px`;
        marginGuide.style.height = `${Math.max(2, afterH - mPx * 2)}px`;
      } else {
        marginGuide.classList.add('hidden');
      }
    }

    if (contentFill) {
      // Convert PDF bottom-left boxY into CSS top-left topPx
      const cssLeft = pLayout.boxX * pxPerPt;
      const cssTop = (pLayout.dstH - pLayout.boxY - pLayout.drawVisH) * pxPerPt;
      contentFill.style.left = `${cssLeft}px`;
      contentFill.style.top = `${cssTop}px`;
      contentFill.style.width = `${Math.max(4, pLayout.drawVisW * pxPerPt)}px`;
      contentFill.style.height = `${Math.max(4, pLayout.drawVisH * pxPerPt)}px`;
    }

    const beforeCap = document.getElementById('normBeforeCaption');
    const afterCap = document.getElementById('normAfterCaption');
    if (beforeCap) beforeCap.textContent = `${Math.round(pDetail.width)} × ${Math.round(pDetail.height)} pt`;
    if (afterCap) afterCap.textContent = `${Math.round(pLayout.dstW)} × ${Math.round(pLayout.dstH)} pt`;

    const metricsEl = document.getElementById('normPreviewMetrics');
    if (metricsEl) {
      const targetName = PDFManager.identifyPaperSize(pLayout.dstW, pLayout.dstH);
      const scaleDesc =
        options.fitMode === 'stretch'
          ? `Stretch ${pLayout.scaleX.toFixed(2)}× × ${pLayout.scaleY.toFixed(2)}×`
          : `Scale ${pLayout.scaleX.toFixed(2)}×`;
      metricsEl.textContent = `${targetName} · ${scaleDesc}`;
    }

    const footerEl = document.getElementById('normFooterSummary');
    if (footerEl) {
      if (options.scope === 'custom' && (!options.pageIndices || options.pageIndices.length === 0)) {
        footerEl.textContent = 'Enter valid page numbers (e.g. 1, 3-5) to apply.';
      } else if (options.scope === 'mismatched' && mismatchCount === 0) {
        footerEl.textContent = 'All pages already match the selected target size!';
      } else {
        footerEl.textContent = `${willResizeCount} page(s) will be normalized · ${alreadyMatchCount} already match · Vector quality preserved`;
      }
    }
  }

  private async executeNormalize(): Promise<void> {
    const pdfManager = this.callbacks.getPDFManager();
    if (pdfManager.getPageCount() === 0) return;

    const options = this.buildCurrentOptions();
    if (options.targetWidth < 36 || options.targetHeight < 36) {
      alert('Target width and height must be at least 36 pt (12.7 mm / 0.5 in).');
      return;
    }

    if (options.scope === 'custom' && (!options.pageIndices || options.pageIndices.length === 0)) {
      alert(`Please enter valid page numbers between 1 and ${pdfManager.getPageCount()} (e.g. 1, 3-5).`);
      return;
    }

    if (options.scope === 'mismatched' && this.summary) {
      const hasAnyMismatch = this.summary.pageDetails.some(
        (d) => !ExportEngine.computeNormalizedPageLayout(d.width, d.height, options).isAlreadyMatching
      );
      if (!hasAnyMismatch) {
        alert('All pages already match the chosen target size and orientation.');
        return;
      }
    }

    const activeIdx = this.callbacks.getActivePageIndex();
    this.close();

    try {
      this.callbacks.showProcessing('Unifying Page Sizes...', 'Preparing document and preserving edits...');

      const annotationManager = this.callbacks.getAnnotationManager();
      const trueEditManager = this.callbacks.getTrueEditManager();
      const hasPendingEdits =
        pdfManager.hasStructuralModifications() ||
        trueEditManager.getAllChanges().length > 0 ||
        annotationManager.hasAnyAnnotations();

      let baseBytes: Uint8Array;
      if (hasPendingEdits) {
        baseBytes = await ExportEngine.exportPDF(
          pdfManager,
          annotationManager,
          trueEditManager,
          (pct, stat) => this.callbacks.updateProcessing(Math.round(pct * 0.35), stat)
        );
      } else {
        const orig = pdfManager.getOriginalBytes();
        if (!orig) throw new Error('No PDF loaded');
        baseBytes = new Uint8Array(orig);
      }

      const result = await ExportEngine.normalizePages(baseBytes, options, (pct, stat) => {
        const mapped = hasPendingEdits ? 35 + Math.round(pct * 0.65) : pct;
        this.callbacks.updateProcessing(mapped, stat);
      });

      const sampleLayout = ExportEngine.computeNormalizedPageLayout(
        options.targetWidth,
        options.targetHeight,
        options
      );
      const targetLabel =
        options.orientationMode === 'keep'
          ? `${PDFManager.identifyPaperSize(options.targetWidth, options.targetHeight).replace(/ (Portrait|Landscape)$/i, '')} (Uniform Scale)`
          : `${Math.round(sampleLayout.dstW)} × ${Math.round(sampleLayout.dstH)} pt (${PDFManager.identifyPaperSize(sampleLayout.dstW, sampleLayout.dstH)})`;

      await this.callbacks.onNormalized(
        result.bytes,
        baseBytes,
        result.resizedCount,
        targetLabel,
        activeIdx
      );
    } catch (err) {
      this.callbacks.hideProcessing();
      console.error('Page normalization failed:', err);
      alert('Failed to resize pages: ' + (err as Error).message);
    }
  }
}
